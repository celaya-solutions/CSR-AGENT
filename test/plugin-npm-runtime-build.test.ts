// Plugin npm runtime build tests validate plugin runtime package builds.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildPluginNpmRuntime,
  listMissingPluginNpmRuntimeHostExports,
  listPublishablePluginPackageDirs,
  resolvePluginNpmRuntimeBuildPlan,
} from "../scripts/lib/plugin-npm-runtime-build.mts";
import { useAutoCleanupTempDirTracker } from "./helpers/temp-dir.js";

const repoRoot = path.resolve(import.meta.dirname, "..");
const tempDirs = useAutoCleanupTempDirTracker(afterEach);

type PluginNpmRuntimeBuildPlan = NonNullable<ReturnType<typeof resolvePluginNpmRuntimeBuildPlan>>;

function expectDistRelativePaths(paths: string[]) {
  expect(paths.every((entry) => entry.startsWith("./dist/"))).toBe(true);
}

function expectPluginNpmRuntimeBuildPlan(
  plan: ReturnType<typeof resolvePluginNpmRuntimeBuildPlan>,
): PluginNpmRuntimeBuildPlan {
  if (!plan) {
    throw new Error("expected plugin npm runtime build plan");
  }
  return plan;
}

describe("plugin npm runtime build planning", () => {
  it.each([
    "missing-directory",
    "missing-manifest",
    "malformed-manifest",
    "no-extensions",
    "javascript-only",
  ])("reports selected package input without touching output (%s)", async (scenario) => {
    const packageDir = path.join(tempDirs.make("openclaw-plugin-runtime-input-"), "selected");
    const manifestPath = path.join(packageDir, "package.json");
    const outDir = path.join(packageDir, "dist");
    if (scenario !== "missing-directory") {
      mkdirSync(outDir, { recursive: true });
      writeFileSync(path.join(outDir, "sentinel.js"), "keep\n");
    }
    if (scenario === "malformed-manifest") {
      writeFileSync(manifestPath, "{");
    } else if (scenario === "no-extensions" || scenario === "javascript-only") {
      writeFileSync(
        manifestPath,
        JSON.stringify({
          name: "input-fixture",
          version: "1.0.0",
          ...(scenario === "javascript-only" ? { openclaw: { extensions: ["./index.js"] } } : {}),
        }),
      );
      writeFileSync(path.join(packageDir, "index.js"), "export default {};\n");
    }

    const result = buildPluginNpmRuntime({ repoRoot, packageDir, logLevel: "silent" });
    if (scenario === "missing-directory" || scenario === "missing-manifest") {
      await expect(result).rejects.toMatchObject({ code: "ENOENT", path: manifestPath });
    } else if (scenario === "malformed-manifest") {
      await expect(result).rejects.toBeInstanceOf(SyntaxError);
    } else {
      await expect(result).resolves.toBeNull();
    }
    if (scenario === "missing-directory") {
      expect(existsSync(packageDir)).toBe(false);
    } else {
      expect(readdirSync(outDir)).toEqual(["sentinel.js"]);
      expect(readFileSync(path.join(outDir, "sentinel.js"), "utf8")).toBe("keep\n");
    }
  });

  it("builds a private worker without registering it as a plugin entry", async () => {
    const packageDir = tempDirs.make("openclaw-plugin-runtime-worker-");
    mkdirSync(path.join(packageDir, "src"));
    writeFileSync(
      path.join(packageDir, "package.json"),
      JSON.stringify({
        name: "@openclaw/worker-fixture",
        version: "1.0.0",
        type: "module",
        openclaw: {
          extensions: ["./index.ts"],
          compat: { pluginApi: "1.0.0" },
          build: { workerEntries: ["./src/store.worker.ts"] },
        },
      }),
    );
    writeFileSync(
      path.join(packageDir, "index.ts"),
      `import { resolveRuntimeWorkerUrl } from ${JSON.stringify(path.join(repoRoot, "src/infra/runtime-worker-url.ts").replaceAll("\\", "/"))};
` +
        `export const workerUrl = resolveRuntimeWorkerUrl({
          currentModuleUrl: import.meta.url,
          sourceWorkerName: "store.worker",
          distWorkerPath: "extensions/worker-fixture/src/store.worker.js",
          package: { name: "@openclaw/worker-fixture", distWorkerPath: "src/store.worker.js" },
        });
`,
    );
    writeFileSync(
      path.join(packageDir, "src/store.worker.ts"),
      'import { parentPort, isMainThread } from "node:worker_threads";\n' +
        "const value: number = 42; parentPort!.postMessage({ value, isMainThread });\n",
    );

    const plan = expectPluginNpmRuntimeBuildPlan(
      await buildPluginNpmRuntime({ repoRoot, packageDir, logLevel: "silent" }),
    );
    expect(plan.runtimeExtensions).toEqual(["./dist/index.js"]);
    const { workerUrl } = await import(pathToFileURL(path.join(packageDir, "dist/index.js")).href);
    const worker = new Worker(workerUrl);
    try {
      const result = await new Promise((resolve, reject) => {
        worker.once("message", resolve);
        worker.once("error", reject);
        worker.once("exit", (code) => reject(new Error(`Worker exited before replying: ${code}`)));
      });
      expect(result).toEqual({ value: 42, isMainThread: false });
    } finally {
      await worker.terminate();
    }
  });

  it.each(["index.tsx", "src/index.tsx"])(
    "builds an executable %s package entry",
    async (entry) => {
      const packageDir = tempDirs.make("openclaw-plugin-runtime-tsx-");
      mkdirSync(path.dirname(path.join(packageDir, entry)), { recursive: true });
      writeFileSync(
        path.join(packageDir, "package.json"),
        JSON.stringify({
          name: "@openclaw/tsx-fixture",
          version: "1.0.0",
          type: "module",
          openclaw: { extensions: [`./${entry}`], compat: { pluginApi: "1.0.0" } },
        }),
      );
      writeFileSync(
        path.join(packageDir, entry),
        'const id: string = "tsx-fixture"; export default { id };\n',
      );

      await buildPluginNpmRuntime({ repoRoot, packageDir, logLevel: "silent" });

      const outputPath = path.join(packageDir, "dist", entry.replace(/\.tsx$/u, ".js"));
      expect(existsSync(outputPath)).toBe(true);
      expect((await import(pathToFileURL(outputPath).href)).default.id).toBe("tsx-fixture");
    },
  );

  it("rejects a symlinked package dist root before building", async () => {
    const syntheticRepoRoot = tempDirs.make("openclaw-plugin-runtime-output-root-");
    const packageDir = path.join(syntheticRepoRoot, "extensions", "demo");
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(
      path.join(syntheticRepoRoot, "package.json"),
      JSON.stringify({ version: "1.0.0" }),
    );
    writeFileSync(
      path.join(packageDir, "package.json"),
      JSON.stringify({
        name: "@openclaw/demo",
        version: "1.0.0",
        openclaw: {
          compat: { pluginApi: "1.0.0" },
          extensions: ["./index.ts"],
          release: { publishToNpm: true },
        },
      }),
    );
    writeFileSync(path.join(packageDir, "index.ts"), "export default {};\n");
    const targetDir = path.join(syntheticRepoRoot, "live-gateway-dist");
    mkdirSync(targetDir);
    writeFileSync(path.join(targetDir, "sentinel.js"), "keep\n");
    symlinkSync(targetDir, path.join(packageDir, "dist"), "dir");

    await expect(
      buildPluginNpmRuntime({
        repoRoot: syntheticRepoRoot,
        packageDir,
        logLevel: "silent",
      }),
    ).rejects.toThrow(/symbolic link/u);
    expect(readFileSync(path.join(targetDir, "sentinel.js"), "utf8")).toBe("keep\n");
    expect(readlinkSync(path.join(packageDir, "dist"))).toBe(targetDir);
  });

  it("plans package-local runtime entries for every publishable plugin package", () => {
    const packageDirs = listPublishablePluginPackageDirs({ repoRoot });
    expect(packageDirs.length).toBeGreaterThan(0);

    const plans = packageDirs.map((packageDir) =>
      resolvePluginNpmRuntimeBuildPlan({
        repoRoot,
        packageDir,
      }),
    );
    const resolvedPlans = plans.map(expectPluginNpmRuntimeBuildPlan);
    expect(resolvedPlans.map((plan) => plan.pluginDir)).toEqual(
      packageDirs.map((packageDir) => path.basename(packageDir)),
    );
    for (const plan of resolvedPlans) {
      expect(plan.outDir).toBe(path.join(plan.packageDir, "dist"));
      expectDistRelativePaths(plan.runtimeExtensions);
      expectDistRelativePaths(plan.runtimeBuildOutputs);
      expect(plan.packageFiles).toContain("dist/**");
      expect(plan.packagePeerMetadata.peerDependencies.openclaw).toBe(
        plan.packageJson.openclaw?.compat?.pluginApi,
      );
      expect(plan.packagePeerMetadata.peerDependenciesMeta.openclaw.optional).toBe(true);
    }
  });

  it("includes top-level public runtime surfaces", () => {
    const acpxDir = path.join(repoRoot, "extensions", "acpx");
    const acpxRuntimePlan = expectPluginNpmRuntimeBuildPlan(
      resolvePluginNpmRuntimeBuildPlan({ repoRoot, packageDir: acpxDir }),
    );
    expect(acpxRuntimePlan.entry).toEqual({
      index: path.join(acpxDir, "index.ts"),
      "doctor-contract-api": path.join(acpxDir, "doctor-contract-api.ts"),
      "register.runtime": path.join(acpxDir, "register.runtime.ts"),
      "runtime-api": path.join(acpxDir, "runtime-api.ts"),
      "setup-api": path.join(acpxDir, "setup-api.ts"),
    });
    expect(acpxRuntimePlan.packageFiles).toEqual([
      "dist/**",
      "openclaw.plugin.json",
      "README.md",
      "assets/icon.png",
      "skills/**",
    ]);
  });

  it("builds doctor contract surfaces for publishable channel plugins", () => {
    for (const pluginDir of ["discord"]) {
      const plan = expectPluginNpmRuntimeBuildPlan(
        resolvePluginNpmRuntimeBuildPlan({
          repoRoot,
          packageDir: path.join(repoRoot, "extensions", pluginDir),
        }),
      );
      expect(plan.entry["doctor-contract-api"]).toBe(
        path.join(repoRoot, "extensions", pluginDir, "doctor-contract-api.ts"),
      );
      const extension = plan.runtimeFormat === "cjs" ? ".cjs" : ".js";
      expect(plan.runtimeBuildOutputs).toContain(`./dist/doctor-contract-api${extension}`);
      expect(plan.packageFiles).toContain("dist/**");
    }
  });

  it("keeps published Codex runtime imports resolvable from the host package", async () => {
    const result = await buildPluginNpmRuntime({
      repoRoot,
      packageDir: "extensions/codex",
      logLevel: "silent",
    });
    const plan = expectPluginNpmRuntimeBuildPlan(result);

    expect(listMissingPluginNpmRuntimeHostExports(plan)).toEqual([]);
  });

  it("keeps published llama.cpp runtime imports resolvable from the host package", async () => {
    const result = await buildPluginNpmRuntime({
      repoRoot,
      packageDir: "extensions/llama-cpp",
      logLevel: "silent",
    });
    const plan = expectPluginNpmRuntimeBuildPlan(result);

    expect(listMissingPluginNpmRuntimeHostExports(plan)).toEqual([]);
  });

  it("detects unresolved side-effect host imports in built plugin runtimes", () => {
    const outDir = tempDirs.make("openclaw-plugin-runtime-host-import-");
    writeFileSync(
      path.join(outDir, "index.js"),
      [
        'import "openclaw/plugin-sdk/not-exported";',
        'const runtime = __require("openclaw/plugin-sdk/not-exported-from-require");',
        "void runtime;",
        "",
      ].join("\n"),
    );
    const plan = expectPluginNpmRuntimeBuildPlan(
      resolvePluginNpmRuntimeBuildPlan({
        repoRoot,
        packageDir: path.join(repoRoot, "extensions", "codex"),
      }),
    );

    expect(listMissingPluginNpmRuntimeHostExports({ ...plan, outDir })).toEqual([
      "openclaw/plugin-sdk/not-exported",
      "openclaw/plugin-sdk/not-exported-from-require",
    ]);
  });

  it("does not require host metadata when the runtime has no host imports", () => {
    const syntheticRepoRoot = tempDirs.make("openclaw-plugin-runtime-synthetic-repo-");
    const outDir = tempDirs.make("openclaw-plugin-runtime-no-host-import-");
    writeFileSync(path.join(outDir, "index.js"), "export default {};\n");
    const plan = expectPluginNpmRuntimeBuildPlan(
      resolvePluginNpmRuntimeBuildPlan({
        repoRoot,
        packageDir: path.join(repoRoot, "extensions", "codex"),
      }),
    );

    expect(
      listMissingPluginNpmRuntimeHostExports({ ...plan, repoRoot: syntheticRepoRoot, outDir }),
    ).toEqual([]);
  });
});
