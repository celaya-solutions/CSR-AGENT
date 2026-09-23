// Ci Workflow Guards tests cover ci workflow guards script behavior.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  existsSync,
  globSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { isBuiltin } from "node:module";
import { connect } from "node:net";
import { devNull, tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { expectDefined } from "@openclaw/normalization-core";
import { minimatch } from "minimatch";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  detectChangedScope,
  detectNodeFastScope,
  shouldRunNativeI18n,
  writeGitHubOutput,
} from "../../scripts/ci-changed-scope.mjs";
import { resolveShardPlans, runShardPlans } from "../../scripts/ci-run-node-test-shard.mts";
import { resolveChangedDockerSeedLanes } from "../../scripts/lib/ci-changed-node-test-plan.mts";
import { createNodeTestShardBundles } from "../../scripts/lib/ci-node-test-plan.mts";
import { visitModuleSpecifiers } from "../../scripts/lib/guard-inventory-utils.mjs";
import { pnpmLockfileDocuments } from "../../scripts/lib/pnpm-lockfile-documents.mjs";
import { resolveRunVitestSpawnEnv } from "../../scripts/lib/vitest-process-env.mts";
import { resolvePnpmRunner } from "../../scripts/pnpm-runner.mts";
import {
  BOUNDARY_CHECKS,
  selectChecksForShard,
} from "../../scripts/run-additional-boundary-checks.mts";
import { buildVitestRunPlans } from "../../scripts/test-projects.test-support.mts";
import { createTempDirTracker, useAutoCleanupTempDirTracker } from "../helpers/temp-dir.js";
import { sharedVitestConfig } from "../vitest/vitest.shared.config.ts";
import {
  createUiE2eVitestConfig,
  uiE2ePrivateServerTestFiles,
  uiE2eRealGatewayTestFiles,
  uiE2eRuntimeBudgetTestFile,
  uiE2eSerialTestFiles,
} from "../vitest/vitest.ui-e2e.config.ts";
import { runCiGitStep } from "./ci-git-owner.test-support.js";
import { runGeneratedPublisherScenario } from "./generated-publisher.test-support.js";

const CHECKOUT_V6 = "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1";
const CACHE_V5 = "actions/cache/restore@55cc8345863c7cc4c66a329aec7e433d2d1c52a9";
const CACHE_SAVE_V5 = "actions/cache/save@55cc8345863c7cc4c66a329aec7e433d2d1c52a9";
const SETUP_GO_V6 = "actions/setup-go@b7ad1dad31e06c5925ef5d2fc7ad053ef454303e";
const UPLOAD_ARTIFACT_V7 = "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a";
const DOWNLOAD_ARTIFACT_V8 = "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c";
const CREATE_GITHUB_APP_TOKEN_V3 =
  "actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1";
const MANTIS_GITHUB_APP_CLIENT_ID = "Iv23liPJCozR0uHm6P7G";
const OPENGREP_PR_DIFF_WORKFLOW = ".github/workflows/opengrep-precise.yml";
const OPENGREP_FULL_WORKFLOW = ".github/workflows/opengrep-precise-full.yml";
const CONTROL_UI_LOCALE_REFRESH_WORKFLOW = ".github/workflows/control-ui-locale-refresh.yml";
const PUBLISH_GENERATED_PR_ACTION = ".github/actions/publish-generated-pr/action.yml";
const SETUP_ANDROID_TOOLCHAIN_ACTION = ".github/actions/setup-android-toolchain/action.yml";
const OIDC_BOUND_MAIN_REUSABLE_WORKFLOWS = new Set<string>();
const AMBIGUOUS_MAIN_PUSH_DIAGNOSTIC =
  "::error title=ambiguous main push::github.event.before is zero; refusing to infer a diff base for a created or recreated main branch.";
const AMBIGUOUS_MAIN_PUSH_GUARD = `if [ "$GITHUB_EVENT_NAME" = "push" ] && [[ "$base_sha" =~ ^0+$ ]]; then
  echo "${AMBIGUOUS_MAIN_PUSH_DIAGNOSTIC}" >&2
  exit 1
fi`;
const tempDirs = useAutoCleanupTempDirTracker(afterEach);
const rootPackageManager = (
  JSON.parse(readFileSync("package.json", "utf8")) as {
    packageManager: string;
  }
).packageManager;
const TSX_IMPORT = import.meta.resolve("tsx");

type WorkflowStep = {
  "continue-on-error"?: boolean;
  env?: Record<string, unknown>;
  id?: string;
  if?: string;
  name?: string;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
  "working-directory"?: string;
};

const readCiWorkflow = (() => {
  // The checked-in workflow is fixed for this suite; clones keep fixture mutations local.
  const workflow = parse(readFileSync(".github/workflows/ci.yml", "utf8"));
  return () => structuredClone(workflow);
})();

function evaluateWorkflowExpression(
  expression: unknown,
  context: {
    action?: string;
    // Runner routing keys off contributor trust, so pull-request cases default
    // to CONTRIBUTOR: same-repo PRs always come from someone with write access.
    authorAssociation?: string;
    cancelled?: boolean;
    dispatchId?: string;
    draft?: boolean;
    eventName: "pull_request" | "push" | "workflow_dispatch" | "repository_dispatch" | "schedule";
    failed?: boolean;
    env?: Record<string, string>;
    frozenTarget?: boolean;
    fileHashes?: Record<string, string>;
    headRepository?: string;
    headSha?: string;
    hostedRunnerProfileContract?: boolean;
    matrix?: Record<string, unknown>;
    preflightOutputs?: Record<string, string>;
    pullRequestNumber?: number;
    ref?: string;
    resolveTargetOutputs?: Record<string, string>;
    releaseGate?: boolean;
    releaseScope?: string;
    repository: string;
    runCheck?: boolean;
    runnerBackend?: "" | "blacksmith" | "github" | "hybrid";
    runnerEnvironment?: "" | "github-hosted" | "self-hosted";
    runnerProfile?: "blacksmith" | "github" | "hybrid";
    runAttempt: number;
    runId?: number;
    runNumber?: number;
    sha?: string;
    steps?: Record<
      string,
      { outputs: Record<string, string>; outcome?: "success" | "failure" | "cancelled" | "skipped" }
    >;
    targetContextRef?: string;
    targetRef?: string;
    useGithubHostedRunners?: boolean;
    workflow?: string;
    workflowSha?: string;
    workflowToken?: string;
  },
) {
  if (typeof expression !== "string") {
    throw new TypeError("workflow expression must be a string");
  }
  const match = expression.match(/^\$\{\{\s*([\s\S]*?)\s*\}\}$/u);
  if (!match) {
    throw new Error(`invalid workflow expression: ${expression}`);
  }
  const source = match[1];
  if (source === undefined) {
    throw new Error(`workflow expression has no body: ${expression}`);
  }
  // Actions permits dashes in property names; preserve quoted literals while
  // translating those accesses for the JavaScript fixture evaluator.
  const evaluableSource = source.replace(
    /'(?:[^']|'')*'|\.([A-Za-z_][\w-]*)/gu,
    (token: string, property: string | undefined) =>
      property?.includes("-") ? `[${JSON.stringify(property)}]` : token,
  );
  return runInNewContext(evaluableSource, {
    always: () => true,
    failure: () => context.failed ?? false,
    cancelled: () => context.cancelled ?? false,
    // GitHub expression builtins the runner-routing clauses use.
    contains: (haystack: unknown, needle: unknown) =>
      Array.isArray(haystack)
        ? haystack.includes(needle)
        : String(haystack).includes(String(needle)),
    endsWith: (value: unknown, suffix: unknown) =>
      String(value).toLowerCase().endsWith(String(suffix).toLowerCase()),
    fromJSON: (value: string) => JSON.parse(value) as unknown,
    format: (value: string, ...args: unknown[]) =>
      value.replace(/\{(\d+)\}/gu, (_match, index: string) => String(args[Number(index)])),
    hashFiles: (file: string) => context.fileHashes?.[file] ?? "",
    startsWith: (value: unknown, prefix: unknown) => String(value).startsWith(String(prefix)),
    toJson: (value: unknown) => JSON.stringify(value),
    github: {
      event_name: context.eventName,
      repository: context.repository,
      ref: context.ref ?? "refs/heads/main",
      run_attempt: context.runAttempt,
      run_id: context.runId,
      run_number: context.runNumber,
      sha: context.sha,
      workflow: context.workflow,
      workflow_sha: context.workflowSha,
      token: context.workflowToken,
      event:
        context.headRepository || context.eventName === "pull_request"
          ? {
              action: context.action,
              pull_request: {
                author_association: context.authorAssociation ?? "CONTRIBUTOR",
                draft: context.draft ?? false,
                number: context.pullRequestNumber,
                head: {
                  sha: context.headSha,
                  repo: { full_name: context.headRepository ?? context.repository },
                },
              },
            }
          : {},
    },
    inputs: {
      dispatch_id: context.dispatchId ?? "",
      release_gate: context.releaseGate ?? false,
      release_scope: context.releaseScope ?? "full",
      target_context_ref: context.targetContextRef ?? "",
      target_ref: context.targetRef ?? "",
      use_github_hosted_runners: context.useGithubHostedRunners ?? false,
    },
    env: context.env ?? {},
    matrix: context.matrix ?? {},
    runner: { environment: context.runnerEnvironment ?? "" },
    steps: context.steps ?? {},
    needs: {
      resolve_target: { outputs: context.resolveTargetOutputs ?? {} },
      preflight: {
        outputs: {
          frozen_target: String(context.frozenTarget ?? false),
          hosted_runner_profile_contract: String(context.hostedRunnerProfileContract ?? true),
          run_check: String(context.runCheck ?? true),
          runner_profile: context.runnerProfile ?? context.runnerBackend ?? "blacksmith",
          ...context.preflightOutputs,
        },
      },
    },
    vars: {
      OPENCLAW_CI_RUNNER_BACKEND: context.runnerBackend ?? "",
    },
  });
}

function runCiGateFixture(jobResults: string) {
  const gateStep = readCiWorkflow().jobs["ci-gate"].steps.find(
    (step: WorkflowStep) => step.name === "Verify selected CI lanes",
  );
  return spawnSync("bash", ["-c", gateStep.run], {
    encoding: "utf8",
    env: {
      ...process.env,
      JOB_RESULTS: jobResults,
    },
  });
}

function renderCiGateEnvironment(
  context: Partial<Parameters<typeof evaluateWorkflowExpression>[1]> = {},
  results: Record<string, string> = {},
) {
  const workflow = readCiWorkflow();
  const step = workflow.jobs["ci-gate"].steps.find(
    (candidate: WorkflowStep) => candidate.name === "Verify selected CI lanes",
  );
  const preflightOutputs = {
    ...Object.fromEntries(
      Object.keys(workflow.jobs.preflight.outputs)
        .filter((key) => key.startsWith("run_"))
        .map((key) => [key, "true"]),
    ),
    compatibility_target: "false",
    release_scope: "full",
    ...context.preflightOutputs,
  };
  const jobResults: string = step.env.JOB_RESULTS;
  return jobResults.replace(/\$\{\{[\s\S]*?\}\}/gu, (expression) => {
    const result = expression.match(/^\$\{\{\s*needs\.([\w-]+)\.result\s*\}\}$/u);
    if (result) {
      return results[expectDefined(result[1], expression)] ?? "success";
    }
    return String(
      evaluateWorkflowExpression(expression, {
        eventName: "workflow_dispatch",
        repository: "openclaw/openclaw",
        runAttempt: 1,
        ...context,
        preflightOutputs,
      }) ?? "",
    );
  });
}

function quoteShell(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function runPreflightNodeInvocation(
  script: string,
  options: {
    checkoutRevision: string;
    eventName: "pull_request" | "push" | "workflow_dispatch";
    workflowRevision: string;
  },
) {
  const root = tempDirs.make("openclaw-preflight-runtime-");
  const binDir = path.join(root, "bin");
  const argsPath = path.join(root, "node-args");
  mkdirSync(binDir, { recursive: true });
  const nodePath = path.join(binDir, "node");
  writeFileSync(
    nodePath,
    '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$OPENCLAW_NODE_ARGS"\ncat >/dev/null\n',
  );
  chmodSync(nodePath, 0o755);
  const result = spawnSync("bash", ["-c", script], {
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: options.eventName,
      OPENCLAW_CI_CHECKOUT_REVISION: options.checkoutRevision,
      OPENCLAW_CI_WORKFLOW_REVISION: options.workflowRevision,
      OPENCLAW_NODE_ARGS: argsPath,
      PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
    },
  });
  expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
  return readFileSync(argsPath, "utf8").trim().split("\n");
}

function runWorkflowShellScript(
  script: string,
  options: { cwd?: string; env?: NodeJS.ProcessEnv },
) {
  const root = mkdtempSync(path.join(tmpdir(), "openclaw-workflow-shell-"));
  const modulePaths: string[] = [];
  try {
    let moduleIndex = 0;
    const moduleRoot = options.cwd ?? process.cwd();
    const rewritten = script
      .replace(
        /node (?:(?:--import tsx |"\$\{manifest_node_args\[@\]\}" ))?--input-type=module <<'([A-Z][A-Z0-9_]*)'\n([\s\S]*?)\n\1(?=\n|$)/gu,
        (_match, _marker: string, body: string) => {
          const modulePath = path.join(
            moduleRoot,
            `.openclaw-${path.basename(root)}-${moduleIndex}.mjs`,
          );
          moduleIndex += 1;
          modulePaths.push(modulePath);
          writeFileSync(modulePath, `${body}\n`, "utf8");
          return `${quoteShell(process.execPath)} --import ${quoteShell(TSX_IMPORT)} ${quoteShell(modulePath)}`;
        },
      )
      .replaceAll(
        "manifest_node_args+=(--import tsx)",
        `manifest_node_args+=(--import ${quoteShell(TSX_IMPORT)})`,
      );
    const scriptPath = path.join(root, "run.sh");
    writeFileSync(scriptPath, rewritten.endsWith("\n") ? rewritten : `${rewritten}\n`, "utf8");
    return spawnSync("bash", [scriptPath], {
      ...options,
      encoding: "utf8",
      // Child caches and temporary artifacts share the fixture's cleanup owner.
      // Inheriting a huge host tsx cache makes startup depend on unrelated runs.
      env: { ...(options.env ?? process.env), TMPDIR: root, TMP: root, TEMP: root },
    });
  } finally {
    for (const modulePath of modulePaths) {
      rmSync(modulePath, { force: true });
    }
    rmSync(root, { force: true, recursive: true });
  }
}

function runCiChangedScopeFixture(changedPaths: string[]): Record<string, string> {
  const outputPath = path.join(tempDirs.make("openclaw-ci-scope-"), "scope.out");
  writeGitHubOutput(
    detectChangedScope(changedPaths),
    outputPath,
    undefined,
    detectNodeFastScope(changedPaths),
    shouldRunNativeI18n(changedPaths),
    changedPaths,
  );
  return Object.fromEntries(
    readFileSync(outputPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

function runCiManifestFixture(options: {
  bundledPlanner: boolean;
  nodeTestShards?: Record<string, unknown>[];
  nodeTestGroupsCodec?: boolean;
  startupCorpusCoverage?: boolean;
  changedPlannerSource?: string | null;
  changedPaths?: string[] | null;
  changedCoreTestSupport?: boolean;
  repository?: string;
  eventName?: "pull_request" | "push" | "workflow_dispatch";
  historicalCompatibility?: boolean;
  iosCapabilities?: boolean;
  iosBuildCapability?: boolean;
  androidCiCapabilities?: boolean;
  nativeI18nCapabilities?: boolean;
  macosNodeParts?: boolean;
  openClawKitTests?: boolean;
  protocolCoverage?: boolean;
  packageVersion?: string;
  qaSmokePlan?: boolean;
  formatCheck?: boolean;
  releaseCandidateCompatibility?: boolean;
  releaseGate?: boolean;
  targetContextCompatibility?: boolean;
  nodeFastOnly?: boolean;
  nodeFastPluginContracts?: boolean;
  nodeFastCiRouting?: boolean;
  runNode?: boolean;
  historicalReader?: boolean;
  runnerBackend?: "blacksmith" | "github" | "hybrid";
  runnerProfile?: "blacksmith" | "github" | "hybrid";
  targetHostedRunnerProfileContract?: boolean;
  uiE2eProjectsCapability?: boolean;
  remoteTagRefs?: Record<string, string>;
  scopeEnv?: Record<string, string>;
}) {
  const root = mkdtempSync(path.join(tmpdir(), "openclaw-ci-manifest-"));
  try {
    const scriptsDir = path.join(root, "scripts", "lib");
    mkdirSync(scriptsDir, { recursive: true });
    // The manifest packs grouped Node rows through the target's codec and the
    // shard runner unpacks them; targets that predate the codec omit it.
    if (options.nodeTestGroupsCodec ?? true) {
      writeFileSync(
        path.join(scriptsDir, "ci-node-test-groups-codec.mts"),
        readFileSync("scripts/lib/ci-node-test-groups-codec.mts"),
      );
    }
    writeFileSync(
      path.join(scriptsDir, "ci-node-test-plan.mts"),
      options.nodeTestShards
        ? `export const createNodeTestShards = () => ${JSON.stringify(options.nodeTestShards)};
           export const createNodeTestShardBundles = createNodeTestShards;`
        : options.bundledPlanner
          ? `
          export const createNodeTestShards = () => [{
            checkName: "legacy-node-plan",
            configs: ["test/vitest/legacy.config.ts"],
            requiresDist: false,
            runner: "ubuntu-24.04",
            shardName: "legacy-node-plan",
          }];
          export const createNodeTestShardBundles = (options = {}) => [{
            checkName: "bundled-node-plan",
            configs: ["test/vitest/bundled.config.ts"],
            includePatterns: options.changedPaths,
            env: {
              OPENCLAW_CI_TEST_COMPACT_MODE: options.compactMode ?? "full",
              OPENCLAW_CI_TEST_RUNNER_BACKEND: options.runnerBackend ?? "",
            },
            requiresDist: false,
            runner: "ubuntu-24.04",
            shardName: "bundled-node-plan",
          }];
        `
          : `
          export const createNodeTestShards = () => [{
            checkName: "legacy-node-plan",
            configs: ["test/vitest/legacy.config.ts"],
            requiresDist: false,
            runner: "ubuntu-24.04",
            shardName: "legacy-node-plan",
          }];
        `,
      "utf8",
    );
    if (options.startupCorpusCoverage) {
      appendFileSync(
        path.join(scriptsDir, "ci-node-test-plan.mts"),
        `\nexport { hasCompleteStartupCorpusCoverage } from ${JSON.stringify(pathToFileURL(path.resolve("scripts/lib/ci-node-test-plan.mts")).href)};\n`,
      );
    }
    if (options.changedCoreTestSupport) {
      for (const file of [
        "scripts/changed-lanes.mts",
        "scripts/lib/changed-path-facts.mjs",
        "scripts/lib/release-changelog.mjs",
        "scripts/lib/arg-utils.mts",
        "scripts/lib/arg-utils.runtime.mjs",
        "scripts/lib/direct-run.mjs",
        "scripts/lib/merge-head-diff-base.mjs",
        "scripts/lib/record-shared.mjs",
        "packages/normalization-core/src/stable-stringify.ts",
        "scripts/run-tsgo-core-test-shards.mts",
        "scripts/run-additional-boundary-checks.mts",
      ]) {
        const target = path.join(root, file);
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, readFileSync(file));
      }
    }
    const iosCapabilities = options.iosCapabilities ?? options.bundledPlanner;
    const iosBuildCapability = options.iosBuildCapability ?? iosCapabilities;
    const nativeI18nCapabilities = options.nativeI18nCapabilities ?? options.bundledPlanner;
    const macosNodeParts = options.macosNodeParts ?? options.bundledPlanner;
    const packageScripts = options.bundledPlanner
      ? {
          ...(nativeI18nCapabilities
            ? {
                "android:i18n:check": "true",
                "apple:i18n:check": "true",
                "native:i18n:check": "true",
              }
            : {}),
          ...(iosBuildCapability ? { "ios:build": "true" } : {}),
          ...(macosNodeParts
            ? Object.fromEntries([1, 2, 3].map((part) => [`test:macos:ci:${part}`, "true"]))
            : {}),
          "check:assertion-safety": "true",
          "check:max-lines-ratchet": "true",
        }
      : {};
    writeFileSync(
      path.join(root, "package.json"),
      `${JSON.stringify({ version: options.packageVersion, scripts: packageScripts })}\n`,
    );
    if (options.bundledPlanner && options.changedPlannerSource !== null) {
      writeFileSync(
        path.join(scriptsDir, "ci-changed-node-test-plan.mts"),
        options.changedPlannerSource ??
          `
          export const createChangedNodeTestShards = (changedPaths) =>
            changedPaths.includes("src/focused.ts") ||
            changedPaths.includes("test/scripts/sqlite-sessions-transcripts-flip-proof.built-cli.e2e.test.ts")
              ? [{
                  checkName: "changed-node-plan",
                  configs: [],
                  requiresDist: false,
                  runner: "ubuntu-24.04",
                  shardName: "changed-node-plan",
                  targets: changedPaths.includes("src/focused.ts")
                    ? ["src/focused.test.ts"]
                    : ["test/scripts/sqlite-sessions-transcripts-flip-proof.built-cli.e2e.test.ts"],
                }]
              : null;
          export const createChangedExtensionFallbackShards = (changedPaths) =>
            changedPaths.some((changedPath) => changedPath.startsWith("extensions/"))
              ? changedPaths.some((changedPath) => changedPath.startsWith("extensions/matrix/"))
                ? [{
                    checkName: "changed-extension-fallback-plan",
                    configs: ["test/vitest/vitest.extension-matrix.config.ts"],
                    includePatterns: [
                      "extensions/matrix/src/client.test.ts",
                      "extensions/matrix/src/monitor.test.ts",
                    ],
                    requiresDist: false,
                    runner: "ubuntu-24.04",
                    shardName: "changed-extension-fallback-plan",
                    predictedSeconds: 120,
                  }]
                : [{
                  checkName: "changed-extension-fallback-plan",
                  configs: [],
                  requiresDist: false,
                  runner: "ubuntu-24.04",
                  shardName: "changed-extension-fallback-plan",
                  predictedSeconds: 120,
                  targets: ["extensions/codex/src/focused.test.ts"],
                }]
              : [];
          export const hasBuildArtifactAffectingChange = (changedPaths) =>
            !changedPaths.includes("test/scripts/sqlite-sessions-transcripts-flip-proof.built-cli.e2e.test.ts");
          export const hasSqliteSessionLifecycleAffectingChange = (changedPaths) =>
            changedPaths.includes("src/sqlite-session-owner.ts") ||
            changedPaths.includes("test/scripts/sqlite-sessions-transcripts-flip-proof.built-cli.e2e.test.ts");
          export const resolveChangedDockerSeedLanes = (changedPaths) => changedPaths.includes("scripts/e2e/docker-openai-seed.ts") ? ["mcp-channels", "cron-mcp-cleanup"] : [];
        `,
        "utf8",
      );
    }
    if (options.bundledPlanner) {
      const sqliteLifecycleProof = path.join(
        root,
        "test/scripts/sqlite-sessions-transcripts-flip-proof.built-cli.e2e.test.ts",
      );
      mkdirSync(path.dirname(sqliteLifecycleProof), { recursive: true });
      writeFileSync(sqliteLifecycleProof, "export {};\n");
      writeFileSync(
        path.join(scriptsDir, "channel-contract-test-plan.mts"),
        `export const createChannelContractTestShards = () => ["a", "b"].map((suffix) => ({
          checkName: "channel-contracts-" + suffix,
          includePatterns: ["src/channels/plugins/contracts/fixture-" + suffix + ".test.ts"],
          runtime: "node",
          task: "contracts-channels",
        }));\n`,
      );
      writeFileSync(
        path.join(scriptsDir, "plugin-contract-test-plan.mts"),
        `export const createPluginContractTestShards = () => ["a", "b"].map((suffix) => ({
          checkName: "plugin-contracts-" + suffix,
          includePatterns: ["src/plugins/contracts/fixture-" + suffix + ".test.ts"],
          runtime: "node",
          task: "contracts-plugins",
        }));\n`,
      );
    }
    if (options.qaSmokePlan ?? options.bundledPlanner) {
      const smokePlan = path.join(root, "extensions", "qa-lab", "src", "ci-smoke-plan.ts");
      mkdirSync(path.dirname(smokePlan), { recursive: true });
      writeFileSync(smokePlan, "export {};\n");
    }
    if (iosCapabilities) {
      for (const name of [
        "install-swift-tools.sh",
        "install-xcodegen.sh",
        "lint-swift.sh",
        "format-swift.sh",
      ]) {
        writeFileSync(path.join(root, "scripts", name), "#!/bin/sh\n");
      }
    }
    if (options.protocolCoverage ?? options.bundledPlanner) {
      writeFileSync(path.join(root, "scripts", "check-protocol-event-coverage.mjs"), "");
    }
    const targetWorkflow = path.join(root, ".github", "workflows", "ci.yml");
    mkdirSync(path.dirname(targetWorkflow), { recursive: true });
    writeFileSync(
      targetWorkflow,
      [
        ...((options.formatCheck ?? options.bundledPlanner)
          ? ["pnpm format:check", "pnpm format:check"]
          : []),
        ...((options.androidCiCapabilities ?? options.bundledPlanner)
          ? ["android-ci-contract-v2"]
          : []),
        ...((options.openClawKitTests ?? options.bundledPlanner)
          ? ["openclawkit-tests-contract-v1"]
          : []),
        ...(options.bundledPlanner ? ["docker-seed-e2e-contract-v1"] : []),
        ...((options.targetHostedRunnerProfileContract ?? options.bundledPlanner)
          ? ["hosted-runner-profile-contract-v1"]
          : []),
      ].join("\n"),
    );
    const uiE2eConfig = path.join(root, "test", "vitest", "vitest.ui-e2e.config.ts");
    mkdirSync(path.dirname(uiE2eConfig), { recursive: true });
    writeFileSync(
      uiE2eConfig,
      (options.uiE2eProjectsCapability ?? options.bundledPlanner)
        ? "// ui-e2e-projects-contract-v1\n"
        : 'export default { test: { name: "ui-e2e" } };\n',
    );
    const outputPath = path.join(root, "manifest.out");
    const summaryPath = path.join(root, "summary.md");
    const gitOwner = ".github/actions/git-owner";
    const trustedGitOwner = path.join(root, ".ci-harness", gitOwner);
    mkdirSync(trustedGitOwner, { recursive: true });
    for (const name of ["test-prerequisites.mjs", "test-prerequisites.json"]) {
      writeFileSync(path.join(trustedGitOwner, name), readFileSync(path.join(gitOwner, name)));
    }
    const trustedReleasePolicy = path.join(root, ".ci-harness/scripts/lib");
    mkdirSync(trustedReleasePolicy, { recursive: true });
    for (const name of ["release-context.mjs", "release-version.mjs"]) {
      writeFileSync(path.join(trustedReleasePolicy, name), readFileSync(`scripts/lib/${name}`));
    }
    const fixtureBin = path.join(root, "bin");
    let correctionBaseSha = "";
    if (options.remoteTagRefs) {
      mkdirSync(fixtureBin);
      const ghFixture = path.join(root, "gh.mjs");
      writeFileSync(
        ghFixture,
        `
        const [command, endpoint, queryFlag, query] = process.argv.slice(2);
        const baseRef = ${JSON.stringify(`refs/tags/v${options.packageVersion}`)};
        if (process.env.GH_TOKEN !== "test-token" || command !== "api" ||
            endpoint !== "repos/openclaw/openclaw/commits/" + encodeURIComponent(baseRef) ||
            queryFlag !== "--jq" || query !== ".sha") {
          throw new Error("Expected authenticated, fully qualified correction base lookup");
        }
        const refs = ${JSON.stringify(options.remoteTagRefs)};
        if (!refs[baseRef]) throw new Error("gh: Not Found (HTTP 404)");
        process.stdout.write((refs[baseRef + "^{}"] ?? refs[baseRef]) + "\\n");
      `,
      );
      writeExecutable(path.join(fixtureBin, "gh"), [
        "#!/bin/sh",
        `exec ${quoteShell(process.execPath)} ${quoteShell(ghFixture)} "$@"`,
      ]);
      writeExecutable(path.join(fixtureBin, "git"), [
        "#!/bin/sh",
        "echo 'Anonymous Git transport is unavailable' >&2",
        "exit 128",
      ]);
      const correctionStep = expectDefined(
        readCiWorkflow().jobs.preflight.steps.find(
          (step: WorkflowStep) => step.name === "Resolve release correction base",
        ),
        "trusted correction base producer",
      );
      const correctionOutput = path.join(root, "correction.out");
      writeFileSync(correctionOutput, "");
      const correction = runWorkflowShellScript(correctionStep.run, {
        cwd: root,
        env: {
          PATH: `${fixtureBin}${path.delimiter}${process.env.PATH ?? ""}`,
          GH_TOKEN: correctionStep.env?.GH_TOKEN === "${{ github.token }}" ? "test-token" : "",
          GITHUB_REPOSITORY: "openclaw/openclaw",
          GITHUB_OUTPUT: correctionOutput,
          TARGET_CONTEXT_REF:
            options.scopeEnv?.OPENCLAW_CI_TARGET_CONTEXT_TARGET === "true"
              ? options.scopeEnv.OPENCLAW_CI_TARGET_CONTEXT_REF
              : options.scopeEnv?.OPENCLAW_CI_HISTORICAL_TARGET_TAG,
        },
      });
      if (correction.status !== 0) {
        return {
          output: `${correction.stdout}${correction.stderr}`,
          outputs: {} as Record<string, string>,
          status: correction.status,
          summary: "",
        };
      }
      correctionBaseSha = readWorkflowOutputs(correctionOutput).sha ?? "";
    }
    if (options.historicalReader) {
      const reader = path.join(root, "src/audit/message-delivery-progress-store.test.ts");
      mkdirSync(path.dirname(reader), { recursive: true });
      writeFileSync(reader, "export {};\n");
    }
    writeFileSync(outputPath, "", "utf8");
    writeFileSync(summaryPath, "", "utf8");
    const manifestStep = readCiWorkflow().jobs.preflight.steps.find(
      (step: { name?: string }) => step.name === "Build CI manifest",
    );
    const run = runWorkflowShellScript(manifestStep.run, {
      cwd: root,
      env: {
        ...process.env,
        GH_TOKEN: "",
        GITHUB_TOKEN: "",
        GITHUB_OUTPUT: outputPath,
        GITHUB_RUN_ATTEMPT: "1",
        GITHUB_STEP_SUMMARY: summaryPath,
        RUNNER_TEMP: root,
        PATH: options.remoteTagRefs
          ? `${fixtureBin}${path.delimiter}${process.env.PATH ?? ""}`
          : process.env.PATH,
        OPENCLAW_CI_CHANGED_PATHS_JSON:
          options.changedPaths === undefined ? undefined : JSON.stringify(options.changedPaths),
        OPENCLAW_CI_CHECKOUT_REVISION: "a".repeat(40),
        OPENCLAW_CI_CORRECTION_BASE_SHA: correctionBaseSha,
        OPENCLAW_CI_DOCS_CHANGED: "true",
        OPENCLAW_CI_DOCS_ONLY: "false",
        OPENCLAW_CI_EVENT_NAME: options.eventName ?? "workflow_dispatch",
        OPENCLAW_CI_HISTORICAL_TARGET:
          (options.historicalCompatibility ?? true) &&
          (options.eventName ?? "workflow_dispatch") === "workflow_dispatch"
            ? "true"
            : "false",
        OPENCLAW_CI_RELEASE_GATE: String(options.releaseGate ?? false),
        OPENCLAW_CI_RELEASE_CANDIDATE_TARGET:
          options.releaseCandidateCompatibility === true ? "true" : "false",
        OPENCLAW_CI_TARGET_CONTEXT_TARGET:
          options.targetContextCompatibility === true ? "true" : "false",
        OPENCLAW_CI_REPOSITORY: options.repository ?? "openclaw/openclaw",
        OPENCLAW_CI_RUN_ANDROID: "true",
        OPENCLAW_CI_RUN_CONTROL_UI_I18N: "true",
        OPENCLAW_CI_RUN_IOS_BUILD: "true",
        OPENCLAW_CI_RUN_MACOS: "true",
        OPENCLAW_CI_RUN_NATIVE_I18N: "true",
        OPENCLAW_CI_RUN_NODE: String(options.runNode ?? true),
        OPENCLAW_CI_RUN_NODE_FAST_CI_ROUTING: String(options.nodeFastCiRouting ?? false),
        OPENCLAW_CI_RUN_NODE_FAST_ONLY: String(options.nodeFastOnly ?? false),
        OPENCLAW_CI_RUN_NODE_FAST_PLUGIN_CONTRACTS: String(
          options.nodeFastPluginContracts ?? false,
        ),
        OPENCLAW_CI_RUNNER_BACKEND: options.runnerBackend ?? options.runnerProfile ?? "",
        OPENCLAW_CI_RUNNER_PROFILE: options.runnerProfile ?? options.runnerBackend ?? "blacksmith",
        OPENCLAW_CI_RUN_SKILLS_PYTHON: "true",
        OPENCLAW_CI_RUN_WINDOWS: "true",
        OPENCLAW_CI_WORKFLOW_REVISION: "b".repeat(40),
        ...options.scopeEnv,
      },
    });
    const outputs = Object.fromEntries(
      readFileSync(outputPath, "utf8")
        .trim()
        .split("\n")
        .map((line) => {
          const separator = line.indexOf("=");
          return [line.slice(0, separator), line.slice(separator + 1)];
        }),
    );
    return {
      output: `${run.stdout}${run.stderr}`,
      outputChars: readFileSync(outputPath, "utf8").length,
      outputs,
      status: run.status,
      summary: readFileSync(summaryPath, "utf8"),
    };
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

const readFrozenAdditionalCheckRows = (() => {
  let rows: Array<{ check_name: string; group: string; runner: string }> | undefined;
  return () => {
    if (!rows) {
      const manifest = runCiManifestFixture({
        bundledPlanner: true,
        eventName: "workflow_dispatch",
        historicalCompatibility: true,
        changedPaths: [],
        scopeEnv: {
          OPENCLAW_CI_CHECKOUT_REVISION: "a".repeat(40),
          OPENCLAW_CI_WORKFLOW_REVISION: "b".repeat(40),
        },
      });
      expect(manifest.status, manifest.output).toBe(0);
      rows = JSON.parse(
        expectDefined(manifest.outputs.check_additional_matrix, "additional check matrix"),
      ).include;
    }
    return structuredClone(expectDefined(rows, "frozen additional check rows"));
  };
})();

function runRunnerProfileFixture(options: {
  authorAssociation?: string;
  configuredProfile?: string;
  eventName: "pull_request" | "push" | "workflow_dispatch";
  headRepository?: string;
  repository?: string;
  runAttempt?: number;
  targetSupportsContract: boolean;
}) {
  const root = mkdtempSync(path.join(tmpdir(), "openclaw-ci-runner-profile-"));
  try {
    const workflowPath = path.join(root, ".github", "workflows", "ci.yml");
    mkdirSync(path.dirname(workflowPath), { recursive: true });
    writeFileSync(
      workflowPath,
      options.targetSupportsContract ? "hosted-runner-profile-contract-v1\n" : "name: legacy\n",
      "utf8",
    );
    const outputPath = path.join(root, "profile.out");
    writeFileSync(outputPath, "", "utf8");
    const step = expectDefined(
      readCiWorkflow().jobs.preflight.steps.find(
        (candidate: WorkflowStep) => candidate.name === "Resolve logical runner profile",
      ),
      "logical runner profile preflight step",
    );
    const result = runWorkflowShellScript(expectDefined(step.run, "runner profile script"), {
      cwd: root,
      env: {
        ...process.env,
        AUTHOR_ASSOCIATION: options.authorAssociation ?? "",
        CONFIGURED_RUNNER_PROFILE: options.configuredProfile ?? "",
        GITHUB_EVENT_NAME: options.eventName,
        GITHUB_OUTPUT: outputPath,
        GITHUB_REPOSITORY: options.repository ?? "openclaw/openclaw",
        HEAD_REPOSITORY: options.headRepository ?? options.repository ?? "openclaw/openclaw",
        GITHUB_RUN_ATTEMPT: String(options.runAttempt ?? 1),
      },
    });
    const outputs = Object.fromEntries(
      readFileSync(outputPath, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const separator = line.indexOf("=");
          return [line.slice(0, separator), line.slice(separator + 1)];
        }),
    );
    return { output: `${result.stdout}${result.stderr}`, outputs, status: result.status };
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

function runCiReleaseRefValidation(options: {
  kind?: "context" | "historical" | "candidate";
  ref: string;
  targetSha: string;
  resolvedSha?: string;
  comparisonStatus?: string;
  apiError?: "ref" | "comparison";
}) {
  const root = tempDirs.make("openclaw-ci-target-context-");
  const outputPath = path.join(root, "github-output");
  const binPath = path.join(root, "bin");
  const resolvedSha = options.resolvedSha ?? "b".repeat(40);
  const kind = options.kind ?? "context";
  const ref = `refs/${kind === "historical" ? "tags" : "heads"}/${options.ref}`;
  mkdirSync(binPath);
  writeFileSync(
    path.join(root, "ci-git-owner.py"),
    readFileSync(".github/actions/git-owner/owner.py"),
  );
  writeFileSync(outputPath, "", "utf8");
  writeFileSync(
    path.join(binPath, "git"),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "-C" ]]; then shift 2; fi
if [[ "$*" == "remote get-url origin" ]]; then
  printf '%s\\n' 'https://github.com/openclaw/openclaw.git'
else
  echo 'fatal: could not read Username for https://github.com: terminal prompts disabled' >&2
  exit 128
fi
`,
    "utf8",
  );
  writeFileSync(
    path.join(binPath, "gh"),
    `#!/usr/bin/env bash
set -euo pipefail
[[ "\${GH_TOKEN:-}" == "test-token" ]] || exit 4
[[ "$1" == "api" ]] || exit 64
shift
if [[ "$1" == "--method" && "$2" == "GET" ]]; then shift 2; fi
[[ "$#" == 3 && "$2" == "--jq" ]] || exit 64
case "$1" in
  "$MOCK_REF_ENDPOINT") kind=ref; value="$MOCK_REF_SHA"; query=.sha ;;
  "$MOCK_COMPARE_ENDPOINT") kind=comparison; value="$MOCK_COMPARE_STATUS"; query=.status ;;
  *) echo "Unexpected GitHub API endpoint: $1" >&2; exit 64 ;;
esac
[[ "$3" == "$query" ]] || exit 64
# Valid-looking partial output must not authorize a failed request.
printf '%s\\n' "$value"
if [[ "$MOCK_API_ERROR" == "$kind" ]]; then
  echo 'gh: Service Unavailable (HTTP 503)' >&2
  exit 1
fi
`,
    "utf8",
  );
  chmodSync(path.join(binPath, "git"), 0o755);
  chmodSync(path.join(binPath, "gh"), 0o755);
  const stepName = {
    context: "Validate target context",
    historical: "Validate historical release target",
    candidate: "Validate release candidate target",
  }[kind];
  const step = expectDefined(
    readCiWorkflow().jobs.preflight.steps.find(
      (candidate: WorkflowStep) => candidate.name === stepName,
    ),
    stepName,
  );
  const run = spawnSync(
    "bash",
    ["-c", expectDefined(step.run, "target context validation script")],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        GH_TOKEN: step.env?.GH_TOKEN === "${{ github.token }}" ? "test-token" : "",
        GITHUB_REPOSITORY: "openclaw/openclaw",
        GITHUB_OUTPUT: outputPath,
        MOCK_REF_ENDPOINT: `repos/openclaw/openclaw/commits/${encodeURIComponent(ref)}`,
        MOCK_REF_SHA: resolvedSha,
        MOCK_COMPARE_ENDPOINT: `repos/openclaw/openclaw/compare/${options.targetSha}...${resolvedSha}`,
        MOCK_COMPARE_STATUS: options.comparisonStatus ?? "ahead",
        MOCK_API_ERROR: options.apiError ?? "",
        RUNNER_TEMP: root,
        PATH: `${binPath}:${process.env.PATH ?? ""}`,
        TARGET_CONTEXT_REF: options.ref,
        TARGET_REF: options.targetSha,
        EXPECTED_SHA: options.targetSha,
        HISTORICAL_TARGET_TAG: options.ref,
        RELEASE_CANDIDATE_REF: options.ref,
      },
    },
  );
  return {
    output: `${run.stdout}${run.stderr}`,
    outputs: readWorkflowOutputs(outputPath),
    status: run.status,
  };
}

function runCandidateTrustClassification(options: {
  checkoutRevision: string;
  defaultRevision?: string;
  eventName: "pull_request" | "push" | "workflow_dispatch";
  historicalTarget?: boolean;
  ref?: string;
  releaseCandidateTarget?: boolean;
  releaseGate?: boolean;
  targetContextTarget?: boolean;
  targetRef?: string;
  workflowRevision?: string;
}) {
  const root = tempDirs.make("openclaw-ci-candidate-trust-");
  const outputPath = path.join(root, "github-output");
  const binPath = path.join(root, "bin");
  const defaultRevision = options.defaultRevision ?? "b".repeat(40);
  mkdirSync(binPath);
  writeFileSync(outputPath, "", "utf8");
  for (const command of ["git", "gh"]) {
    writeExecutable(path.join(binPath, command), [
      "#!/bin/sh",
      "echo 'Cache trust must consume the resolved default SHA without another lookup' >&2",
      "exit 128",
    ]);
  }
  const step = expectDefined(
    readCiWorkflow().jobs.preflight.steps.find(
      (candidate: WorkflowStep) => candidate.name === "Classify candidate cache trust",
    ),
    "candidate cache trust step",
  );
  const script = expectDefined(step.run, "candidate cache trust script");
  const run = spawnSync("bash", ["-c", script], {
    encoding: "utf8",
    env: {
      ...process.env,
      CHECKOUT_REVISION: options.checkoutRevision,
      DEFAULT_SHA: defaultRevision,
      GITHUB_EVENT_NAME: options.eventName,
      GITHUB_OUTPUT: outputPath,
      GITHUB_REF: options.ref ?? "",
      HISTORICAL_TARGET: String(options.historicalTarget ?? false),
      RUNNER_TEMP: root,
      PATH: `${binPath}:${process.env.PATH ?? ""}`,
      RELEASE_CANDIDATE_TARGET: String(options.releaseCandidateTarget ?? false),
      RELEASE_GATE: String(options.releaseGate ?? false),
      TARGET_CONTEXT_TARGET: String(options.targetContextTarget ?? false),
      TARGET_REF: options.targetRef ?? "",
      WORKFLOW_REVISION: options.workflowRevision ?? "a".repeat(40),
    },
  });
  return {
    output: `${run.stdout}${run.stderr}`,
    outputs: readWorkflowOutputs(outputPath),
    status: run.status,
  };
}

function readAndroidToolchainAction() {
  return parse(readFileSync(SETUP_ANDROID_TOOLCHAIN_ACTION, "utf8"));
}

function readWorkflowSanityWorkflow() {
  return parse(readFileSync(".github/workflows/workflow-sanity.yml", "utf8"));
}

function readCriticalQualityWorkflow() {
  return readFileSync(".github/workflows/codeql-critical-quality.yml", "utf8");
}

function readWorkflow(filePath: string) {
  return parse(readFileSync(filePath, "utf8"));
}

const PULL_REQUEST_EDIT_FIELDS = ["title", "body", "base"] as const;

function readPullRequestEditFields(condition: unknown) {
  const expression = typeof condition === "string" ? condition : "";
  return PULL_REQUEST_EDIT_FIELDS.filter((field) =>
    expression.includes(`github.event.changes.${field}`),
  );
}

function readTrackedText(relativePath: string): string {
  if (existsSync(relativePath)) {
    return readFileSync(relativePath, "utf8");
  }
  return execFileSync("git", ["show", `:${relativePath}`], { encoding: "utf8" });
}

function findYamlFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      return findYamlFiles(entryPath);
    }
    return entry.isFile() && /\.ya?ml$/u.test(entry.name) ? [entryPath] : [];
  });
}

function findUnpinnedExternalActions(): string[] {
  const violations: string[] = [];
  for (const workflowPath of [
    ...findYamlFiles(".github/workflows"),
    ...findYamlFiles(".github/actions"),
  ]) {
    for (const [index, line] of readFileSync(workflowPath, "utf8").split("\n").entries()) {
      const uses = line.match(/^\s*(?:-\s*)?uses:\s*([^#\s]+)/u)?.[1];
      if (
        !uses ||
        uses.startsWith("./") ||
        uses.startsWith("docker://") ||
        OIDC_BOUND_MAIN_REUSABLE_WORKFLOWS.has(uses)
      ) {
        continue;
      }
      const at = uses.lastIndexOf("@");
      if (at < 1 || !/^[a-f0-9]{40}$/u.test(uses.slice(at + 1))) {
        violations.push(`${workflowPath}:${index + 1}: ${uses}`);
      }
    }
  }
  return violations;
}

function runGit(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function runDiffBaseFixture(options: {
  commitCount: 1 | 2 | 3;
  eventBaseSha: string;
  defaultBranch?: string;
  manual?: boolean;
  apiError?: "ref" | "comparison";
}) {
  const root = tempDirs.make("openclaw-ci-diff-base-");
  runGit(root, ["init", "-q", "-b", "main"]);
  runGit(root, ["config", "commit.gpgsign", "false"]);
  runGit(root, ["config", "user.email", "ci-fixture@example.com"]);
  runGit(root, ["config", "user.name", "CI Fixture"]);
  for (let index = 1; index <= options.commitCount; index += 1) {
    writeFileSync(path.join(root, "fixture.txt"), `commit ${index}\n`, "utf8");
    runGit(root, ["add", "fixture.txt"]);
    runGit(root, ["commit", "-q", "-m", `fixture ${index}`]);
  }

  const headSha = runGit(root, ["rev-parse", "HEAD"]);
  const parentSha =
    options.commitCount > 1 ? runGit(root, ["rev-parse", "--verify", "HEAD^1"]) : null;
  const eventBaseSha = options.eventBaseSha === "parent" ? parentSha! : options.eventBaseSha;
  const outputPath = path.join(root, "github-output");
  writeFileSync(outputPath, "", "utf8");
  const diffBaseStep = readCiWorkflow().jobs.preflight.steps.find(
    (step: WorkflowStep) => step.name === "Resolve exact diff base",
  );
  const defaultBranch = options.defaultBranch ?? "main";
  const fixtureEnv: NodeJS.ProcessEnv = {};
  if (options.manual) {
    const bin = path.join(root, "bin");
    mkdirSync(bin);
    writeFileSync(
      path.join(root, "ci-git-owner.py"),
      readFileSync(".github/actions/git-owner/owner.py"),
    );
    writeExecutable(path.join(bin, "git"), [
      "#!/bin/sh",
      'if [ "$1" = -C ]; then shift 2; fi',
      `[ "$*" = 'rev-parse HEAD' ] || { echo 'Anonymous Git transport is unavailable' >&2; exit 128; }`,
      `printf '%s\\n' '${headSha}'`,
    ]);
    writeExecutable(path.join(bin, "gh"), [
      "#!/bin/sh",
      '[ "$GH_TOKEN" = test-token ] || exit 4',
      '[ "$1" = api ] || exit 64',
      "shift",
      'if [ "$1" = --method ]; then [ "$2" = GET ] || exit 64; shift 2; fi',
      'case "$*" in',
      `  'repos/openclaw/openclaw/commits/${encodeURIComponent(`refs/heads/${defaultBranch}`)} --jq .sha') kind=ref ;;`,
      `  'repos/openclaw/openclaw/compare/${parentSha}...${headSha} --jq .merge_base_commit.sha') kind=comparison ;;`,
      "  *) exit 64 ;;",
      "esac",
      `printf '%s\\n' '${parentSha}'`,
      'if [ "$MOCK_API_ERROR" = "$kind" ]; then echo "gh: Service Unavailable (HTTP 503)" >&2; exit 1; fi',
    ]);
    fixtureEnv.PATH = `${bin}${path.delimiter}${process.env.PATH ?? ""}`;
    fixtureEnv.GH_TOKEN = evaluateWorkflowExpression(diffBaseStep.env.GH_TOKEN, {
      eventName: "workflow_dispatch",
      repository: "openclaw/openclaw",
      runAttempt: 1,
      workflowToken: "test-token",
    });
    fixtureEnv.RUNNER_TEMP = root;
    fixtureEnv.MOCK_API_ERROR = options.apiError ?? "";
  }
  const run = runWorkflowShellScript(diffBaseStep.run, {
    cwd: root,
    env: {
      ...process.env,
      DEFAULT_BRANCH: defaultBranch,
      EVENT_BASE_SHA: eventBaseSha,
      GITHUB_EVENT_NAME: options.manual ? "workflow_dispatch" : "push",
      GITHUB_OUTPUT: outputPath,
      GITHUB_REPOSITORY: "openclaw/openclaw",
      PULL_REQUEST_NUMBER: "",
      RELEASE_GATE: "false",
      ...fixtureEnv,
    },
  });
  const rawOutputs = readFileSync(outputPath, "utf8").trim();
  const outputs: Record<string, string> =
    rawOutputs === ""
      ? {}
      : Object.fromEntries(
          rawOutputs.split("\n").map((line) => {
            const separator = line.indexOf("=");
            return [line.slice(0, separator), line.slice(separator + 1)];
          }),
        );
  const emittedBaseIsCommit =
    typeof outputs.sha === "string" &&
    spawnSync("git", ["cat-file", "-e", `${outputs.sha}^{commit}`], { cwd: root }).status === 0;
  return {
    emittedBaseIsCommit,
    eventBaseSha,
    headSha,
    output: `${run.stdout}${run.stderr}`,
    outputs,
    parentSha,
    status: run.status,
  };
}

function writeExecutable(filePath: string, lines: string[]): void {
  writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
  chmodSync(filePath, 0o755);
}

function readWorkflowOutputs(outputPath: string): Record<string, string> {
  if (!existsSync(outputPath)) {
    return {};
  }
  const output = readFileSync(outputPath, "utf8").trim();
  return output
    ? Object.fromEntries(
        output.split("\n").map((line) => {
          const separator = line.indexOf("=");
          return [line.slice(0, separator), line.slice(separator + 1)];
        }),
      )
    : {};
}

function runCheckShardFixture(options: {
  frozenTarget: boolean;
  scripts: string[];
  task?: "guards" | "npm-lock" | "test-types";
  checkoutBase?: string;
  types?: {
    compose?: boolean;
    profile?: "blacksmith" | "github" | "hybrid";
    eventName?: "pull_request" | "push" | "workflow_dispatch";
    stripeSupport?: boolean;
    hostedContract?: boolean;
    failStripe?: string;
    changedPathsJson?: string;
    boundary?: boolean;
  };
}): {
  calls: string[];
  output: string;
  status: number | null;
  typeCalls: { row: string; command: string; localCheck: string | null }[];
  rows: { name: string; status: number | null }[];
} {
  const root = tempDirs.make("openclaw-ci-guards-");
  const fakeBin = path.join(root, "bin");
  const callsPath = path.join(root, "pnpm-calls.txt");
  const typeCallsPath = path.join(root, "type-calls.txt");
  const typeCheck = options.task === "test-types";
  mkdirSync(fakeBin);
  if (typeCheck) {
    mkdirSync(path.join(root, "scripts"));
    writeFileSync(
      path.join(root, "scripts/run-tsgo-core-test-shards.mts"),
      options.types?.stripeSupport === false ? "// legacy runner\n" : "// --stripe\n",
    );
    writeFileSync(
      path.join(root, "scripts/run-tsgo-core-test-shards.mjs"),
      `import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(process.env.TYPE_CALLS, [process.env.TYPE_ROW, process.env.OPENCLAW_LOCAL_CHECK ?? "<unset>", "node " + args.join(" ")].join("\\t") + "\\n");
if (args[args.indexOf("--stripe") + 1] === process.env.FAIL_TYPE_STRIPE) process.exit(17);
`,
    );
  }
  if (options.types?.boundary) {
    writeFileSync(
      path.join(root, "scripts/run-additional-boundary-checks.mts"),
      readFileSync("scripts/run-additional-boundary-checks.mts"),
    );
    for (const directory of ["scripts/lib", "packages", "node_modules"]) {
      symlinkSync(path.resolve(directory), path.join(root, directory), "dir");
    }
    writeFileSync(
      path.join(root, "scripts/check-native-state-schema-version.mjs"),
      `
import { appendFileSync } from "node:fs";
appendFileSync(process.env.TYPE_CALLS, [process.env.TYPE_ROW, process.env.OPENCLAW_LOCAL_CHECK ?? "<unset>", "node scripts/check-native-state-schema-version.mjs"].join("\\t") + "\\n");
`,
    );
  }
  const scripts = Object.fromEntries(options.scripts.map((name) => [name, "true"]));
  if (options.types?.compose) {
    // The full-path root-coverage probe must see the actual package alias.
    scripts["tsgo:test"] = (
      JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> }
    ).scripts["tsgo:test"]!;
  }
  writeFileSync(path.join(root, "package.json"), `${JSON.stringify({ scripts })}\n`);
  writeExecutable(path.join(fakeBin, "pnpm"), [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    'if [ "$*" = "run --silent" ]; then exit 1; fi',
    'printf "%s\\n" "$*" >> "$PNPM_CALLS"',
    ...(typeCheck
      ? [
          'printf "%s\\t%s\\tpnpm %s\\n" "$TYPE_ROW" "${OPENCLAW_LOCAL_CHECK-<unset>}" "$*" >> "$TYPE_CALLS"',
        ]
      : []),
  ]);
  const workflow = readCiWorkflow();
  const checkShardStep = workflow.jobs["check-shard"].steps.find(
    (step: WorkflowStep) => step.name === "Run check shard",
  );
  const context: Parameters<typeof evaluateWorkflowExpression>[1] = {
    eventName:
      options.types?.eventName ?? (options.frozenTarget ? "workflow_dispatch" : "pull_request"),
    repository: "openclaw/openclaw",
    runAttempt: 1,
    frozenTarget: options.frozenTarget,
    hostedRunnerProfileContract: options.types?.hostedContract ?? true,
    runnerProfile: options.types?.profile ?? "hybrid",
    preflightOutputs: {
      compatibility_target: String(options.frozenTarget),
      run_format_check: "false",
      changed_core_test_paths_json: options.types?.changedPathsJson ?? "",
    },
  };
  const rows: { name: string; step: WorkflowStep; matrix: Record<string, unknown> }[] = [];
  const coreJob = workflow.jobs["check-test-types-hosted-core-shard"];
  if (options.types?.compose && evaluateWorkflowExpression(coreJob.if, context)) {
    for (const stripe of coreJob.strategy.matrix.stripe) {
      rows.push({
        name: `core-${stripe}`,
        step: coreJob.steps.find(
          (step: WorkflowStep) => step.name === "Run hosted core test-types stripe",
        ),
        matrix: { stripe },
      });
    }
  }
  rows.push({ name: "central", step: checkShardStep, matrix: { task: options.task ?? "guards" } });
  if (options.types?.boundary) {
    rows.push({
      name: "boundary",
      step: workflow.jobs["check-additional-shard"].steps.find(
        (step: WorkflowStep) => step.name === "Run additional check shard",
      ),
      matrix: { group: "boundaries" },
    });
  }
  // Rows are independent (matrix fail-fast:false); each real Bash body owns its halt.
  const runs = rows.map((row) => {
    const resolveValue = (value: unknown) =>
      typeof value === "string" && value.startsWith("${{")
        ? evaluateWorkflowExpression(value, { ...context, matrix: row.matrix })
        : value;
    const command = typeCheck
      ? row.step.run!.replace(/\$\{\{[\s\S]*?\}\}/gu, (expression) =>
          String(resolveValue(expression)),
        )
      : row.step.run!;
    return Object.assign(
      spawnSync("bash", ["-c", command], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          FROZEN_TARGET: options.frozenTarget ? "true" : "false",
          FORMAT_CHECK: "false",
          HISTORICAL_TARGET: options.frozenTarget ? "true" : "false",
          HOSTED_RUNNER_STRIPES: "true",
          CHECKOUT_BASE_SHA: options.checkoutBase ?? "",
          PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
          PNPM_CALLS: callsPath,
          TASK: options.task ?? "guards",
          ...(typeCheck
            ? {
                OPENCLAW_LOCAL_CHECK: undefined,
                TYPE_ROW: row.name,
                TYPE_CALLS: typeCallsPath,
                FAIL_TYPE_STRIPE: options.types?.failStripe,
                ...Object.fromEntries(
                  Object.entries(row.step.env ?? {}).map(([key, value]) => [
                    key,
                    String(resolveValue(value)),
                  ]),
                ),
              }
            : {}),
        },
      }),
      { name: row.name },
    );
  });
  const failed = runs.find((run) => run.status !== 0);
  return {
    calls: existsSync(callsPath)
      ? readFileSync(callsPath, "utf8").trim().split("\n").filter(Boolean)
      : [],
    output: runs.map((run) => `${run.stdout}${run.stderr}`).join("\n"),
    status: failed ? failed.status : 0,
    typeCalls: existsSync(typeCallsPath)
      ? readFileSync(typeCallsPath, "utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const [row, localCheck, command] = line.split("\t");
            return {
              row: row!,
              command: command!,
              localCheck: localCheck === "<unset>" ? null : localCheck!,
            };
          })
      : [],
    rows: runs.map(({ name, status }) => ({ name, status })),
  };
}

function runDependencyCheckFixture(options: {
  historicalTarget: boolean;
  releaseToolingEntry?: boolean;
  scripts: string[];
}): {
  calls: string[];
  output: string;
  status: number | null;
} {
  const root = mkdtempSync(path.join(tmpdir(), "openclaw-ci-deadcode-"));
  try {
    const fakeBin = path.join(root, "bin");
    const callsPath = path.join(root, "pnpm-calls.txt");
    mkdirSync(fakeBin);
    writeFileSync(
      path.join(root, "package.json"),
      `${JSON.stringify({
        scripts: Object.fromEntries(options.scripts.map((name) => [name, "true"])),
      })}\n`,
    );
    if (options.releaseToolingEntry) {
      mkdirSync(path.join(root, "config"), { recursive: true });
      mkdirSync(path.join(root, "scripts"), { recursive: true });
      writeFileSync(
        path.join(root, "config/knip.config.ts"),
        "const repositoryScriptEntries = [\n] as const;\n",
      );
      writeFileSync(path.join(root, "scripts/generate-dependency-release-evidence.mts"), "");
    }
    writeExecutable(path.join(fakeBin, "pnpm"), [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      'if [ "${EXPECT_RELEASE_TOOLING_ENTRY:-false}" = "true" ] &&',
      "  ! grep -Fq '\"scripts/generate-dependency-release-evidence.mts!\"' config/knip.config.ts; then",
      '  echo "release-only helper is missing from Knip entries" >&2',
      "  exit 1",
      "fi",
      'printf "%s\\n" "$*" >> "$PNPM_CALLS"',
    ]);
    const checkShardRun = readCiWorkflow().jobs["check-shard"].steps.find(
      (step: WorkflowStep) => step.name === "Run check shard",
    ).run;
    const run = spawnSync("bash", ["-c", checkShardRun], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        EXPECT_RELEASE_TOOLING_ENTRY: options.releaseToolingEntry ? "true" : "false",
        FROZEN_TARGET: options.historicalTarget ? "true" : "false",
        FORMAT_CHECK: "false",
        HISTORICAL_TARGET: options.historicalTarget ? "true" : "false",
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        PNPM_CALLS: callsPath,
        TASK: "dependencies",
      },
    });
    return {
      calls: existsSync(callsPath)
        ? readFileSync(callsPath, "utf8").trim().split("\n").filter(Boolean)
        : [],
      output: `${run.stdout}${run.stderr}`,
      status: run.status,
    };
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

function runControlUiI18nSourceFixture(options: {
  compatibilityTarget: boolean;
  hasVerifyScript: boolean;
}): { calls: string[]; output: string; summary: string; status: number | null } {
  const root = mkdtempSync(path.join(tmpdir(), "openclaw-ci-control-ui-i18n-"));
  try {
    const fakeBin = path.join(root, "bin");
    const callsPath = path.join(root, "pnpm-calls.txt");
    const summaryPath = path.join(root, "summary.md");
    mkdirSync(fakeBin);
    writeFileSync(
      path.join(root, "package.json"),
      `${JSON.stringify({
        scripts: options.hasVerifyScript ? { "ui:i18n:verify": "true" } : {},
      })}\n`,
    );
    writeExecutable(path.join(fakeBin, "pnpm"), [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      'printf "%s\\n" "$*" >> "$PNPM_CALLS"',
    ]);
    const sourceStep = readCiWorkflow().jobs["control-ui-i18n"].steps.find(
      (step: WorkflowStep) => step.name === "Verify Control UI i18n source",
    );
    const run = spawnSync("bash", ["-c", sourceStep.run], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        COMPATIBILITY_TARGET: options.compatibilityTarget ? "true" : "false",
        GITHUB_STEP_SUMMARY: summaryPath,
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        PNPM_CALLS: callsPath,
      },
    });
    return {
      calls: existsSync(callsPath)
        ? readFileSync(callsPath, "utf8").trim().split("\n").filter(Boolean)
        : [],
      output: `${run.stdout}${run.stderr}`,
      status: run.status,
      summary: existsSync(summaryPath) ? readFileSync(summaryPath, "utf8") : "",
    };
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

describe("ci workflow guards", () => {
  it("credits the max-lines baseline only through an emitted required ratchet guard", () => {
    const manifest = runCiManifestFixture({
      bundledPlanner: true,
      eventName: "pull_request",
      changedPaths: ["config/max-lines-baseline.txt"],
      changedPlannerSource: `
        export const hasBuildArtifactAffectingChange = () => false;
        export const createChangedNodeTestShards = (_paths, options) => {
          console.log("max-lines-guard:" + JSON.stringify(options.dedicatedMaxLinesRatchet));
          return [];
        };
        export const createChangedExtensionFallbackShards = () => { throw new Error("Unexpected fallback"); };
      `,
    });
    expect(manifest.status, manifest.output).toBe(0);
    expect(manifest.output).toContain("max-lines-guard:true");
    const tasks = JSON.parse(
      expectDefined(manifest.outputs.checks_fast_core_matrix, "fast ratchet matrix"),
    ).include;
    expect(tasks).toContainEqual({
      check_name: "checks-fast-baseline-ratchets",
      runtime: "node",
      task: "baseline-ratchets",
    });
    const context = { preflightOutputs: manifest.outputs };
    expect(runCiGateFixture(renderCiGateEnvironment(context)).status).toBe(0);
    for (const result of ["failure", "skipped"]) {
      expect(
        runCiGateFixture(renderCiGateEnvironment(context, { "checks-fast-core": result })).status,
      ).toBe(1);
    }
  });

  it("keeps activity unit proof without unrelated dedicated UI E2E on a PR", () => {
    const manifest = runCiManifestFixture({
      bundledPlanner: true,
      eventName: "pull_request",
      changedPaths: ["ui/src/pages/activity/activity-page.test.ts"],
      scopeEnv: { OPENCLAW_CI_RUN_UI_TESTS: "true" },
      changedPlannerSource: `
        export const hasUiE2eAffectingChange = () => false;
        export const hasBuildArtifactAffectingChange = () => false;
        export const createChangedNodeTestShards = (_paths, options) => [{
          checkName: "dedicated-ui-" + options.dedicatedUiE2e,
          configs: [], requiresDist: false, runner: "ubuntu-24.04", shardName: "unit",
        }];
        export const createChangedExtensionFallbackShards = () => [];
      `,
    });
    expect(manifest.status, manifest.output).toBe(0);
    const workflow = readCiWorkflow();
    const context = {
      eventName: "pull_request" as const,
      repository: "openclaw/openclaw",
      runAttempt: 1,
      preflightOutputs: manifest.outputs,
    };
    for (const name of ["checks-ui", "control-ui-performance"]) {
      expect(evaluateWorkflowExpression(`\${{ ${workflow.jobs[name].if} }}`, context)).toBe(true);
    }
    for (const name of ["checks-ui-e2e", "checks-ui-e2e-real-gateway"]) {
      expect(evaluateWorkflowExpression(`\${{ ${workflow.jobs[name].if} }}`, context)).toBe(false);
    }
    expect(JSON.stringify(manifest.outputs)).toContain("dedicated-ui-false");
    expect(
      runCiGateFixture(
        renderCiGateEnvironment(
          { preflightOutputs: manifest.outputs },
          {
            "checks-ui-e2e": "skipped",
            "checks-ui-e2e-real-gateway": "skipped",
          },
        ),
      ).status,
    ).toBe(0);
    expect(
      runCiGateFixture(
        renderCiGateEnvironment(
          { preflightOutputs: manifest.outputs },
          {
            "checks-ui": "skipped",
          },
        ),
      ).status,
    ).toBe(1);
  });

  it.each([
    { eventName: "push" as const },
    { eventName: "workflow_dispatch" as const, historicalCompatibility: false },
    { eventName: "workflow_dispatch" as const, historicalCompatibility: true },
    { eventName: "pull_request" as const, repository: "example/openclaw" },
    { eventName: "pull_request" as const, changedPaths: null },
    { eventName: "pull_request" as const, missingSelector: true },
  ])("retains UI E2E outside current known unit-only PR selection %j", (options) => {
    const manifest = runCiManifestFixture({
      bundledPlanner: true,
      changedPaths: ["ui/src/pages/activity/activity-page.test.ts"],
      scopeEnv: { OPENCLAW_CI_RUN_UI_TESTS: "true" },
      ...options,
      changedPlannerSource: `
        ${"missingSelector" in options && options.missingSelector ? "" : "export const hasUiE2eAffectingChange = () => false;"}
        export const createChangedNodeTestShards = () => [];
        export const createChangedExtensionFallbackShards = () => [];
      `,
    });
    // Current PRs with an unusable manifest fail rather than narrowing proof.
    if ("changedPaths" in options && options.changedPaths === null) {
      expect(manifest.status).not.toBe(0);
    } else {
      expect(manifest.status, manifest.output).toBe(0);
      expect(manifest.outputs.run_ui_tests).toBe("true");
      expect(manifest.outputs.run_ui_e2e).toBe("true");
    }
  });
  it("isolates mutations between workflow fixtures", () => {
    const workflow = readCiWorkflow();
    const expected = structuredClone(workflow);

    workflow.jobs.preflight.steps[0].name = "mutated fixture";
    workflow.jobs.preflight.steps.pop();
    delete workflow.jobs["ci-gate"];

    expect(readCiWorkflow()).toEqual(expected);
  });

  it("preserves module heredocs and cleans child temporary artifacts", () => {
    const parentTempDir = tmpdir();
    const run = runWorkflowShellScript(
      `node --input-type=module <<'NODE'
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
NODE_prefix: for (const value of ["heredoc-body-preserved"]) {
  console.log(value);
  break NODE_prefix;
}
console.log(mkdtempSync(join(tmpdir(), 'openclaw-workflow-child-')));
NODE
`,
      {},
    );

    expect(run.status, run.stderr).toBe(0);
    const [body, temporaryDirectory] = run.stdout.trim().split("\n");
    const childDirectory = expectDefined(temporaryDirectory, "child temporary directory");
    try {
      expect(body).toBe("heredoc-body-preserved");
      expect(tmpdir()).toBe(parentTempDir);
      expect(existsSync(childDirectory)).toBe(false);
    } finally {
      rmSync(childDirectory, { force: true, recursive: true });
    }
  });

  it("routes PR edited metadata only to interested automation", () => {
    const labeler = readWorkflow(".github/workflows/labeler.yml");

    expect(labeler.on.pull_request_target.types).toContain("edited");
    expect(readPullRequestEditFields(labeler.jobs.label.if)).toEqual(["title", "base"]);

    const labelerSteps = labeler.jobs.label.steps;
    const changedFieldsForStep = (matcher: (step: WorkflowStep) => boolean) =>
      readPullRequestEditFields(labelerSteps.find(matcher)?.if);
    expect({
      pathLabels: changedFieldsForStep(
        (step) => step.uses?.startsWith("actions/labeler@") === true,
      ),
      size: changedFieldsForStep((step) => step.name === "Apply PR size label"),
      contributor: changedFieldsForStep(
        (step) => step.name === "Apply maintainer or trusted-contributor label",
      ),
      betaBlocker: changedFieldsForStep((step) => step.name === "Apply beta-blocker title label"),
      activePrLimit: changedFieldsForStep((step) => step.name === "Apply too-many-prs label"),
    }).toEqual({
      pathLabels: ["base"],
      size: ["base"],
      contributor: [],
      betaBlocker: ["title"],
      activePrLimit: [],
    });
  });

  it("makes the hosted release-gate fallback explicit and exact-SHA only", () => {
    const workflow = readCiWorkflow();
    const releaseGate = workflow.on.workflow_dispatch.inputs.release_gate;

    expect(releaseGate).toEqual({
      description:
        "Run an exact-SHA maintainer release-gate fallback when PR CI is capacity-stalled.",
      required: false,
      default: false,
      type: "boolean",
    });
    expect(workflow.on.workflow_dispatch.inputs.dispatch_id).toEqual({
      description: "Optional parent workflow dispatch identifier",
      required: false,
      default: "",
      type: "string",
    });
    expect(workflow.on.workflow_dispatch.inputs.pull_request_number).toEqual({
      description: "Pull request number required by the exact-SHA release gate.",
      required: false,
      default: "",
      type: "string",
    });
    expect(workflow.on.workflow_dispatch.inputs).not.toHaveProperty("loc_base_ref");
    expect(workflow.on.workflow_dispatch.inputs).not.toHaveProperty("pr_number");
    expect(workflow.on.workflow_dispatch.inputs.release_scope).toMatchObject({
      default: "full",
      type: "choice",
      options: ["full", "npm-beta", "npm-stable"],
    });
    expect(workflow.jobs.preflight.outputs.release_scope).toBe(
      "${{ steps.manifest.outputs.release_scope }}",
    );
    expect(readFileSync(".github/workflows/ci.yml", "utf8")).toContain(
      "run-name: ${{ github.event_name == 'workflow_dispatch' && inputs.dispatch_id != '' && format('CI {0}', inputs.dispatch_id) || (github.event_name == 'workflow_dispatch' && inputs.release_gate && format('CI release gate {0}', inputs.target_ref) || 'CI') }}",
    );
    const preflightSteps = workflow.jobs.preflight.steps;
    expect(
      preflightSteps.find((step: WorkflowStep) => step.name === "Build CI manifest").env,
    ).toMatchObject({
      OPENCLAW_CI_RELEASE_SCOPE: "${{ inputs.release_scope || 'full' }}",
      OPENCLAW_CI_PULL_REQUEST_NUMBER: "${{ inputs.pull_request_number }}",
      OPENCLAW_CI_TARGET_REF: "${{ inputs.target_ref }}",
      OPENCLAW_CI_TARGET_CONTEXT_REF: "${{ inputs.target_context_ref }}",
      OPENCLAW_CI_HISTORICAL_TARGET_TAG: "${{ inputs.historical_target_tag }}",
    });
    const validationStep = preflightSteps.find(
      (step: WorkflowStep) => step.name === "Validate release-gate dispatch",
    );
    expect(validationStep.if).toBe(
      "github.event_name == 'workflow_dispatch' && inputs.release_gate",
    );
    expect(validationStep.run).toContain(
      "release_gate requires target_ref to be a full commit SHA",
    );
    expect(validationStep.run).toContain("release_gate requires pull_request_number");
    expect(validationStep.run).toContain("release_gate must run from the branch at target_ref");
    expect(validationStep.run).toContain(
      "release_gate cannot be combined with historical_target_tag",
    );
    const diffBaseStep = preflightSteps.find(
      (step: WorkflowStep) => step.name === "Resolve exact diff base",
    );
    expect(diffBaseStep.env).toMatchObject({
      PULL_REQUEST_NUMBER: "${{ inputs.pull_request_number }}",
      RELEASE_GATE: "${{ inputs.release_gate }}",
    });
    expect(diffBaseStep.run).toContain("refs/pull/${PULL_REQUEST_NUMBER}/merge");
    expect(diffBaseStep.run).toContain('release_gate_head="$(git rev-parse "${merge_ref}^2")"');
    expect(diffBaseStep.run).toContain(
      "release_gate pull request head ${release_gate_head} does not match target ${target_head}",
    );
    expect(diffBaseStep.run).toContain('base_sha="$(git rev-parse "${merge_ref}^1")"');
    expect(diffBaseStep.run).toContain('head_sha="$(git rev-parse "$merge_ref")"');
    expect(diffBaseStep.run).toContain('echo "head_sha=$head_sha" >> "$GITHUB_OUTPUT"');
    const changedScopeStep = preflightSteps.find(
      (step: WorkflowStep) => step.name === "Detect changed scopes",
    );
    expect(changedScopeStep.if).toContain(
      "github.event_name == 'workflow_dispatch' && inputs.release_gate",
    );
    expect(changedScopeStep.env?.OPENCLAW_ALLOW_RELEASE_GENERATED_MIX).toContain(
      "github.event_name == 'workflow_dispatch'",
    );
    expect(changedScopeStep.run).toContain('elif [ "${{ github.event_name }}" = "pull_request" ]');
    expect(changedScopeStep.run).toContain('HEAD_SHA="${{ steps.diff_base.outputs.head_sha }}"');
    expect(changedScopeStep.run).toContain(
      'node scripts/ci-changed-scope.mjs --base "$BASE" --head "$HEAD_SHA"',
    );
    expect(workflow.jobs.preflight.permissions).toEqual({ contents: "read" });
    expect(workflow.jobs.preflight.outputs.run_ios_screenshots).toBe(
      "${{ steps.changed_scope.outputs.run_ios_screenshots }}",
    );
    const workflowSource = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(workflowSource).toContain(
      "OPENCLAW_CI_RUN_MACOS: ${{ github.event_name == 'workflow_dispatch' && !inputs.release_gate && 'true' || steps.changed_scope.outputs.run_macos || 'false' }}",
    );
    expect(workflowSource).toContain(
      "OPENCLAW_CI_RUN_IOS_BUILD: ${{ github.event_name == 'workflow_dispatch' && !inputs.release_gate && 'true' || steps.changed_scope.outputs.run_ios_build || 'false' }}",
    );
    expect(workflowSource).toContain(
      "OPENCLAW_CI_RUN_ANDROID: ${{ github.event_name == 'workflow_dispatch' && (inputs.release_gate || inputs.include_android) && 'true' || steps.changed_scope.outputs.run_android || 'false' }}",
    );

    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      const runsOn = (job as { "runs-on"?: unknown })["runs-on"];
      if (typeof runsOn !== "string" || !runsOn.includes("blacksmith-")) {
        continue;
      }
      expect(
        evaluateWorkflowExpression(runsOn, {
          eventName: "workflow_dispatch",
          releaseGate: true,
          repository: "openclaw/openclaw",
          runAttempt: 1,
          runnerBackend: "hybrid",
        }),
        `${jobName} must use GitHub-hosted capacity for release gates`,
      ).toMatch(/^(?:ubuntu|windows|macos)-/u);
    }

    expect(
      workflow.jobs["macos-node"]["runs-on"],
      "macOS Node retries must escape stalled Blacksmith capacity",
    ).toContain("github.run_attempt > 1");
  });

  it("pins every external GitHub Action reference to a full commit SHA", () => {
    expect(findUnpinnedExternalActions()).toEqual([]);
  });

  it("forbids moving reusable workflow references", () => {
    expect([...OIDC_BOUND_MAIN_REUSABLE_WORKFLOWS]).toEqual([]);
  });

  it.skipIf(process.platform === "win32")(
    "enables auto-merge for the exact generated pull request head",
    () => {
      const result = runGeneratedPublisherScenario(null, { autoMerge: true });

      expect(result.branchExists).toBe(true);
      expect(result.mergeCalls).toContain("pr merge https://github.com/openclaw/openclaw/pull/1");
      expect(result.mergeCalls).toContain("--auto --squash --match-head-commit");
      expect(result.summary).toContain("Enabled squash auto-merge for exact generated head");
    },
  );

  it.skipIf(process.platform === "win32")(
    "waits for the published pull request head before enabling auto-merge",
    () => {
      const result = runGeneratedPublisherScenario(null, {
        autoMerge: true,
        stalePrViewHeadOnce: true,
      });

      expect(result.mergeCalls).toContain("--auto --squash --match-head-commit");
      expect(result.publishOutput).toContain(
        "Generated pull request head has not converged yet; rechecking",
      );
    },
  );

  it.skipIf(process.platform === "win32")(
    "preserves inherited auto-merge while replacing a generated pull request head",
    () => {
      const result = runGeneratedPublisherScenario(null, {
        autoMerge: true,
        existingAutoMergeMethod: "SQUASH",
        existingPr: true,
      });

      expect(result.generatedA).toBe("desired-a");
      expect(result.mergeCalls).toBe("");
      expect(result.summary).toContain(
        "Squash auto-merge already enabled for generated pull request",
      );
    },
  );

  it.skipIf(process.platform === "win32")(
    "accepts inherited auto-merge completing immediately after publication",
    () => {
      const result = runGeneratedPublisherScenario(null, {
        autoMerge: true,
        existingAutoMergeMethod: "SQUASH",
        existingPr: true,
        mergeGeneratedPush: true,
      });

      expect(result.branchExists).toBe(false);
      expect(result.mainGeneratedA).toBe("desired-a");
      expect(result.mergeCalls).toBe("");
      expect(result.summary).toContain(
        "Generated output was merged before pull request reconciliation",
      );
    },
  );

  it.skipIf(process.platform === "win32")(
    "waits for the existing pull request head before replacing it",
    () => {
      const result = runGeneratedPublisherScenario(null, {
        autoMerge: true,
        existingAutoMergeMethod: "SQUASH",
        existingPr: true,
        stalePrHeadOnce: true,
      });

      expect(result.generatedA).toBe("desired-a");
      expect(result.publishOutput).toContain(
        "Generated pull request head has not converged yet; rechecking",
      );
    },
  );

  it.skipIf(process.platform === "win32")(
    "refuses to replace an auto-merge-enabled head when publication opts out",
    () => {
      const result = runGeneratedPublisherScenario(null, {
        autoMerge: false,
        existingAutoMergeMethod: "SQUASH",
        existingPr: true,
        expectFailure: true,
      });

      expect(result.generatedA).toBe("stale-pr-a");
      expect(result.mergeCalls).toBe("");
      expect(result.publishOutput).toContain("auto-merge enabled while publication opted out");
    },
  );

  it.skipIf(process.platform === "win32")(
    "does not mutate inherited auto-merge when generated publication fails",
    () => {
      const result = runGeneratedPublisherScenario(null, {
        autoMerge: true,
        existingAutoMergeMethod: "SQUASH",
        existingPr: true,
        expectFailure: true,
        failGeneratedPush: true,
      });

      expect(result.generatedA).toBe("stale-pr-a");
      expect(result.mergeCalls).toBe("");
      expect(result.summary).not.toContain("auto-merge");
    },
  );

  it.skipIf(process.platform === "win32")(
    "rejects an incompatible inherited auto-merge method without mutating it",
    () => {
      const result = runGeneratedPublisherScenario(null, {
        autoMerge: true,
        existingAutoMergeMethod: "MERGE",
        existingPr: true,
        expectFailure: true,
      });

      expect(result.generatedA).toBe("stale-pr-a");
      expect(result.mergeCalls).toBe("");
      expect(result.publishOutput).toContain(
        "Generated pull request already uses incompatible MERGE auto-merge",
      );
    },
  );

  it.skipIf(process.platform === "win32")(
    "defers a newer owned snapshot even when the desired diff is disjoint",
    () => {
      const result = runGeneratedPublisherScenario("b");

      expect(result.branchExists).toBe(false);
      expect(result.summary).toContain(
        "Deferred stale generated output because owned generated paths changed on main.",
      );
    },
  );

  it.skipIf(process.platform === "win32")(
    "defers stale generator inputs and preserves an existing pull request and disarms auto-merge",
    () => {
      const result = runGeneratedPublisherScenario(null, {
        existingPr: true,
        autoMerge: true,
        existingAutoMergeMethod: "SQUASH",
        updateSource: true,
      });

      expect(result.branchHead).not.toBe(result.mainHead);
      expect(result.generatedA).toBe("stale-pr-a");
      expect(result.summary).toContain(
        "Deferred stale generated output because generator inputs changed on main.",
      );
      expect(result.mergeCalls).toContain("--disable-auto");
      expect(result.summary).toContain("Preserved stale generated pull request");
    },
  );

  it.skipIf(process.platform === "win32")(
    "defers timing refits when only the runtime group codec changes on main",
    () => {
      const workflow = readWorkflow(".github/workflows/ci-test-timings-refit.yml");
      const publisher = expectDefined(
        workflow.jobs.refit.steps.find(
          (step: WorkflowStep) => step.uses === "./.github/actions/publish-generated-pr",
        ),
        "timing refit publisher",
      );
      const result = runGeneratedPublisherScenario(null, {
        invalidationPaths: publisher.with["invalidation-paths"],
        updateSource: "scripts/lib/ci-node-test-groups-codec.mts",
      });

      expect(result.branchExists).toBe(false);
      expect(result.mainGeneratedA).toBe("old-a");
      expect(result.mergeCalls).toBe("");
      expect(result.summary).toContain(
        "Deferred stale generated output because generator inputs changed on main.",
      );
    },
  );

  it.skipIf(process.platform === "win32")(
    "publishes after unrelated source changes when input invalidation is disabled",
    () => {
      const result = runGeneratedPublisherScenario(null, {
        invalidationPaths: "",
        overlapPolicy: "fail",
        updateSource: true,
      });

      expect(result.branchExists).toBe(true);
      expect(result.generatedA).toBe("desired-a");
      expect(result.publishOutput).not.toContain("Refusing stale generated output");
    },
  );

  it.skipIf(process.platform === "win32")(
    "preserves an existing pull request when a no-change run becomes stale",
    () => {
      const result = runGeneratedPublisherScenario("b", {
        existingPr: true,
        noGeneratedChange: true,
      });

      expect(result.branchHead).toBe(result.initialBranch);
      expect(result.generatedA).toBe("stale-pr-a");
      expect(result.generatedB).toBe("old-b");
      expect(result.summary).toContain(
        "Deferred stale generated output because owned generated paths changed on main.",
      );
      expect(result.summary).toContain("Preserved stale generated pull request");
    },
  );

  it.skipIf(process.platform === "win32").each([false, true])(
    "disarms stale output when inputs advance during PR publication (inherited=%s)",
    (inherited) => {
      const result = runGeneratedPublisherScenario(null, {
        autoMerge: true,
        existingPr: inherited,
        existingAutoMergeMethod: inherited ? "SQUASH" : undefined,
        updateSourceBeforeAutoMerge: true,
      });
      expect(result.generatedA).toBe("desired-a");
      expect(result.branchHead).not.toBe(result.mainHead);
      expect(result.mergeCalls).not.toContain("--auto --squash");
      expect(result.mergeCalls.includes("--disable-auto")).toBe(inherited);
      expect(result.summary).toContain("Deferred stale generated output");
    },
  );

  it.skipIf(process.platform === "win32")(
    "leaves a current no-change run's existing pull request and auto-merge unchanged",
    () => {
      const result = runGeneratedPublisherScenario(null, {
        existingPr: true,
        noGeneratedChange: true,
        autoMerge: true,
        existingAutoMergeMethod: "SQUASH",
      });
      expect(result.branchHead).toBe(result.initialBranch);
      expect(result.generatedA).toBe("stale-pr-a");
      expect(result.mergeCalls).toBe("");
      expect(result.summary).toBe("");
    },
  );

  it.skipIf(process.platform === "win32")(
    "does not overwrite a successor that moves while stale auto-merge is disabled",
    () => {
      const result = runGeneratedPublisherScenario(null, {
        existingPr: true,
        updateSource: true,
        existingAutoMergeMethod: "SQUASH",
        autoMerge: true,
        disarmRace: true,
        expectFailure: true,
      });
      expect(result.branchHead).not.toBe(result.initialBranch);
      expect(result.generatedA).toBe("old-a");
      expect(result.mergeCalls).toContain("--disable-auto");
      expect(result.mergeCalls).not.toContain("--auto --squash");
      expect(result.summary).not.toContain("Preserved stale");
    },
  );

  it.skipIf(process.platform === "win32")(
    "fails stale generated publication when no successor run is guaranteed",
    () => {
      const overlap = runGeneratedPublisherScenario("a", {
        expectFailure: true,
        overlapPolicy: "fail",
      });
      expect(overlap.branchExists).toBe(false);
      expect(overlap.publishOutput).toContain(
        "::error::Refusing stale generated output because owned generated paths changed on main.",
      );

      const stalePr = runGeneratedPublisherScenario(null, {
        existingPr: true,
        expectFailure: true,
        noGeneratedChange: true,
        overlapPolicy: "fail",
        updateSource: true,
      });
      expect(stalePr.branchHead).toBe(stalePr.initialBranch);
      expect(stalePr.summary).toContain("Preserved stale generated pull request");
      expect(stalePr.publishOutput).toContain(
        "::error::Refusing stale generated output because generator inputs changed on main.",
      );

      const publishRun = parse(readFileSync(PUBLISH_GENERATED_PR_ACTION, "utf8")).runs.steps.find(
        (step: { name?: string }) => step.name === "Publish generated pull request",
      ).run;
      const invalidPolicy = spawnSync("bash", ["-c", publishRun], {
        encoding: "utf8",
        env: {
          ...process.env,
          AUTO_MERGE: "false",
          CONTENTS_TOKEN: "contents-token",
          GH_TOKEN: "pull-request-token",
          OVERLAP_POLICY: "continue",
        },
      });
      expect(invalidPolicy.status).not.toBe(0);
      expect(`${invalidPolicy.stdout}${invalidPolicy.stderr}`).toContain(
        "Generated PR publication overlap policy must be 'defer' or 'fail'.",
      );
    },
  );

  it("fails OpenGrep SARIF artifact uploads when reports are missing", () => {
    const cases = [
      {
        workflowPath: OPENGREP_PR_DIFF_WORKFLOW,
        artifactName: "opengrep-pr-diff-sarif",
      },
      {
        workflowPath: OPENGREP_FULL_WORKFLOW,
        artifactName: "opengrep-full-sarif",
      },
    ];

    for (const item of cases) {
      const workflow = parse(readFileSync(item.workflowPath, "utf8"));
      const uploadStep = workflow.jobs.scan.steps.find(
        (step: WorkflowStep) => step.name === "Upload SARIF as workflow artifact",
      );

      expect(uploadStep.if, item.workflowPath).toBe("always()");
      expect(uploadStep.uses, item.workflowPath).toBe(UPLOAD_ARTIFACT_V7);
      expect(uploadStep.with, item.workflowPath).toMatchObject({
        name: item.artifactName,
        path: ".opengrep-out/precise.sarif",
        "if-no-files-found": "error",
      });
    }
  });

  it("verifies the pinned OpenGrep release binary before installing it", () => {
    for (const workflowPath of [OPENGREP_PR_DIFF_WORKFLOW, OPENGREP_FULL_WORKFLOW]) {
      const workflow = parse(readFileSync(workflowPath, "utf8"));
      const installStep = expectDefined(
        workflow.jobs.scan.steps.find((step: WorkflowStep) => step.name === "Install opengrep"),
        `Install opengrep step in ${workflowPath}`,
      );
      const run = expectDefined(installStep.run, `Install opengrep script in ${workflowPath}`);

      expect(installStep.env, workflowPath).toMatchObject({
        OPENGREP_VERSION: "v1.27.1",
        OPENGREP_LINUX_X64_SHA256:
          "58053da76672bbeb5b0a5441021c58338707052e10f81d777140ca879bd491ce",
      });
      expect(run, workflowPath).toContain('binary="$(mktemp "${RUNNER_TEMP}/opengrep.XXXXXX")"');
      expect(run, workflowPath).toContain("trap 'rm -f \"$binary\"' EXIT");
      expect(run, workflowPath).toContain(
        "curl -fsSL --retry 4 --retry-all-errors --retry-delay 2",
      );
      expect(run, workflowPath).toContain("--connect-timeout 10 --max-time 300");
      expect(run, workflowPath).toContain('-o "$binary"');
      expect(run, workflowPath).toContain(
        "https://github.com/opengrep/opengrep/releases/download/${OPENGREP_VERSION}/opengrep_manylinux_x86",
      );
      expect(run, workflowPath).toContain(
        'printf \'%s  %s\\n\' "$OPENGREP_LINUX_X64_SHA256" "$binary" | sha256sum --check',
      );
      expect(run, workflowPath).toContain('install -m 0755 "$binary" "$install_dir/opengrep"');
      expect(run.indexOf('-o "$binary"'), workflowPath).toBeLessThan(
        run.indexOf("sha256sum --check"),
      );
      expect(run.indexOf("sha256sum --check"), workflowPath).toBeLessThan(
        run.indexOf('install -m 0755 "$binary"'),
      );
      expect(run, workflowPath).not.toMatch(/\|\s*bash/u);
    }
  });

  it("keeps docs-change detection fail-safe and fixture-aware", () => {
    const action = readFileSync(".github/actions/detect-docs-changes/action.yml", "utf8");

    expect(action).toContain("base-sha:");
    expect(action).toContain("docs_only:");
    expect(action).toContain("docs_changed:");
    expect(action).toContain("BASE_SHA: ${{ inputs.base-sha }}");
    expect(action).toContain('BASE="$BASE_SHA"');
    expect(action).toContain(
      'CHANGED=$(git diff --no-renames --name-only "$BASE" HEAD 2>/dev/null || echo "UNKNOWN")',
    );
    expect(action).toContain('if [ "$CHANGED" = "UNKNOWN" ] || [ -z "$CHANGED" ]; then');
    expect(action).toContain("docs_only=false");
    expect(action).toContain("docs_changed=false");
    expect(action).toContain("test/fixtures/*)");
    expect(action).toContain("docs/* | *.md | *.mdx | config/markdownlint*.jsonc)");

    const run = parse(action).runs.steps[0].run as string;
    for (const [source, destination, docsChanged, docsOnly] of [
      ["src/old.ts", "docs/new.md", "true", "false"],
      ["docs/old.md", "src/new.ts", "true", "false"],
      ["docs/old.md", "docs/new.md", "true", "true"],
      ["docs/old.md", "docs/.generated/config-baseline.counts.json", "true", "true"],
      ["docs/old.md", "docs/plugins/plugin-inventory.md", "true", "true"],
      ["src/old.ts", "src/new.ts", "false", "false"],
      ["test/fixtures/old.md", "docs/new.md", "true", "false"],
      ["docs/removed.md", null, "true", "true"],
    ] as const) {
      const root = tempDirs.make("openclaw-docs-diff-");
      const origin = path.join(root, "origin");
      const checkout = path.join(root, "checkout");
      mkdirSync(path.dirname(path.join(origin, source)), { recursive: true });
      const content = Array.from({ length: 100 }, (_, index) => `line ${index}\n`).join("");
      writeFileSync(path.join(origin, source), content);
      runGit(origin, ["init", "-q", "-b", "main"]);
      for (const [name, value] of [
        ["user.name", "CI Fixture"],
        ["user.email", "ci-fixture@example.invalid"],
        ["commit.gpgsign", "false"],
        ["uploadpack.allowFilter", "true"],
      ] as const) {
        runGit(origin, ["config", name, value]);
      }
      runGit(origin, ["add", "."]);
      runGit(origin, ["commit", "-qm", "base"]);
      const base = runGit(origin, ["rev-parse", "HEAD"]);
      const sourceBlob = runGit(origin, ["rev-parse", `HEAD:${source}`]);
      rmSync(path.join(origin, source));
      if (destination) {
        mkdirSync(path.dirname(path.join(origin, destination)), { recursive: true });
        writeFileSync(path.join(origin, destination), `${content}edited after rename\n`);
      }
      runGit(origin, ["add", "-A"]);
      runGit(origin, ["commit", "-qm", "change"]);
      runGit(root, [
        "clone",
        "-q",
        "--no-local",
        "--filter=blob:none",
        "--depth=2",
        origin,
        checkout,
      ]);
      runGit(checkout, ["config", "diff.renames", "true"]);
      const localObjects = () =>
        runGit(checkout, ["cat-file", "--batch-all-objects", "--batch-check=%(objectname)"]);
      expect(localObjects()).toContain(base);
      expect(localObjects()).not.toContain(sourceBlob);
      const output = path.join(root, "output");
      const trace = path.join(root, "trace");
      const result = runWorkflowShellScript(run, {
        cwd: checkout,
        env: { ...process.env, BASE_SHA: base, GITHUB_OUTPUT: output, GIT_TRACE2_EVENT: trace },
      });
      expect(result.status, result.stderr).toBe(0);
      expect(readWorkflowOutputs(output), `${source} -> ${destination}`).toEqual({
        docs_changed: docsChanged,
        docs_only: docsOnly,
      });
      expect(readFileSync(trace, "utf8")).not.toContain('"fetch"');
      expect(localObjects()).not.toContain(sourceBlob);
    }
  });

  it("runs generated docs checks in the docs-only job", () => {
    const job = readCiWorkflow().jobs["check-docs"];
    const configDocsCheck = job.steps.find(
      (step: WorkflowStep) => step.name === "Check config docs baseline",
    );
    const pluginInventoryCheck = job.steps.find(
      (step: WorkflowStep) => step.name === "Check plugin inventory",
    );

    expect(job.if).toBe("needs.preflight.outputs.run_check_docs == 'true'");
    expect(configDocsCheck?.run).toBe("pnpm config:docs:check");
    expect(pluginInventoryCheck?.run).toBe("pnpm plugins:inventory:check");
  });

  it("bounds matrix fan-out for runner-registration pressure", () => {
    const workflow = readCiWorkflow();

    expect(workflow.concurrency.group).toContain("github.event.pull_request.number");
    expect(workflow.concurrency["cancel-in-progress"]).toContain(
      "github.event_name == 'pull_request'",
    );
    expect(workflow.jobs["checks-fast-core"].strategy["max-parallel"]).toBe(12);
    expect(workflow.jobs["checks-node-core-test-nondist-shard"].strategy["max-parallel"]).toBe(96);
    expect(workflow.jobs["checks-fast-plugin-contracts-shard"].strategy["max-parallel"]).toBe(12);
    expect(workflow.jobs["checks-fast-channel-contracts-shard"].strategy["max-parallel"]).toBe(12);
    expect(workflow.jobs["check-shard"].strategy["max-parallel"]).toBe(12);
    expect(workflow.jobs["check-additional-shard"].strategy["max-parallel"]).toBe(12);
    expect(workflow.jobs["checks-windows"].strategy["max-parallel"]).toBe(2);
  });

  it("runs changed Docker seed owners in one gated scheduler job", () => {
    const source = readFileSync(".github/workflows/ci.yml", "utf8");
    const jobs = readCiWorkflow().jobs;
    const job = jobs["docker-seed-e2e"];
    expect(source).toContain("docker-seed-e2e-contract-v1");
    expect(source).toContain(
      'typeof changedNodeTestPlan.resolveChangedDockerSeedLanes === "function"',
    );
    expect(jobs.preflight.outputs).toMatchObject({
      docker_seed_lanes: "${{ steps.manifest.outputs.docker_seed_lanes }}",
      run_docker_seed_e2e: "${{ steps.manifest.outputs.run_docker_seed_e2e }}",
    });
    expect(job.if).toBe("needs.preflight.outputs.run_docker_seed_e2e == 'true'");
    expect(job.needs).toEqual(["preflight"]);
    expect(job["timeout-minutes"]).toBe(60);
    expect(job.permissions).toEqual({ contents: "read" });
    expect(job.strategy).toBeUndefined();
    expect(job.steps[0]).toEqual(jobs["pnpm-store-warmup"].steps[0]);
    expect(job.steps[1].uses).toBe("./.ci-harness/.github/actions/setup-node-env");
    expect(job.steps[1].with).toMatchObject({
      "build-all-cache-scope": "full",
      "cache-mode": "${{ needs.preflight.outputs.cache_mode }}",
    });
    const run = job.steps.find(
      (step: WorkflowStep) => step.name === "Run changed Docker seed owner lanes",
    ) as WorkflowStep;
    const parallelism = run.env?.OPENCLAW_DOCKER_ALL_PARALLELISM;
    expect(run).toMatchObject({
      run: "pnpm test:docker:all",
      env: {
        OPENCLAW_DOCKER_ALL_LANES: "${{ needs.preflight.outputs.docker_seed_lanes }}",
        OPENCLAW_DOCKER_ALL_LIVE_MODE: "skip",
        OPENCLAW_DOCKER_E2E_ALLOW_UNRELEASED_CHANGELOG: "1",
        OPENCLAW_UPGRADE_SURVIVOR_SCENARIOS: "legacy-operator-state",
        OPENCLAW_UPGRADE_SURVIVOR_UPDATE_RESTART_MODE: "auto-auth",
        OPENCLAW_DOCKER_ALL_TAIL_PARALLELISM: parallelism,
      },
    });
    expect(parallelism).toContain("&& 3 || 1");
    expect(run.env).not.toHaveProperty("OPENCLAW_UPGRADE_SURVIVOR_BASELINE_SPEC");
    const baseline = job.steps.find(
      (step: WorkflowStep) => step.name === "Resolve published Docker seed upgrade baseline",
    ) as WorkflowStep;
    expect(baseline.if).toBe(
      "contains(format(' {0} ', needs.preflight.outputs.docker_seed_lanes), ' published-upgrade-survivor ')",
    );
    expect(baseline.env).toEqual({
      TARGET_CONTEXT_REF: "${{ inputs.target_context_ref || github.base_ref || github.ref_name }}",
    });
    expect(job.steps.indexOf(baseline)).toBeLessThan(job.steps.indexOf(run));
  });

  it.each([
    { candidate: "2026.9.3", expected: "openclaw@2026.9.2" },
    { candidate: "2026.9.2", expected: "openclaw@2026.9.1" },
    { candidate: "2026.9.4-beta.1", expected: "openclaw@2026.9.3" },
    { candidate: "2026.9.3-beta.1", expected: "openclaw@2026.9.2" },
    {
      candidate: "2026.6.35",
      context: "extended-stable/2026.6.33",
      expected: "openclaw@2026.6.34",
    },
    { candidate: "2026.6.34", expected: undefined },
  ])("hands Docker seed a strictly older published baseline for $candidate", (fixture) => {
    const job = readCiWorkflow().jobs["docker-seed-e2e"];
    const baseline = job.steps.find(
      (step: WorkflowStep) => step.name === "Resolve published Docker seed upgrade baseline",
    ) as WorkflowStep | undefined;
    const run = job.steps.find(
      (step: WorkflowStep) => step.name === "Run changed Docker seed owner lanes",
    ) as WorkflowStep;
    const root = mkdtempSync(path.join(tmpdir(), "openclaw-ci-upgrade-baseline-"));
    try {
      const bin = path.join(root, "bin");
      const tooling = path.join(root, ".ci-harness", "scripts", "lib");
      mkdirSync(bin);
      mkdirSync(tooling, { recursive: true });
      for (const name of ["release-upgrade-baseline.mjs", "release-version.mjs"]) {
        copyFileSync(path.resolve("scripts", "lib", name), path.join(tooling, name));
      }
      writeFileSync(
        path.join(root, "package.json"),
        JSON.stringify({ version: fixture.candidate }),
      );
      writeFileSync(
        path.join(root, ".ci-harness", "package.json"),
        JSON.stringify({ version: "2026.10.1" }),
      );
      symlinkSync(process.execPath, path.join(bin, "node"));
      writeFileSync(
        path.join(bin, "npm"),
        `#!${process.execPath}
const args = process.argv.slice(2);
if (JSON.stringify(args) !== JSON.stringify(["view", "openclaw", "versions", "--json", "--silent", "--prefer-online"])) process.exit(2);
console.log(JSON.stringify(["2026.6.34", "2026.6.35", "2026.9.1", "2026.9.2", "2026.9.3", "2026.9.4-beta.1"]));
`,
        { mode: 0o755 },
      );
      writeFileSync(
        path.join(bin, "pnpm"),
        `#!${process.execPath}
if (process.argv.slice(2).join(" ") !== "test:docker:all") process.exit(2);
require("node:fs").writeFileSync("scheduler-baseline", process.env.OPENCLAW_UPGRADE_SURVIVOR_BASELINE_SPEC ?? "missing");
`,
        { mode: 0o755 },
      );
      writeFileSync(path.join(root, "github-env"), "");
      const inheritedBaseline = run.env?.OPENCLAW_UPGRADE_SURVIVOR_BASELINE_SPEC;
      const result = runWorkflowShellScript(
        `set -euo pipefail\n${baseline?.run ?? ""}\nset -a\nsource "$GITHUB_ENV"\nset +a\n${run.run}`,
        {
          cwd: root,
          env: {
            ...process.env,
            PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
            GITHUB_ENV: path.join(root, "github-env"),
            OPENCLAW_UPGRADE_SURVIVOR_BASELINE_SPEC:
              typeof inheritedBaseline === "string" ? inheritedBaseline : "",
            TARGET_CONTEXT_REF: fixture.context ?? "main",
          },
        },
      );
      const receipt = path.join(root, "scheduler-baseline");
      if (fixture.expected) {
        expect(result.status, result.stderr).toBe(0);
        expect(readFileSync(receipt, "utf8")).toBe(fixture.expected);
      } else {
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain(
          "no published stable OpenAgent baseline predates candidate",
        );
        expect(existsSync(receipt)).toBe(false);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    { eventName: "pull_request" as const, production: false, expected: false },
    { eventName: "pull_request" as const, production: true, expected: true },
    { eventName: "push" as const, production: false, expected: true },
  ])("routes published-upgrade proof for $eventName (production=$production)", (options) => {
    const changedPaths = [
      "src/commands/doctor-config-preflight.admission.process.test.ts",
      "src/commands/doctor-config-runtime.test-support.ts",
      ...(options.production ? ["src/commands/doctor-config-preflight.ts"] : []),
    ];
    const selected = resolveChangedDockerSeedLanes(changedPaths);
    const result = runCiManifestFixture({
      bundledPlanner: true,
      runNode: false,
      changedPaths,
      eventName: options.eventName,
      scopeEnv: { GITHUB_REF: "refs/heads/main" },
      changedPlannerSource: `export const resolveChangedDockerSeedLanes = () => ${JSON.stringify(selected)};`,
    });
    expect(result.status, result.output).toBe(0);
    expect(result.outputs.run_docker_seed_e2e).toBe(String(options.expected));
    expect(result.outputs.docker_seed_lanes).toBe(
      options.expected ? "published-upgrade-survivor" : "",
    );
  });

  it.each([
    { repository: "openclaw/openclaw", ref: "refs/heads/main", expected: true },
    { repository: "openclaw/openclaw", ref: "refs/heads/feature", expected: false },
    { repository: "fork/openclaw", ref: "refs/heads/main", expected: false },
  ])(
    "gates only canonical main pushes admitted by CI ($repository $ref)",
    ({ repository, ref, expected }) => {
      const push = readCiWorkflow().on.push;
      expect(push.branches).toEqual(["main"]);
      expect(push).not.toHaveProperty("paths");
      expect(push["paths-ignore"]).toEqual(["**/*.md", "docs/**"]);
      const result = runCiManifestFixture({
        bundledPlanner: true,
        eventName: "push",
        repository,
        changedPaths: ["assets/logo.svg"],
        scopeEnv: { GITHUB_REF: ref },
      });
      expect(result.status, result.output).toBe(0);
      expect(result.outputs.run_docker_seed_e2e).toBe(String(expected));
      expect(result.outputs.docker_seed_lanes).toBe(expected ? "published-upgrade-survivor" : "");
    },
  );

  it.each([
    { paths: ["README.md"], admitted: false },
    { paths: [".agents/skills/example/SKILL.md"], admitted: false },
    { paths: ["docs/ci.md", "docs/images/diagram.svg"], admitted: false },
    { paths: ["docs/reference/schema.json"], admitted: false },
    { paths: ["src/ordinary.ts"], admitted: true },
    { paths: ["assets/logo.svg"], admitted: true },
    { paths: ["README.md", "src/ordinary.ts"], admitted: true },
    { paths: ["docs/ci.md", "assets/logo.svg"], admitted: true },
  ])("admits main push paths $paths to CI: $admitted", ({ paths, admitted }) => {
    const ignored: string[] = readCiWorkflow().on.push["paths-ignore"] ?? [];
    // GitHub skips paths-ignore only when every changed path matches a pattern.
    const runsCi = paths.some(
      (changedPath) => !ignored.some((pattern) => minimatch(changedPath, pattern, { dot: true })),
    );
    expect(runsCi).toBe(admitted);
    if (!runsCi) {
      return;
    }
    const result = runCiManifestFixture({
      bundledPlanner: true,
      eventName: "push",
      repository: "openclaw/openclaw",
      changedPaths: paths,
      scopeEnv: { GITHUB_REF: "refs/heads/main" },
    });
    expect(result.status, result.output).toBe(0);
    expect(result.outputs.run_docker_seed_e2e).toBe("true");
    expect(result.outputs.docker_seed_lanes).toBe("published-upgrade-survivor");
  });

  it("splits Windows tests two ways on every runner backend", () => {
    const workflow = readCiWorkflow();
    const runStep = workflow.jobs["checks-windows"].steps.find(
      (step: WorkflowStep) => step.name === "Run ${{ matrix.task }} (${{ matrix.runtime }})",
    );
    const blacksmith = runCiManifestFixture({
      bundledPlanner: true,
      eventName: "push",
      historicalCompatibility: false,
      runnerBackend: "blacksmith",
    });
    const github = runCiManifestFixture({
      bundledPlanner: true,
      eventName: "push",
      historicalCompatibility: false,
      runnerBackend: "github",
    });
    const hybrid = runCiManifestFixture({
      bundledPlanner: true,
      eventName: "push",
      historicalCompatibility: false,
      runnerBackend: "hybrid",
    });
    const hybridDispatch = runCiManifestFixture({
      bundledPlanner: true,
      eventName: "workflow_dispatch",
      historicalCompatibility: false,
      runnerBackend: "hybrid",
    });

    expect(blacksmith.status, blacksmith.output).toBe(0);
    expect(github.status, github.output).toBe(0);
    expect(hybrid.status, hybrid.output).toBe(0);
    expect(hybridDispatch.status, hybridDispatch.output).toBe(0);
    // Blacksmith's Windows class admits exactly 2 concurrent jobs (run
    // 31865243804), so every backend uses the same 2-part split: a 3rd part
    // queues behind a finished one and a single lane serializes the whole body.
    const expectedWindowsMatrix = [
      { check_name: "checks-windows-node-test-1", runtime: "node", task: "test-1" },
      { check_name: "checks-windows-node-test-2", runtime: "node", task: "test-2" },
    ];
    for (const [label, manifest] of [
      ["Blacksmith", blacksmith],
      ["GitHub", github],
      ["hybrid", hybrid],
      ["hybrid dispatch", hybridDispatch],
    ] as const) {
      expect(
        JSON.parse(expectDefined(manifest.outputs.checks_windows_matrix, `${label} Windows matrix`))
          .include,
        label,
      ).toEqual(expectedWindowsMatrix);
    }
    expect(runStep.run).toContain('scripts?.["test:windows:ci:1"]');
    expect(runStep.run).toContain('scripts?.["test:windows:ci:2"]');
    expect(runStep.run).toContain("pnpm test:windows:ci");
    expect(runStep.run).toContain("target's combined Windows suite ran in test-1");
    expect(runStep.run).not.toContain("pnpm test:windows:ci:3");
  });

  it.skipIf(process.platform === "win32").for(["blacksmith", "github", "hybrid"] as const)(
    "executes each Mac partition once and keeps historical coverage on %s",
    (runnerBackend) => {
      const workflow = readCiWorkflow();
      const job = workflow.jobs["macos-node"];
      const runStep = job.steps.find((step: WorkflowStep) => step.name === "TS tests (macOS)");
      const cwd = tempDirs.make("macos-partition-routing-");
      const bin = path.join(cwd, "bin");
      mkdirSync(bin);
      writeFileSync(path.join(bin, "pnpm"), '#!/bin/sh\nprintf "selected=%s\\n" "$*"\n');
      chmodSync(path.join(bin, "pnpm"), 0o755);
      for (const partsSupported of [true, false]) {
        const manifest = runCiManifestFixture({
          bundledPlanner: true,
          eventName: "workflow_dispatch",
          historicalCompatibility: !partsSupported,
          macosNodeParts: partsSupported,
          runnerBackend,
        });
        expect(manifest.status, manifest.output).toBe(0);
        const rows = JSON.parse(
          expectDefined(manifest.outputs.macos_node_matrix, "Mac Node matrix"),
        ).include as Array<{ task: string }>;
        expect(rows.map(({ task }) => task)).toEqual(
          partsSupported ? ["test-1", "test-2", "test-3"] : ["test"],
        );
        const commands = rows.map(({ task }) => {
          const result = runWorkflowShellScript(runStep.run, {
            cwd,
            env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, TASK: task },
          });
          expect(result.status, result.stdout + result.stderr).toBe(0);
          return result.stdout.match(/^selected=(.*)$/m)?.[1];
        });
        expect(commands).toEqual(
          partsSupported
            ? ["test:macos:ci:1", "test:macos:ci:2", "test:macos:ci:3"]
            : ["test:macos:ci"],
        );
      }
      expect(job.strategy["max-parallel"]).toBe(3);
      expect(runStep.env.OPENCLAW_VITEST_MAX_WORKERS).toBe(2);
    },
  );

  it.skipIf(process.platform === "win32")(
    "keeps Windows projects serial on each runner while both jobs remain parallel",
    () => {
      const workflow = readCiWorkflow();
      const job = workflow.jobs["checks-windows"];
      const runStep = job.steps.find(
        (step: WorkflowStep) => step.name === "Run ${{ matrix.task }} (${{ matrix.runtime }})",
      );
      const cwd = tempDirs.make("windows-project-budget-");
      const bin = path.join(cwd, "bin");
      mkdirSync(bin);
      writeFileSync(
        path.join(cwd, "package.json"),
        JSON.stringify({
          scripts: { "test:windows:ci:1": "fixture", "test:windows:ci:2": "fixture" },
        }),
      );
      const pnpm = path.join(bin, "pnpm");
      writeFileSync(
        pnpm,
        '#!/bin/sh\nprintf "project_parallelism=%s\\n" "${OPENCLAW_TEST_PROJECTS_PARALLEL:-1}"\n',
      );
      chmodSync(pnpm, 0o755);
      for (const task of ["test-1", "test-2"]) {
        for (const runner of ["github-hosted", "self-hosted"]) {
          const result = runWorkflowShellScript(runStep.run, {
            cwd,
            env: {
              ...process.env,
              PATH: `${bin}${path.delimiter}${process.env.PATH}`,
              TASK: task,
              RUNNER_ENVIRONMENT: runner,
              OPENCLAW_TEST_PROJECTS_PARALLEL: undefined,
            },
          });
          expect(result.status, result.stdout + result.stderr).toBe(0);
          expect(result.stdout).toContain("project_parallelism=1");
        }
      }
      expect(job.strategy["max-parallel"]).toBe(2);
      expect(job.env.OPENCLAW_VITEST_MAX_WORKERS).toBe(1);
    },
  );

  it("binds frozen target context to the declared live release branch", () => {
    const workflow = readCiWorkflow();
    const input = workflow.on.workflow_dispatch.inputs.target_context_ref;
    const step = expectDefined(
      workflow.jobs.preflight.steps.find(
        (candidate: WorkflowStep) => candidate.name === "Validate target context",
      ),
      "target context validation step",
    );
    const targetSha = "a".repeat(40);

    expect(input).toEqual({
      description:
        "Canonical release branch context authorizing compatibility fallbacks for an exact-SHA target",
      required: false,
      default: "",
      type: "string",
    });
    expect(step.if).toBe("inputs.target_context_ref != ''");

    for (const contextRef of [
      "release/2026.8.1",
      "release/2026.8.1-1",
      "extended-stable/2026.8.33",
    ]) {
      for (const comparisonStatus of ["ahead", "identical"]) {
        const result = runCiReleaseRefValidation({
          ref: contextRef,
          targetSha,
          resolvedSha: comparisonStatus === "identical" ? targetSha : "b".repeat(40),
          comparisonStatus,
        });
        expect(result.status, `${contextRef}: ${result.output}`).toBe(0);
        expect(result.outputs.eligible).toBe("true");
      }
    }

    for (const contextRef of [
      "v2026.8.1",
      "main",
      "release-ci/2026.8.1-beta.2-frozen",
      "release/2026.8",
      "refs/heads/release/2026.8.1",
    ]) {
      const result = runCiReleaseRefValidation({ ref: contextRef, targetSha });
      expect(result.status, contextRef).toBe(1);
      expect(result.output).toContain(
        "target_context_ref must be a canonical OpenAgent release branch.",
      );
    }

    for (const targetRef of ["main", "a".repeat(39)]) {
      const result = runCiReleaseRefValidation({ ref: "release/2026.8.1", targetSha: targetRef });
      expect(result.status, targetRef).toBe(1);
      expect(result.output).toContain(
        "target_context_ref requires target_ref to be a full commit SHA.",
      );
    }

    for (const comparisonStatus of ["behind", "diverged"]) {
      const result = runCiReleaseRefValidation({
        ref: "release/2026.8.1",
        targetSha,
        comparisonStatus,
      });
      expect(result.status, comparisonStatus).toBe(1);
      expect(result.output).toContain(
        "target_ref must be the declared release branch head or one of its ancestors.",
      );
    }
  });

  it.each([
    { kind: "historical", ref: "v2026.8.1" },
    { kind: "historical", ref: "v2026.8.1-beta.2" },
    { kind: "historical", ref: "v2026.8.1-1" },
    { kind: "candidate", ref: "release/2026.8.1" },
    { kind: "candidate", ref: "release/2026.8.1-1" },
    { kind: "candidate", ref: "extended-stable/2026.8.33" },
  ] as const)("binds authenticated $kind ref $ref to its exact commit", (identity) => {
    const targetSha = "a".repeat(40);
    const accepted = runCiReleaseRefValidation({ ...identity, targetSha, resolvedSha: targetSha });
    expect(accepted.status, accepted.output).toBe(0);
    expect(accepted.outputs.eligible).toBe("true");

    const mismatched = runCiReleaseRefValidation({ ...identity, targetSha });
    expect(mismatched.status).not.toBe(0);
    expect(mismatched.output).toContain(`does not resolve to ${targetSha}`);
    expect(mismatched.outputs).not.toHaveProperty("eligible");
  });

  it.each([
    { kind: "context", ref: "release/2026.8.1", apiError: "ref" },
    { kind: "context", ref: "release/2026.8.1", apiError: "comparison" },
    { kind: "historical", ref: "v2026.8.1", apiError: "ref" },
    { kind: "candidate", ref: "release/2026.8.1", apiError: "ref" },
  ] as const)("rejects unavailable authenticated $kind $apiError evidence", (identity) => {
    const targetSha = "a".repeat(40);
    const result = runCiReleaseRefValidation({
      ...identity,
      targetSha,
      resolvedSha: targetSha,
    });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("HTTP 503");
    expect(result.outputs).not.toHaveProperty("eligible");
  });

  it.each([
    { kind: "historical", ref: "refs/heads/v2026.8.1" },
    { kind: "historical", ref: "release/2026.8.1" },
    { kind: "candidate", ref: "refs/tags/release/2026.8.1" },
    { kind: "candidate", ref: "v2026.8.1" },
  ] as const)("rejects wrong-namespace $kind ref $ref before remote admission", (identity) => {
    const result = runCiReleaseRefValidation({ ...identity, targetSha: "a".repeat(40) });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("must be a canonical OpenAgent release");
    expect(result.outputs).not.toHaveProperty("eligible");
  });

  // Native Windows Node cannot execute this fixture's POSIX gh child shim.
  it.skipIf(process.platform === "win32")("protects correction credentials", () => {
    const root = tempDirs.make("openclaw-ci-correction-order-");
    const trusted = path.join(root, ".ci-harness/scripts/lib");
    const eventsPath = path.join(root, "events");
    const outputPath = path.join(root, "output");
    const bin = path.join(root, "bin");
    mkdirSync(trusted, { recursive: true });
    mkdirSync(path.join(root, "scripts"));
    mkdirSync(bin);
    writeFileSync(eventsPath, "");
    writeFileSync(outputPath, "");
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ version: "2026.9.1" }));
    for (const name of ["release-context.mjs", "release-version.mjs"]) {
      writeFileSync(path.join(trusted, name), readFileSync(`scripts/lib/${name}`));
    }
    writeFileSync(
      path.join(trusted, "release-context-original.mjs"),
      readFileSync("scripts/lib/release-context.mjs"),
    );
    const poisonedHelper = `
      import { appendFileSync } from 'node:fs';
      if (process.env.GH_TOKEN) appendFileSync(${JSON.stringify(eventsPath)}, 'token-exposed\\n');
      export { resolveReleaseContextIdentity } from './release-context-original.mjs';
    `;
    writeFileSync(
      path.join(root, "scripts/ci-changed-scope.mjs"),
      `import { appendFileSync, writeFileSync } from 'node:fs';
       appendFileSync(${JSON.stringify(eventsPath)}, 'candidate\\n');
       writeFileSync(${JSON.stringify(path.join(trusted, "release-context.mjs"))}, ${JSON.stringify(poisonedHelper)});`,
    );
    writeExecutable(path.join(bin, "gh"), [
      "#!/bin/sh",
      '[ "$GH_TOKEN" = test-token ] || exit 4',
      `[ "$*" = 'api repos/openclaw/openclaw/commits/refs%2Ftags%2Fv2026.9.1 --jq .sha' ] || exit 64`,
      `printf 'lookup\\n' >> ${quoteShell(eventsPath)}`,
      `printf '%s\\n' '${"a".repeat(40)}'`,
    ]);
    const context = {
      eventName: "workflow_dispatch" as const,
      releaseGate: true,
      releaseScope: "npm-stable",
      repository: "openclaw/openclaw",
      runAttempt: 1,
      targetContextRef: "release/2026.9.1-1",
      workflowToken: "test-token",
      steps: {
        diff_base: { outputs: { sha: "b".repeat(40), head_sha: "a".repeat(40) } },
        target_context_target: { outputs: { eligible: "true" } },
      },
    };
    const steps = readCiWorkflow().jobs.preflight.steps.filter((step: WorkflowStep) =>
      ["Resolve release correction base", "Detect changed scopes"].includes(step.name ?? ""),
    );
    expect(steps).toHaveLength(2);
    for (const step of steps) {
      const evaluate = (expression: string) => evaluateWorkflowExpression(expression, context);
      expect(evaluate(`\${{ ${step.if} }}`), step.name).toBe(true);
      const run = runWorkflowShellScript(
        step.run.replace(/\$\{\{[\s\S]*?\}\}/gu, (expression: string) =>
          String(evaluate(expression)),
        ),
        {
          cwd: root,
          env: {
            PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
            GITHUB_REPOSITORY: context.repository,
            GITHUB_OUTPUT: outputPath,
            ...Object.fromEntries(
              Object.entries(step.env ?? {}).map(([name, value]) => [
                name,
                String(evaluate(String(value))),
              ]),
            ),
          },
        },
      );
      expect(run.status, `${step.name}: ${run.stdout}${run.stderr}`).toBe(0);
    }
    expect(readFileSync(eventsPath, "utf8").trim().split("\n")).toEqual(["lookup", "candidate"]);
    expect(readWorkflowOutputs(outputPath).sha).toBe("a".repeat(40));
  });

  it("bounds Android SDK command-line tools downloads", () => {
    const action = readAndroidToolchainAction();
    const restoreStep = expectDefined(
      action.runs.steps.find((step: WorkflowStep) => step.name === "Restore Android SDK cache"),
      "Android SDK cache restore step",
    );
    const setupStep = expectDefined(
      action.runs.steps.find((step: WorkflowStep) =>
        step.run?.includes("commandlinetools-linux-${CMDLINE_TOOLS_VERSION}_latest.zip"),
      ),
      "Android SDK setup step",
    );

    expect(restoreStep.with?.key).toBe(
      "${{ runner.os }}-android-sdk-v1-cmdline-15859902-platform-37.0-build-tools-36.0.0",
    );
    expect(String(restoreStep.with?.["restore-keys"]).trim()).toBe(
      "${{ runner.os }}-android-sdk-v1-cmdline-15859902-",
    );
    expect(setupStep.run).toContain('CMDLINE_TOOLS_VERSION="15859902"');
    expect(setupStep.run).toContain(
      'CMDLINE_TOOLS_SHA256="4e4c464f145a7512b57d088ac6c278c03c9eea610886b35a5e0804e74eedf583"',
    );
    expect(setupStep.run).toContain("curl -fsSL --connect-timeout 10 --max-time 300");
    expect(setupStep.run).toContain("sha256sum --check -");
  });

  describe("CI workflow admission", () => {
    type EventContext = Parameters<typeof evaluateWorkflowExpression>[1];
    type AdmissionRun = {
      context: EventContext;
      group: string;
      state: "pending" | "running" | "cancelling" | "cancelled" | "completed" | "skipped";
      eligibleJobs?: string[];
    };
    const guardedJobs = ["preflight", "security-fast", "ci-gate"];
    const event = (runId: number, overrides: Partial<EventContext> = {}): EventContext => ({
      eventName: "pull_request",
      action: "ready_for_review",
      draft: false,
      pullRequestNumber: 7,
      headSha: "a".repeat(40),
      sha: "b".repeat(40),
      ref: "refs/pull/7/merge",
      repository: "openclaw/openclaw",
      workflow: "CI",
      runAttempt: 1,
      runId,
      runNumber: runId,
      ...overrides,
    });

    function admissionDriver() {
      const workflow = readCiWorkflow();
      const runs: AdmissionRun[] = [];
      const active = (run: AdmissionRun) => run.state === "running" || run.state === "cancelling";
      return {
        admit(context: EventContext): AdmissionRun {
          if (context.eventName === "pull_request") {
            expect(workflow.on.pull_request.types).toContain(context.action);
          }
          const group: string = evaluateWorkflowExpression(workflow.concurrency.group, context);
          const cancel = evaluateWorkflowExpression(
            workflow.concurrency["cancel-in-progress"],
            context,
          );
          // GitHub replaces pending work even without active cancellation:
          // https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency
          for (const previous of runs.filter(
            (run) => run.group.toLowerCase() === group.toLowerCase(),
          )) {
            if (previous.state === "pending") {
              previous.state = "cancelled";
            }
            if (active(previous) && cancel) {
              previous.state = "cancelling";
            }
          }
          const run: AdmissionRun = { context, group, state: "pending" };
          runs.push(run);
          return run;
        },
        start(run: AdmissionRun) {
          if (
            run.state !== "pending" ||
            runs.some((other) => other.group === run.group && active(other))
          ) {
            return;
          }
          // Admission precedes job conditions. This probes eligibility, not the job DAG.
          run.eligibleJobs = guardedJobs.filter((job) => {
            const condition: string = workflow.jobs[job].if;
            return evaluateWorkflowExpression(
              condition.startsWith("${{") ? condition : `\${{ ${condition} }}`,
              run.context,
            );
          });
          run.state = run.eligibleJobs.length ? "running" : "skipped";
        },
        finish(run: AdmissionRun) {
          expect(active(run)).toBe(true);
          run.state = run.state === "cancelling" ? "cancelled" : "completed";
        },
        cancel(run: AdmissionRun) {
          run.state = "cancelled";
        },
      };
    }

    // Synthetic admission orders, not recovered webhook payloads.
    it.each(
      ["opened", "reopened", "synchronize"].flatMap((action) =>
        ["pending", "running"].map((state) => ({ action, state })),
      ),
    )("preserves $state ready CI after a delayed draft $action", ({ action, state }) => {
      const scheduler = admissionDriver();
      const predecessor = scheduler.admit(event(1, { action: "opened" }));
      scheduler.start(predecessor);
      const ready = scheduler.admit(event(2));
      if (state === "running") {
        scheduler.finish(predecessor);
        scheduler.start(ready);
      }
      expect(ready.state).toBe(state);
      const lateDraft = scheduler.admit(event(3, { action, draft: true }));
      expect(ready.state, "late draft displaced runnable ready CI").toBe(state);
      scheduler.start(lateDraft);
      expect(lateDraft.state).toBe("skipped");
      expect(lateDraft.eligibleJobs).toEqual([]);
      const anotherDraft = scheduler.admit(event(4, { action, draft: true }));
      expect(anotherDraft.group).not.toBe(lateDraft.group);
      expect(lateDraft.group).not.toBe(ready.group);
      if (state === "pending") {
        expect(ready.eligibleJobs).toBeUndefined();
        scheduler.start(ready);
        expect(ready.state).toBe("pending");
        scheduler.finish(predecessor);
        scheduler.start(ready);
      }
      expect(ready.state).toBe("running");
      expect(ready.eligibleJobs).toEqual(guardedJobs);
    });

    it("admits ready CI after the forward draft-to-ready sequence", () => {
      const scheduler = admissionDriver();
      const draft = scheduler.admit(event(1, { action: "opened", draft: true }));
      scheduler.start(draft);
      expect(draft.eligibleJobs).toEqual([]);
      expect(draft.state).toBe("skipped");
      const ready = scheduler.admit(event(2));
      scheduler.start(ready);
      expect(ready.group).toBe("CI-v7-7");
      expect(ready.eligibleJobs).toEqual(guardedJobs);
    });

    it.each(["pending", "running"])(
      "converted_to_draft cancels %s CI and skips its jobs",
      (state) => {
        const scheduler = admissionDriver();
        const previous = scheduler.admit(event(1));
        scheduler.start(previous);
        const ready = state === "pending" ? scheduler.admit(event(2)) : previous;
        const converted = scheduler.admit(event(3, { action: "converted_to_draft", draft: true }));
        expect(converted.group).toBe("CI-v7-7");
        expect(ready.state).toBe(state === "pending" ? "cancelled" : "cancelling");
        expect(previous.state).toBe("cancelling");
        scheduler.finish(previous);
        scheduler.start(converted);
        expect(converted.state).toBe("skipped");
        expect(converted.eligibleJobs).toEqual([]);
      },
    );

    it.each(["pending", "running"])(
      "a newer non-draft head supersedes %s CI only for its PR",
      (state) => {
        const scheduler = admissionDriver();
        const otherPr = scheduler.admit(
          event(1, { pullRequestNumber: 8, ref: "refs/pull/8/merge" }),
        );
        scheduler.start(otherPr);
        const old = scheduler.admit(event(2));
        if (state === "running") {
          scheduler.start(old);
        }
        const next = scheduler.admit(
          event(3, {
            action: "synchronize",
            headSha: "c".repeat(40),
            sha: "d".repeat(40),
          }),
        );
        expect(next.group).toBe(old.group);
        expect(old.state).toBe(state === "pending" ? "cancelled" : "cancelling");
        expect(otherPr.state).toBe("running");
        if (state === "running") {
          scheduler.finish(old);
        }
        scheduler.start(next);
        expect(next.eligibleJobs).toEqual(guardedJobs);
      },
    );

    it("isolates manual dispatches on the same target from each other and PR CI", () => {
      const scheduler = admissionDriver();
      const ready = scheduler.admit(event(1));
      scheduler.start(ready);
      const manual = [2, 3].map((runId) =>
        scheduler.admit(
          event(runId, {
            eventName: "workflow_dispatch",
            targetRef: "a".repeat(40),
          }),
        ),
      );
      for (const run of manual) {
        scheduler.start(run);
        expect(run.state).toBe("running");
        expect(run.eligibleJobs).toEqual(guardedJobs);
      }
      expect(manual.map((run) => run.group)).toEqual(["CI-manual-v1-2", "CI-manual-v1-3"]);
      expect(ready.state).toBe("running");
    });

    it.each(["pending", "running"])(
      "passive drafts do not resurrect explicitly cancelled %s CI",
      (state) => {
        const scheduler = admissionDriver();
        const ready = scheduler.admit(event(1));
        if (state === "running") {
          scheduler.start(ready);
        }
        scheduler.cancel(ready);
        const draft = scheduler.admit(event(2, { action: "synchronize", draft: true }));
        scheduler.start(draft);
        scheduler.start(ready);
        expect(ready.state).toBe("cancelled");
        expect(draft.state).toBe("skipped");
        expect(draft.eligibleJobs).toEqual([]);
        expect(
          evaluateWorkflowExpression(readCiWorkflow().jobs["ci-gate"].if, {
            ...ready.context,
            cancelled: ready.state === "cancelled",
          }),
        ).toBe(false);
      },
    );

    it("pipelines canonical main across two non-canceling slots with coalesced pending work", () => {
      const workflow = readCiWorkflow();
      const scheduler = admissionDriver();
      const push = (runId: number) =>
        event(runId, {
          eventName: "push",
          ref: "refs/heads/main",
          sha: runId.toString(16).padStart(40, "0"),
        });
      for (let digit = 0; digit < 10; digit++) {
        expect(evaluateWorkflowExpression(workflow.concurrency.group, push(100 + digit))).toBe(
          `CI-v8-refs/heads/main-${digit % 2 === 0 ? "a" : "b"}`,
        );
        expect(
          evaluateWorkflowExpression(workflow.concurrency["cancel-in-progress"], push(100 + digit)),
        ).toBe(false);
      }
      const active = [20, 21].map((id) => scheduler.admit(push(id)));
      active.forEach((run) => scheduler.start(run));
      const pending = [22, 23].map((id) => scheduler.admit(push(id)));
      const newest = [24, 25].map((id) => scheduler.admit(push(id)));
      expect(active.map((run) => run.state)).toEqual(["running", "running"]);
      expect(pending.map((run) => run.state)).toEqual(["cancelled", "cancelled"]);
      for (const run of newest) {
        scheduler.start(run);
        expect(run.state).toBe("pending");
        expect(run.eligibleJobs).toBeUndefined();
      }
      scheduler.finish(active[0]!);
      newest.forEach((run) => scheduler.start(run));
      expect(newest.map((run) => run.state)).toEqual(["running", "pending"]);
      scheduler.finish(active[1]!);
      scheduler.start(newest[1]!);
      expect(newest.map((run) => run.state)).toEqual(["running", "running"]);
      expect(workflow.jobs["runner-admission"]).toBeUndefined();
      expect(workflow.jobs.preflight.needs).toBeUndefined();
      expect(workflow.jobs["security-fast"].needs).toBeUndefined();
    });

    it.each([
      ["openclaw/openclaw", "refs/heads/topic", "CI-v7-refs/heads/topic"],
      ["contributor/fork", "refs/heads/main", `CI-v7-refs/heads/main-${"b".repeat(40)}`],
      ["contributor/fork", "refs/heads/topic", `CI-v7-refs/heads/topic-${"b".repeat(40)}`],
    ])("preserves push grouping for %s on %s", (repository, ref, group) => {
      const workflow = readCiWorkflow();
      const context = event(1, { eventName: "push", repository, ref });
      expect(evaluateWorkflowExpression(workflow.concurrency.group, context)).toBe(group);
      expect(evaluateWorkflowExpression(workflow.concurrency["cancel-in-progress"], context)).toBe(
        false,
      );
    });
  });

  it.each([
    { buildImpact: false, uiE2e: false, distRequired: false },
    { buildImpact: true, uiE2e: true, distRequired: false },
    { buildImpact: false, uiE2e: false, distRequired: true },
  ])(
    "composes dedicated suite coverage before precise planning (build=$buildImpact, UI=$uiE2e, dist=$distRequired)",
    ({ buildImpact, uiE2e, distRequired }) => {
      const runnerProfile = distRequired ? "hybrid" : "blacksmith";
      const manifest = runCiManifestFixture({
        runnerProfile,
        bundledPlanner: true,
        eventName: "pull_request",
        changedPaths: [buildImpact ? "src/fixture.ts" : "src/plugins/contracts/fixture-a.test.ts"],
        scopeEnv: { OPENCLAW_CI_RUN_UI_TESTS: String(uiE2e) },
        changedPlannerSource: `
        export const createChangedNodeTestShards = (_paths, options = {}) => {
          console.log("dedicated-coverage:" + JSON.stringify(options));
          return ${
            buildImpact
              ? "[]"
              : `[{ checkName: "changed-boundary", shardName: "changed-boundary",
            configs: ["test/vitest/vitest.boundary.config.ts"], requiresDist: ${distRequired},
            runner: "ubuntu-24.04" }]`
          };
        };
        export const createChangedExtensionFallbackShards = () => { throw new Error("Unexpected broad fallback"); };
        export const hasBuildArtifactAffectingChange = () => ${buildImpact};
        export const hasSqliteSessionLifecycleAffectingChange = () => false;
      `,
      });
      expect(manifest.status, manifest.output).toBe(0);
      const dedicated = ["plugin", "channel"].flatMap((family) => {
        expect(manifest.outputs[`run_${family}_contracts_shards`]).toBe("true");
        const rows = JSON.parse(
          expectDefined(manifest.outputs[`${family}_contracts_matrix`], family),
        ).include;
        expect(rows).toHaveLength(1);
        return rows.flatMap((row: { groups: unknown[] }) => row.groups);
      });
      expect(dedicated).toHaveLength(4);
      const coverage = expectDefined(
        manifest.output.split("\n").find((line) => line.startsWith("dedicated-coverage:")),
        "precise planner coverage input",
      );
      expect(JSON.parse(coverage.slice("dedicated-coverage:".length))).toEqual({
        runnerBackend: runnerProfile,
        dedicatedContractShards: dedicated,
        dedicatedUiE2e: uiE2e,
        dedicatedMaxLinesRatchet: true,
      });
      for (const job of ["checks-ui-e2e", "checks-ui-e2e-real-gateway"]) {
        expect(
          evaluateWorkflowExpression(`\${{ ${readCiWorkflow().jobs[job].if} }}`, {
            eventName: "pull_request",
            repository: "openclaw/openclaw",
            runAttempt: 1,
            preflightOutputs: manifest.outputs,
          }),
          job,
        ).toBe(uiE2e);
      }
      const nodeRows = JSON.parse(
        expectDefined(manifest.outputs.checks_node_core_nondist_matrix, "precise matrix"),
      ).include;
      expect(nodeRows).toEqual(
        buildImpact || distRequired
          ? []
          : [expect.objectContaining({ shard_name: "changed-boundary" })],
      );
      expect(manifest.outputs.run_build_artifacts).toBe(String(buildImpact || distRequired));
      expect(manifest.outputs.run_checks_node_core_dist).toBe(String(buildImpact || distRequired));
    },
  );

  it.each([
    ["push", "blacksmith", false],
    ["pull_request", "github", false],
    ["pull_request", "hybrid", false],
    ["workflow_dispatch", "blacksmith", false],
    ["workflow_dispatch", "blacksmith", true],
    ["workflow_dispatch", "github", true],
  ] as const)(
    "shares contract setup while retaining process envelopes (%s, %s, frozen=%s)",
    (eventName, runnerProfile, frozenTarget) => {
      const manifest = runCiManifestFixture({
        bundledPlanner: true,
        changedPaths: ["package.json"],
        eventName,
        runnerProfile,
        scopeEnv: {
          OPENCLAW_CI_WORKFLOW_REVISION: (frozenTarget ? "b" : "a").repeat(40),
        },
      });
      expect(manifest.status, manifest.output).toBe(0);
      for (const family of ["plugin", "channel"] as const) {
        const outputName = `${family}_contracts_matrix`;
        const rows = JSON.parse(expectDefined(manifest.outputs[outputName], outputName)).include;
        const expected = ["a", "b"].map((suffix) => ({
          checkName: `${family}-contracts-${suffix}`,
          includePatterns: [
            `${family === "plugin" ? "src/plugins" : "src/channels/plugins"}/contracts/fixture-${suffix}.test.ts`,
          ],
          runtime: "node",
          task: `contracts-${family}s`,
        }));
        expect(rows).toHaveLength(frozenTarget ? 2 : 1);
        expect(rows.flatMap((row: { groups: unknown[] }) => row.groups)).toEqual(expected);
        expect(rows.map((row: { checkName: string }) => row.checkName)).toEqual(
          frozenTarget
            ? expected.map((shard) => shard.checkName)
            : [`checks-fast-contracts-${family}s`],
        );
      }
    },
  );

  it.each(["plugin", "channel"] as const)(
    "joins %s contract envelopes and stops admission on any failure",
    (family) => {
      const workflow = readCiWorkflow();
      const job = workflow.jobs[`checks-fast-${family}-contracts-shard`];
      const step = job.steps.find(
        (candidate: WorkflowStep) => candidate.name === `Run ${family} contract shard`,
      );
      expect(step.env.OPENCLAW_CONTRACT_INCLUDE_PATTERNS_JSON).toBe("${{ toJson(matrix) }}");
      expect(step.env.OPENCLAW_TEST_PROJECTS_PARALLEL).toBe(family === "channel" ? "4" : undefined);
      const fixture = tempDirs.make("openclaw-contract-groups-");
      const binDir = path.join(fixture, "bin");
      mkdirSync(binDir);
      const commandLog = path.join(fixture, "commands.jsonl");
      const pnpm = path.join(binDir, "pnpm");
      writeFileSync(
        pnpm,
        String.raw`#!${process.execPath}
const fs = require("node:fs");
const files = JSON.parse(fs.readFileSync(process.env.OPENCLAW_VITEST_INCLUDE_FILE, "utf8"));
const record = { args: process.argv.slice(2), files, parallel: process.env.OPENCLAW_TEST_PROJECTS_PARALLEL ?? null };
fs.appendFileSync(process.env.CONTRACT_COMMAND_LOG, JSON.stringify({ ...record, phase: "start" }) + "\n");
setImmediate(() => {
  fs.appendFileSync(process.env.CONTRACT_COMMAND_LOG, JSON.stringify({ ...record, phase: "end" }) + "\n");
  process.exitCode = files[0] === "first.test.ts" ? Number(process.env.CONTRACT_FIRST_EXIT) : 0;
});

`,
      );
      chmodSync(pnpm, 0o755);
      for (const firstExit of [0, 7, 143]) {
        writeFileSync(commandLog, "");
        const run = runWorkflowShellScript(step.run, {
          cwd: fixture,
          env: {
            PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
            RUNNER_TEMP: fixture,
            CONTRACT_COMMAND_LOG: commandLog,
            CONTRACT_FIRST_EXIT: String(firstExit),
            OPENCLAW_TEST_PROJECTS_PARALLEL: step.env.OPENCLAW_TEST_PROJECTS_PARALLEL,
            OPENCLAW_CONTRACT_INCLUDE_PATTERNS_JSON: JSON.stringify({
              task: `contracts-${family}s`,
              groups: [
                { checkName: "first-envelope", includePatterns: ["first.test.ts"] },
                { checkName: "second-envelope", includePatterns: ["second.test.ts"] },
              ],
            }),
          },
        });
        expect(run.status, `${run.stdout}${run.stderr}`).toBe(firstExit);
        const files = firstExit === 0 ? ["first.test.ts", "second.test.ts"] : ["first.test.ts"];
        expect(
          readFileSync(commandLog, "utf8")
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line)),
        ).toEqual(
          files.flatMap((file) =>
            ["start", "end"].map((phase) => ({
              args: [`test:contracts:${family}s`],
              files: [file],
              parallel: family === "channel" ? "4" : null,
              phase,
            })),
          ),
        );
      }
    },
  );

  it("keeps CodeQL critical quality scans off Blacksmith registrations", () => {
    const source = readCriticalQualityWorkflow();
    const workflow = parse(source);
    const blacksmithJobs = Object.entries(workflow.jobs)
      .filter(([, job]) => job && typeof job === "object")
      .filter(([, job]) => (job as Record<string, unknown>)["runs-on"] !== "ubuntu-24.04")
      .map(([name]) => name);

    expect(blacksmithJobs).toEqual([]);
    expect(source).not.toContain("blacksmith-");
  });

  it("keeps hybrid preflight and the gate hosted while security uses Blacksmith", () => {
    const workflow = readCiWorkflow();
    expect(workflow.jobs["ci-gate"]["runs-on"]).toBe("ubuntu-24.04");
    const context = {
      eventName: "pull_request",
      repository: "openclaw/openclaw",
      runAttempt: 1,
      runnerBackend: "hybrid",
    } as const;

    for (const jobName of ["preflight", "security-fast"]) {
      const expression = workflow.jobs[jobName]["runs-on"];
      for (const eventName of ["pull_request", "push"] as const) {
        expect(evaluateWorkflowExpression(expression, { ...context, eventName }), jobName).toBe(
          jobName === "preflight" ? "ubuntu-24.04" : "blacksmith-4vcpu-ubuntu-2404",
        );
      }
      for (const override of [
        { runAttempt: 2 },
        { runnerBackend: "github" },
        { eventName: "workflow_dispatch" },
        { repository: "contributor/openclaw" },
        { authorAssociation: "NONE", headRepository: "contributor/openclaw" },
      ] as const) {
        expect(evaluateWorkflowExpression(expression, { ...context, ...override }), jobName).toBe(
          "ubuntu-24.04",
        );
      }
      for (const runnerBackend of ["", "blacksmith"] as const) {
        for (const eventName of ["pull_request", "push"] as const) {
          expect(
            evaluateWorkflowExpression(expression, { ...context, eventName, runnerBackend }),
            jobName,
          ).toBe(jobName === "security-fast" ? "ubuntu-24.04" : "blacksmith-4vcpu-ubuntu-2404");
        }
      }
    }
  });

  it.each(
    [
      {
        file: "openclaw-live-and-e2e-checks-reusable.yml",
        runner: "blacksmith-32vcpu-ubuntu-2404",
        jobs: ["validate_docker_openwebui"],
      },
    ].flatMap(({ file, runner, jobs }) => jobs.map((job) => ({ file, runner, job }))),
  )("honors the global hosted runner override for $file/$job", ({ file, runner, job }) => {
    const workflow = parse(readFileSync(`.github/workflows/${file}`, "utf8"));
    const runsOn = workflow.jobs[job]["runs-on"];
    const supportsHostedInput = file === "openclaw-live-and-e2e-checks-reusable.yml";

    for (const runnerBackend of ["github", "", "blacksmith", "hybrid"] as const) {
      for (const useGithubHostedRunners of [false, true]) {
        const expectedRunner =
          runnerBackend === "github" || (supportsHostedInput && useGithubHostedRunners)
            ? "ubuntu-24.04"
            : runner;
        const actualRunner =
          typeof runsOn === "string" && runsOn.startsWith("${{")
            ? evaluateWorkflowExpression(runsOn, {
                eventName: "workflow_dispatch",
                repository: "openclaw/openclaw",
                runAttempt: 1,
                runnerBackend,
                useGithubHostedRunners,
              })
            : runsOn;

        expect(
          actualRunner,
          `${runnerBackend || "unset"}, use_github_hosted_runners=${useGithubHostedRunners}`,
        ).toBe(expectedRunner);
      }
    }
  });

  it("resolves one event-aware logical runner profile without changing physical routing", () => {
    const scenarios = [
      {
        expected: "github",
        name: "current manual dispatch ignores configured Blacksmith",
        options: {
          configuredProfile: "blacksmith",
          eventName: "workflow_dispatch" as const,
          targetSupportsContract: true,
        },
      },
      {
        expected: "blacksmith",
        name: "canonical trusted push keeps the default",
        options: {
          eventName: "push" as const,
          targetSupportsContract: true,
        },
      },
      {
        expected: "github",
        name: "canonical trusted push keeps configured GitHub",
        options: {
          configuredProfile: "github",
          eventName: "push" as const,
          targetSupportsContract: true,
        },
      },
      {
        expected: "hybrid",
        name: "canonical trusted hybrid retry keeps the hybrid workload shape",
        options: {
          authorAssociation: "CONTRIBUTOR",
          configuredProfile: "hybrid",
          eventName: "pull_request" as const,
          runAttempt: 2,
          targetSupportsContract: true,
        },
      },
      {
        expected: "github",
        name: "fork pull request is hosted",
        options: {
          configuredProfile: "hybrid",
          eventName: "pull_request" as const,
          headRepository: "contributor/openclaw",
          targetSupportsContract: true,
        },
      },
      {
        expected: "github",
        name: "untrusted same-repository pull request is hosted",
        options: {
          authorAssociation: "NONE",
          configuredProfile: "blacksmith",
          eventName: "pull_request" as const,
          targetSupportsContract: true,
        },
      },
      {
        expected: "github",
        name: "noncanonical repository is hosted",
        options: {
          configuredProfile: "blacksmith",
          eventName: "push" as const,
          repository: "fork/openclaw",
          targetSupportsContract: true,
        },
      },
      {
        expected: "blacksmith",
        name: "frozen target without the marker keeps legacy dispatch behavior",
        options: {
          configuredProfile: "blacksmith",
          eventName: "workflow_dispatch" as const,
          targetSupportsContract: false,
        },
      },
      {
        expected: "github",
        name: "frozen target with the marker uses event-aware dispatch behavior",
        options: {
          configuredProfile: "blacksmith",
          eventName: "workflow_dispatch" as const,
          targetSupportsContract: true,
        },
      },
    ];

    for (const { expected, name, options } of scenarios) {
      const result = runRunnerProfileFixture(options);
      expect(result.status, `${name}: ${result.output}`).toBe(0);
      expect(result.outputs.runner_profile, name).toBe(expected);
      expect(result.outputs.hosted_runner_profile_contract, name).toBe(
        String(options.targetSupportsContract),
      );
    }

    const invalid = runRunnerProfileFixture({
      configuredProfile: "other",
      eventName: "push",
      targetSupportsContract: true,
    });
    expect(invalid.status).toBe(1);
    expect(invalid.output).toContain(
      "OPENCLAW_CI_RUNNER_BACKEND must be github, hybrid, or blacksmith",
    );

    const workflow = readCiWorkflow();
    expect(workflow.jobs.preflight.outputs.runner_profile).toBe(
      "${{ steps.runner_profile.outputs.runner_profile }}",
    );
    expect(workflow.jobs.preflight["runs-on"]).toContain("vars.OPENCLAW_CI_RUNNER_BACKEND");

    const dispatchManifest = runCiManifestFixture({
      bundledPlanner: true,
      eventName: "workflow_dispatch",
      historicalCompatibility: false,
      runnerBackend: "blacksmith",
      runnerProfile: "github",
    });
    expect(dispatchManifest.status, dispatchManifest.output).toBe(0);
    expect(
      JSON.parse(expectDefined(dispatchManifest.outputs.ui_e2e_matrix, "dispatch UI E2E matrix"))
        .include,
    ).toHaveLength(13);
    expect(
      JSON.parse(
        expectDefined(dispatchManifest.outputs.qa_smoke_ci_matrix, "dispatch QA smoke matrix"),
      ).include,
    ).toHaveLength(6);
  });

  it.each(["", "release/2026.9.1"])(
    "honors trusted dispatch runner selection for check shards with context %j",
    (targetContextRef) => {
      const runsOn = readCiWorkflow().jobs["check-shard"]["runs-on"];
      const lintMatrix = {
        runner: "blacksmith-32vcpu-ubuntu-2404",
        task: "lint",
      };
      const evaluateDispatch = (
        runnerBackend: "blacksmith" | "github" | "hybrid",
        overrides: {
          dispatchId?: string;
          frozenTarget?: boolean;
          matrix?: Record<string, unknown>;
          releaseGate?: boolean;
          repository?: string;
          targetContextRef?: string;
        } = {},
      ) =>
        evaluateWorkflowExpression(runsOn, {
          eventName: "workflow_dispatch",
          matrix: lintMatrix,
          repository: "openclaw/openclaw",
          runAttempt: 1,
          runnerBackend,
          ...overrides,
        });

      expect(evaluateDispatch("blacksmith")).toBe("blacksmith-32vcpu-ubuntu-2404");
      expect(evaluateDispatch("blacksmith", { releaseGate: true })).toBe("ubuntu-24.04");
      expect(evaluateDispatch("github")).toBe("ubuntu-24.04");
      expect(evaluateDispatch("hybrid")).toBe("ubuntu-24.04");

      const frozenFrv = {
        dispatchId: "full-release-validation-33128772779-ci",
        frozenTarget: true,
        targetContextRef,
      };
      expect(evaluateDispatch("hybrid", frozenFrv)).toBe("blacksmith-32vcpu-ubuntu-2404");
      expect(evaluateDispatch("github", frozenFrv)).toBe("ubuntu-24.04");
      expect(evaluateDispatch("hybrid", { ...frozenFrv, frozenTarget: false })).toBe(
        "ubuntu-24.04",
      );
      expect(evaluateDispatch("hybrid", { ...frozenFrv, dispatchId: "manual-ci-proof" })).toBe(
        "ubuntu-24.04",
      );
      expect(evaluateDispatch("hybrid", { ...frozenFrv, releaseGate: true })).toBe("ubuntu-24.04");
      expect(
        evaluateDispatch("hybrid", {
          ...frozenFrv,
          matrix: { runner: "blacksmith-16vcpu-ubuntu-2404", task: "test-types" },
        }),
      ).toBe("ubuntu-24.04");
      expect(evaluateDispatch("hybrid", { ...frozenFrv, repository: "fork/openclaw" })).toBe(
        "ubuntu-24.04",
      );
      expect(
        evaluateWorkflowExpression(runsOn, {
          authorAssociation: "NONE",
          eventName: "pull_request",
          headRepository: "openclaw/openclaw",
          matrix: lintMatrix,
          repository: "openclaw/openclaw",
          runAttempt: 1,
          runnerBackend: "blacksmith",
        }),
      ).toBe("ubuntu-24.04");
    },
  );

  it("encodes GitHub, Blacksmith, and hybrid runner-backend shapes", () => {
    const workflow = readCiWorkflow();
    const jobs = workflow.jobs as Record<string, { "runs-on": unknown }>;
    const expectedHostedRunners = {
      "build-artifacts": "ubuntu-24.04",
      "check-additional-shard": "ubuntu-24.04",
      "check-shard": "ubuntu-24.04",
      "checks-fast-channel-contracts-shard": "ubuntu-24.04",
      "checks-fast-core": "ubuntu-24.04",
      "checks-fast-plugin-contracts-shard": "ubuntu-24.04",
      "checks-node-compat": "ubuntu-24.04",
      "checks-node-core-test-nondist-shard": "ubuntu-24.04",
      "checks-ui": "ubuntu-24.04",
      "checks-ui-e2e": "ubuntu-24.04",
      "checks-ui-e2e-real-gateway": "ubuntu-24.04",
      "control-ui-i18n": "ubuntu-24.04",
      "control-ui-performance": "ubuntu-24.04",
      "docker-seed-e2e": "ubuntu-24.04",
      "macos-node": "macos-15",
      "pnpm-store-warmup": "ubuntu-24.04",
      preflight: "ubuntu-24.04",
      "security-fast": "ubuntu-24.04",
      "skills-python": "ubuntu-24.04",
      "check-test-types-hosted-core-shard": "ubuntu-24.04",
      "checks-windows": "windows-2025",
    } as const;
    const expectedHybridFirstAttemptRunners = {
      ...expectedHostedRunners,
      "security-fast": "blacksmith-4vcpu-ubuntu-2404",
      "build-artifacts": "blacksmith-16vcpu-ubuntu-2404",
      "checks-node-core-test-nondist-shard": "blacksmith-32vcpu-ubuntu-2404",
      "checks-ui-e2e": "blacksmith-8vcpu-ubuntu-2404",
      "checks-ui-e2e-real-gateway": "blacksmith-32vcpu-ubuntu-2404",
      "docker-seed-e2e": "blacksmith-32vcpu-ubuntu-2404",
      "check-test-types-hosted-core-shard": "blacksmith-32vcpu-ubuntu-2404",
      "checks-ui": "blacksmith-8vcpu-ubuntu-2404",
      "checks-windows": "blacksmith-8vcpu-windows-2025",
    } as const;
    const expectedHybridForkRunners = {
      ...expectedHybridFirstAttemptRunners,
      "docker-seed-e2e": "ubuntu-24.04",
    } as const;
    const configurableJobs = Object.entries(jobs)
      .filter(([, job]) => String(job["runs-on"]).startsWith("${{"))
      .map(([jobName]) => jobName)
      .toSorted();
    const canonicalPullRequest = {
      eventName: "pull_request",
      headRepository: "openclaw/openclaw",
      matrix: { runner: "blacksmith-32vcpu-ubuntu-2404" },
      repository: "openclaw/openclaw",
      runAttempt: 1,
    } as const;
    expect(configurableJobs).toEqual(Object.keys(expectedHostedRunners).toSorted());
    expect(jobs["check-lint-hosted-core-shard"]?.["runs-on"]).toBe("ubuntu-24.04");
    // check-docs stays hosted in every mode: its ClawHub clone is unauthenticated by design.
    expect(jobs["check-docs"]?.["runs-on"]).toBe("ubuntu-24.04");
    for (const [jobName, hostedRunner] of Object.entries(expectedHostedRunners)) {
      const expression = jobs[jobName]?.["runs-on"];
      for (const [label, overrides, expectedRunner] of [
        ["github backend", { runnerBackend: "github" }, hostedRunner],
        [
          "hybrid first attempt",
          { runnerBackend: "hybrid" },
          expectedHybridFirstAttemptRunners[jobName as keyof typeof expectedHostedRunners],
        ],
        ["hybrid retry", { runnerBackend: "hybrid", runAttempt: 2 }, hostedRunner],
        [
          "explicit Blacksmith matches default",
          { runnerBackend: "blacksmith" },
          evaluateWorkflowExpression(expression, canonicalPullRequest),
        ],
        // New contributors stay hosted. GitHub can also report maintainers as
        // CONTRIBUTOR when organization membership is concealed.
        [
          "untrusted fork",
          {
            authorAssociation: "NONE",
            headRepository: "contributor/openclaw",
            runnerBackend: "hybrid",
          },
          hostedRunner,
        ],
        [
          "returning-contributor fork",
          {
            authorAssociation: "CONTRIBUTOR",
            headRepository: "contributor/openclaw",
            runnerBackend: "hybrid",
          },
          expectedHybridForkRunners[jobName as keyof typeof expectedHostedRunners],
        ],
      ] as const) {
        expect(
          evaluateWorkflowExpression(expression, { ...canonicalPullRequest, ...overrides }),
          `${jobName}: ${label}`,
        ).toBe(expectedRunner);
      }
      for (const runnerBackend of ["", "blacksmith", "hybrid"] as const) {
        expect(
          evaluateWorkflowExpression(expression, {
            ...canonicalPullRequest,
            authorAssociation: "CONTRIBUTOR",
            headRepository: "contributor/openclaw",
            runnerBackend,
            runAttempt: 2,
          }),
          `${jobName}: returning-contributor fork retry (${runnerBackend || "unset"})`,
        ).toBe(hostedRunner);
      }
    }

    const widenedHybridMatrixRows = [
      {
        jobName: "check-shard",
        matrix: { runner: "blacksmith-32vcpu-ubuntu-2404", task: "lint" },
        runner: "blacksmith-32vcpu-ubuntu-2404",
      },
      {
        jobName: "check-shard",
        matrix: { runner: "blacksmith-32vcpu-ubuntu-2404", task: "test-types" },
        runner: "blacksmith-32vcpu-ubuntu-2404",
      },
      {
        jobName: "check-shard",
        matrix: { runner: "blacksmith-32vcpu-ubuntu-2404", task: "dependencies" },
        runner: "blacksmith-32vcpu-ubuntu-2404",
      },
      {
        jobName: "check-additional-shard",
        matrix: {
          group: "extension-package-boundary",
          runner: "blacksmith-32vcpu-ubuntu-2404",
        },
        runner: "blacksmith-32vcpu-ubuntu-2404",
      },
      {
        jobName: "check-additional-shard",
        matrix: {
          group: "runtime-topology-architecture",
          runner: "blacksmith-32vcpu-ubuntu-2404",
        },
        runner: "blacksmith-32vcpu-ubuntu-2404",
      },
      {
        jobName: "check-additional-shard",
        matrix: {
          group: "plugin-sdk-api-diff",
          runner: "blacksmith-4vcpu-ubuntu-2404",
        },
        runner: "blacksmith-4vcpu-ubuntu-2404",
      },
      {
        jobName: "checks-node-core-test-nondist-shard",
        matrix: { runner: "blacksmith-4vcpu-ubuntu-2404" },
        runner: "blacksmith-4vcpu-ubuntu-2404",
      },
      {
        jobName: "checks-node-core-test-nondist-shard",
        matrix: { runner: "blacksmith-8vcpu-ubuntu-2404" },
        runner: "blacksmith-8vcpu-ubuntu-2404",
      },
    ] as const;
    for (const { jobName, matrix, runner } of widenedHybridMatrixRows) {
      const expression = jobs[jobName]?.["runs-on"];
      for (const [label, overrides, expectedRunner] of [
        ["hybrid attempt 1", { runnerBackend: "hybrid" }, runner],
        ["hybrid retry", { runnerBackend: "hybrid", runAttempt: 2 }, "ubuntu-24.04"],
        ["github backend", { runnerBackend: "github" }, "ubuntu-24.04"],
        [
          "untrusted fork pull request",
          {
            authorAssociation: "NONE",
            headRepository: "contributor/openclaw",
            runnerBackend: "hybrid",
          },
          "ubuntu-24.04",
        ],
        [
          "workflow dispatch",
          { eventName: "workflow_dispatch", runnerBackend: "hybrid" },
          "ubuntu-24.04",
        ],
      ] as const) {
        expect(
          evaluateWorkflowExpression(expression, { ...canonicalPullRequest, matrix, ...overrides }),
          `${jobName}: ${label}`,
        ).toBe(expectedRunner);
      }
    }
  });

  it("gives breaker-routed hosted jobs their hosted timeout budgets", () => {
    const workflow = readCiWorkflow();
    const jobs = workflow.jobs as Record<string, { "timeout-minutes": unknown }>;
    const expectedHostedTimeouts = {
      "build-artifacts": 35,
      "checks-ui-e2e-real-gateway": 40,
    } as const;
    const routeDependentTimeoutJobs = Object.entries(jobs)
      .filter(([, job]) => {
        const timeout = job["timeout-minutes"];
        return typeof timeout === "string" && timeout.includes("github.");
      })
      .map(([jobName]) => jobName)
      .toSorted();
    const canonicalPullRequest = {
      eventName: "pull_request",
      headRepository: "openclaw/openclaw",
      matrix: { task: "build-play" },
      repository: "openclaw/openclaw",
      runAttempt: 1,
    } as const;
    const evaluateTimeout = (
      jobName: string,
      context: Parameters<typeof evaluateWorkflowExpression>[1],
    ) => {
      const value = jobs[jobName]?.["timeout-minutes"];
      return typeof value === "number" ? value : evaluateWorkflowExpression(value, context);
    };

    for (const [jobName, hostedTimeout] of Object.entries(expectedHostedTimeouts)) {
      for (const [overrides, expectedTimeout] of [
        [{ runnerBackend: "github" }, hostedTimeout],
        [{ runnerBackend: "blacksmith" }, 20],
        [{ runnerBackend: "hybrid" }, 20],
        [{ runnerBackend: "hybrid", runAttempt: 2 }, hostedTimeout],
      ] as const) {
        expect(evaluateTimeout(jobName, { ...canonicalPullRequest, ...overrides }), jobName).toBe(
          expectedTimeout,
        );
      }
      expect(jobs[jobName]?.["timeout-minutes"], jobName).toContain(
        "vars.OPENCLAW_CI_RUNNER_BACKEND == 'github'",
      );
    }
    expect(routeDependentTimeoutJobs).toEqual(Object.keys(expectedHostedTimeouts).toSorted());

    const realGateway = workflow.jobs["checks-ui-e2e-real-gateway"];
    for (const eventName of ["pull_request", "push", "workflow_dispatch"] as const) {
      for (const repository of ["openclaw/openclaw", "contributor/openclaw"]) {
        for (const authorAssociation of ["CONTRIBUTOR", "NONE"]) {
          for (const runnerBackend of ["", "blacksmith", "github", "hybrid"] as const) {
            for (const runAttempt of [1, 2]) {
              const context = {
                ...canonicalPullRequest,
                eventName,
                repository,
                authorAssociation,
                runnerBackend,
                runAttempt,
              };
              const runner = evaluateWorkflowExpression(realGateway["runs-on"], context);
              expect(
                evaluateTimeout("checks-ui-e2e-real-gateway", context),
                JSON.stringify(context),
              ).toBe(runner === "ubuntu-24.04" ? 40 : 20);
            }
          }
        }
      }
    }
  });

  it("resolves the pull request base and changed files from the shallow security checkout", () => {
    const securitySteps = readCiWorkflow().jobs["security-fast"].steps as WorkflowStep[];
    const checkoutIndex = securitySteps.findIndex((step) => step.name === "Checkout");
    const checkout = expectDefined(securitySteps[checkoutIndex], "security checkout");
    const root = tempDirs.make("openclaw-security-checkout-");
    const depth = checkout.with?.["fetch-depth"];
    expect(Number.isInteger(Number(depth)) && Number(depth) > 0).toBe(true);
    expect(checkout.with?.["persist-credentials"]).toBe(false);

    const source = path.join(root, "source");
    const selected = path.join(root, "selected");
    mkdirSync(source);
    mkdirSync(selected);
    const git = (cwd: string, ...args: string[]) =>
      execFileSync(
        "git",
        [
          "-C",
          cwd,
          "-c",
          "user.name=CI Fixture",
          "-c",
          "user.email=ci@example.invalid",
          "-c",
          "commit.gpgsign=false",
          ...args,
        ],
        {
          encoding: "utf8",
          timeout: 5_000,
          env: {
            ...process.env,
            GIT_ALLOW_PROTOCOL: "file",
            GIT_CONFIG_GLOBAL: devNull,
            GIT_CONFIG_NOSYSTEM: "1",
            GIT_TERMINAL_PROMPT: "0",
          },
        },
      ).trim();
    git(source, "init", "--initial-branch=main");
    writeFileSync(path.join(source, "base.txt"), "base\n");
    git(source, "add", ".");
    git(source, "commit", "-m", "base");
    git(source, "checkout", "-b", "pull-request");
    for (let index = 0; index < 3; index++) {
      writeFileSync(path.join(source, "change.txt"), `change ${index}\n`);
      git(source, "add", ".");
      git(source, "commit", "-m", `change ${index}`);
    }
    git(source, "checkout", "main");
    writeFileSync(path.join(source, "base.txt"), "advanced base\n");
    git(source, "commit", "-am", "advance main");
    const base = git(source, "rev-parse", "HEAD");
    git(source, "merge", "--no-ff", "pull-request", "-m", "synthetic merge");
    const merge = git(source, "rev-parse", "HEAD");
    git(selected, "init");
    git(
      selected,
      "fetch",
      "--no-tags",
      `--depth=${String(depth)}`,
      pathToFileURL(source).href,
      merge,
    );
    git(selected, "checkout", "--detach", "FETCH_HEAD");

    const resolveBase = expectDefined(
      securitySteps.find((step) => step.id === "diff_base"),
      "security diff base",
    );
    const output = path.join(root, "base-output");
    const result = spawnSync("bash", ["-e", "-c", expectDefined(resolveBase.run, "base script")], {
      cwd: selected,
      encoding: "utf8",
      timeout: 5_000,
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: "pull_request",
        EVENT_BASE_SHA: "stale-event-base",
        GITHUB_OUTPUT: output,
      },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(output, "utf8").trim()).toBe(`sha=${base}`);
    expect(git(selected, "diff", "--name-only", base, "HEAD")).toBe("change.txt");
  });

  it("keeps setup cache access explicit and isolates every cache write", () => {
    const setupActionPaths = [
      ".github/actions/setup-node-env/action.yml",
      ".github/actions/setup-pnpm-store-cache/action.yml",
    ];
    const legacyInputs = [
      "save-actions-cache",
      "save-dependency-cache",
      "save-node-compile-cache",
      "save-vitest-fs-cache",
      "use-actions-cache",
    ];
    for (const actionPath of setupActionPaths) {
      const action = parse(readFileSync(actionPath, "utf8"));
      const steps = action.runs.steps as WorkflowStep[];
      expect(action.inputs["cache-mode"].default, actionPath).toBe("off");
      for (const legacyInput of legacyInputs) {
        expect(action.inputs, `${actionPath}: ${legacyInput}`).not.toHaveProperty(legacyInput);
      }
      expect(
        steps.filter(
          (step) =>
            step.uses?.startsWith("actions/cache@") || step.uses?.startsWith("actions/cache/save@"),
        ),
        actionPath,
      ).toEqual([]);
      expect(
        steps.filter((step) => step.uses?.startsWith("actions/cache/restore@")).length,
        actionPath,
      ).toBeGreaterThan(0);
      const validation = expectDefined(
        steps.find((step) => step.run?.includes("off|restore|read-write")),
        `${actionPath} cache-mode validation`,
      );
      expect(validation.run).toContain("Invalid cache-mode input");
    }

    const callers: Array<{ file: string; mode: unknown; step: WorkflowStep }> = [];
    const directCaches: Array<{ file: string; step: WorkflowStep }> = [];
    for (const file of [
      ...findYamlFiles(".github/workflows"),
      ...findYamlFiles(".github/actions"),
    ]) {
      const parsed = parse(readFileSync(file, "utf8"));
      const stepLists = [
        ...Object.values(parsed?.jobs ?? {}).map(
          (job) => (job as { steps?: WorkflowStep[] }).steps ?? [],
        ),
        (parsed?.runs?.steps ?? []) as WorkflowStep[],
      ];
      for (const step of stepLists.flat()) {
        if (step.uses?.startsWith("actions/cache")) {
          directCaches.push({ file, step });
        }
        if (
          step.uses === "./.github/actions/setup-node-env" ||
          step.uses?.endsWith("/.github/actions/setup-node-env") ||
          step.uses === "./.github/actions/setup-pnpm-store-cache" ||
          step.uses?.endsWith("/.github/actions/setup-pnpm-store-cache")
        ) {
          callers.push({ file, mode: step.with?.["cache-mode"], step });
        }
      }
    }
    expect(callers.length).toBeGreaterThan(0);
    for (const caller of callers) {
      const staticMode = ["off", "restore", "read-write"].includes(String(caller.mode));
      const conditionalMode =
        typeof caller.mode === "string" &&
        caller.mode.startsWith("${{") &&
        (caller.mode.includes("needs.preflight.outputs.cache_mode") ||
          caller.mode.includes("steps.candidate_trust.outputs.cache_mode") ||
          (caller.mode.includes("'restore'") &&
            (caller.mode.includes("'off'") || caller.mode.includes("'read-write'"))));
      expect(staticMode || conditionalMode, `${caller.file}: ${caller.step.name}`).toBe(true);
      for (const legacyInput of legacyInputs) {
        expect(caller.step.with, `${caller.file}: ${legacyInput}`).not.toHaveProperty(legacyInput);
      }
    }
    const writeAuthorizedCallers = callers.filter(
      (caller) =>
        caller.mode === "read-write" ||
        (typeof caller.mode === "string" && caller.mode.includes("'read-write'")),
    );
    expect(writeAuthorizedCallers).toEqual([
      {
        file: ".github/workflows/vitest-cache-warm.yml",
        mode: "read-write",
        step: expect.objectContaining({ name: "Setup Node environment" }),
      },
    ]);

    const nodeCachePathPattern =
      /(?:^|\n)\s*(?:\.artifacts\/build-all-cache|dist\/|dist-runtime\/|packages\/\*\/dist\/|extensions\/\*\/dist\/|~\/\.cache\/ms-playwright|~\/\.local\/share\/pnpm|~\/\.cache\/pnpm|node_modules)(?:\n|$)/u;
    for (const { file, step } of directCaches) {
      if (step.uses?.startsWith("actions/cache/save@")) {
        if (step.with?.path === ".cache/openclaw-cross-os-npm-cache/_cacache") {
          expect([
            ".github/workflows/openclaw-cross-os-release-checks-reusable.yml",
            ".github/workflows/release-npm-cache-warm.yml",
          ]).toContain(file);
          const workflow = parse(readFileSync(file, "utf8"));
          const owner = Object.values(workflow.jobs).find((candidate) =>
            (candidate as { steps?: WorkflowStep[] }).steps?.some(
              (entry) => entry.name === step.name,
            ),
          ) as { if?: string } | undefined;
          const authority = `${owner?.if ?? ""} ${step.if ?? ""}`;
          expect(authority).toContain("github.repository == 'openclaw/openclaw'");
          expect(authority).toContain("github.event_name == 'workflow_dispatch'");
          continue;
        }
        const condition = String(step.if);
        expect(
          condition.includes(".outputs.cache-mode == 'read-write'") ||
            condition.includes("inputs.cache-mode == 'read-write'") ||
            condition.includes("needs.preflight.outputs.cache_write_allowed == 'true'"),
          `${file}: ${step.name}`,
        ).toBe(true);
      }
      if (step.uses?.startsWith("actions/cache@")) {
        expect(nodeCachePathPattern.test(String(step.with?.path)), `${file}: ${step.name}`).toBe(
          false,
        );
      }
    }
  });

  it("owns one exact immutable semantic dependency cache", () => {
    const actionSource = readFileSync(".github/actions/setup-node-env/action.yml", "utf8");
    const ciSource = readFileSync(".github/workflows/ci.yml", "utf8");
    const action = parse(actionSource);
    const workflow = parse(ciSource);
    const actionSteps = action.runs.steps as WorkflowStep[];
    const step = (name: string) =>
      expectDefined(
        actionSteps.find((candidate) => candidate.name === name),
        name,
      );
    const configureStore = step("Configure dependency cache store");
    const resolve = step("Resolve dependency cache key");
    const prepare = step("Prepare dependency cache restore");
    const restore = step("Restore exact dependency cache");
    const prepareFallback = step("Prepare dependency cache miss fallback");
    const setupPnpm = step("Setup pnpm");
    const install = step("Install dependencies");
    const installScript = readFileSync(
      ".github/actions/setup-node-env/install-dependencies.sh",
      "utf8",
    );
    const cachePaths =
      "node_modules\nui/node_modules\npackages/*/node_modules\nextensions/*/node_modules\nexamples/*/node_modules\n.cache/openclaw-pnpm-store\n";

    expect(action.inputs["cache-mode"].default).toBe("off");
    expect(action.inputs["dependency-cache"].default).toBe("false");
    expect(action.inputs).not.toHaveProperty("save-dependency-cache");
    expect(action.inputs).not.toHaveProperty("save-actions-cache");
    expect(action.inputs).not.toHaveProperty("use-actions-cache");
    expect(action.inputs).not.toHaveProperty("sticky-disk");
    expect(action.inputs).not.toHaveProperty("save-sticky-disk");
    expect(actionSource).not.toContain("useblacksmith/stickydisk");

    expect(configureStore.if).toBe(
      "inputs.cache-mode != 'off' && inputs.dependency-cache == 'true'",
    );
    expect(configureStore.run).toContain(
      'echo "PNPM_CONFIG_STORE_DIR=$GITHUB_WORKSPACE/.cache/openclaw-pnpm-store"',
    );
    expect(resolve.if).toBe("inputs.cache-mode != 'off' && inputs.dependency-cache == 'true'");
    expect(resolve.run).toContain('node "$GITHUB_ACTION_PATH/dependency-fingerprint.mjs"');
    expect(resolve.run).toContain("${GITHUB_REPOSITORY:?}-node-deps-v3");
    expect(resolve.run).toContain("${RUNNER_OS:?}-arch-${RUNNER_ARCH:?}");
    expect(resolve.run).toContain("node-$(node --version)-${deps_input_fingerprint:?}");
    expect(resolve.run).not.toMatch(/GITHUB_(?:REF|SHA|RUN_ID)|RUN_(?:ID|ATTEMPT)/u);
    expect(actionSteps.indexOf(resolve)).toBeLessThan(actionSteps.indexOf(restore));
    for (const cleanup of [prepare, prepareFallback]) {
      expect(cleanup.run).toContain('rm -rf "$GITHUB_WORKSPACE/node_modules"');
      expect(cleanup.run).toContain('"$GITHUB_WORKSPACE/.cache/openclaw-pnpm-store"');
      expect(cleanup.run).toContain('"$GITHUB_WORKSPACE/packages"');
      expect(cleanup.run).toContain("-name node_modules");
    }
    expect(actionSteps.indexOf(prepare)).toBeLessThan(actionSteps.indexOf(restore));
    expect(restore).toMatchObject({
      if: "inputs.cache-mode != 'off' && inputs.dependency-cache == 'true'",
      uses: CACHE_V5,
      with: { key: "${{ steps.dependency-cache-key.outputs.key }}", path: cachePaths },
    });
    expect((restore as WorkflowStep & { "continue-on-error"?: boolean })["continue-on-error"]).toBe(
      true,
    );
    expect(restore.with).not.toHaveProperty("restore-keys");
    expect(prepareFallback.if).toContain("steps.dependency-cache.outputs.cache-hit != 'true'");
    expect(prepareFallback.run).toContain(
      "actions/cache treats service, download, and extraction failures as",
    );
    expect(actionSteps.indexOf(restore)).toBeLessThan(actionSteps.indexOf(prepareFallback));
    expect(actionSteps.indexOf(prepareFallback)).toBeLessThan(actionSteps.indexOf(setupPnpm));
    expect(setupPnpm.with?.["cache-mode"]).toContain(
      "steps.dependency-cache.outputs.cache-hit != 'true'",
    );
    expect(setupPnpm.with?.["cache-mode"]).toContain("inputs.cache-mode != 'off'");
    expect(setupPnpm.with?.["cache-mode"]).toContain("'restore' || 'off'");
    expect(actionSteps.indexOf(restore)).toBeLessThan(actionSteps.indexOf(setupPnpm));

    expect(install.run).toBe('bash "$GITHUB_ACTION_PATH/install-dependencies.sh"');
    expect(installScript).toContain("export PNPM_CONFIG_PACKAGE_IMPORT_METHOD=hardlink");
    expect(installScript).toContain("run_pnpm_install --offline");
    expect(installScript).toContain("run_pnpm_install --prefer-offline");
    expect(installScript).toContain('[ "$DEPENDENCY_CACHE_HIT" = "true" ]');
    expect(installScript).toContain('rm -rf "$GITHUB_WORKSPACE/node_modules"');
    expect(installScript).toContain('"$GITHUB_WORKSPACE/packages"');
    expect(installScript).toContain("-name node_modules");
    expect(installScript).toContain('"${PNPM_CONFIG_STORE_DIR:?}"');
    expect(installScript.match(/run_pnpm_install/g)).toHaveLength(5);
    expect(installScript).toContain('echo "OPENCLAW_BUILD_ALL_NO_PNPM=1" >> "$GITHUB_ENV"');
    expect(installScript).toContain(
      'echo "pnpm_config_verify_deps_before_run=false" >> "$GITHUB_ENV"',
    );
    expect(
      actionSteps.some(
        (candidate) =>
          candidate.uses?.startsWith("actions/cache@") ||
          candidate.uses?.startsWith("actions/cache/save@"),
      ),
    ).toBe(false);

    const dependencySetups = Object.entries(workflow.jobs).flatMap(([jobName, job]) =>
      ((job as { steps?: WorkflowStep[] }).steps ?? []).flatMap((candidate) =>
        candidate.uses?.endsWith("/.github/actions/setup-node-env") &&
        candidate.with?.["dependency-cache"] !== undefined
          ? [{ jobName, step: candidate }]
          : [],
      ),
    );
    const preflightRestore = dependencySetups.find(({ jobName }) => jobName === "preflight");
    expect(preflightRestore?.step).toMatchObject({
      if: expect.stringContaining("steps.manifest.outputs.run_node == 'true'"),
      with: {
        "cache-mode": "${{ steps.candidate_trust.outputs.cache_mode }}",
        "dependency-cache": "true",
        "install-bun": "false",
      },
    });
    expect(preflightRestore?.step.if).toContain("github.ref == 'refs/heads/main'");
    expect(preflightRestore?.step.if).toContain("github.event_name == 'pull_request'");
    expect(preflightRestore?.step.if).toContain("vars.OPENCLAW_CI_RUNNER_BACKEND != 'github'");
    expect(preflightRestore?.step.if).toContain("vars.OPENCLAW_CI_RUNNER_BACKEND != 'hybrid'");
    expect(workflow.jobs["pnpm-store-warmup"].if).toContain(
      "needs.preflight.outputs.runner_profile == 'github'",
    );
    expect(workflow.jobs["pnpm-store-warmup"].if).toContain(
      "needs.preflight.outputs.runner_profile == 'hybrid'",
    );
    const consumers = dependencySetups.filter(({ jobName }) => jobName !== "preflight");
    expect(consumers.map(({ jobName }) => jobName).toSorted()).toEqual([
      "build-artifacts",
      "check-additional-shard",
      "check-docs",
      "check-lint-hosted-core-shard",
      "check-shard",
      "check-test-types-hosted-core-shard",
      "checks-fast-channel-contracts-shard",
      "checks-fast-core",
      "checks-fast-plugin-contracts-shard",
      "checks-node-core-test-nondist-shard",
      "checks-ui",
      "checks-ui-e2e",
      "checks-ui-e2e-real-gateway",
      "control-ui-i18n",
      "control-ui-performance",
      "docker-seed-e2e",
    ]);
    for (const { jobName, step: consumer } of consumers) {
      const needs = workflow.jobs[jobName].needs;
      expect(Array.isArray(needs) ? needs : [needs], jobName).toContain("preflight");
      expect(consumer.with, jobName).not.toHaveProperty("save-dependency-cache");
      expect(consumer.with?.["dependency-cache"], jobName).toContain("'true' || 'false'");
      expect(consumer.with?.["cache-mode"], jobName).toBe(
        "${{ needs.preflight.outputs.cache_mode }}",
      );
      const canonical = {
        eventName: "push",
        matrix: {
          group: "extension-package-boundary",
          node_version: "24.x",
          runner: "blacksmith-32vcpu-ubuntu-2404",
          task: "lint",
        },
        repository: "openclaw/openclaw",
        runAttempt: 1,
      } as const;
      const scenarios = [
        { eventName: "push", trusted: true },
        { eventName: "pull_request", headRepository: "openclaw/openclaw", trusted: true },
        { eventName: "pull_request", headRepository: "contributor/openclaw", trusted: false },
        {
          eventName: "pull_request",
          headRepository: "contributor/openclaw",
          authorAssociation: "NONE",
          trusted: false,
        },
        { eventName: "workflow_dispatch", trusted: false },
        { eventName: "push", repository: "contributor/openclaw", trusted: false },
      ] as const;
      for (const runnerBackend of ["", "blacksmith", "github", "hybrid"] as const) {
        for (const runAttempt of [1, 2]) {
          for (const { trusted, ...scenario } of scenarios) {
            const context = { ...canonical, ...scenario, runnerBackend, runAttempt };
            const runsOn = workflow.jobs[jobName]["runs-on"] as string;
            const routedRunner = runsOn.startsWith("${{")
              ? evaluateWorkflowExpression(runsOn, context)
              : runsOn;
            const selfHosted = String(routedRunner).startsWith("blacksmith-");
            expect(
              evaluateWorkflowExpression(consumer.with?.["dependency-cache"], {
                ...context,
                runnerEnvironment: selfHosted ? "self-hosted" : "github-hosted",
              }),
              `${jobName} ${JSON.stringify(context)} on ${routedRunner}`,
            ).toBe(trusted && selfHosted ? "true" : "false");
          }
        }
      }
      // The actual runner must fence restores even when the configured backend
      // still names Blacksmith or hybrid (including hosted retry routing).
      for (const runnerEnvironment of ["", "github-hosted"] as const) {
        expect(
          evaluateWorkflowExpression(consumer.with?.["dependency-cache"], {
            ...canonical,
            runnerBackend: "hybrid",
            runnerEnvironment,
          }),
          `${jobName} actual runner ${runnerEnvironment}`,
        ).toBe("false");
      }
      if (jobName === "checks-node-core-test-nondist-shard") {
        expect(
          evaluateWorkflowExpression(consumer.with?.["dependency-cache"], {
            ...canonical,
            matrix: { ...canonical.matrix, node_version: "22.x" },
            runnerBackend: "hybrid",
            runnerEnvironment: "self-hosted",
          }),
        ).toBe("false");
      }
    }
    for (const { jobName: setupJobName, step: setup } of Object.entries(workflow.jobs).flatMap(
      ([jobName, job]) =>
        ((job as { steps?: WorkflowStep[] }).steps ?? [])
          .filter((candidate) => candidate.uses?.endsWith("/.github/actions/setup-node-env"))
          .map((candidate) => ({ jobName, step: candidate })),
    )) {
      expect(setup.with, setupJobName).not.toHaveProperty("sticky-disk");
      expect(setup.with, setupJobName).not.toHaveProperty("save-sticky-disk");
      expect(
        [
          "off",
          "restore",
          "read-write",
          "${{ needs.preflight.outputs.cache_mode }}",
          "${{ steps.candidate_trust.outputs.cache_mode }}",
        ],
        setupJobName,
      ).toContain(setup.with?.["cache-mode"]);
    }

    const warmer = parse(readFileSync(".github/workflows/vitest-cache-warm.yml", "utf8"));
    const dependencySave = warmer.jobs.warm.steps.find(
      (candidate: WorkflowStep) => candidate.name === "Save exact dependency cache",
    );
    expect(dependencySave).toMatchObject({
      uses: "actions/cache/save@55cc8345863c7cc4c66a329aec7e433d2d1c52a9",
      with: {
        key: "${{ steps.setup-node-env.outputs.dependency-cache-key }}",
        path: cachePaths,
      },
    });
    expect(dependencySave.if).toContain("steps.setup-node-env.outputs.cache-mode == 'read-write'");
  });

  it.skipIf(process.platform === "win32").each([
    {
      name: "uncached frozen",
      cache: false,
      frozen: "true",
      exits: [0],
      modes: ["--prefer-offline"],
      status: 0,
    },
    {
      name: "uncached mutable",
      cache: false,
      frozen: "false",
      exits: [0],
      modes: ["--prefer-offline"],
      status: 0,
    },
    {
      name: "invalid frozen policy",
      cache: false,
      frozen: "invalid",
      exits: [],
      modes: [],
      status: 2,
    },
    {
      name: "uncached failure",
      cache: false,
      frozen: "true",
      exits: [23],
      modes: ["--prefer-offline"],
      status: 23,
    },
    {
      name: "cached success",
      cache: true,
      frozen: "true",
      exits: [0],
      modes: ["--offline"],
      status: 0,
    },
    {
      name: "cached relink",
      cache: true,
      frozen: "true",
      exits: [23, 0],
      modes: ["--offline", "--offline"],
      status: 0,
    },
    {
      name: "cached store rebuild",
      cache: true,
      frozen: "true",
      exits: [23, 23, 0],
      modes: ["--offline", "--offline", "--prefer-offline"],
      status: 0,
    },
    {
      name: "cached terminal failure",
      cache: true,
      frozen: "true",
      exits: [23, 23, 23],
      modes: ["--offline", "--offline", "--prefer-offline"],
      status: 23,
    },
  ])("executes the dependency install recipe: $name", ({ cache, frozen, exits, modes, status }) => {
    const root = tempDirs.make("openclaw-install-recipe-");
    const workspace = path.join(root, "workspace");
    const bin = path.join(root, "bin");
    const store = path.join(root, "store");
    const log = path.join(root, "calls.jsonl");
    const githubEnv = path.join(root, "github.env");
    const payload = path.join(root, "payload");
    for (const directory of [
      bin,
      store,
      ...["", "ui", "packages", "extensions", "examples"].map((entry) =>
        path.join(workspace, entry),
      ),
    ]) {
      mkdirSync(directory, { recursive: true });
    }
    mkdirSync(path.join(workspace, "node_modules"));
    writeFileSync(path.join(workspace, "node_modules", "before"), "");
    writeFileSync(path.join(store, "before"), "");
    symlinkSync(process.execPath, path.join(bin, "node"));
    const pnpm = path.join(bin, "pnpm");
    writeFileSync(
      pnpm,
      "#!" +
        process.execPath +
        "\n" +
        String.raw`
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args[0] === "-v") { console.log("fixture"); process.exit(0); }
const log = process.env.RECIPE_LOG;
const count = fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n").length : 0;
fs.appendFileSync(log, JSON.stringify({ args, cwd: process.cwd(), importMethod: process.env.PNPM_CONFIG_PACKAGE_IMPORT_METHOD }) + "\n");
process.exit(JSON.parse(process.env.RECIPE_EXITS)[count] ?? 99);
`,
    );
    chmodSync(pnpm, 0o755);
    const action = parse(readFileSync(".github/actions/setup-node-env/action.yml", "utf8"));
    const step: WorkflowStep = expectDefined(
      action.runs.steps.find(
        (candidate: WorkflowStep) => candidate.name === "Install dependencies",
      ),
      "Install dependencies",
    );
    const run = expectDefined(step.run, "Install dependencies script");
    const config = {
      PNPM_CONFIG_CACHE_DIR: path.join(root, "metadata"),
      PNPM_CONFIG_CHILD_CONCURRENCY: "3",
      PNPM_CONFIG_NETWORK_CONCURRENCY: "4",
      PNPM_CONFIG_PACKAGE_IMPORT_METHOD: "copy",
      PNPM_CONFIG_STORE_DIR: store,
      PNPM_CONFIG_VIRTUAL_STORE_DIR: path.join(root, "virtual"),
    };
    const result = spawnSync(
      "bash",
      ["-c", run.trimEnd() + ' && printf reached > "$RECIPE_PAYLOAD"'],
      {
        cwd: workspace,
        encoding: "utf8",
        env: {
          PATH: process.env.PATH,
          NODE_BIN: bin,
          GITHUB_ACTION_PATH: path.resolve(".github/actions/setup-node-env"),
          GITHUB_WORKSPACE: workspace,
          GITHUB_ENV: githubEnv,
          CI: "true",
          DEPENDENCY_CACHE: String(cache),
          DEPENDENCY_CACHE_HIT: String(cache),
          FROZEN_LOCKFILE: frozen,
          RECIPE_LOG: log,
          RECIPE_PAYLOAD: payload,
          RECIPE_EXITS: JSON.stringify(exits),
          ...config,
        },
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(status);
    expect(existsSync(payload)).toBe(status === 0);
    const calls: Array<{ args: string[]; cwd: string; importMethod: string }> = existsSync(log)
      ? readFileSync(log, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : [];
    const expectedArgs = [
      "install",
      "--config.ignore-scripts=false",
      "--config.engine-strict=false",
      "--config.enable-pre-post-scripts=true",
      "--config.side-effects-cache=true",
      ...(frozen === "true" ? ["--frozen-lockfile"] : []),
      "--config.cache-dir=" + config.PNPM_CONFIG_CACHE_DIR,
      "--config.child-concurrency=3",
      "--config.network-concurrency=4",
      "--config.package-import-method=" + (cache ? "hardlink" : "copy"),
      "--config.store-dir=" + store,
      "--config.virtual-store-dir=" + config.PNPM_CONFIG_VIRTUAL_STORE_DIR,
    ];
    expect(calls).toEqual(
      modes.map((mode) => ({
        args: [...expectedArgs, mode],
        cwd: workspace,
        importMethod: cache ? "hardlink" : "copy",
      })),
    );
    expect(existsSync(path.join(workspace, "node_modules", "before"))).toBe(modes.length < 2);
    expect(existsSync(path.join(store, "before"))).toBe(modes.length < 3);
    expect(existsSync(githubEnv)).toBe(cache && status === 0);
    if (cache && status === 0) {
      expect(readFileSync(githubEnv, "utf8")).toBe(
        "OPENCLAW_BUILD_ALL_NO_PNPM=1\npnpm_config_verify_deps_before_run=false\n",
      );
    }
  });

  it.skipIf(process.platform === "win32")(
    "preserves pnpm hard links and validates cached importers and supply-chain policy offline",
    async ({ onTestFinished, signal }) => {
      const fixtureDirs = createTempDirTracker();
      // oxlint-disable-next-line prefer-const -- Failure cleanup can run before the registry is started.
      let stopRegistry: (() => Promise<void>) | undefined;
      let readyTimeout: NodeJS.Timeout | undefined;
      // Timeout does not join the test body. Keep close and deletion in one hook,
      // outside afterEach, so a failed join cannot release the registry's files.
      onTestFinished(async () => {
        clearTimeout(readyTimeout);
        await stopRegistry?.();
        fixtureDirs.cleanup();
      });
      const root = fixtureDirs.make("openclaw-dependency-cache-");
      const source = path.join(root, "source");
      const registry = path.join(root, "registry");
      const workspace = path.join(root, "workspace");
      const consumer = path.join(workspace, "packages", "consumer");
      const store = path.join(workspace, ".cache", "openclaw-pnpm-store");
      let userHome = path.join(root, "producer-home");
      mkdirSync(userHome, { recursive: true });
      mkdirSync(source, { recursive: true });
      mkdirSync(registry, { recursive: true });
      mkdirSync(consumer, { recursive: true });
      writeFileSync(
        path.join(source, "package.json"),
        JSON.stringify({
          files: ["index.js"],
          name: "cache-proof-dep",
          packageManager: rootPackageManager,
          scripts: { "pnpm-path": "node -p process.env.npm_execpath" },
          version: "1.0.0",
        }),
      );
      writeFileSync(path.join(source, "index.js"), 'module.exports = "cache-proof-v1";\n');
      // Both projects own the pinned environment before any command runs; otherwise
      // pnpm resolves its own metadata from the public registry during bootstrap.
      const { environment } = pnpmLockfileDocuments(readFileSync("pnpm-lock.yaml", "utf8"));
      if (environment !== null) {
        for (const directory of [source, workspace]) {
          writeFileSync(path.join(directory, "pnpm-lock.yaml"), `---\n${environment}\n---\n`);
        }
      }
      // Capture the pinned CLI before switching to the fixture-only registry/store.
      const bootstrap = resolvePnpmRunner();
      const npmExecPath = execFileSync(
        bootstrap.command,
        [...bootstrap.args, "--silent", "run", "pnpm-path"],
        { cwd: source, encoding: "utf8", env: { ...process.env, CI: "true" } },
      ).trim();
      const pnpm = resolvePnpmRunner({ npmExecPath });
      const action = parse(readFileSync(".github/actions/setup-node-env/action.yml", "utf8"));
      const configureCache = expectDefined(
        action.runs.steps.find(
          (step: WorkflowStep) => step.name === "Configure dependency cache store",
        )?.run,
        "Configure dependency cache store script",
      );
      const envFile = path.join(root, "dependency-cache.env");
      execFileSync("bash", ["-c", configureCache], {
        env: { ...process.env, GITHUB_WORKSPACE: workspace, GITHUB_ENV: envFile },
      });
      const dependencyEnvironment = Object.fromEntries(
        readFileSync(envFile, "utf8")
          .trim()
          .split("\n")
          .map((line) => {
            const separator = line.indexOf("=");
            return [line.slice(0, separator), line.slice(separator + 1)];
          }),
      );
      const runPnpm = (args: string[], cwd: string) =>
        spawnSync(pnpm.command, [...pnpm.args, ...args], {
          cwd,
          encoding: "utf8",
          env: {
            PATH: process.env.PATH,
            HOME: userHome,
            XDG_CACHE_HOME: path.join(userHome, ".cache"),
            CI: "true",
            PNPM_CONFIG_PACKAGE_IMPORT_METHOD: "hardlink",
            ...dependencyEnvironment,
          },
        });
      const version = runPnpm(["--version"], source);
      expect(version.status, version.stderr).toBe(0);
      expect(`pnpm@${version.stdout.trim()}`).toBe(rootPackageManager.split("+")[0]);
      const packed = runPnpm(["pack", "--pack-destination", registry], source);
      expect(packed.status, `${packed.stdout}${packed.stderr}`).toBe(0);
      const tarball = path.join(registry, "cache-proof-dep-1.0.0.tgz");
      const registryScript = String.raw`
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { createServer } = require("node:http");
const tarballPath = process.argv[1];
const tarball = readFileSync(tarballPath);
const server = createServer((request, response) => {
  if (request.url === "/cache-proof-dep") {
    const port = server.address().port;
    const metadata = {
      name: "cache-proof-dep",
      "dist-tags": { latest: "1.0.0" },
      time: {
        "1.0.0": new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        modified: new Date().toISOString(),
      },
      versions: {
        "1.0.0": {
          name: "cache-proof-dep",
          version: "1.0.0",
          dist: {
            tarball: "http://127.0.0.1:" + port + "/cache-proof-dep-1.0.0.tgz",
            shasum: createHash("sha1").update(tarball).digest("hex"),
            integrity: "sha512-" + createHash("sha512").update(tarball).digest("base64"),
          },
        },
      },
    };
    const abbreviated = request.headers.accept?.includes("application/vnd.npm.install-v1+json");
    if (abbreviated) {
      delete metadata.time;
    }
    response.setHeader("content-type", abbreviated ? "application/vnd.npm.install-v1+json" : "application/json");
    response.end(JSON.stringify(metadata));
    return;
  }
  if (request.url === "/cache-proof-dep-1.0.0.tgz") {
    response.setHeader("content-type", "application/octet-stream");
    response.end(tarball);
    return;
  }
  response.statusCode = 404;
  response.end();
});
server.listen(0, "127.0.0.1", () => {
  process.send(server.address().port);
});
`;
      const registryServer = spawn(process.execPath, ["-e", registryScript, tarball], {
        stdio: ["ignore", "ignore", "ignore", "ipc"],
      });
      let registryDidClose = false;
      // Retain actual close from launch, including failed spawn; readiness must not own this join.
      const registryClosed = new Promise<void>((resolve) => {
        registryServer.once("close", () => {
          registryDidClose = true;
          resolve();
        });
      });
      const failures: unknown[] = [];
      registryServer.on("error", (error) => failures.push(error));
      stopRegistry = async () => {
        if (!registryDidClose) {
          registryServer.kill("SIGTERM");
        }
        await registryClosed;
      };
      try {
        const port = await new Promise<number>((resolve, reject) => {
          readyTimeout = setTimeout(() => reject(new Error("fixture registry not ready")), 2_000);
          registryServer.once("message", (message) => {
            if (typeof message !== "number") {
              reject(new Error("fixture registry sent an invalid port"));
              return;
            }
            resolve(message);
          });
          registryServer.once("error", reject);
          void registryClosed.then(() => reject(new Error("fixture registry closed before ready")));
        });
        clearTimeout(readyTimeout);
        signal.throwIfAborted();
        const registryUrl = `http://127.0.0.1:${port}`;
        writeFileSync(
          path.join(workspace, "package.json"),
          JSON.stringify({
            dependencies: { "cache-proof-dep": "1.0.0" },
            name: "cache-proof-root",
            packageManager: rootPackageManager,
            private: true,
          }),
        );
        const workspaceConfig =
          "packages:\n  - packages/*\nminimumReleaseAge: 10080\nminimumReleaseAgeStrict: true\n";
        writeFileSync(path.join(workspace, "pnpm-workspace.yaml"), workspaceConfig);
        const writeConsumerManifest = (dependencyVersion: string) =>
          writeFileSync(
            path.join(consumer, "package.json"),
            JSON.stringify({
              dependencies: { "cache-proof-dep": dependencyVersion },
              name: "cache-proof-consumer",
              private: true,
            }),
          );
        writeConsumerManifest("1.0.0");
        // The fixture registry serves only its test package, not the preserved project pnpm pin.
        const installArgs = [
          "install",
          "--ignore-scripts",
          "--config.engine-strict=false",
          "--pm-on-fail=ignore",
        ];
        const onlineArgs = [...installArgs, `--registry=${registryUrl}`];
        const seeded = runPnpm([...onlineArgs, "--lockfile-only"], workspace);
        expect(seeded.status, `${seeded.stdout}${seeded.stderr}`).toBe(0);
        // CI publishes a frozen install, without the lockfile generator's caches.
        rmSync(userHome, { force: true, recursive: true });
        rmSync(store, { force: true, recursive: true });
        mkdirSync(userHome, { recursive: true });
        const installed = runPnpm([...onlineArgs, "--frozen-lockfile"], workspace);
        expect(installed.status, `${installed.stdout}${installed.stderr}`).toBe(0);

        const findSameFile = (directory: string, referencePath: string): string | undefined => {
          const reference = statSync(referencePath);
          for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const entryPath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
              const nested = findSameFile(entryPath, referencePath);
              if (nested) {
                return nested;
              }
            } else if (entry.isFile()) {
              const candidate = statSync(entryPath);
              if (candidate.dev === reference.dev && candidate.ino === reference.ino) {
                return entryPath;
              }
            }
          }
          return undefined;
        };
        const rootPackageFile = path.join(workspace, "node_modules", "cache-proof-dep", "index.js");
        expect(findSameFile(store, rootPackageFile)).toBeDefined();

        const archive = path.join(root, "dependency-cache.tar");
        execFileSync(
          "tar",
          [
            "-cf",
            archive,
            "-C",
            workspace,
            "node_modules",
            "packages/consumer/node_modules",
            ".cache/openclaw-pnpm-store",
          ],
          { stdio: "pipe" },
        );

        rmSync(path.join(workspace, "node_modules"), { force: true, recursive: true });
        rmSync(path.join(consumer, "node_modules"), { force: true, recursive: true });
        rmSync(store, { force: true, recursive: true });
        rmSync(userHome, { force: true, recursive: true });
        userHome = path.join(root, "consumer-home");
        mkdirSync(userHome, { recursive: true });
        execFileSync("tar", ["-xf", archive, "-C", workspace], { stdio: "pipe" });

        const restoredPackageFile = path.join(
          workspace,
          "node_modules",
          "cache-proof-dep",
          "index.js",
        );
        expect(findSameFile(store, restoredPackageFile)).toBeDefined();
        expect(
          readFileSync(path.join(consumer, "node_modules", "cache-proof-dep", "index.js"), "utf8"),
        ).toBe('module.exports = "cache-proof-v1";\n');

        await stopRegistry();
        signal.throwIfAborted();
        expect(registryDidClose, "registry closed before source deletion/offline install").toBe(
          true,
        );
        await expect(
          new Promise<void>((resolve, reject) => {
            const socket = connect({ host: "127.0.0.1", port, signal });
            socket.once("error", reject);
            socket.once("connect", () => {
              socket.destroy();
              resolve();
            });
          }),
        ).rejects.toMatchObject({ code: "ECONNREFUSED" });
        signal.throwIfAborted();
        rmSync(registry, { force: true, recursive: true });
        const cachedIdentity = statSync(restoredPackageFile);
        const cachedLockfile = readFileSync(path.join(workspace, "pnpm-lock.yaml"), "utf8");
        const offlineArgs = [...onlineArgs, "--offline", "--frozen-lockfile"];
        const reconciliation = runPnpm(offlineArgs, workspace);
        expect(reconciliation.status, `${reconciliation.stdout}${reconciliation.stderr}`).toBe(0);
        expect(statSync(restoredPackageFile)).toMatchObject({
          dev: cachedIdentity.dev,
          ino: cachedIdentity.ino,
        });
        expect(readFileSync(path.join(workspace, "pnpm-lock.yaml"), "utf8")).toBe(cachedLockfile);
        expect(
          readFileSync(path.join(consumer, "node_modules", "cache-proof-dep", "index.js"), "utf8"),
        ).toBe('module.exports = "cache-proof-v1";\n');
        // A stricter policy invalidates pnpm's saved verification and reads the
        // restored registry metadata. A 14-day-old release fails a 21-day gate.
        writeFileSync(
          path.join(workspace, "pnpm-workspace.yaml"),
          workspaceConfig.replace("minimumReleaseAge: 10080", "minimumReleaseAge: 30240"),
        );
        const stricterPolicy = runPnpm(offlineArgs, workspace);
        expect(stricterPolicy.status).toBe(1);
        expect(`${stricterPolicy.stdout}${stricterPolicy.stderr}`).toContain(
          "ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION",
        );
        writeFileSync(path.join(workspace, "pnpm-workspace.yaml"), workspaceConfig);
        writeConsumerManifest("2.0.0");
        const drift = runPnpm(offlineArgs, workspace);
        expect(drift.status).toBe(1);
        expect(`${drift.stdout}${drift.stderr}`).toContain('Cannot install with "frozen-lockfile"');
        expect(`${drift.stdout}${drift.stderr}`).toContain('in importers["packages/consumer"]');
        expect(`${drift.stdout}${drift.stderr}`).toContain(
          "cache-proof-dep (lockfile: 1.0.0, manifest: 2.0.0)",
        );
      } catch (error) {
        if (failures[0] !== error) {
          failures.unshift(error);
        }
      } finally {
        clearTimeout(readyTimeout);
        try {
          await stopRegistry();
        } catch (error) {
          failures.push(error);
        }
      }
      if (failures.length === 1) {
        throw failures[0];
      }
      if (failures.length > 1) {
        throw new AggregateError(failures, "dependency cache fixture failed");
      }
    },
  );

  it("persists content-validated public full-build declarations", () => {
    const action = parse(readFileSync(".github/actions/setup-node-env/action.yml", "utf8"));
    const installStep = action.runs.steps.find(
      (step: WorkflowStep) => step.name === "Install dependencies",
    );
    const cacheStep = action.runs.steps.find(
      (step: WorkflowStep) => step.name === "Restore build-all cache",
    );

    expect(action.inputs["build-all-cache-scope"].default).toBe("");
    expect(cacheStep).toMatchObject({
      if: "inputs.cache-mode != 'off' && inputs.build-all-cache-scope != ''",
      uses: CACHE_V5,
      with: { path: ".artifacts/build-all-cache" },
    });
    expect(cacheStep.with.key).toContain("build-all-v1-${{ inputs.build-all-cache-scope }}");
    expect(cacheStep.with.key).toContain("${{ runner.os }}-${{ runner.arch }}");
    const renderCacheKey = (template: string, runId: number, runAttempt: number) =>
      template.replace(/\$\{\{([\s\S]*?)\}\}/gu, (_, expression: string) =>
        String(
          runInNewContext(expression.replace(/inputs\.([a-z-]+)/gu, 'inputs["$1"]'), {
            github: { repository: "openclaw/openclaw", run_id: runId, run_attempt: runAttempt },
            inputs: { "build-all-cache-scope": "full", "node-version": "24.x" },
            runner: { os: "Linux", arch: "X64" },
            hashFiles: () => "unchanged-source",
          }),
        ),
      );
    // A new warmer or rerun must publish rebuilt groups even when an outer input
    // fingerprint would be unchanged; per-group signatures own content validity.
    const keys = (
      [
        [10, 1],
        [11, 1],
        [11, 2],
      ] as const
    ).map(([runId, runAttempt]) => renderCacheKey(cacheStep.with.key, runId, runAttempt));
    expect(new Set(keys).size).toBe(3);
    for (const key of keys) {
      expect(key.startsWith(renderCacheKey(cacheStep.with["restore-keys"], 11, 2).trim())).toBe(
        true,
      );
    }
    expect(cacheStep.with["restore-keys"]).not.toContain("hashFiles");
    expect(action.runs.steps.indexOf(installStep)).toBeLessThan(
      action.runs.steps.indexOf(cacheStep),
    );
    const warmer = parse(readFileSync(".github/workflows/vitest-cache-warm.yml", "utf8"));
    const buildSave = warmer.jobs.warm.steps.find(
      (step: WorkflowStep) => step.name === "Save build-all cache",
    );
    expect(buildSave).toMatchObject({
      uses: "actions/cache/save@55cc8345863c7cc4c66a329aec7e433d2d1c52a9",
      with: {
        key: "${{ steps.setup-node-env.outputs.build-all-cache-key }}",
        path: ".artifacts/build-all-cache",
      },
    });
    expect(buildSave.if).toContain("steps.setup-node-env.outputs.cache-mode == 'read-write'");

    const releaseChecks = parse(
      readFileSync(".github/workflows/openclaw-live-and-e2e-checks-reusable.yml", "utf8"),
    );
    const repoE2eWorkflow = readWorkflow(".github/workflows/openclaw-repo-e2e-reusable.yml");
    const pipelines = [
      releaseChecks.jobs.validate_repo_e2e_gateway,
      releaseChecks.jobs.validate_repo_e2e_runtime,
    ];
    expect(releaseChecks.jobs.validate_live_docker_provider_suites.env).toMatchObject({
      OPENCLAW_SELECTED_SHA: "${{ needs.validate_selected_ref.outputs.selected_sha }}",
      OPENCLAW_TOOLING_SHA: "${{ needs.validate_selected_ref.outputs.workflow_sha }}",
    });
    const repoE2eRows = pipelines.flatMap((pipeline) => JSON.parse(pipeline.with.suites)) as Array<{
      name: string;
      command: string;
      target_script?: string;
    }>;
    expect(pipelines.map((pipeline) => pipeline.with.build_profile)).toEqual([
      "full",
      "ciArtifacts",
    ]);
    for (const pipeline of pipelines) {
      // Each profile starts independently; a slow/full declaration build cannot hold up UI readers.
      expect(pipeline.needs).toBe("validate_selected_ref");
      expect(pipeline.if).toBe(
        "(!inputs.prepare_only) && inputs.include_repo_e2e && inputs.live_suite_filter == ''",
      );
      expect(pipeline.uses).toBe("./.github/workflows/openclaw-repo-e2e-reusable.yml");
      expect(pipeline.with.ref).toBe("${{ needs.validate_selected_ref.outputs.selected_sha }}");
      expect(pipeline.with.advisory).toBe("${{ inputs.advisory }}");
      expect(pipeline.with.allow_frozen_target_scenario_omissions).toBe(
        "${{ inputs.allow_frozen_target_scenario_omissions }}",
      );
    }
    expect(repoE2eRows.map((row) => row.command)).toEqual([
      ...Array.from({ length: 4 }, (_, index) => `pnpm test:e2e:gateway --shard=${index + 1}/4`),
      ...Array.from({ length: 4 }, (_, index) => `pnpm test:ui:e2e --shard=${index + 1}/4`),
      "pnpm test:e2e:agent-plugin-gateway",
    ]);
    expect(new Set(repoE2eRows.map((row) => row.name)).size).toBe(9);
    expect(repoE2eRows.find((row) => row.name === "Agent plugin Gateway")).toMatchObject({
      target_script: "test:e2e:agent-plugin-gateway",
    });
    expect(repoE2eWorkflow.env).toMatchObject({
      OPENCLAW_BUILD_PRIVATE_QA: "1",
      OPENCLAW_ENABLE_PRIVATE_QA_CLI: "1",
      OPENCLAW_VITEST_MAX_WORKERS: "2",
    });
    const producer = repoE2eWorkflow.jobs.build;
    const repoE2e = repoE2eWorkflow.jobs.test;
    expect(repoE2e.needs).toBe("build");
    expect(repoE2e.name).toBe("Repo E2E (${{ matrix.name }})");
    expect(repoE2e["timeout-minutes"]).toBe(90);
    expect(repoE2e.strategy).toMatchObject({ "fail-fast": false, "max-parallel": 4 });
    expect(repoE2e["continue-on-error"]).toBe("${{ inputs.advisory }}");
    const producerSteps = producer.steps as WorkflowStep[];
    expect(producerSteps.find((step) => step.name === "Build dist for repo E2E")?.run).toContain(
      "full) pnpm build",
    );
    expect(producerSteps.find((step) => step.name === "Build dist for repo E2E")?.run).toContain(
      "ciArtifacts) pnpm build:ci-artifacts",
    );
    expect(producerSteps.find((step) => step.uses === UPLOAD_ARTIFACT_V7)?.with?.name).toContain(
      "${{ github.run_attempt }}",
    );
    const repoE2eSteps = repoE2e.steps as WorkflowStep[];
    expect(repoE2eSteps.find((step) => step.name === "Checkout selected ref")?.with?.ref).toBe(
      "${{ inputs.ref }}",
    );
    expect(repoE2eSteps.find((step) => step.uses === DOWNLOAD_ARTIFACT_V8)?.with).toMatchObject({
      "artifact-ids": "${{ needs.build.outputs.artifact_id }}",
      "run-id": "${{ needs.build.outputs.artifact_run_id }}",
      "github-token": "${{ github.token }}",
    });
    expect(repoE2eSteps.some((step) => step.run?.includes("pnpm build"))).toBe(false);
    const restoreIndex = repoE2eSteps.findIndex((step) => step.name === "Restore repo E2E build");
    const sandboxSetupIndex = repoE2eSteps.findIndex(
      (step) => step.run === "scripts/sandbox-setup.sh",
    );
    const repoE2eIndex = repoE2eSteps.findIndex((step) => step.name === "Run repo E2E suite");
    expect(restoreIndex).toBeGreaterThanOrEqual(0);
    expect(sandboxSetupIndex).toBeGreaterThan(restoreIndex);
    expect(repoE2eIndex).toBeGreaterThan(sandboxSetupIndex);
    expect(repoE2eSteps[repoE2eIndex]).toMatchObject({
      env: {
        OPENCLAW_E2E_WORKERS: "2",
        OPENCLAW_E2E_USE_PREBUILT_DIST: "1",
        TARGET_REQUIRED_SCRIPT: "${{ matrix.target_script || '' }}",
      },
    });
    const repoE2eRun = repoE2eSteps[repoE2eIndex]?.run;
    expect(repoE2eRun).toContain("OPENCLAW_ALLOW_FROZEN_TARGET_SCENARIO_OMISSIONS");
    expect(repoE2eRun).toContain("Selected target does not provide required repo E2E capability");
    expect(repoE2eRun).toContain("selected target does not provide this newer repo E2E capability");
    expect(repoE2eRun).toContain("${{ matrix.command }}");
    const targetedGroupStep = releaseChecks.jobs.plan_docker_lane_groups.steps.find(
      (step: WorkflowStep) => step.name === "Build targeted Docker lane groups",
    );
    expect(targetedGroupStep.env.OPENCLAW_UPGRADE_SURVIVOR_SCENARIOS).toBe(
      "${{ inputs.published_upgrade_survivor_scenarios }}",
    );
    expect(releaseChecks.jobs.validate_docker_lanes["timeout-minutes"]).toBe(
      "${{ matrix.group.timeout_minutes || 60 }}",
    );
    expect(releaseChecks.jobs.validate_docker_lanes.strategy["max-parallel"]).toBe(32);
    expect(releaseChecks.jobs.validate_docker_lanes.env.OPENCLAW_UPGRADE_SURVIVOR_SCENARIOS).toBe(
      "${{ matrix.group.published_upgrade_survivor_scenarios || inputs.published_upgrade_survivor_scenarios }}",
    );
  });

  it("persists Node 26 minimum declarations through trusted bounded artifacts", () => {
    const workflow = parse(readFileSync(".github/workflows/node-runtime-compat.yml", "utf8"));
    const steps = workflow.jobs.compat.steps as WorkflowStep[];
    const setupStep = steps.find((step) => step.name === "Setup Node environment");
    const resolveStep = steps.find(
      (step) => step.name === "Resolve trusted declaration cache artifact",
    );
    const downloadStep = steps.find(
      (step) => step.name === "Restore trusted declaration cache artifact",
    );
    const uploadStep = steps.find(
      (step) => step.name === "Publish trusted declaration cache artifact",
    );

    expect(workflow.permissions).toMatchObject({ actions: "read", contents: "read" });
    expect(setupStep?.with).not.toHaveProperty("build-all-cache-scope");
    expect(resolveStep?.run).toContain('.head_branch == "main"');
    expect(resolveStep?.run).toContain('(.path | split("@")[0])');
    expect(resolveStep?.run).toContain('.conclusion == "success"');
    expect(resolveStep?.run).toContain("status=success&per_page=5");
    expect(resolveStep?.run).toContain("artifacts?per_page=10");
    expect(resolveStep?.run).not.toContain("--paginate");
    expect(downloadStep).toMatchObject({
      if: "steps.declaration_cache.outputs.artifact_id != ''",
      uses: DOWNLOAD_ARTIFACT_V8,
      with: {
        path: ".artifacts/build-all-cache",
        repository: "${{ github.repository }}",
      },
    });
    expect(uploadStep).toMatchObject({
      if: "success() && github.repository == 'openclaw/openclaw' && github.ref == 'refs/heads/main'",
      uses: UPLOAD_ARTIFACT_V7,
      with: {
        "if-no-files-found": "error",
        "include-hidden-files": true,
        overwrite: true,
        path: ".artifacts/build-all-cache",
        "retention-days": 14,
      },
    });
  });

  it("fingerprints dependency install inputs without ordinary script churn", () => {
    const root = mkdtempSync(path.join(tmpdir(), "openclaw-dependency-fingerprint-"));
    try {
      const helper = path.resolve(".github/actions/setup-node-env/dependency-fingerprint.mjs");
      const writeManifest = (manifest: Record<string, unknown>) => {
        writeFileSync(path.join(root, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
      };
      const fingerprint = (frozenLockfile = true) =>
        execFileSync(
          process.execPath,
          [helper, "--workspace", root, "--frozen-lockfile", frozenLockfile ? "true" : "false"],
          { encoding: "utf8" },
        ).trim();

      execFileSync("git", ["init", "-q"], { cwd: root });
      writeManifest({
        name: "fixture",
        openclaw: { schemaVersions: { agent: 17, state: 6 } },
        scripts: {
          "pnpm:devPreinstall": "node scripts/check-install-dependency-ownership.mjs",
          postinstall: "node scripts/postinstall-bundled-plugins.mjs",
          preinstall: "node scripts/preinstall-package-manager-warning.mjs",
          prepare: "node scripts/prepare-git-hooks.mjs",
          test: "vitest run",
        },
        devDependencies: { vitest: "1.0.0" },
      });
      writeFileSync(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
      execFileSync("git", ["add", "package.json", "pnpm-lock.yaml"], { cwd: root });

      const baseline = fingerprint();
      expect(baseline).toMatch(/^v2-[a-f0-9]{64}$/);

      // Presence is part of the record type, so a real file cannot collide
      // with the representation of an absent optional install input.
      writeFileSync(path.join(root, ".pnpmfile.cjs"), "<missing>");
      expect(fingerprint()).not.toBe(baseline);
      rmSync(path.join(root, ".pnpmfile.cjs"));
      expect(fingerprint()).toBe(baseline);

      writeFileSync(path.join(root, ".pnpmfile.mjs"), "export const hooks = {};\n");
      const mjsHookFingerprint = fingerprint();
      expect(mjsHookFingerprint).not.toBe(baseline);
      writeFileSync(
        path.join(root, ".pnpmfile.mjs"),
        "export const hooks = { readPackage: (pkg) => pkg };\n",
      );
      expect(fingerprint()).not.toBe(mjsHookFingerprint);
      rmSync(path.join(root, ".pnpmfile.mjs"));
      expect(fingerprint()).toBe(baseline);

      for (const relativePath of [
        "node-version.mjs",
        ".github/actions/setup-node-env/install-dependencies.sh",
        "scripts/check-install-dependency-ownership.mjs",
        "scripts/prepare-git-hooks.mjs",
        "scripts/lib/package-lifecycle-marker.mjs",
      ]) {
        const inputPath = path.join(root, relativePath);
        mkdirSync(path.dirname(inputPath), { recursive: true });
        writeFileSync(inputPath, "fixture\n");
        expect(fingerprint(), relativePath).not.toBe(baseline);
        rmSync(inputPath);
        expect(fingerprint(), relativePath).toBe(baseline);
      }

      // Formatting, key order, and scripts that pnpm install never executes
      // should keep the existing dependency snapshot warm.
      writeManifest({
        devDependencies: { vitest: "1.0.0" },
        scripts: {
          test: "vitest run --reporter=dot",
          prepare: "node scripts/prepare-git-hooks.mjs",
          "pnpm:devPreinstall": "node scripts/check-install-dependency-ownership.mjs",
          postinstall: "node scripts/postinstall-bundled-plugins.mjs",
          preinstall: "node scripts/preinstall-package-manager-warning.mjs",
        },
        name: "fixture",
      });
      expect(fingerprint()).toBe(baseline);

      // Repository-owned package metadata does not affect pnpm's install tree
      // or any audited install hook, so schema churn must stay warm.
      writeManifest({
        name: "fixture",
        openclaw: { schemaVersions: { agent: 17, state: 7 } },
        scripts: {
          "pnpm:devPreinstall": "node scripts/check-install-dependency-ownership.mjs",
          postinstall: "node scripts/postinstall-bundled-plugins.mjs",
          preinstall: "node scripts/preinstall-package-manager-warning.mjs",
          prepare: "node scripts/prepare-git-hooks.mjs",
          test: "vitest run",
        },
        devDependencies: { vitest: "1.0.0" },
      });
      expect(fingerprint()).toBe(baseline);

      writeManifest({
        name: "fixture",
        scripts: {
          "pnpm:devPreinstall": "node scripts/check-install-dependency-ownership.mjs",
          postinstall: "node scripts/postinstall-bundled-plugins.mjs",
          preinstall: "node scripts/preinstall-package-manager-warning.mjs",
          prepare: "node scripts/prepare-git-hooks.mjs",
          test: "vitest run",
        },
        devDependencies: { vitest: "2.0.0" },
      });
      expect(fingerprint()).not.toBe(baseline);

      writeManifest({
        name: "fixture",
        scripts: { postinstall: "node install-v2.mjs", test: "vitest run" },
        devDependencies: { vitest: "1.0.0" },
      });
      expect(() => fingerprint()).toThrow(/unaudited install lifecycle scripts in package\.json/);

      mkdirSync(path.join(root, "packages", "worker"), { recursive: true });
      writeManifest({
        name: "fixture",
        scripts: {
          "pnpm:devPreinstall": "node scripts/check-install-dependency-ownership.mjs",
          postinstall: "node scripts/postinstall-bundled-plugins.mjs",
          preinstall: "node scripts/preinstall-package-manager-warning.mjs",
          prepare: "node scripts/prepare-git-hooks.mjs",
        },
        devDependencies: { vitest: "1.0.0" },
      });
      const workerManifest = path.join(root, "packages", "worker", "package.json");
      writeFileSync(
        workerManifest,
        `${JSON.stringify({ name: "worker", scripts: { prepare: "node build.mjs" } })}\n`,
      );
      execFileSync("git", ["add", "packages/worker/package.json"], { cwd: root });
      expect(() => fingerprint()).toThrow(
        /unaudited install lifecycle scripts in packages\/worker\/package\.json/,
      );
      writeFileSync(
        workerManifest,
        `${JSON.stringify({ name: "worker", scripts: { build: "node build.mjs" } })}\n`,
      );

      writeManifest({
        name: "fixture",
        scripts: {
          "pnpm:devPreinstall": "node scripts/check-install-dependency-ownership.mjs",
          postinstall: "node scripts/postinstall-bundled-plugins.mjs",
          preinstall: "node scripts/preinstall-package-manager-warning.mjs",
          prepare: "node scripts/prepare-git-hooks.mjs",
          test: "vitest run",
        },
        devDependencies: { vitest: "1.0.0" },
      });
      writeFileSync(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.1'\n");
      expect(fingerprint()).not.toBe(baseline);
      expect(fingerprint(false)).not.toBe(baseline);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("hashes transform inputs once per enabled setup and never for skipped caches", () => {
    const action = parse(readFileSync(".github/actions/setup-node-env/action.yml", "utf8"));
    const transformSteps = (action.runs.steps as WorkflowStep[]).filter((step) =>
      step.name?.includes("Vitest transform cache"),
    );
    const output = path.join(tempDirs.make("openclaw-transform-generation-"), "output");
    for (const os of ["Linux", "macOS", "Windows"]) {
      for (const mode of ["off", "restore", "read-write"]) {
        for (const flags of [
          ["false", "false"],
          ["true", "false"],
          ["false", "true"],
          ["true", "true"],
        ]) {
          for (const generation of ["a".repeat(64), "b".repeat(64)]) {
            const hashes: string[][] = [];
            const steps: Record<string, { outputs: Record<string, string> }> = {};
            const context = {
              github: { repository: "openclaw/openclaw", run_id: 10, run_attempt: 2 },
              inputs: {
                "cache-mode": mode,
                "vitest-fs-cache": flags[0],
                "restore-test-caches": flags[1],
                "node-version": "24.x",
              },
              runner: { os, arch: "X64" },
              steps,
              hashFiles: (...patterns: string[]) => {
                hashes.push(patterns);
                return generation;
              },
            };
            const evaluate = (expression: string): unknown =>
              runInNewContext(
                expression.replace(/(inputs|steps)\.([a-z-]+)/gu, '$1["$2"]'),
                context,
              );
            const render = (value: unknown) =>
              String(value).replace(/\$\{\{([\s\S]*?)\}\}/gu, (_, expression: string) => {
                const result = evaluate(expression);
                if (result == null) {
                  return "";
                }
                if (
                  typeof result === "string" ||
                  typeof result === "number" ||
                  typeof result === "boolean"
                ) {
                  return String(result);
                }
                throw new TypeError(`non-scalar workflow interpolation: ${expression}`);
              });
            let cacheInputs: Record<string, string> | undefined;
            let configuredGeneration: string | undefined;
            for (const step of transformSteps) {
              // Runner v2.336.0 evaluates embedded env before if; run/with inputs
              // are evaluated only after admission (CompositeActionHandler/ActionRunner).
              const env = Object.fromEntries(
                Object.entries(step.env ?? {}).map(([key, value]) => [key, render(value)]),
              );
              if (!evaluate(step.if ?? "true")) {
                if (step.id) {
                  steps[step.id] = { outputs: {} };
                }
                continue;
              }
              if (step.name === "Resolve Vitest transform cache generation") {
                writeFileSync(output, "");
                execFileSync("bash", ["-e", "-c", render(step.run)], {
                  env: { ...process.env, GITHUB_OUTPUT: output },
                });
                steps[expectDefined(step.id, "transform generation step id")] = {
                  outputs: Object.fromEntries(
                    readFileSync(output, "utf8")
                      .trim()
                      .split("\n")
                      .map((line) => line.split("=")),
                  ),
                };
              } else if (step.uses) {
                cacheInputs = Object.fromEntries(
                  Object.entries(step.with ?? {}).map(([key, value]) => [key, render(value)]),
                );
              } else {
                configuredGeneration = env.CACHE_GENERATION;
              }
            }
            const enabled = os !== "Windows" && mode !== "off" && flags.includes("true");
            expect(hashes, JSON.stringify({ os, mode, flags, generation })).toHaveLength(
              enabled ? 1 : 0,
            );
            if (enabled) {
              expect(hashes[0]).toEqual([
                "pnpm-lock.yaml",
                "pnpm-workspace.yaml",
                "**/package.json",
                "**/tsconfig*.json",
                "vitest.config.*",
                "test/vitest/**",
                "src/state/*.sql",
                "!**/node_modules/**",
              ]);
              const prefix = `openclaw/openclaw-vitest-fs-v3-protected-${os}-X64-node-24.x-${generation}-`;
              expect(cacheInputs).toEqual({
                path: "/var/tmp/openclaw-vitest-fs-cache",
                key: `${prefix}10-2`,
                "restore-keys": `${prefix}\n`,
              });
              expect(configuredGeneration).toBe(generation);
            } else {
              expect(cacheInputs).toBeUndefined();
              expect(configuredGeneration).toBeUndefined();
            }
          }
        }
      }
    }
  });

  it("persists isolated transform and compile caches through immutable protected archives", () => {
    const workflow = readCiWorkflow();
    const nodeTestJob = workflow.jobs["checks-node-core-test-nondist-shard"];
    const setupNodeStep = nodeTestJob.steps.find(
      (step: WorkflowStep) => step.name === "Setup Node environment",
    );
    const action = parse(readFileSync(".github/actions/setup-node-env/action.yml", "utf8"));
    const readerStep = action.runs.steps.find(
      (step: WorkflowStep) => step.name === "Restore Vitest transform cache",
    );
    const configureStep = action.runs.steps.find(
      (step: WorkflowStep) => step.name === "Configure Vitest transform cache",
    );
    const compileEpochStep = action.runs.steps.find(
      (step: WorkflowStep) => step.name === "Select Node compile cache epoch",
    );
    const compileReaderStep = action.runs.steps.find(
      (step: WorkflowStep) => step.name === "Restore Node compile cache",
    );
    const compileConfigureStep = action.runs.steps.find(
      (step: WorkflowStep) => step.name === "Configure Node compile cache",
    );
    const buildSetupNodeStep = workflow.jobs["build-artifacts"].steps.find(
      (step: WorkflowStep) => step.name === "Setup Node environment",
    );
    const hostedTestCacheInput =
      "${{ (needs.preflight.outputs.runner_profile == 'github' || needs.preflight.outputs.runner_profile == 'hybrid') && 'true' || 'false' }}";
    const hostedTestCacheJobs = [
      "checks-ui",
      "checks-ui-e2e",
      "checks-fast-plugin-contracts-shard",
      "checks-fast-channel-contracts-shard",
    ];
    const hostedFastCoreTestCacheInput =
      "${{ (needs.preflight.outputs.runner_profile == 'github' || needs.preflight.outputs.runner_profile == 'hybrid') && (matrix.task == 'bundled-protocol' || matrix.task == 'contracts-plugins-ci-routing' || matrix.task == 'ci-routing' || matrix.task == 'bun-launcher') && 'true' || 'false' }}";

    expect(setupNodeStep.with).toMatchObject({
      "cache-mode": "${{ needs.preflight.outputs.cache_mode }}",
      "node-compile-cache": "true",
      "node-compile-cache-scope": "test",
      "vitest-fs-cache": "true",
    });
    expect(setupNodeStep.with).not.toHaveProperty("save-node-compile-cache");
    expect(setupNodeStep.with).not.toHaveProperty("runtime-cache-sticky-disk");
    expect(action.inputs).not.toHaveProperty("runtime-cache-sticky-disk");
    expect(action.inputs["vitest-fs-cache"].default).toBe("false");
    expect(action.inputs["restore-test-caches"].default).toBe("false");
    expect(action.inputs).not.toHaveProperty("save-vitest-fs-cache");
    expect(action.inputs["node-compile-cache"].default).toBe("false");
    expect(action.inputs["node-compile-cache-scope"].default).toBe("test");
    expect(action.inputs).not.toHaveProperty("save-node-compile-cache");
    expect(
      action.runs.steps.some((step: WorkflowStep) =>
        step.name?.includes("transform cache sticky disk"),
      ),
    ).toBe(false);
    expect(
      action.runs.steps.some((step: WorkflowStep) =>
        step.name?.includes("compile cache sticky disk"),
      ),
    ).toBe(false);
    expect(readerStep.uses).toBe(CACHE_V5);
    expect(readerStep.if).toContain("inputs.cache-mode != 'off'");
    expect(readerStep.if).toContain("inputs.restore-test-caches == 'true'");
    expect(readerStep.if).toContain("runner.os != 'Windows'");
    expect(readerStep.if).not.toMatch(/runner\.(?:environment|labels|name)/u);
    expect(readerStep.with.key).toContain("vitest-fs-v3-protected-");
    expect(readerStep.with.key).toContain("github.run_id");
    expect(readerStep.with.key).toContain("github.run_attempt");
    expect(configureStep.if).toContain("inputs.restore-test-caches == 'true'");
    expect(configureStep.run).toContain("OPENCLAW_VITEST_FS_MODULE_CACHE_PATH=$cache_root");
    expect(configureStep.run).toContain(".openclaw-transform-generation");
    expect(configureStep.run).not.toContain("protected Vitest transform seed");
    expect(configureStep.env.CACHE_WRITER).toBe("0");
    expect(configureStep.run).toContain("OPENCLAW_VITEST_FS_MODULE_CACHE_WRITER=");
    expect(compileEpochStep.run).toContain('if [ "$CACHE_SCOPE" = "build" ]');
    expect(compileEpochStep.run).toContain("date -u +%Y%m%d");
    expect(compileEpochStep.run).toContain("GITHUB_RUN_ID");
    expect(compileReaderStep.with.key).toContain(
      "node-compile-v3-${{ inputs.node-compile-cache-scope }}-protected-",
    );
    expect(compileReaderStep.with.key).toContain("steps.node-compile-cache-epoch.outputs.value");
    expect(compileReaderStep.with.key).not.toContain("pull_request");
    expect(compileEpochStep.if).toContain("inputs.restore-test-caches == 'true'");
    expect(compileReaderStep.if).toContain("inputs.cache-mode != 'off'");
    expect(compileReaderStep.if).toContain("inputs.restore-test-caches == 'true'");
    expect(compileConfigureStep.if).toContain("inputs.restore-test-caches == 'true'");
    expect(compileConfigureStep.run).toContain("NODE_COMPILE_CACHE=$cache_root");
    expect(compileConfigureStep.run).toContain("NODE_COMPILE_CACHE_PORTABLE=1");
    expect(compileConfigureStep.run).toContain("OPENCLAW_NODE_COMPILE_CACHE_WRITER=0");
    expect(buildSetupNodeStep.with).toMatchObject({
      "cache-mode": "${{ needs.preflight.outputs.cache_mode }}",
      "node-compile-cache": "true",
      "node-compile-cache-scope": "build",
      "build-all-cache-scope": "full",
    });
    expect(buildSetupNodeStep.with["node-compile-cache-scope"]).not.toBe(
      setupNodeStep.with["node-compile-cache-scope"],
    );

    for (const jobName of hostedTestCacheJobs) {
      const setup = workflow.jobs[jobName].steps.find(
        (step: WorkflowStep) => step.name === "Setup Node environment",
      );
      expect(setup.with["restore-test-caches"], jobName).toBe(hostedTestCacheInput);
      expect(
        evaluateWorkflowExpression(setup.with["restore-test-caches"], {
          eventName: "push",
          repository: "openclaw/openclaw",
          runnerBackend: "github",
          runAttempt: 1,
        }),
        jobName,
      ).toBe("true");
      expect(
        evaluateWorkflowExpression(setup.with["restore-test-caches"], {
          eventName: "push",
          repository: "openclaw/openclaw",
          runnerBackend: "blacksmith",
          runAttempt: 1,
        }),
        jobName,
      ).toBe("false");
      expect(setup.with, jobName).not.toHaveProperty("save-node-compile-cache");
      expect(setup.with, jobName).not.toHaveProperty("save-vitest-fs-cache");
    }
    const fastCoreSetup = workflow.jobs["checks-fast-core"].steps.find(
      (step: WorkflowStep) => step.name === "Setup Node environment",
    );
    expect(fastCoreSetup.with["restore-test-caches"]).toBe(hostedFastCoreTestCacheInput);
    for (const task of [
      "bundled-protocol",
      "contracts-plugins-ci-routing",
      "ci-routing",
      "bun-launcher",
    ]) {
      expect(
        evaluateWorkflowExpression(fastCoreSetup.with["restore-test-caches"], {
          eventName: "push",
          matrix: { task },
          repository: "openclaw/openclaw",
          runnerBackend: "github",
          runAttempt: 1,
        }),
        task,
      ).toBe("true");
    }
    for (const task of ["baseline-ratchets", "coercion-helpers"]) {
      expect(
        evaluateWorkflowExpression(fastCoreSetup.with["restore-test-caches"], {
          eventName: "push",
          matrix: { task },
          repository: "openclaw/openclaw",
          runnerBackend: "github",
          runAttempt: 1,
        }),
        task,
      ).toBe("false");
    }
    expect(
      evaluateWorkflowExpression(fastCoreSetup.with["restore-test-caches"], {
        eventName: "push",
        matrix: { task: "bundled-protocol" },
        repository: "openclaw/openclaw",
        runnerBackend: "blacksmith",
        runAttempt: 1,
      }),
    ).toBe("false");
    expect(fastCoreSetup.with).not.toHaveProperty("save-node-compile-cache");
    expect(fastCoreSetup.with).not.toHaveProperty("save-vitest-fs-cache");

    for (const jobName of ["checks-ui-e2e-real-gateway", "control-ui-i18n"]) {
      const setup = workflow.jobs[jobName].steps.find(
        (step: WorkflowStep) => step.name === "Setup Node environment",
      );
      expect(setup.with, jobName).not.toHaveProperty("restore-test-caches");
    }
  });

  it("warms protected caches without main-run cancellation", () => {
    const warmerSource = readFileSync(".github/workflows/vitest-cache-warm.yml", "utf8");
    const warmer = parse(warmerSource);
    const warmerSetup = warmer.jobs.warm.steps.find(
      (step: WorkflowStep) => step.name === "Setup Node environment",
    );
    const checkoutStep = warmer.jobs.warm.steps.find(
      (step: WorkflowStep) => step.name === "Checkout",
    );
    const seedStep = warmer.jobs.warm.steps.find(
      (step: WorkflowStep) => step.name === "Select broad cache seed",
    );
    const warmStep = warmer.jobs.warm.steps.find(
      (step: WorkflowStep) => step.name === "Warm transform and compile caches",
    );
    const warmerSteps = warmer.jobs.warm.steps as WorkflowStep[];
    const buildStep = expectDefined(
      warmerSteps.find((step) => step.name === "Warm build cache"),
      "cache warm build",
    );
    const boundaryRestoreStep = expectDefined(
      warmerSteps.find((step) => step.name === "Restore native SDK boundary cache"),
      "native SDK boundary cache restore",
    );
    const boundaryPrepareStep = expectDefined(
      warmerSteps.find((step) => step.name === "Prepare native SDK boundary cache"),
      "native SDK boundary cache preparation",
    );
    const boundarySaveStep = expectDefined(
      warmerSteps.find((step) => step.name === "Save native SDK boundary cache"),
      "native SDK boundary cache publication",
    );
    const boundaryCleanupStep = expectDefined(
      warmerSteps.find((step) => step.name === "Clear native SDK boundary output before build"),
      "native SDK boundary output cleanup",
    );
    const warmAssertionStep = expectDefined(
      warmerSteps.find((step) => step.name === "Assert cache warming succeeded"),
      "final cache warming assertion",
    );

    expect(warmer.concurrency["cancel-in-progress"]).toBe(false);
    expect(warmer.concurrency.group).toBe("vitest-cache-warm-${{ github.ref }}");
    // hosted-mode cache recovery needs a maintainer-operated fallback when the
    // scheduled seed is missing or stale.
    expect(warmer.on).toHaveProperty("workflow_dispatch");
    expect(warmer.on.push.branches).toEqual(["main"]);
    expect(warmer.on.repository_dispatch.types).toEqual(["vitest-cache-warm"]);
    expect(warmer.jobs.warm.if).toContain("github.repository == 'openclaw/openclaw'");
    expect(warmer.jobs.warm.strategy).toEqual({
      "fail-fast": false,
      matrix: { platform: ["linux", "macos"] },
    });
    expect(warmer.on).not.toHaveProperty("pull_request");
    expect(warmer.on).not.toHaveProperty("pull_request_target");
    for (const eventName of ["push", "workflow_dispatch"] as const) {
      for (const runnerBackend of ["blacksmith", "hybrid", "github"] as const) {
        for (const platform of warmer.jobs.warm.strategy.matrix.platform) {
          const context = {
            eventName,
            matrix: { platform },
            repository: "openclaw/openclaw",
            runAttempt: 1,
            runnerBackend,
          };
          const full = platform === "linux";
          const expectedRunner = full
            ? runnerBackend === "github"
              ? "ubuntu-24.04"
              : "blacksmith-8vcpu-ubuntu-2404"
            : "macos-15";
          expect(evaluateWorkflowExpression(warmer.jobs.warm["runs-on"], context)).toBe(
            expectedRunner,
          );
          const setupInputs = Object.fromEntries(
            Object.entries(warmerSetup.with).map(([key, value]) => [
              key,
              typeof value === "string" && value.startsWith("${{")
                ? evaluateWorkflowExpression(value, context)
                : value,
            ]),
          );
          expect(setupInputs).toMatchObject({
            "build-all-cache-scope": full ? "full" : "",
            "cache-mode": "read-write",
            "dependency-cache": String(full),
            "install-bun": "false",
            "node-compile-cache-scope": "test",
            "node-compile-cache": String(full),
            "vitest-fs-cache": String(full),
          });
          for (const step of [
            buildStep,
            boundaryPrepareStep,
            boundaryCleanupStep,
            seedStep,
            warmStep,
            warmAssertionStep,
          ]) {
            expect(evaluateWorkflowExpression(step.if, context), step.name).toBe(full);
          }
        }
      }
    }
    expect(warmer.on).not.toHaveProperty("workflow_run");
    expect(checkoutStep.with).toBeUndefined();
    expect(warmerSource).toContain('cron: "17 8 * * *"');
    expect(seedStep.run).toContain(
      'import { createVitestCacheWarmGroups } from "./scripts/lib/ci-node-test-plan.mts";',
    );
    expect(seedStep.run).toMatch(
      /const groups = createVitestCacheWarmGroups\(\);[\s\S]*appendFileSync\(\s*process\.env\.GITHUB_ENV,[\s\S]*OPENCLAW_NODE_TEST_GROUPS_JSON=\$\{JSON\.stringify\(groups\)\}/u,
    );
    expect(warmerSource).not.toContain("OPENCLAW_NODE_TEST_CONFIGS_JSON");
    expect(warmerSource).toContain('"OPENCLAW_NODE_TEST_PLAN_CONCURRENCY=1"');
    expect(seedStep.run).toContain('"OPENCLAW_NODE_TEST_PLAN_CONTINUE_ON_FAILURE=1"');
    expect(warmStep.id).toBe("warm-caches");
    expect(warmStep["continue-on-error"]).toBe(true);
    expect(warmStep.env).toMatchObject({
      OPENCLAW_VITEST_FS_MODULE_CACHE_WRITER: "1",
      OPENCLAW_NODE_COMPILE_CACHE_WRITER: "1",
    });
    expect(warmerSetup["continue-on-error"]).not.toBe(true);
    for (const legacyInput of [
      "save-actions-cache",
      "save-dependency-cache",
      "save-node-compile-cache",
      "save-vitest-fs-cache",
      "use-actions-cache",
    ]) {
      expect(warmerSetup.with).not.toHaveProperty(legacyInput);
    }
    const saveSteps = warmerSteps.filter((step) => step.uses?.startsWith("actions/cache/save@"));
    expect(saveSteps.map((step) => step.name)).toEqual([
      "Save Node toolchain cache",
      "Save exact dependency cache",
      "Save native SDK boundary cache",
      "Save build-all cache",
      "Save dist build cache",
      "Save pnpm store cache",
      "Save Vitest transform cache",
      "Save Node compile cache",
    ]);
    for (const saveStep of saveSteps) {
      expect(saveStep.if, saveStep.name).toContain(
        "steps.setup-node-env.outputs.cache-mode == 'read-write'",
      );
      expect(warmerSteps.indexOf(saveStep), saveStep.name).toBeGreaterThan(
        warmerSteps.indexOf(warmerSetup),
      );
      if (
        saveStep.name === "Save Node toolchain cache" ||
        saveStep.name === "Save exact dependency cache"
      ) {
        expect(warmerSteps.indexOf(saveStep), saveStep.name).toBeLessThan(
          warmerSteps.indexOf(buildStep),
        );
        // A normal step condition retains Actions' implicit success() gate,
        // so failed setup cannot publish even if it produced cache outputs.
        expect(saveStep.if, saveStep.name).not.toMatch(/\b(?:always|failure|cancelled)\(/u);
      } else if (
        saveStep.name === "Save build-all cache" ||
        saveStep.name === "Save dist build cache"
      ) {
        expect(warmerSteps.indexOf(saveStep), saveStep.name).toBeGreaterThan(
          warmerSteps.findIndex((step) => step.name === "Warm build cache"),
        );
        expect(warmerSteps.indexOf(saveStep), saveStep.name).toBeLessThan(
          warmerSteps.indexOf(seedStep),
        );
        expect(saveStep.if).not.toMatch(/always\(|failure\(/u);
      } else if (saveStep.name === "Save native SDK boundary cache") {
        expect(saveStep.if).toContain(
          "steps.extension-package-boundary-cache.outputs.cache-hit != 'true'",
        );
        expect(saveStep.if).not.toMatch(/always\(|failure\(|cancelled\(/u);
      } else {
        expect(warmerSteps.indexOf(saveStep), saveStep.name).toBeGreaterThan(
          warmerSteps.indexOf(warmStep),
        );
      }
      expect(warmerSteps.indexOf(saveStep), saveStep.name).toBeLessThan(
        warmerSteps.indexOf(warmAssertionStep),
      );
    }
    expect(warmAssertionStep.if).toBe("${{ always() && matrix.platform == 'linux' }}");
    expect(warmAssertionStep.run).toContain("steps.warm-caches.outcome");
    expect(warmAssertionStep.run).toContain("exit 1");
    expect(warmerSteps.at(-1)).toBe(warmAssertionStep);
    // No close-time cleanup workflow is needed; Actions cache LRU/TTL expires
    // old hosted-writer and warmer generations.
    expect(existsSync(".github/workflows/pr-cache-cleanup.yml")).toBe(false);
    expect(seedStep.if).toBe("${{ matrix.platform == 'linux' }}");
    expect(warmStep.if).toBe("${{ matrix.platform == 'linux' }}");
    const distSave = expectDefined(
      saveSteps.find((step) => step.name === "Save dist build cache"),
      "Linux dist publication",
    );
    expect(distSave.if).toBe(
      "${{ matrix.platform == 'linux' && steps.setup-node-env.outputs.cache-mode == 'read-write' }}",
    );
    expect(boundaryRestoreStep.uses).toBe(CACHE_V5);
    expect(boundarySaveStep.uses).toBe(CACHE_SAVE_V5);
    const boundaryRestoreInputs = expectDefined(
      boundaryRestoreStep.with,
      "native SDK boundary cache inputs",
    );
    expect(boundaryRestoreInputs.key).toBe(
      "${{ runner.os }}-extension-package-boundary-v4-${{ github.sha }}",
    );
    expect(boundarySaveStep.with).toEqual({
      path: boundaryRestoreInputs.path,
      key: boundaryRestoreInputs.key,
    });
    expect(boundaryRestoreInputs["restore-keys"]).toBe(
      "${{ runner.os }}-extension-package-boundary-v4-\n",
    );
    expect(boundaryPrepareStep.run).toBe(
      "node --import ./scripts/tsx.mjs scripts/prepare-extension-package-boundary-artifacts.mts --mode=package-boundary",
    );
    expect(boundaryPrepareStep["continue-on-error"]).not.toBe(true);
    expect(warmerSteps.indexOf(boundaryRestoreStep)).toBeLessThan(warmerSteps.indexOf(buildStep));
    expect(warmerSteps.indexOf(boundaryPrepareStep)).toBeGreaterThan(
      warmerSteps.indexOf(boundaryRestoreStep),
    );
    expect(warmerSteps.indexOf(boundarySaveStep)).toBeGreaterThan(
      warmerSteps.indexOf(boundaryPrepareStep),
    );
    expect(warmerSteps.indexOf(boundarySaveStep)).toBeLessThan(warmerSteps.indexOf(buildStep));
    expect(warmerSteps.indexOf(boundaryCleanupStep)).toBeGreaterThan(
      warmerSteps.indexOf(boundarySaveStep),
    );
    expect(warmerSteps.indexOf(boundaryCleanupStep)).toBeLessThan(warmerSteps.indexOf(buildStep));
    const cleanupRoot = tempDirs.make("openclaw-native-sdk-cleanup-");
    const sdkOutput = path.join(cleanupRoot, "packages/plugin-sdk/dist/native.d.ts");
    const sdkSource = path.join(cleanupRoot, "packages/plugin-sdk/src/core.ts");
    const siblingOutput = path.join(cleanupRoot, "packages/normalization-core/dist/index.js");
    const boundaryReceipt = path.join(
      cleanupRoot,
      ".artifacts/extension-package-boundary/plugin-sdk.json",
    );
    for (const file of [sdkOutput, sdkSource, siblingOutput, boundaryReceipt]) {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, "sentinel\n");
    }
    const cleanupResult = runWorkflowShellScript(
      expectDefined(boundaryCleanupStep.run, "cleanup"),
      {
        cwd: cleanupRoot,
        env: process.env,
      },
    );
    expect(cleanupResult.status, `${cleanupResult.stdout}${cleanupResult.stderr}`).toBe(0);
    expect(existsSync(sdkOutput)).toBe(false);
    expect(existsSync(sdkSource)).toBe(true);
    expect(existsSync(siblingOutput)).toBe(true);
    expect(existsSync(boundaryReceipt)).toBe(true);
    const storeSave = expectDefined(
      saveSteps.find((step) => step.name === "Save pnpm store cache"),
      "platform pnpm store publication",
    );
    expect(storeSave.if).not.toContain("matrix.platform");
    expect(storeSave.if).toContain("steps.setup-node-env.outputs.pnpm-store-cache-hit != 'true'");
    expect(storeSave.if).not.toMatch(/\b(?:always|failure|cancelled)\(/u);
    expect(storeSave.with).toEqual({
      path: "${{ steps.setup-node-env.outputs.pnpm-store-cache-path }}",
      key: "${{ steps.setup-node-env.outputs.pnpm-store-cache-key }}",
    });
  });

  it("uses bundled Node shards and telemetry-backed runner sizes", () => {
    const workflow = readCiWorkflow();
    const source = readFileSync(".github/workflows/ci.yml", "utf8");

    expect(source).toContain("createNodeTestShardBundles");
    const artifactRunner = workflow.jobs["build-artifacts"]["runs-on"];
    for (const [frozenTarget, expected] of [
      ["false", "blacksmith-16vcpu-ubuntu-2404"],
      ["true", "blacksmith-32vcpu-ubuntu-2404"],
      ["", "blacksmith-32vcpu-ubuntu-2404"],
    ] as const) {
      const context = {
        eventName: "push",
        repository: "openclaw/openclaw",
        runAttempt: 1,
        preflightOutputs: { frozen_target: frozenTarget },
      } as const;
      for (const runnerBackend of ["", "blacksmith", "hybrid"] as const) {
        for (const eventName of ["push", "pull_request"] as const) {
          expect(
            evaluateWorkflowExpression(artifactRunner, { ...context, runnerBackend, eventName }),
            `build-artifacts: ${runnerBackend || "default"}/${eventName}/frozen=${frozenTarget}`,
          ).toBe(expected);
        }
      }
      for (const override of [
        { runnerBackend: "github" },
        { runnerBackend: "hybrid", runAttempt: 2 },
        { eventName: "workflow_dispatch" },
        { eventName: "pull_request", authorAssociation: "NONE", headRepository: "fork/openclaw" },
      ] as const) {
        expect(evaluateWorkflowExpression(artifactRunner, { ...context, ...override })).toBe(
          "ubuntu-24.04",
        );
      }
    }
    expect(workflow.jobs["build-artifacts"]["timeout-minutes"]).toBe(
      "${{ (vars.OPENCLAW_CI_RUNNER_BACKEND == 'github' || (vars.OPENCLAW_CI_RUNNER_BACKEND == 'hybrid' && github.run_attempt > 1) || (github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name != github.repository)) && 35 || 20 }}",
    );
    expect(workflow.jobs["checks-node-core-test-nondist-shard"]["runs-on"]).toContain(
      "blacksmith-4vcpu-ubuntu-2404",
    );
    for (const task of ["dependencies", "test-types"]) {
      expect(workflow.jobs["check-shard"].strategy.matrix.include).toContainEqual({
        check_name: `check-${task}`,
        task,
        runner: "blacksmith-32vcpu-ubuntu-2404",
      });
    }
    expect(workflow.jobs["check-additional-shard"]["runs-on"]).toContain("matrix.runner");
    expect(readFrozenAdditionalCheckRows()).toContainEqual({
      check_name: "check-additional-runtime-topology-architecture",
      group: "runtime-topology-architecture",
      runner: "blacksmith-32vcpu-ubuntu-2404",
    });
    expect(readFrozenAdditionalCheckRows()).toContainEqual({
      check_name: "check-session-accessor-boundary",
      group: "session-accessor-boundary",
      runner: "blacksmith-4vcpu-ubuntu-2404",
    });
    expect(readFrozenAdditionalCheckRows()).toContainEqual({
      check_name: "check-export-name-collisions",
      group: "export-name-collisions",
      runner: "blacksmith-4vcpu-ubuntu-2404",
    });
    expect(readFrozenAdditionalCheckRows()).toContainEqual({
      check_name: "check-sqlite-session-schema-baseline",
      group: "sqlite-session-schema-baseline",
      runner: "blacksmith-4vcpu-ubuntu-2404",
    });
    // The Windows matrix carries no per-row runner: both parts share one class.
    expect(workflow.jobs["checks-windows"]["runs-on"]).not.toContain("matrix.runner");
    expect(source).toContain("blacksmith-8vcpu-windows-2025");
  });

  it("keeps the extension boundary sticky disk on one protected key", () => {
    const workflow = readCiWorkflow();
    const warmer = parse(readFileSync(".github/workflows/vitest-cache-warm.yml", "utf8"));
    const additionalJob = workflow.jobs["check-additional-shard"];
    const checkShardJob = workflow.jobs["check-shard"];
    const hostedCoreJob = workflow.jobs["check-lint-hosted-core-shard"];

    // Cold SDK preparation and plugin compilation need CPU and memory headroom.
    expect(readFrozenAdditionalCheckRows()).toContainEqual({
      check_name: "check-additional-extension-package-boundary",
      group: "extension-package-boundary",
      runner: "blacksmith-32vcpu-ubuntu-2404",
    });
    const runStep = additionalJob.steps.find(
      (step: WorkflowStep) => step.name === "Run additional check shard",
    );
    expect(runStep.env.OPENCLAW_EXTENSION_BOUNDARY_CONCURRENCY).toBe(16);

    // O(1) disks: Blacksmith caps sticky disks per installation, and the old
    // per-PR/per-config keys minted new disks until every mount 429-failed
    // fleet-wide. Snapshot validity lives in the in-job marker, not the key.
    const boundaryMount = additionalJob.steps.find(
      (step: WorkflowStep) => step.name === "Mount extension boundary sticky disk",
    );
    const lintMount = checkShardJob.steps.find(
      (step: WorkflowStep) => step.name === "Mount extension boundary sticky disk",
    );
    const boundaryCache = expectDefined(
      additionalJob.steps.find(
        (step: WorkflowStep) => step.name === "Cache extension package boundary artifacts",
      ),
      "extension package boundary cache",
    );
    const hostedLintCache = expectDefined(
      checkShardJob.steps.find(
        (step: WorkflowStep) =>
          step.name === "Cache extension package boundary artifacts for hosted lint",
      ),
      "hosted lint extension package boundary cache",
    );
    const hostedCoreCache = expectDefined(
      hostedCoreJob.steps.find(
        (step: WorkflowStep) =>
          step.name === "Cache extension package boundary artifacts for hosted core lint",
      ),
      "hosted core extension package boundary cache",
    );
    expect(boundaryMount.with.key).toBe("${{ github.repository }}-ext-boundary-v2");
    expect(lintMount.with.key).toBe(boundaryMount.with.key);
    for (const gate of [boundaryMount, lintMount]) {
      expect(gate.if).toContain("vars.OPENCLAW_CI_RUNNER_BACKEND != 'github'");
    }
    expect(hostedLintCache.if).toBe(
      "needs.preflight.outputs.cache_mode != 'off' && matrix.task == 'lint' && steps.extension-boundary-inputs.outputs.enabled == 'true' && (needs.preflight.outputs.runner_profile == 'github' || needs.preflight.outputs.runner_profile == 'hybrid')",
    );
    expect(boundaryCache.if).toBe(
      "needs.preflight.outputs.cache_mode != 'off' && matrix.group == 'extension-package-boundary' && steps.extension-boundary-inputs.outputs.enabled == 'true'",
    );
    expect(hostedCoreCache.if).toBe(
      "needs.preflight.outputs.cache_mode != 'off' && needs.preflight.outputs.runner_profile == 'github' && !inputs.release_gate && steps.extension-boundary-inputs.outputs.enabled == 'true'",
    );
    for (const cache of [hostedLintCache, hostedCoreCache]) {
      expect(cache.uses).toBe(CACHE_V5);
      expect(cache.with).toEqual(boundaryCache.with);
    }
    const fingerprintReference = "${{ steps.extension-boundary-inputs.outputs.fingerprint }}";
    expect(boundaryCache.with.key).toBe(
      "${{ runner.os }}-extension-package-boundary-v4-${{ steps.extension-boundary-inputs.outputs.fingerprint }}",
    );
    expect(boundaryCache.with.path.trim().split("\n")).toEqual([
      "packages/plugin-sdk/dist",
      ".artifacts/extension-package-boundary/plugins",
      ".artifacts/extension-package-boundary/*.json",
      ".artifacts/extension-package-boundary/compile",
    ]);
    const fingerprintSteps = [additionalJob, checkShardJob, hostedCoreJob].map((job) =>
      expectDefined(
        job.steps.find(
          (step: WorkflowStep) => step.name === "Compute extension boundary input fingerprint",
        ),
        "extension boundary input fingerprint step",
      ),
    );
    for (const step of fingerprintSteps) {
      expect(step.id).toBe("extension-boundary-inputs");
      expect(step.run).toContain('fingerprint="$(git rev-parse HEAD)"');
      expect(step.run).toContain('echo "enabled=false" >> "$GITHUB_OUTPUT"');
    }
    expect(fingerprintSteps[0]?.run).toBe(fingerprintSteps[1]?.run);
    expect(fingerprintSteps[1]?.run).toBe(fingerprintSteps[2]?.run);
    expect(fingerprintSteps[2]?.if).toBe(
      "needs.preflight.outputs.runner_profile == 'github' && !inputs.release_gate",
    );
    expect(hostedCoreJob.steps.indexOf(fingerprintSteps[2])).toBeLessThan(
      hostedCoreJob.steps.indexOf(hostedCoreCache),
    );
    expect(hostedCoreJob.steps.indexOf(hostedCoreCache)).toBeLessThan(
      hostedCoreJob.steps.findIndex(
        (step: WorkflowStep) => step.name === "Run hosted core lint stripe",
      ),
    );
    expect(
      hostedCoreJob.steps.some((step: WorkflowStep) =>
        step.uses?.startsWith("actions/cache/save@"),
      ),
    ).toBe(false);
    const warmerBoundaryRestore = expectDefined(
      warmer.jobs.warm.steps.find(
        (step: WorkflowStep) => step.name === "Restore native SDK boundary cache",
      ),
      "warmer boundary restore",
    );
    const warmerBoundarySave = expectDefined(
      warmer.jobs.warm.steps.find(
        (step: WorkflowStep) => step.name === "Save native SDK boundary cache",
      ),
      "warmer boundary save",
    );
    expect(warmerBoundaryRestore.with.path).toBe(boundaryCache.with.path);
    expect(warmerBoundaryRestore.with["restore-keys"]).toBe(boundaryCache.with["restore-keys"]);
    expect(warmerBoundarySave.with.path).toBe(boundaryCache.with.path);
    // Single semantic writer: protected pushes commit explicitly (not
    // on-change/if-missing, whose allocated-byte heuristic can strand a stale
    // marker); PR clones and the lint consumer stay read-only.
    expect(boundaryMount.with.commit).toBe(
      "${{ github.event_name != 'pull_request' && 'true' || 'false' }}",
    );
    expect(lintMount.with.commit).toBe("false");

    // Transport keys use the same commit; native owner records independently
    // validate source content and output integrity after restoration.
    const restoreStep = additionalJob.steps.find(
      (step: WorkflowStep) => step.name === "Restore extension boundary artifacts from sticky disk",
    );
    const lintRestoreStep = checkShardJob.steps.find(
      (step: WorkflowStep) => step.name === "Restore extension boundary artifacts from sticky disk",
    );
    const seedStep = additionalJob.steps.find(
      (step: WorkflowStep) => step.name === "Seed extension boundary sticky disk",
    );
    for (const gate of [restoreStep, lintRestoreStep, seedStep]) {
      expect(gate.run).toContain(fingerprintReference);
      expect(gate.run).toContain(".source-fingerprint");
      expect(gate.run).not.toContain("git rev-parse HEAD:");
      expect(gate.run).not.toContain("BOUNDARY_CONFIG_HASH");
      expect(gate.if).toContain("vars.OPENCLAW_CI_RUNNER_BACKEND != 'github'");
    }
    // Seeding is writer-only work: PR mounts never commit, so seeding there
    // would burn wall clock on a discarded clone.
    expect(seedStep.if).toContain("github.event_name != 'pull_request'");
    expect(seedStep.if).toContain("steps.boundary-sticky-restore.outputs.restored == 'false'");
    expect(seedStep.run).toContain(
      "rsync -aR --exclude='*.lock*' .artifacts/extension-package-boundary",
    );
    for (const step of [restoreStep, lintRestoreStep]) {
      expect(step.run).toContain("for payload in packages .artifacts;");
    }
  });

  it("never keys a Blacksmith sticky disk by unbounded run dimensions", () => {
    // Blacksmith caps backing disks per installation; per-PR, per-commit,
    // per-run, or per-hash key segments mint disks until every mount 429s.
    // Snapshot validity belongs in in-job fingerprints/markers, never the key.
    const workflowFiles = readdirSync(".github/workflows")
      .filter((name) => name.endsWith(".yml"))
      .map((name) => `.github/workflows/${name}`);
    const actionFiles = readdirSync(".github/actions").map(
      (name) => `.github/actions/${name}/action.yml`,
    );
    const stickyKeys: Array<{ file: string; key: string }> = [];
    for (const file of [...workflowFiles, ...actionFiles]) {
      if (!existsSync(file)) {
        continue;
      }
      const parsed = parse(readFileSync(file, "utf8"));
      const jobs = parsed?.jobs ? Object.values(parsed.jobs) : [];
      const stepLists = [
        ...jobs.map((job) => (job as { steps?: WorkflowStep[] }).steps ?? []),
        (parsed?.runs?.steps ?? []) as WorkflowStep[],
      ];
      for (const step of stepLists.flat()) {
        if (typeof step?.uses !== "string" || !step.uses.startsWith("useblacksmith/stickydisk@")) {
          continue;
        }
        const key = step.with?.key;
        stickyKeys.push({ file, key: typeof key === "string" ? key : "" });
      }
    }
    expect(stickyKeys.length).toBeGreaterThan(0);
    for (const { file, key } of stickyKeys) {
      expect(key, file).not.toContain("github.event.pull_request.number");
      expect(key, file).not.toContain("github.sha");
      expect(key, file).not.toContain("github.ref");
      expect(key, file).not.toContain("github.run_");
      expect(key, file).not.toContain("hashFiles(");
    }
  });

  it("selects every supplemental boundary check exactly once across the CI matrix", () => {
    const job = readCiWorkflow().jobs["check-additional-shard"];
    const step = job.steps.find(
      (entry: WorkflowStep) => entry.name === "Run additional check shard",
    );
    const selector = String(step?.env?.OPENCLAW_ADDITIONAL_BOUNDARY_SHARD ?? "");
    const rows = readFrozenAdditionalCheckRows();
    const selected = rows
      .filter((row) => row.group === "boundaries")
      .flatMap(() => selectChecksForShard(BOUNDARY_CHECKS, selector));
    expect(selected.toSorted((left, right) => left.label.localeCompare(right.label))).toEqual(
      BOUNDARY_CHECKS.toSorted((left, right) => left.label.localeCompare(right.label)),
    );
  });

  it("runs all source checks serially and preserves individual failures", () => {
    const additionalJob = readCiWorkflow().jobs["check-additional-shard"];
    const runStep = additionalJob.steps.find(
      (step: WorkflowStep) => step.name === "Run additional check shard",
    );
    const sessionCommands = [
      "lint:tmp:session-accessor-boundary",
      "lint:tmp:sqlite-transaction-boundary",
      "lint:tmp:session-transcript-reader-boundary",
    ];
    const root = tempDirs.make("openclaw-session-boundary-workflow-");
    const binDir = path.join(root, "bin");
    const callsPath = path.join(root, "pnpm-calls.txt");
    mkdirSync(binDir);
    const pnpmPath = path.join(binDir, "pnpm");
    writeFileSync(
      pnpmPath,
      '#!/usr/bin/env bash\nset -euo pipefail\nprintf \'%s\\n\' "$*" >> "$PNPM_CALLS"\nif [[ "${2:-}" == "${PNPM_FAIL:-}" ]]; then exit 1; fi\n',
      "utf8",
    );
    chmodSync(pnpmPath, 0o755);
    const exportScript = path.join(root, "scripts/check-export-name-collisions.mts");
    mkdirSync(path.dirname(exportScript));
    for (const [group, commands] of [
      [
        "source-contracts",
        ["lint:tmp:export-name-collisions", ...sessionCommands, "sqlite:sessions-schema:check"],
      ],
      ["session-accessor-boundary", sessionCommands],
      ["export-name-collisions", ["lint:tmp:export-name-collisions"]],
      ["sqlite-session-schema-baseline", ["sqlite:sessions-schema:check"]],
    ] as const) {
      for (const scenario of [
        { failed: "", missing: "", missingFile: false },
        ...commands.map((failed) => ({ failed, missing: "", missingFile: false })),
        ...(group === "source-contracts"
          ? [
              ...commands.map((missing) => ({ failed: "", missing, missingFile: false })),
              { failed: "", missing: "", missingFile: true },
            ]
          : []),
      ]) {
        const present = commands.filter(
          (command) =>
            command !== scenario.missing &&
            !(scenario.missingFile && command === "lint:tmp:export-name-collisions"),
        );
        if (scenario.missingFile) {
          rmSync(exportScript, { force: true });
        } else {
          writeFileSync(exportScript, "");
        }
        writeFileSync(
          path.join(root, "package.json"),
          JSON.stringify({
            scripts: Object.fromEntries(
              commands
                .filter((command) => command !== scenario.missing)
                .map((command) => [command, "fixture"]),
            ),
          }),
        );
        writeFileSync(callsPath, "");
        const result = runWorkflowShellScript(runStep.run, {
          cwd: root,
          env: {
            ...process.env,
            ADDITIONAL_CHECK_GROUP: group,
            PATH: `${binDir}:${process.env.PATH ?? ""}`,
            PNPM_CALLS: callsPath,
            PNPM_FAIL: scenario.failed,
          },
        });
        const context = `${group} ${JSON.stringify(scenario)}\n${result.stdout}${result.stderr}`;
        expect(readFileSync(callsPath, "utf8").trim().split("\n").filter(Boolean), context).toEqual(
          present.map((command) => `run ${command}`),
        );
        expect(result.status, context).toBe(scenario.failed ? 1 : 0);
        expect(result.stdout.match(/^::error .+$/gmu) ?? [], context).toEqual(
          scenario.failed
            ? [`::error title=${scenario.failed} failed::${scenario.failed} failed`]
            : [],
        );
        for (const command of present.filter((entry) => entry !== scenario.failed)) {
          expect(result.stdout, context).toContain(`[ok] ${command}`);
        }
        expect(result.stdout.match(/^\[skip\].+$/gmu) ?? [], context).toHaveLength(
          scenario.missing || scenario.missingFile ? 1 : 0,
        );
      }
    }
  });

  it("groups current source checks and allocates SDK reports only for dispatch", () => {
    const workflow = readCiWorkflow();
    const additionalJob = workflow.jobs["check-additional-shard"];
    expect(additionalJob.strategy.matrix).toBe(
      "${{ fromJSON(needs.preflight.outputs.check_additional_matrix) }}",
    );
    expect(workflow.jobs.preflight.outputs.check_additional_matrix).toBe(
      "${{ steps.manifest.outputs.check_additional_matrix }}",
    );
    const frozenGroups = [
      "boundaries",
      "prompt-snapshots",
      "export-name-collisions",
      "session-accessor-boundary",
      "sqlite-session-schema-baseline",
      "plugin-sdk-api-diff",
      "extension-package-boundary",
      "runtime-topology-architecture",
    ];
    for (const [eventName, frozen] of [
      ["push", false],
      ["pull_request", false],
      ["workflow_dispatch", false],
      ["workflow_dispatch", true],
    ] as const) {
      const manifest = runCiManifestFixture({
        bundledPlanner: true,
        eventName,
        historicalCompatibility: frozen,
        changedPaths: [],
        scopeEnv: {
          OPENCLAW_CI_CHECKOUT_REVISION: "a".repeat(40),
          OPENCLAW_CI_WORKFLOW_REVISION: (frozen ? "b" : "a").repeat(40),
        },
      });
      expect(manifest.status, manifest.output).toBe(0);
      const rows = JSON.parse(
        expectDefined(manifest.outputs.check_additional_matrix, "additional check matrix"),
      ).include;
      const expectedGroups = frozen
        ? frozenGroups
        : [
            "boundaries",
            "prompt-snapshots",
            "source-contracts",
            ...(eventName === "workflow_dispatch" ? ["plugin-sdk-api-diff"] : []),
            "extension-package-boundary",
            "runtime-topology-architecture",
          ];
      expect(rows.map((row: { group: string }) => row.group)).toEqual(expectedGroups);
      expect(manifest.outputs.run_check_additional).toBe("true");
      for (const row of rows) {
        if (row.group === "source-contracts") {
          expect(row).toEqual({
            check_name: "check-source-contracts",
            group: "source-contracts",
            runner: "blacksmith-4vcpu-ubuntu-2404",
          });
        } else {
          expect(readFrozenAdditionalCheckRows()).toContainEqual(row);
        }
      }
    }
    for (const selection of [{ runNode: false }, { nodeFastOnly: true }]) {
      const manifest = runCiManifestFixture({
        bundledPlanner: true,
        eventName: "pull_request",
        changedPaths: [],
        ...selection,
      });
      expect(manifest.status, manifest.output).toBe(0);
      expect(manifest.outputs.run_check_additional).toBe("false");
      expect(
        JSON.parse(
          expectDefined(manifest.outputs.check_additional_matrix, "additional check matrix"),
        ).include,
      ).toEqual([]);
    }

    expect(workflow.jobs.preflight.outputs.diff_head_revision).toBe(
      "${{ steps.diff_base.outputs.head_sha }}",
    );
    const ensureHeadStep = additionalJob.steps.find(
      (step: WorkflowStep) => step.name === "Ensure Plugin SDK API diff head commit",
    );
    expect(ensureHeadStep.with["base-sha"]).toBe(
      "${{ needs.preflight.outputs.diff_head_revision }}",
    );
    expect(ensureHeadStep.with["fetch-ref"]).toContain("refs/pull/{0}/merge");

    for (const revision of ["base", "head"]) {
      const ensureRevisionStep = additionalJob.steps.find(
        (step: WorkflowStep) => step.name === `Ensure Plugin SDK API diff ${revision} commit`,
      );
      for (const [eventName, group, eligible] of [
        ["pull_request", "plugin-sdk-api-diff", false],
        ["push", "plugin-sdk-api-diff", false],
        ["workflow_dispatch", "plugin-sdk-api-diff", true],
        ["workflow_dispatch", "boundaries", false],
      ] as const) {
        expect(
          evaluateWorkflowExpression(`\${{ ${ensureRevisionStep.if} }}`, {
            eventName,
            matrix: { group },
            repository: "openclaw/openclaw",
            runAttempt: 1,
          }),
          `${revision} preparation for ${eventName}/${group}`,
        ).toBe(eligible);
      }
    }

    const runStep = additionalJob.steps.find(
      (step: WorkflowStep) => step.name === "Run additional check shard",
    );
    expect(runStep.run).toContain("plugin-sdk-api-diff)");
    expect(runStep.run).toContain('run_check "plugin-sdk:api:diff" pnpm run plugin-sdk:api:diff');
    expect(runStep.run).toContain('--base "${{ needs.preflight.outputs.diff_base_revision }}"');
    expect(runStep.run).toContain('--head "${{ needs.preflight.outputs.diff_head_revision }}"');
    expect(runStep.run).not.toContain('--head "${{ needs.preflight.outputs.checkout_revision }}"');
  });

  it("uses the current SDK diff and preserves the historical baseline check", () => {
    const workflow = readCiWorkflow();
    const runStep = workflow.jobs["check-additional-shard"].steps.find(
      (step: WorkflowStep) => step.name === "Run additional check shard",
    );
    const runCase = (
      scripts: Record<string, string>,
      compatibilityTarget: boolean,
      eventName = "workflow_dispatch",
      fail = false,
    ) => {
      const root = tempDirs.make("openclaw-plugin-sdk-api-workflow-");
      const binDir = path.join(root, "bin");
      const callsPath = path.join(root, "pnpm-calls.txt");
      const summaryPath = path.join(root, "summary.md");
      mkdirSync(binDir);
      writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts }), "utf8");
      const pnpmPath = path.join(binDir, "pnpm");
      writeFileSync(
        pnpmPath,
        '#!/usr/bin/env bash\nset -euo pipefail\nprintf \'%s\\n\' "$*" >> "$PNPM_CALLS"\nexit "$PNPM_RESULT"\n',
        "utf8",
      );
      chmodSync(pnpmPath, 0o755);
      const script = runStep.run
        .replaceAll("${{ needs.preflight.outputs.diff_base_revision }}", "base-sha")
        .replaceAll("${{ needs.preflight.outputs.diff_head_revision }}", "synthetic-head-sha");
      const result = runWorkflowShellScript(script, {
        cwd: root,
        env: {
          ...process.env,
          ADDITIONAL_CHECK_GROUP: "plugin-sdk-api-diff",
          COMPATIBILITY_TARGET: compatibilityTarget ? "true" : "false",
          GITHUB_EVENT_NAME: eventName,
          GITHUB_STEP_SUMMARY: summaryPath,
          PATH: `${binDir}:${process.env.PATH ?? ""}`,
          PNPM_CALLS: callsPath,
          PNPM_RESULT: fail ? "1" : "0",
          RUN_PROMPT_SNAPSHOTS: "false",
        },
      });
      return {
        calls: existsSync(callsPath) ? readFileSync(callsPath, "utf8").trim().split("\n") : [],
        result,
        summaryPath,
      };
    };

    // Pure reporting: pushes and PRs skip the diff; dispatches (including
    // release validation) still produce it.
    for (const eventName of ["push", "pull_request"]) {
      const skipped = runCase({ "plugin-sdk:api:diff": "mock" }, false, eventName);
      expect(skipped.result.status, skipped.result.stderr).toBe(0);
      expect(skipped.calls).toEqual([]);
      expect(skipped.result.stdout).toContain("manual and release dispatches only");
    }

    const current = runCase({ "plugin-sdk:api:diff": "mock" }, false);
    expect(current.result.status, current.result.stderr).toBe(0);
    expect(current.calls).toEqual([
      "run plugin-sdk:api:diff -- --base base-sha --head synthetic-head-sha --json .artifacts/plugin-sdk-api-diff.json --summary " +
        current.summaryPath,
    ]);

    const failed = runCase({ "plugin-sdk:api:diff": "mock" }, false, "workflow_dispatch", true);
    expect(failed.result.status, failed.result.stderr).toBe(1);
    expect(failed.calls).toHaveLength(1);
    expect(failed.result.stdout).toContain(
      "::error title=plugin-sdk:api:diff failed::plugin-sdk:api:diff failed",
    );

    const historical = runCase({ "plugin-sdk:api:check": "mock" }, true);
    expect(historical.result.status, historical.result.stderr).toBe(0);
    expect(historical.calls).toEqual(["run plugin-sdk:api:check"]);

    const missingCurrent = runCase({ "plugin-sdk:api:check": "mock" }, false);
    expect(missingCurrent.result.status).toBe(1);
    expect(missingCurrent.calls).toEqual([]);
    expect(missingCurrent.result.stdout).toContain(
      "Current CI targets must provide plugin-sdk:api:diff.",
    );
  });

  it("owns Docs Agent Git without changing cadence, deadlines, or action authority", () => {
    const source = readFileSync(".github/workflows/docs-agent.yml", "utf8");
    const workflow = parse(source);
    const job = workflow.jobs["update-docs"];
    const steps = job.steps as WorkflowStep[];
    expect(steps.map(({ name }) => name)).toEqual([
      "Checkout",
      "Prepare Git owner",
      "Gate trusted main activity and hourly cadence",
      "Setup Node environment",
      "Ensure docs agent key exists",
      "Run Codex docs agent",
      "Enforce existing-docs-only patch",
      "Restore Node 24 path",
      "Check docs",
      "Commit docs updates",
    ]);
    expect(steps[1]).toEqual({
      name: "Prepare Git owner",
      uses: "openclaw/openclaw/.github/actions/git-owner@dd4528b6393e7d00063067a080ca7241b48ce475",
    });
    expect(steps[0]).toMatchObject({
      uses: CHECKOUT_V6,
      with: {
        ref: "main",
        "fetch-depth": 0,
        "persist-credentials": false,
        submodules: false,
      },
    });
    expect(job["timeout-minutes"]).toBe(30);
    expect(workflow.permissions).toEqual({ actions: "read", contents: "write" });
    expect(workflow.concurrency).toEqual({ group: "docs-agent-main", "cancel-in-progress": false });
    expect(steps[5]).toEqual({
      name: "Run Codex docs agent",
      if: "steps.gate.outputs.run_agent == 'true'",
      uses: "openai/codex-action@52fe01ec70a42f454c9d2ebd47598f9fd6893d56",
      env: {
        DOCS_AGENT_BASE_SHA: "${{ steps.gate.outputs.review_base_sha }}",
        DOCS_AGENT_HEAD_SHA: "${{ steps.gate.outputs.review_head_sha }}",
      },
      with: {
        "openai-api-key":
          "${{ secrets.OPENCLAW_DOCS_AGENT_OPENAI_API_KEY || secrets.OPENAI_API_KEY }}",
        "prompt-file": ".github/codex/prompts/docs-agent.md",
        model: "${{ vars.OPENCLAW_CI_OPENAI_MODEL_BARE }}",
        effort: "medium",
        sandbox: "workspace-write",
        "safety-strategy": "drop-sudo",
        "codex-args": '["--full-auto"]',
      },
    });
    const gate = expectDefined(steps[2]?.run, "gate policy");
    const commit = expectDefined(steps[9]?.run, "commit policy");
    const enforce = expectDefined(steps[6]?.run, "enforcement producers");
    expect(gate.match(/python3 -I -S "\$CI_GIT_OWNER" --policy -/gu)).toHaveLength(2);
    expect(gate.indexOf("--policy -")).toBeLessThan(gate.indexOf("gh api"));
    expect(gate.lastIndexOf("--policy -")).toBeGreaterThan(gate.indexOf("gh api"));
    expect(commit).toContain('exec python3 -I -S "$CI_GIT_OWNER" --policy -');
    for (const policy of [gate, commit]) {
      expect(policy.match(/for attempt in range\(1, 6\):/gu)).toHaveLength(1);
      expect(policy).toContain("except (GitFailure, FetchTimeout):");
      expect(policy).not.toMatch(
        /except (?:Exception|BaseException)|except:|error\.code|\$\?|\|\| true/u,
      );
    }
    expect(gate).toContain(
      'if attempt == 5:\n            print("Failed to fetch main after retries.", file=sys.stderr)\n            raise SystemExit(1)',
    );
    expect(gate.match(/backoff\(attempt \* 2\)/gu)).toHaveLength(1);
    expect(commit.match(/backoff\(attempt \* 2\)/gu)).toHaveLength(2);
    const calls = [
      ...`${gate}\n${commit}`.matchAll(/(?:run_git|git_output)\(([\s\S]*?)\)(?=\.rstrip|\n|$)/gu),
    ].map((match) => match[1]!);
    const fetches = calls.filter((call) => call.startsWith('workspace, "fetch"'));
    expect(fetches).toEqual([
      'workspace, "fetch", "--no-tags", "origin", "main", timeout=120, reclaim_locks=True',
      'workspace, "fetch", "--no-tags", "origin", target, timeout=120, reclaim_locks=True',
    ]);
    expect(calls.filter((call) => call.includes("timeout="))).toEqual(fetches);
    expect(enforce.match(/--checkout-git 0 (?:ls-files|diff)/gu)).toHaveLength(5);
    expect(`${gate}\n${commit}\n${enforce}`).not.toMatch(
      /\btimeout --|\bgit (?:fetch|rev-parse|cat-file|diff|ls-files|config|add|commit|push)\b/u,
    );
    // The corrected REST cadence contract is deliberately byte-stable across Git migration.
    const cadence = source.slice(
      source.indexOf("          runs_json="),
      source.indexOf('          python3 -I -S "$CI_GIT_OWNER" --policy - "$remote_main"'),
    );
    expect(createHash("sha256").update(cadence).digest("hex")).toBe(
      "f130607e377acff6983fc2efaa015025ae2865d340dfad1fb865ee61e081f83e",
    );
  });

  it("owns docs mirror Git lifecycle without changing transport or stale-source policy", () => {
    const source = readFileSync(".github/workflows/docs-sync-publish.yml", "utf8");
    const workflow = parse(source);
    const steps = workflow.jobs["sync-publish-repo"].steps as WorkflowStep[];
    expect(steps.map(({ name }) => name)).toEqual([
      "Skip publish sync without token",
      "Checkout source repo",
      "Checkout ClawHub docs source",
      "Prepare Git owner",
      "Setup Node",
      "Clone publish repo",
      "Sync docs into publish repo",
      "Cache successful docs validation",
      "Commit publish repo sync",
    ]);
    expect(steps[3]).toEqual({
      name: "Prepare Git owner",
      if: "env.OPENCLAW_DOCS_SYNC_TOKEN != ''",
      uses: "openclaw/openclaw/.github/actions/git-owner@dd4528b6393e7d00063067a080ca7241b48ce475",
    });
    expect(steps[1]).toMatchObject({ with: { "fetch-depth": 0 } });
    expect(steps[2]).toMatchObject({
      with: {
        repository: "openclaw/clawhub",
        ref: "main",
        path: "clawhub-source",
        "fetch-depth": 1,
        "persist-credentials": false,
      },
    });
    for (const step of steps.slice(1)) {
      expect(step.if).toBe(
        step.name === "Cache successful docs validation"
          ? "env.OPENCLAW_DOCS_SYNC_TOKEN != '' && github.repository == 'openclaw/openclaw' && github.ref == 'refs/heads/main'"
          : "env.OPENCLAW_DOCS_SYNC_TOKEN != ''",
      );
    }
    expect(source).not.toContain("setup-python");
    expect(workflow.concurrency).toEqual({
      group:
        "docs-sync-publish-${{ github.event_name == 'workflow_dispatch' && format('manual-{0}', github.run_id) || github.ref }}",
      "cancel-in-progress": false,
    });
    const clone = expectDefined(steps[5]?.run, "clone policy");
    const sync = expectDefined(steps[6]?.run, "sync body");
    const publish = expectDefined(steps[8]?.run, "publication policy");
    expect(steps[8]?.["working-directory"]).toBe("publish");
    for (const policy of [clone, publish]) {
      expect(
        policy.startsWith(
          "set -euo pipefail\nexec python3 -I -S \"$CI_GIT_OWNER\" --policy - <<'PYTHON'\n",
        ),
      ).toBe(true);
      expect(policy.match(/for attempt in range\(1, 6\):/gu)).toHaveLength(1);
      expect(policy.match(/backoff\(attempt \* 2\)/gu)).toHaveLength(1);
      expect(policy).toContain("except (GitFailure, FetchTimeout):");
      expect(policy).not.toMatch(
        /except (?:Exception|BaseException)|except:|error\.code|\$\?|\|\| true/u,
      );
    }
    expect(clone).toContain('publish = os.path.join(workspace, "publish")');
    expect(clone).toContain('subprocess.run(["rm", "-rf", publish], check=True)');
    expect(clone).toContain(
      "https://x-access-token:{os.environ['OPENCLAW_DOCS_SYNC_TOKEN']}@github.com/openclaw/docs.git",
    );
    const calls = [...`${clone}\n${publish}`.matchAll(/run_git\(([\s\S]*?)\)(?=\n|$)/gu)].map(
      (match) => match[1]!,
    );
    const transports = calls.filter((call) => /^\w+, "(?:clone|fetch)"/u.test(call));
    expect(transports).toHaveLength(3);
    expect(transports.every((call) => call.includes("timeout=120"))).toBe(true);
    expect(transports.slice(1)).toEqual(
      Array(2).fill(
        'publish, "fetch", "origin", "main:refs/remotes/origin/main", timeout=120, reclaim_locks=True',
      ),
    );
    expect(calls.filter((call) => call.includes("timeout="))).toEqual(transports);
    expect(calls.filter((call) => /^publish, "(?:rebase|push)"/u.test(call))).toHaveLength(3);
    expect(
      calls
        .filter((call) => /^publish, "(?:config|add|commit|rebase|push)"/u.test(call))
        .every((call) => call.includes("reclaim_locks=True")),
    ).toBe(true);
    expect(publish).toContain("if not current_source_sha or current_source_sha == source_sha:");
    expect(publish).toContain(
      'run_git(workspace, "merge-base", "--is-ancestor", source_sha, current_source_sha)',
    );
    expect(publish).toContain("except (GitFailure, json.JSONDecodeError):");
    expect(sync.startsWith("set -euo pipefail\n")).toBe(true);
    expect(sync).toContain(
      'clawhub_sha="$(cd "$GITHUB_WORKSPACE/clawhub-source" && python3 -I -S "$CI_GIT_OWNER" --checkout-git 0 rev-parse HEAD)"\nnode scripts/docs-sync-publish.mjs',
    );
    expect([clone, sync, publish].join("\n")).not.toMatch(
      /\btimeout --|\bgit (?:clone|fetch|show|merge-base|diff|config|add|commit|rebase|push|rev-parse)\b|--depth|--no-tags/u,
    );
  });

  it("checks the generated Git owner in the workflow guard lane", () => {
    const check = spawnSync(process.execPath, ["scripts/generate-ci-git-owner.mts", "--check"], {
      encoding: "utf8",
    });
    expect(check.status, check.stderr).toBe(0);
  });

  it("uses the maintained authenticated checkout for security-fast", () => {
    const workflow = readCiWorkflow();
    const checkoutStep = workflow.jobs["security-fast"].steps.find(
      (step: WorkflowStep) => step.name === "Checkout",
    );
    const manualCheckoutStep = workflow.jobs["security-fast"].steps.find(
      (step: WorkflowStep) => step.name === "Checkout manual target",
    );

    expect(checkoutStep.uses).toBe(CHECKOUT_V6);
    expect(checkoutStep.if).toBe(
      "github.event_name != 'workflow_dispatch' || inputs.target_ref == ''",
    );
    expect(checkoutStep.with["persist-credentials"]).toBe(false);
    expect(checkoutStep.with["fetch-depth"]).toBe(2);
    expect(manualCheckoutStep.if).toBe(
      "github.event_name == 'workflow_dispatch' && inputs.target_ref != ''",
    );
    expect(manualCheckoutStep.run).toContain("workflow_dispatch target_ref");
  });

  it("uses native preflight tooling unless a dispatch selects a different revision", () => {
    const workflow = readCiWorkflow();
    const steps = workflow.jobs.preflight.steps as WorkflowStep[];
    const setupPnpm = expectDefined(
      steps.find((step) => step.name === "Setup manifest pnpm"),
      "manifest pnpm setup",
    );
    const installDependencies = expectDefined(
      steps.find((step) => step.name === "Install manifest dependencies"),
      "manifest dependency install",
    );
    const buildManifest = expectDefined(
      steps.find((step) => step.name === "Build CI manifest"),
      "manifest builder",
    );
    const checkProtocolCoverage = expectDefined(
      steps.find((step) => step.name === "Check mobile protocol event coverage"),
      "protocol coverage owner",
    );
    const workflowSha = "a".repeat(40);
    const otherSha = "b".repeat(40);
    const cases = [
      ["same-revision dispatch", "workflow_dispatch", workflowSha, "", false, false],
      [
        "same-revision explicit target dispatch",
        "workflow_dispatch",
        workflowSha,
        workflowSha,
        false,
        false,
      ],
      ["same-revision release gate", "workflow_dispatch", workflowSha, workflowSha, true, false],
      ["push", "push", otherSha, "", false, false],
      ["pull request", "pull_request", otherSha, "", false, false],
      ["different-revision dispatch", "workflow_dispatch", otherSha, otherSha, false, true],
      ["different-revision release gate", "workflow_dispatch", otherSha, otherSha, true, true],
    ] as const;

    for (const [
      label,
      eventName,
      checkoutRevision,
      targetRef,
      releaseGate,
      usesCompatibilityTooling,
    ] of cases) {
      const context = {
        eventName,
        releaseGate,
        repository: "openclaw/openclaw",
        runAttempt: 1,
        steps: { checkout_ref: { outputs: { sha: checkoutRevision } } },
        targetRef,
        workflowSha,
      };
      const evaluateStep = (step: WorkflowStep) =>
        evaluateWorkflowExpression(`\${{ ${step.if} }}`, context);
      expect([evaluateStep(setupPnpm), evaluateStep(installDependencies)], label).toEqual([
        usesCompatibilityTooling,
        usesCompatibilityTooling,
      ]);
      const invocationOptions = (step: WorkflowStep) => ({
        checkoutRevision: String(
          evaluateWorkflowExpression(step.env?.OPENCLAW_CI_CHECKOUT_REVISION, context),
        ),
        eventName,
        workflowRevision: String(
          evaluateWorkflowExpression(step.env?.OPENCLAW_CI_WORKFLOW_REVISION, context),
        ),
      });
      expect(
        runPreflightNodeInvocation(
          expectDefined(buildManifest.run, "manifest script"),
          invocationOptions(buildManifest),
        ),
        label,
      ).toEqual(
        usesCompatibilityTooling
          ? ["--import", "tsx", "--input-type=module"]
          : ["--input-type=module"],
      );
      expect(
        runPreflightNodeInvocation(
          expectDefined(checkProtocolCoverage.run, "protocol coverage script"),
          invocationOptions(checkProtocolCoverage),
        ),
        label,
      ).toEqual([
        usesCompatibilityTooling
          ? "scripts/check-protocol-event-coverage.mjs"
          : "scripts/check-protocol-event-coverage.mts",
      ]);
    }
  });

  it("keeps manual candidates separate from trusted cache authority", () => {
    const workflow = readCiWorkflow();
    const preflight = workflow.jobs.preflight;
    const checkoutStep = expectDefined(
      preflight.steps.find((step: WorkflowStep) => step.name === "Checkout"),
      "preflight checkout owner",
    );
    expect(checkoutStep.env?.WORKFLOW_SHA).toBe("${{ github.workflow_sha }}");
    const harnessSteps = preflight.steps.filter(
      (step: WorkflowStep) =>
        step.uses?.startsWith("actions/checkout@") && step.with?.path === ".ci-harness",
    );
    expect(harnessSteps).toHaveLength(1);
    const harnessStep = expectDefined(harnessSteps[0], "different-revision harness checkout");
    expect(harnessStep).toMatchObject({
      uses: CHECKOUT_V6,
      with: {
        ref: "${{ github.workflow_sha }}",
        path: ".ci-harness",
        "sparse-checkout":
          "/.github/actions/\n/scripts/lib/release-context.mjs\n/scripts/lib/release-version.mjs\n",
        "sparse-checkout-cone-mode": false,
        "persist-credentials": false,
      },
    });
    const resolvedIndex = preflight.steps.findIndex(
      (step: WorkflowStep) => step.id === "checkout_ref",
    );
    const harnessIndex = preflight.steps.indexOf(harnessStep);
    const consumerIndex = preflight.steps.findIndex((step: WorkflowStep) =>
      step.uses?.startsWith("./.ci-harness/"),
    );
    expect(preflight.steps.indexOf(checkoutStep)).toBeLessThan(resolvedIndex);
    expect(resolvedIndex).toBeLessThan(harnessIndex);
    expect(harnessIndex).toBeLessThan(consumerIndex);
    const workflowSha = "a".repeat(40);
    for (const eventName of ["push", "pull_request", "workflow_dispatch"] as const) {
      for (const headRepository of ["openclaw/openclaw", "contributor/openclaw"]) {
        for (const selectedSha of [workflowSha, "b".repeat(40)]) {
          expect(
            evaluateWorkflowExpression(harnessStep.if, {
              eventName,
              headRepository,
              repository: "openclaw/openclaw",
              runAttempt: 1,
              steps: { checkout_ref: { outputs: { sha: selectedSha } } },
              workflowSha,
            }),
          ).toBe(selectedSha !== workflowSha);
        }
      }
    }
    const trustStep = expectDefined(
      preflight.steps.find((step: WorkflowStep) => step.name === "Classify candidate cache trust"),
      "candidate cache trust step",
    );

    expect(preflight.outputs).toMatchObject({
      candidate_trust: "${{ steps.candidate_trust.outputs.trust }}",
      cache_mode: "${{ steps.candidate_trust.outputs.cache_mode }}",
      cache_write_allowed: "${{ steps.candidate_trust.outputs.cache_write_allowed }}",
    });
    expect(trustStep.env).toMatchObject({
      CHECKOUT_REVISION: "${{ steps.checkout_ref.outputs.sha }}",
      DEFAULT_SHA: "${{ steps.diff_base.outputs.default_sha }}",
      TARGET_REF: "${{ inputs.target_ref }}",
      WORKFLOW_REVISION: "${{ github.workflow_sha }}",
    });
    expect(trustStep.run).toContain("trust=untrusted");
    expect(trustStep.run).toContain("cache_mode=off");
    expect(trustStep.run).toContain("cache_write_allowed=false");
    expect(trustStep.run).toContain('elif [[ "$GITHUB_EVENT_NAME" == "workflow_dispatch" ]]');
    expect(trustStep.run).toContain('"$RELEASE_GATE" == "true"');
    expect(trustStep.run).toContain('"$CHECKOUT_REVISION" == "$DEFAULT_SHA"');
    expect(trustStep.run).toContain('"$CHECKOUT_REVISION" == "$WORKFLOW_REVISION"');
    expect(trustStep.run).toContain("cache_write_allowed=true");

    const ciLocalActions = Object.values(workflow.jobs).flatMap(
      (job) =>
        (job as { steps?: WorkflowStep[] }).steps?.filter((step) =>
          step.uses?.includes("/.github/actions/"),
        ) ?? [],
    );
    expect(ciLocalActions.length).toBeGreaterThan(0);
    for (const step of ciLocalActions) {
      expect(step.uses, step.name).toContain("./.ci-harness/.github/actions/");
    }

    for (const [jobName, job] of Object.entries(workflow.jobs)) {
      for (const step of (job as { steps?: WorkflowStep[] }).steps ?? []) {
        if (step.uses?.startsWith("actions/cache/restore@")) {
          expect(String(step.if), `${jobName}: ${step.name}`).toContain(
            "preflight.outputs.cache_mode != 'off'",
          );
        }
        if (step.uses?.startsWith("actions/cache/save@")) {
          expect(String(step.if), `${jobName}: ${step.name}`).toContain(
            "preflight.outputs.cache_write_allowed == 'true'",
          );
        }
      }
    }

    const goSetup = expectDefined(
      workflow.jobs["checks-node-core-test-nondist-shard"].steps.find(
        (step: WorkflowStep) => step.name === "Setup Go for docs i18n",
      ),
      "docs i18n Go setup",
    );
    expect(goSetup.with?.cache).toBe(false);
  });

  it("classifies cache write authority from proven candidate identity", () => {
    const workflowRevision = "a".repeat(40);
    const defaultRevision = "b".repeat(40);
    const arbitraryRevision = "c".repeat(40);
    const cases = [
      {
        expected: { cache_mode: "off", cache_write_allowed: "false", trust: "untrusted" },
        options: {
          checkoutRevision: arbitraryRevision,
          eventName: "workflow_dispatch" as const,
          targetRef: arbitraryRevision,
          workflowRevision,
        },
      },
      {
        expected: { cache_mode: "restore", cache_write_allowed: "false", trust: "workflow" },
        options: {
          checkoutRevision: workflowRevision,
          eventName: "workflow_dispatch" as const,
          workflowRevision,
        },
      },
      {
        expected: { cache_mode: "restore", cache_write_allowed: "true", trust: "main" },
        options: {
          checkoutRevision: defaultRevision,
          defaultRevision,
          eventName: "workflow_dispatch" as const,
          targetRef: defaultRevision,
          workflowRevision,
        },
      },
      {
        expected: { cache_mode: "restore", cache_write_allowed: "true", trust: "release" },
        options: {
          checkoutRevision: arbitraryRevision,
          eventName: "workflow_dispatch" as const,
          targetContextTarget: true,
          targetRef: arbitraryRevision,
          workflowRevision,
        },
      },
      {
        expected: {
          cache_mode: "restore",
          cache_write_allowed: "false",
          trust: "pull-request",
        },
        options: {
          checkoutRevision: arbitraryRevision,
          eventName: "workflow_dispatch" as const,
          releaseGate: true,
          targetRef: arbitraryRevision,
          workflowRevision,
        },
      },
      {
        expected: {
          cache_mode: "restore",
          cache_write_allowed: "false",
          trust: "pull-request",
        },
        options: {
          checkoutRevision: arbitraryRevision,
          eventName: "pull_request" as const,
          workflowRevision,
        },
      },
      {
        expected: { cache_mode: "restore", cache_write_allowed: "true", trust: "main" },
        options: {
          checkoutRevision: defaultRevision,
          eventName: "push" as const,
          ref: "refs/heads/main",
          workflowRevision,
        },
      },
    ];

    for (const testCase of cases) {
      const result = runCandidateTrustClassification(testCase.options);
      expect(result.status, result.output).toBe(0);
      expect(result.outputs).toMatchObject(testCase.expected);
    }
  });

  it("uses the maintained checkout across workflow sanity jobs", () => {
    const workflow = readWorkflowSanityWorkflow();

    for (const jobName of ["no-tabs", "actionlint", "generated-doc-baselines"]) {
      const checkoutStep = workflow.jobs[jobName].steps.find(
        (step: WorkflowStep) => step.name === "Checkout",
      );

      expect(checkoutStep.uses, jobName).toBe(CHECKOUT_V6);
      expect(checkoutStep.with, jobName).toEqual({
        "fetch-depth": 1,
        "persist-credentials": false,
      });
    }
  });

  it("pins workflow sanity's typed Git policy after Python setup", () => {
    const steps: WorkflowStep[] = readWorkflowSanityWorkflow().jobs.actionlint.steps;
    const python = expectDefined(
      steps.find((step) => step.name === "Setup Python"),
      "Python",
    );
    const owner = expectDefined(
      steps.find((step) => step.name === "Prepare Git owner"),
      "owner",
    );
    const policy = expectDefined(
      steps.find((step) => step.name === "Prepare trusted workflow audit configs"),
      "policy",
    );
    expect(python.with).toEqual({ "python-version": "3.12" });
    expect(owner.uses).toBe(
      "openclaw/openclaw/.github/actions/git-owner@dd4528b6393e7d00063067a080ca7241b48ce475",
    );
    expect(owner.with).toBeUndefined();
    expect(steps.indexOf(python)).toBeLessThan(steps.indexOf(owner));
    expect(steps.indexOf(owner)).toBeLessThan(steps.indexOf(policy));
    expect(policy.if).toBe("github.event_name == 'pull_request'");
    expect(policy.env).toEqual({
      BASE_REF: "${{ github.event.pull_request.base.ref }}",
      BASE_SHA: "${{ github.event.pull_request.base.sha }}",
    });
    expect(policy.run).toContain("exec python3 -I -S \"$CI_GIT_OWNER\" --policy - <<'PYTHON'");
    expect(policy.run).not.toMatch(
      /timeout --|fetch_status|fetch_base_ref|sleep 5|subprocess\.PIPE|except (?:Exception|BaseException|SystemExit|RuntimeError)/u,
    );
    expect(policy.run?.match(/timeout=\d+/gu)).toEqual(["timeout=30"]);
    expect(policy.run).toContain("range(1, 4)");
    expect(policy.run).toContain("backoff(5)");
    for (const contract of [
      "--no-tags",
      "--depth=1",
      "reclaim_locks=True",
      "refs/remotes/origin/security-base",
      "refs/heads/",
      ".pre-commit-config.yaml",
      ".github/zizmor.yml",
      "pre-commit-base.yaml",
      "zizmor-base.yml",
      "PRE_COMMIT_CONFIG_PATH=",
    ]) {
      expect(policy.run).toContain(contract);
    }
    const audit = expectDefined(
      steps.find((step) => step.name === "Audit all workflows with zizmor"),
      "audit",
    );
    expect(audit.run).toContain(
      'pre-commit run --config "${PRE_COMMIT_CONFIG_PATH:-.pre-commit-config.yaml}" zizmor',
    );
  });

  it("bounds the workflow sanity ShellCheck download", () => {
    const workflow = readWorkflowSanityWorkflow();
    const shellcheckStep = expectDefined(
      workflow.jobs.actionlint.steps.find(
        (step: WorkflowStep) => step.name === "Install ShellCheck",
      ),
      "ShellCheck install step",
    );
    expect(shellcheckStep.run).toContain("curl --connect-timeout 10 --max-time 120");
    expect(shellcheckStep.run).toContain("--retry 5 --retry-delay 2 --retry-all-errors");
  });

  it("pins workflow and pre-commit actionlint to the large-stdin deadlock fix", () => {
    const revision = "011a6d15e749bb3f2d771eed9c7aa0e7e3e10ee7";
    const steps: WorkflowStep[] = readWorkflowSanityWorkflow().jobs.actionlint.steps;
    const setupGo = expectDefined(
      steps.find((step) => step.uses === SETUP_GO_V6),
      "Go setup",
    );
    const install = expectDefined(
      steps.find((step) => step.name === "Install actionlint"),
      "actionlint install",
    );

    expect(setupGo.with).toEqual({ "go-version": "1.25.0", cache: false });
    expect(steps.indexOf(setupGo)).toBeLessThan(steps.indexOf(install));
    expect(install.run).toContain(`ACTIONLINT_REVISION="${revision}"`);
    expect(install.run).toContain('export GOBIN="$RUNNER_TEMP/actionlint-bin"');
    expect(install.run).toContain(
      'go install "github.com/rhysd/actionlint/cmd/actionlint@${ACTIONLINT_REVISION}"',
    );
    expect(install.run).toContain('"$GOBIN/actionlint" -version');
    expect(install.run).toContain("v1.7.13-0.20260419144658-${ACTIONLINT_REVISION:0:12}");
    expect(install.run).toContain('echo "$GOBIN" >> "$GITHUB_PATH"');
    const preCommit = parse(readFileSync(".pre-commit-config.yaml", "utf8"));
    expect(
      preCommit.repos.find(
        (repo: { repo: string }) => repo.repo === "https://github.com/rhysd/actionlint",
      ).rev,
    ).toBe(revision);
  });

  it("runs committed generated baseline drift checks in workflow sanity", () => {
    const workflow = readWorkflowSanityWorkflow();
    const steps = workflow.jobs["generated-doc-baselines"].steps;
    const stepNames = steps.map((step: WorkflowStep) => step.name);

    expect(stepNames).toContain("Check SQLite sessions/transcripts schema baseline drift");
    expect(stepNames).toContain("Check plugin SDK surface budget");
    expect(
      stepNames.indexOf("Check SQLite sessions/transcripts schema baseline drift"),
    ).toBeLessThan(stepNames.indexOf("Check plugin SDK surface budget"));
    expect(
      steps.find(
        (step: WorkflowStep) =>
          step.name === "Check SQLite sessions/transcripts schema baseline drift",
      ).run,
    ).toBe("pnpm sqlite:sessions-schema:check");
    expect(
      steps.find((step: WorkflowStep) => step.name === "Check plugin SDK surface budget").run,
    ).toBe("pnpm plugin-sdk:surface:check");
  });

  it("shares checkout ownership across Linux and native platforms with their existing budgets", () => {
    const source = readFileSync(".github/workflows/ci.yml", "utf8");
    const workflow = readCiWorkflow();

    expect(source.match(/&platform_checkout_step/gu) ?? []).toHaveLength(1);
    expect(source.match(/\*platform_checkout_step/gu) ?? []).toHaveLength(1);
    expect(source.match(/&owned_checkout_run/gu) ?? []).toHaveLength(1);
    const linuxCheckout = workflow.jobs["checks-fast-core"].steps.find(
      (step: WorkflowStep) => step.name === "Checkout",
    );
    for (const runner of ["Linux", "macOS", "Windows"]) {
      const defaults = spawnSync(
        process.platform === "win32" ? "python" : "python3",
        [
          "-I",
          "-S",
          "-c",
          'import json,runpy; owner=runpy.run_path(".github/actions/git-owner/owner.py"); print(json.dumps([owner["fetch_timeout_seconds"], owner["cleanup_seconds"]]))',
        ],
        { encoding: "utf8", env: { ...process.env, RUNNER_OS: runner } },
      );
      expect(defaults.status, defaults.stderr).toBe(0);
      expect(JSON.parse(defaults.stdout)).toEqual([runner === "Linux" ? 120 : 90, 10]);
    }

    for (const jobName of ["checks-windows", "macos-node"]) {
      const checkoutStep = workflow.jobs[jobName].steps.find(
        (step: WorkflowStep) => step.name === "Checkout",
      );

      expect(checkoutStep.run, jobName).toBe(linuxCheckout.run);
      expect(checkoutStep.env, jobName).toEqual(linuxCheckout.env);
      // Bootstrap cannot load Python startup code from the candidate checkout.
      expect(checkoutStep.run, jobName).toContain('exec "$python_command" -I -S -');
    }

    const macosNodeSetup = workflow.jobs["macos-node"].steps.find(
      (step: WorkflowStep) => step.name === "Setup Node environment",
    );
    expect(macosNodeSetup.with).toMatchObject({
      "cache-mode": "${{ needs.preflight.outputs.cache_mode }}",
      "install-bun": "false",
    });
  });

  it("runs dependency policy guards in PR CI preflight", () => {
    const parsedWorkflow = readCiWorkflow();
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    const preflightGuards = workflow.slice(
      workflow.indexOf("guards)"),
      workflow.indexOf("npm-lock)"),
    );
    const npmLockGuards = workflow.slice(
      workflow.indexOf("npm-lock)"),
      workflow.indexOf("prod-types)"),
    );

    expect(workflow).toContain("check-guards");
    expect(workflow).toContain("check-npm-lock");
    expect(preflightGuards).toContain('has_package_script "check:doctor-deprecation-registry"');
    expect(preflightGuards).toContain("pnpm check:doctor-deprecation-registry");
    expect(preflightGuards).toContain(
      "[skip] frozen target predates the wall-clock doctor deprecation registry guard",
    );
    expect(preflightGuards).toContain(
      "Current CI targets must provide the check:doctor-deprecation-registry package script.",
    );
    expect(preflightGuards.indexOf('elif [[ "$FROZEN_TARGET" == "true" ]]')).toBeGreaterThan(
      preflightGuards.indexOf("pnpm check:doctor-deprecation-registry"),
    );
    const checkShard = parsedWorkflow.jobs["check-shard"].steps.find(
      (step: WorkflowStep) => step.name === "Run check shard",
    );
    expect(checkShard.env.FROZEN_TARGET).toBe("${{ needs.preflight.outputs.frozen_target }}");
    expect(parsedWorkflow.jobs.preflight.outputs.frozen_target).toBe(
      "${{ steps.manifest.outputs.frozen_target }}",
    );
    expect(preflightGuards).toContain(
      'if [[ "$FROZEN_TARGET" == "true" ]]; then\n' +
        "                pnpm dup:check:coverage\n" +
        "              else\n" +
        "                pnpm dup:check\n" +
        "              fi",
    );
    expect(npmLockGuards).toContain("pnpm deps:npm-lock:check");
    expect(preflightGuards).toContain("pnpm deps:patches:check");
    expect(preflightGuards).toContain('has_package_script "check:coercion-helpers"');
    expect(preflightGuards).toContain("pnpm check:coercion-helpers");
    expect(preflightGuards).toContain(
      "[skip] historical target predates the coercion-helper declaration guard",
    );
    expect(preflightGuards).toContain(
      "Current CI targets must provide the check:coercion-helpers package script.",
    );
    expect(parsedWorkflow.jobs.preflight.outputs.diff_base_revision).toBe(
      "${{ steps.diff_base.outputs.sha }}",
    );
    const diffBaseStep = parsedWorkflow.jobs.preflight.steps.find(
      (step: WorkflowStep) => step.name === "Resolve exact diff base",
    );
    expect(diffBaseStep.run).toContain("--prefer-first-parent");
    expect(diffBaseStep.env.DEFAULT_BRANCH).toBe("${{ github.event.repository.default_branch }}");
    expect(diffBaseStep.env.GH_TOKEN).toBe(
      "${{ github.event_name == 'workflow_dispatch' && !inputs.release_gate && github.token || '' }}",
    );
    expect(diffBaseStep.run).toContain(
      '"repos/${GITHUB_REPOSITORY}/compare/${default_sha}...${head_sha}"',
    );
    expect(diffBaseStep.run).toContain("Could not resolve an exact diff base");
    expect(diffBaseStep.run).toContain(AMBIGUOUS_MAIN_PUSH_GUARD);
    const securityDiffBase = parsedWorkflow.jobs["security-fast"].steps.find(
      (step: WorkflowStep) => step.name === "Resolve security diff base",
    ).run;
    expect(securityDiffBase).toContain("git rev-list --parents -n 1 HEAD");
    expect(securityDiffBase).not.toContain("node scripts/lib/merge-head-diff-base.mjs");
    expect(securityDiffBase).toContain(AMBIGUOUS_MAIN_PUSH_GUARD);
    const checkShardStep = parsedWorkflow.jobs["check-shard"].steps.find(
      (step: WorkflowStep) => step.name === "Run check shard",
    );
    expect(checkShardStep.run).not.toContain("--checkout-git");
    expect(checkShardStep.run).toContain(
      'test "$(git rev-parse refs/remotes/origin/ci-ratchet-base^{commit})" = "$CHECKOUT_BASE_SHA"',
    );
  });

  it.each([
    { job: "check-shard", task: "prod-types", events: [] },
    {
      job: "checks-fast-core",
      task: "baseline-ratchets",
      events: ["pull_request", "push", "workflow_dispatch"],
    },
    {
      job: "checks-fast-core",
      task: "release-lint-core-1",
      events: ["pull_request", "push", "workflow_dispatch"],
    },
    { job: "checks-fast-core", task: "ci-routing", events: [] },
  ])("prepares the frozen diff base for $job/$task at checkout", ({ job, task, events }) => {
    const expression = readCiWorkflow().jobs[job].env?.CHECKOUT_BASE_SHA;
    const base = "c".repeat(40);
    expect(typeof expression).toBe("string");
    for (const eventName of ["pull_request", "push", "workflow_dispatch"] as const) {
      expect(
        evaluateWorkflowExpression(expression, {
          eventName,
          repository: "openclaw/openclaw",
          runAttempt: 1,
          matrix: { task },
          preflightOutputs: { diff_base_revision: base },
        }),
        eventName,
      ).toBe(events.includes(eventName) ? base : "");
    }
  });

  it.each([
    { label: "manual run", checkoutBase: "", changedScript: true },
    { label: "target without changed checks", checkoutBase: "c".repeat(40), changedScript: false },
  ])("keeps the full npm-lock sweep for $label", ({ checkoutBase, changedScript }) => {
    const result = runCheckShardFixture({
      task: "npm-lock",
      frozenTarget: false,
      checkoutBase,
      scripts: ["deps:npm-lock:check", ...(changedScript ? ["deps:npm-lock:check:changed"] : [])],
    });
    expect(result.status, result.output).toBe(0);
    expect(result.calls).toEqual(["deps:npm-lock:check"]);
  });

  it.each([false, true])(
    "preserves absent npm-lock capability handling (historical=%s)",
    (historical) => {
      const result = runCheckShardFixture({
        task: "npm-lock",
        frozenTarget: historical,
        scripts: [],
      });
      expect(result.status, result.output).toBe(historical ? 0 : 1);
      expect(result.calls).toEqual([]);
      expect(result.output).toContain(
        historical
          ? "[skip] historical target predates the transient npm lock contract"
          : "Current CI targets must provide the deps:npm-lock:check package script.",
      );
    },
  );

  it("runs temp path guardrails in the hosted guard shard", () => {
    const requiredScripts = [
      "check:doctor-deprecation-registry",
      "check:browser-inspect-script:swift",
      "check:coercion-helpers",
    ];
    const current = runCheckShardFixture({
      frozenTarget: false,
      scripts: [...requiredScripts, "check:temp-path-guardrails"],
    });
    expect(current.status, current.output).toBe(0);
    expect(current.calls).toContain("check:temp-path-guardrails");
    expect(current.calls.indexOf("check:temp-path-guardrails")).toBeLessThan(
      current.calls.indexOf("dup:check"),
    );

    const frozenMissing = runCheckShardFixture({
      frozenTarget: true,
      scripts: requiredScripts,
    });
    expect(frozenMissing.status, frozenMissing.output).toBe(0);
    expect(frozenMissing.calls).not.toContain("check:temp-path-guardrails");
    expect(frozenMissing.calls).toContain("dup:check:coverage");
    expect(frozenMissing.output).toContain(
      "[skip] frozen target predates the temp path guardrails",
    );

    const currentMissing = runCheckShardFixture({
      frozenTarget: false,
      scripts: requiredScripts,
    });
    expect(currentMissing.status).toBe(1);
    expect(currentMissing.calls).not.toContain("check:temp-path-guardrails");
    expect(currentMissing.calls).not.toContain("dup:check");
    expect(currentMissing.output).toContain(
      "Current CI targets must provide the check:temp-path-guardrails package script.",
    );

    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    const preflightGuards = workflow.slice(
      workflow.indexOf("guards)"),
      workflow.indexOf("npm-lock)"),
    );
    expect(preflightGuards.indexOf("pnpm check:temp-path-guardrails")).toBeLessThan(
      preflightGuards.indexOf("pnpm dup:check"),
    );
  });

  it.each([
    {
      scripts: ["tsgo:scripts", "tsgo:test:root"],
      frozenTarget: false,
      status: 0,
      calls: ["tsgo:extensions:test", "tsgo:scripts", "tsgo:test:root"],
    },
    {
      scripts: ["tsgo:scripts"],
      frozenTarget: false,
      status: 1,
      calls: ["tsgo:extensions:test", "tsgo:scripts"],
    },
    {
      scripts: [],
      frozenTarget: false,
      status: 1,
      calls: ["tsgo:extensions:test"],
    },
    {
      scripts: [],
      frozenTarget: true,
      status: 0,
      calls: ["tsgo:extensions:test"],
    },
    {
      scripts: ["tsgo:test:root"],
      frozenTarget: true,
      status: 0,
      calls: ["tsgo:extensions:test", "tsgo:test:root"],
    },
  ])(
    "runs declared typechecks for scripts=$scripts frozen=$frozenTarget",
    ({ scripts, frozenTarget, status, calls }) => {
      const result = runCheckShardFixture({ scripts, frozenTarget, task: "test-types" });
      expect(result.status, result.output).toBe(status);
      expect(result.calls).toEqual(calls);
    },
  );

  it("routes eligible core test leaves to one type owner before runner allocation", () => {
    const changedPaths = [
      "src/commands/doctor-config-preflight.plugin-persistence.test.ts",
      "docs/ci.md",
    ];
    const manifest = runCiManifestFixture({
      bundledPlanner: true,
      changedCoreTestSupport: true,
      eventName: "pull_request",
      changedPaths,
    });
    expect(manifest.status, manifest.output).toBe(0);
    expect(manifest.outputs.changed_core_test_paths_json).toBe(
      JSON.stringify(changedPaths.slice(0, 1)),
    );
    const result = runCheckShardFixture({
      frozenTarget: false,
      task: "test-types",
      scripts: ["tsgo:scripts", "tsgo:test:root"],
      types: {
        compose: true,
        changedPathsJson: manifest.outputs.changed_core_test_paths_json,
        boundary: true,
      },
    });
    expect(result.status, result.output).toBe(0);
    expect(result.rows).toEqual([
      { name: "central", status: 0 },
      { name: "boundary", status: 0 },
    ]);
    expect(result.typeCalls.filter((call) => call.row === "central")).toEqual([
      {
        row: "central",
        localCheck: null,
        command: `node --changed-paths-json ${JSON.stringify(changedPaths.slice(0, 1))} --concurrency 2`,
      },
      ...["tsgo:extensions:test", "tsgo:scripts", "tsgo:test:root"].map((command) => ({
        row: "central",
        localCheck: "0",
        command: `pnpm ${command}`,
      })),
    ]);
    expect(
      result.typeCalls
        .filter((call) => call.row === "boundary")
        .map((call) => call.command)
        .toSorted(),
    ).toEqual(
      BOUNDARY_CHECKS.filter((check) => check.label !== "lint:tmp:tsgo-core-boundary")
        .map((check) => [check.command, ...check.args].join(" "))
        .toSorted(),
    );
    const workflow = readCiWorkflow();
    expect(
      evaluateWorkflowExpression(workflow.jobs["check-test-types-hosted-core-shard"].if, {
        eventName: "pull_request",
        repository: "openclaw/openclaw",
        runAttempt: 1,
        runnerProfile: "hybrid",
        preflightOutputs: manifest.outputs,
      }),
    ).toBe(false);
  });

  it.each([
    { changedPaths: null, invalid: true },
    { changedPaths: [] },
    { changedPaths: ["docs/ci.md"] },
    { changedPaths: ["src/commands/doctor.test.ts", "package.json"] },
    { changedPaths: ["src/commands/doctor.test.ts", "src/shared.test-support.ts"] },
    { changedPaths: ["packages/mermaid-renderer/src/render.test.ts"] },
    { changedPaths: ["src/gateway/gateway-acp-bind.live.test.ts"] },
    { changedPaths: ["src/commands/doctor.test.ts"], changedCoreTestSupport: false },
    { changedPaths: ["src/commands/doctor.test.ts"], eventName: "push" as const },
    { changedPaths: ["src/commands/doctor.test.ts"], eventName: "workflow_dispatch" as const },
    {
      changedPaths: ["src/commands/doctor.test.ts"],
      scopeEnv: { OPENCLAW_CI_CHANGED_PATHS_JSON: "invalid" },
      invalid: true,
    },
  ])("retains full type owners for ineligible manifest inputs %j", (options) => {
    const manifest = runCiManifestFixture({
      bundledPlanner: true,
      changedCoreTestSupport: true,
      eventName: "pull_request",
      ...options,
    });
    if ("invalid" in options) {
      expect(manifest.status).not.toBe(0);
      expect(manifest.output).toContain("Current PR CI requires complete changed paths");
      expect(manifest.outputs.changed_core_test_paths_json).toBeUndefined();
    } else {
      expect(manifest.status, manifest.output).toBe(0);
      expect(manifest.outputs.changed_core_test_paths_json).toBe("");
    }
  });

  it.each([
    ["hybrid", "pull_request", false, true, true, true],
    ["github", "workflow_dispatch", false, true, true, true],
    ["blacksmith", "push", false, true, true, false],
    ["hybrid", "workflow_dispatch", true, false, true, false],
    ["hybrid", "workflow_dispatch", true, true, false, false],
    ["hybrid", "workflow_dispatch", true, true, true, true],
  ] as const)(
    "preserves type workload for %s %s frozen=%s hosted-contract=%s stripe-support=%s",
    (profile, eventName, frozenTarget, hostedContract, stripeSupport, striped) => {
      const result = runCheckShardFixture({
        task: "test-types",
        scripts: ["tsgo:scripts", "tsgo:test:root"],
        frozenTarget,
        types: { compose: true, profile, eventName, hostedContract, stripeSupport },
      });
      expect(result.status, result.output).toBe(0);
      const stripes = result.typeCalls.filter((call) => call.command.startsWith("node "));
      const packages = result.typeCalls.filter((call) => call.command.startsWith("pnpm "));
      expect(packages.map((call) => call.localCheck)).toEqual(packages.map(() => "0"));
      if (striped) {
        expect(result.rows).toHaveLength(3);
        expect(
          result.rows.map((row) =>
            stripes
              .filter((call) => call.row === row.name)
              .map((call) => call.command.split(" ")[2]),
          ),
        ).toEqual([["1/5", "2/5"], ["3/5", "4/5"], ["5/5"]]);
        for (const call of stripes) {
          const args = call.command.split(" ").slice(1);
          expect(args).toEqual(["--stripe", expect.any(String), "--concurrency", "2"]);
          expect(call.localCheck).toBeNull();
        }
        expect(result.calls).toEqual(["tsgo:extensions:test", "tsgo:scripts", "tsgo:test:root"]);
      } else {
        expect(stripes).toEqual([]);
        expect(result.calls).toEqual(["check:test-types", "tsgo:scripts"]);
      }
    },
  );

  it.each(["1/5", "5/5"])("halts only the type row whose first stripe %s fails", (failStripe) => {
    const result = runCheckShardFixture({
      task: "test-types",
      scripts: ["tsgo:scripts", "tsgo:test:root"],
      frozenTarget: false,
      types: { compose: true, failStripe },
    });
    expect(result.status, result.output).toBe(17);
    expect(readCiWorkflow().jobs["check-test-types-hosted-core-shard"].strategy["fail-fast"]).toBe(
      false,
    );
    const failed = result.rows.filter((row) => row.status !== 0);
    expect(failed).toHaveLength(1);
    expect(result.rows.filter((row) => row.status === 0)).toHaveLength(2);
    expect(
      result.typeCalls.filter((call) => call.row === failed[0]!.name).map((call) => call.command),
    ).toEqual([`node --stripe ${failStripe} --concurrency 2`]);
  });

  it.each(["main", "trunk/release"])(
    "resolves manual diff and cache bases from authenticated %s when anonymous Git is unavailable",
    (defaultBranch) => {
      const result = runDiffBaseFixture({
        commitCount: 2,
        eventBaseSha: "",
        defaultBranch,
        manual: true,
      });
      expect(result.status, result.output).toBe(0);
      expect(result.outputs).toEqual({
        default_sha: result.parentSha,
        sha: result.parentSha,
        head_sha: result.headSha,
      });
      expect(result.emittedBaseIsCommit).toBe(true);
    },
  );

  it.each(["ref", "comparison"] as const)(
    "rejects unavailable authenticated manual diff-base %s evidence",
    (apiError) => {
      const result = runDiffBaseFixture({
        commitCount: 2,
        eventBaseSha: "",
        manual: true,
        apiError,
      });
      expect(result.status).not.toBe(0);
      expect(result.output).toContain("HTTP 503");
      expect(result.outputs).not.toHaveProperty("sha");
    },
  );

  it("rejects ambiguous zero-before main pushes and preserves concrete bases", () => {
    const zeroSha = "0".repeat(40);
    const threeCommit = runDiffBaseFixture({ commitCount: 3, eventBaseSha: zeroSha });
    expect(threeCommit.status, threeCommit.output).toBe(1);
    expect(threeCommit.output).toContain(AMBIGUOUS_MAIN_PUSH_DIAGNOSTIC);
    expect(threeCommit.outputs).not.toHaveProperty("sha");
    expect(threeCommit.emittedBaseIsCommit).toBe(false);

    const rootCommit = runDiffBaseFixture({ commitCount: 1, eventBaseSha: zeroSha });
    expect(rootCommit.status, rootCommit.output).toBe(1);
    expect(rootCommit.output).toContain(AMBIGUOUS_MAIN_PUSH_DIAGNOSTIC);
    expect(rootCommit.outputs).not.toHaveProperty("sha");
    expect(rootCommit.emittedBaseIsCommit).toBe(false);

    const concreteBase = runDiffBaseFixture({
      commitCount: 3,
      eventBaseSha: "parent",
    });
    expect(concreteBase.status, concreteBase.output).toBe(0);
    expect(concreteBase.outputs.sha).toBe(concreteBase.eventBaseSha);
    expect(concreteBase.emittedBaseIsCommit).toBe(true);
  });

  it("uses stable deadcode checks for current and frozen checkouts", () => {
    const modern = runDependencyCheckFixture({
      historicalTarget: false,
      scripts: ["deadcode:dependencies", "deadcode:unused-files", "deadcode:exports"],
    });
    expect(modern.status, modern.output).toBe(0);
    // The scripts launch concurrently; completion order is nondeterministic.
    expect(modern.calls.toSorted()).toEqual([
      "deadcode:dependencies",
      "deadcode:exports",
      "deadcode:unused-files",
    ]);

    const frozenWithExports = runDependencyCheckFixture({
      historicalTarget: true,
      releaseToolingEntry: true,
      scripts: ["deadcode:dependencies", "deadcode:unused-files", "deadcode:exports"],
    });
    expect(frozenWithExports.status, frozenWithExports.output).toBe(0);
    expect(frozenWithExports.calls.toSorted()).toEqual([
      "deadcode:dependencies",
      "deadcode:exports",
      "deadcode:unused-files",
    ]);

    const frozen = runDependencyCheckFixture({
      historicalTarget: true,
      scripts: [
        "deadcode:ci",
        "deadcode:dependencies",
        "deadcode:report:ci:ts-unused",
        "deadcode:unused-files",
      ],
    });
    expect(frozen.status, frozen.output).toBe(0);
    expect(frozen.calls.toSorted()).toEqual(["deadcode:dependencies", "deadcode:unused-files"]);

    const currentWithoutExports = runDependencyCheckFixture({
      historicalTarget: false,
      scripts: ["deadcode:dependencies", "deadcode:unused-files"],
    });
    expect(currentWithoutExports.status).toBe(1);
    // The missing-script contract violation now fails fast before launching
    // the concurrent scans instead of wasting two Knip runs first.
    expect(currentWithoutExports.calls).toEqual([]);
    expect(currentWithoutExports.output).toContain(
      "Current CI targets must provide the deadcode:exports package script.",
    );

    const legacy = runDependencyCheckFixture({
      historicalTarget: true,
      scripts: ["deadcode:ci"],
    });
    expect(legacy.status, legacy.output).toBe(0);
    expect(legacy.calls).toEqual(["deadcode:ci"]);

    const incompleteCurrent = runDependencyCheckFixture({
      historicalTarget: false,
      scripts: ["deadcode:dependencies"],
    });
    expect(incompleteCurrent.status).toBe(1);
    expect(incompleteCurrent.calls).toEqual([]);
    expect(incompleteCurrent.output).toContain(
      "Target does not provide a supported deadcode check.",
    );
  });

  it("keeps the preflight manifest import closure dependency-free", () => {
    const manifestStep = readCiWorkflow().jobs.preflight.steps.find(
      (step: WorkflowStep) => step.name === "Build CI manifest",
    );
    const manifestRun = expectDefined(manifestStep?.run, "Build CI manifest script");
    const manifestSource = expectDefined(
      manifestRun.match(/--input-type=module <<'([A-Z][A-Z0-9_]*)'\n([\s\S]*?)\n\1(?=\n|$)/u)?.[2],
      "Build CI manifest Node source",
    );
    const repoRoot = process.cwd();
    const pending = new Set<string>();

    function inspectImports(file: string, source: string, workflow = false) {
      const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      const specifiers = new Set<string>();
      const constants = new Map<string, string>();
      for (const statement of sourceFile.statements) {
        if (
          !ts.isVariableStatement(statement) ||
          !(statement.declarationList.flags & ts.NodeFlags.Const)
        ) {
          continue;
        }
        for (const declaration of statement.declarationList.declarations) {
          if (
            ts.isIdentifier(declaration.name) &&
            declaration.initializer &&
            ts.isStringLiteralLike(declaration.initializer)
          ) {
            constants.set(declaration.name.text, declaration.initializer.text);
          }
        }
      }
      visitModuleSpecifiers(
        ts,
        sourceFile,
        ({ specifier }: { specifier: string }) => specifiers.add(specifier),
        { includeCommonJs: true, includeImportTypes: true },
      );
      function visit(node: ts.Node) {
        // The workflow selects current .mts or historical .mjs candidates before
        // importing them through variables/helpers. Follow its existing module paths.
        if (
          workflow &&
          ts.isStringLiteralLike(node) &&
          /^\.\.?\/.*\.[cm]?[jt]s$/u.test(node.text) &&
          existsSync(node.text)
        ) {
          specifiers.add(node.text);
        }
        if (
          !workflow &&
          ts.isCallExpression(node) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) && node.expression.text === "require"))
        ) {
          const argument = node.arguments[0];
          if (!argument || !ts.isStringLiteralLike(argument)) {
            const specifier =
              argument && ts.isIdentifier(argument) ? constants.get(argument.text) : undefined;
            expect(
              specifier,
              `${file}: cannot statically resolve module specifier ${argument?.getText(sourceFile) ?? "<missing>"}`,
            ).toBeDefined();
            specifiers.add(expectDefined(specifier, "resolved module specifier"));
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(sourceFile);
      for (const specifier of specifiers) {
        const diagnostic = `${file}: preflight import ${JSON.stringify(specifier)} must resolve without node_modules`;
        if (specifier.startsWith("node:")) {
          expect(isBuiltin(specifier), diagnostic).toBe(true);
          continue;
        }
        expect(specifier, diagnostic).toMatch(/^\.\.?\//u);
        const importedFile = path.relative(
          repoRoot,
          path.resolve(
            workflow ? repoRoot : path.dirname(file),
            // CI materializes trusted actions under the harness checkout prefix.
            workflow ? specifier.replace(/^\.\/\.ci-harness\//u, "./") : specifier,
          ),
        );
        expect(importedFile, diagnostic).not.toMatch(/^(?:\.\.(?:[\\/]|$)|[\\/])/u);
        expect(importedFile.split(path.sep), diagnostic).not.toContain("node_modules");
        expect(existsSync(importedFile), `${diagnostic}; missing ${importedFile}`).toBe(true);
        pending.add(importedFile);
      }
    }

    inspectImports(".github/workflows/ci.yml (Build CI manifest)", manifestSource, true);
    expect(pending.size, "workflow must declare preflight module entry points").toBeGreaterThan(0);
    // Set iteration visits newly discovered modules once, including cycles.
    for (const file of pending) {
      expect(
        pending.size,
        "preflight import closure exceeded 256 repository files",
      ).toBeLessThanOrEqual(256);
      inspectImports(file, readFileSync(file, "utf8"));
    }
  });

  it("runs mobile protocol coverage for Node and native-only changes", () => {
    const workflow = readCiWorkflow();
    const coverageStep = workflow.jobs.preflight.steps.find(
      (step: WorkflowStep) => step.name === "Check mobile protocol event coverage",
    );
    const checkShardRun = workflow.jobs["check-shard"].steps.find(
      (step: WorkflowStep) => step.name === "Run check shard",
    ).run;

    // Current-source preflight runs the .mts natively; dispatches selecting
    // another revision retain that target's tsx shim.
    expect(coverageStep.run).toContain("node scripts/check-protocol-event-coverage.mts");
    expect(coverageStep.run).toContain("node scripts/check-protocol-event-coverage.mjs");
    expect(coverageStep.if).toBe("steps.manifest.outputs.run_protocol_event_coverage == 'true'");
    expect(checkShardRun).not.toContain("check:protocol-coverage");
  });

  it("keeps type-aware oxlint within hosted fork-runner resources", () => {
    const workflow = readCiWorkflow();
    const manifestStep = workflow.jobs.preflight.steps.find(
      (step: WorkflowStep) => step.name === "Build CI manifest",
    );
    const checkShardStep = workflow.jobs["check-shard"].steps.find(
      (step: WorkflowStep) => step.name === "Run check shard",
    );
    const checkShardRun = checkShardStep.run;
    const hostedCoreLint = workflow.jobs["check-lint-hosted-core-shard"];
    const hostedCoreTypes = workflow.jobs["check-test-types-hosted-core-shard"];
    expect(manifestStep.env.OPENCLAW_CI_RUNNER_PROFILE).toBe(
      "${{ steps.runner_profile.outputs.runner_profile }}",
    );
    expect(manifestStep.run).toContain("runnerBackend: runnerProfile");
    expect(checkShardStep.env.RUNNER_PROFILE).toBe("${{ needs.preflight.outputs.runner_profile }}");
    expect(checkShardStep.env.HOSTED_RUNNER_STRIPES).toContain(
      "needs.preflight.outputs.hosted_runner_profile_contract == 'true'",
    );
    expect(checkShardRun).toContain('if [ "$HOSTED_RUNNER_STRIPES" = "true" ]; then');
    expect(checkShardStep.env.RELEASE_GATE).toBe("${{ inputs.release_gate && 'true' || 'false' }}");
    expect(checkShardRun).toContain("lint_args=(--only=extensions --only=scripts --threads=1)");
    expect(checkShardRun).toContain('if [ "$RELEASE_GATE" = "true" ]; then');
    expect(checkShardRun).toContain("lint_args=(--only=scripts --threads=1)");
    expect(checkShardRun).toContain('elif [ "$(nproc)" -lt 8 ]; then');
    expect(checkShardRun).toContain("lint_args=(--threads=1)");
    expect(checkShardRun).not.toContain("lint_args=(--split-core --threads=1)");
    expect(checkShardRun).toContain('pnpm lint "${lint_args[@]}"');
    expect(checkShardRun).toContain(
      'node --import tsx scripts/run-oxlint-shards.mts "${lint_args[@]}"',
    );
    for (const job of [hostedCoreLint, hostedCoreTypes]) {
      expect(job.if).toContain("needs.preflight.outputs.runner_profile == 'github'");
      expect(job.if).toContain("needs.preflight.outputs.runner_profile == 'hybrid'");
      expect(job.if).toContain("needs.preflight.outputs.hosted_runner_profile_contract == 'true'");
      expect(
        evaluateWorkflowExpression(job.if, {
          eventName: "workflow_dispatch",
          frozenTarget: true,
          hostedRunnerProfileContract: false,
          repository: "openclaw/openclaw",
          runnerProfile: "blacksmith",
          runAttempt: 1,
        }),
      ).toBe(false);
      expect(
        evaluateWorkflowExpression(job.if, {
          eventName: "workflow_dispatch",
          frozenTarget: true,
          hostedRunnerProfileContract: true,
          repository: "openclaw/openclaw",
          runnerProfile: "github",
          runAttempt: 1,
        }),
      ).toBe(true);
      for (const [runnerProfile, expected] of [
        ["blacksmith", false],
        ["github", true],
        ["hybrid", true],
      ] as const) {
        expect(
          evaluateWorkflowExpression(job.if, {
            eventName: "pull_request",
            frozenTarget: false,
            hostedRunnerProfileContract: true,
            repository: "openclaw/openclaw",
            runnerProfile,
            runAttempt: 1,
          }),
        ).toBe(expected);
      }
    }
    expect(hostedCoreLint["runs-on"]).toBe("ubuntu-24.04");
    expect(hostedCoreLint.strategy["fail-fast"]).toBe(false);
    expect(hostedCoreLint.strategy["max-parallel"]).toBe(5);
    const coreLintStep = hostedCoreLint.steps.find(
      (step: WorkflowStep) => step.name === "Run hosted core lint stripe",
    );
    expect(coreLintStep.env.CORE_STRIPE).toBe("${{ matrix.stripe }}");
    type GoEnv = Partial<Pick<NodeJS.ProcessEnv, "GOMAXPROCS" | "GOGC" | "GOMEMLIMIT">>;
    const goEnvKeys = ["GOMAXPROCS", "GOGC", "GOMEMLIMIT"] as const;
    const runLintOwner = ({
      capability,
      cpuCount = 32,
      eventName = "workflow_dispatch",
      failStripe,
      frozenTarget = !capability,
      goEnv = {},
      expectedGoEnv = goEnv,
      lane,
      profile,
      releaseGate = false,
      stripe = 1,
    }: {
      capability: boolean;
      cpuCount?: number;
      eventName?: "pull_request" | "push" | "workflow_dispatch";
      failStripe?: number;
      frozenTarget?: boolean;
      goEnv?: GoEnv;
      expectedGoEnv?: GoEnv;
      lane: "check" | "core";
      profile: "blacksmith" | "github" | "hybrid";
      releaseGate?: boolean;
      stripe?: number;
    }) => {
      const root = tempDirs.make("openclaw-hosted-lint-owner-");
      const binDir = path.join(root, "bin");
      const callsPath = path.join(root, "calls.txt");
      const goEnvPath = path.join(root, "go-env.txt");
      mkdirSync(path.join(root, "scripts"), { recursive: true });
      mkdirSync(binDir);
      writeFileSync(
        path.join(root, "scripts/run-oxlint-shards.mts"),
        capability ? "// --extension-stripe\n" : "// legacy runner\n",
      );
      for (const command of ["node", "pnpm"]) {
        writeExecutable(path.join(binDir, command), [
          "#!/usr/bin/env bash",
          "set -euo pipefail",
          `printf '${command} %s\\n' "$*" >> "$LINT_CALLS"`,
          'printf \'%s\\t%s\\t%s\\n\' "${GOMAXPROCS-}" "${GOGC-}" "${GOMEMLIMIT-}" >> "$LINT_GO_ENV"',
          ...(failStripe === undefined
            ? []
            : [`if [[ " $* " == *" --core-stripe=${failStripe}/5 "* ]]; then exit 23; fi`]),
        ]);
      }
      writeExecutable(path.join(binDir, "nproc"), [
        "#!/usr/bin/env bash",
        `printf '${cpuCount}\\n'`,
      ]);
      const coreRun = coreLintStep.run.replace(/\$\{\{[\s\S]*?\}\}/gu, (expression: string) =>
        String(
          evaluateWorkflowExpression(expression, {
            eventName,
            frozenTarget,
            matrix: { stripe },
            releaseGate,
            repository: "openclaw/openclaw",
            runnerProfile: profile,
            runAttempt: 1,
          }),
        ),
      );
      const stepEnv = lane === "check" ? checkShardStep.env : coreLintStep.env;
      const result = spawnSync("bash", ["-c", lane === "check" ? checkShardRun : coreRun], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          GOMAXPROCS: undefined,
          GOGC: undefined,
          GOMEMLIMIT: undefined,
          ...goEnv,
          ...Object.fromEntries(
            goEnvKeys.flatMap((key) => (stepEnv[key] === undefined ? [] : [[key, stepEnv[key]]])),
          ),
          FORMAT_CHECK: "false",
          CORE_STRIPE: String(stripe),
          FROZEN_TARGET: frozenTarget ? "true" : "false",
          HISTORICAL_TARGET: capability ? "false" : "true",
          HOSTED_RUNNER_STRIPES: profile === "blacksmith" ? "false" : "true",
          LINT_CALLS: callsPath,
          LINT_GO_ENV: goEnvPath,
          OPENCLAW_LOCAL_CHECK: "0",
          PATH: `${binDir}:${process.env.PATH ?? ""}`,
          RELEASE_GATE: releaseGate ? "true" : "false",
          RUN_CONTROL_UI_I18N: "false",
          RUNNER_PROFILE: profile,
          RUN_UI_TESTS: "false",
          TASK: "lint",
        },
      });
      expect(result.status, `${result.stdout}${result.stderr}`).toBe(
        failStripe === undefined ? 0 : 23,
      );
      const calls = existsSync(callsPath)
        ? readFileSync(callsPath, "utf8").trim().split("\n").filter(Boolean)
        : [];
      expect(calls.length).toBeGreaterThan(0);
      expect(readFileSync(goEnvPath, "utf8").split("\n").filter(Boolean)).toEqual(
        calls.map(() => goEnvKeys.map((key) => expectedGoEnv[key] ?? "").join("\t")),
      );
      return calls;
    };

    const coreLintRows = (
      context: Partial<Parameters<typeof evaluateWorkflowExpression>[1]>,
    ): number[] => {
      const stripes = hostedCoreLint.strategy.matrix.stripe;
      return Array.isArray(stripes)
        ? stripes
        : evaluateWorkflowExpression(stripes, {
            eventName: "pull_request",
            repository: "openclaw/openclaw",
            runnerProfile: "hybrid",
            runAttempt: 1,
            ...context,
          });
    };
    for (const eventName of ["pull_request", "push"] as const) {
      const rows = coreLintRows({ eventName });
      expect(rows).toEqual([1, 2]);
      expect(
        rows.map((stripe) =>
          runLintOwner({ capability: true, eventName, lane: "core", profile: "hybrid", stripe }),
        ),
      ).toEqual(
        [
          [1, 2],
          [3, 4, 5],
        ].map((stripes) =>
          stripes.map(
            (stripe) =>
              `node --import tsx scripts/run-oxlint-shards.mts --only=core --split-core --core-stripe=${stripe}/5 --threads=1`,
          ),
        ),
      );
    }
    for (const context of [
      { runnerProfile: "github" as const },
      { eventName: "workflow_dispatch" as const },
      { frozenTarget: true },
      { releaseGate: true },
    ]) {
      expect(coreLintRows(context)).toEqual([1, 2, 3, 4, 5]);
    }
    expect(
      runLintOwner({
        capability: true,
        eventName: "pull_request",
        failStripe: 1,
        lane: "core",
        profile: "hybrid",
      }),
    ).toEqual([
      "node --import tsx scripts/run-oxlint-shards.mts --only=core --split-core --core-stripe=1/5 --threads=1",
    ]);
    expect(
      runLintOwner({
        capability: true,
        eventName: "pull_request",
        failStripe: 4,
        lane: "core",
        profile: "hybrid",
        stripe: 2,
      }),
    ).toEqual([
      "node --import tsx scripts/run-oxlint-shards.mts --only=core --split-core --core-stripe=3/5 --threads=1",
      "node --import tsx scripts/run-oxlint-shards.mts --only=core --split-core --core-stripe=4/5 --threads=1",
    ]);

    expect(runLintOwner({ capability: true, lane: "check", profile: "github" })).toEqual([
      "node --import tsx scripts/run-oxlint-shards.mts --only=extensions --extension-stripe=6/6 --threads=1",
      "node --import tsx scripts/run-oxlint-shards.mts --only=scripts --threads=1",
    ]);
    expect(
      runLintOwner({
        capability: true,
        eventName: "pull_request",
        lane: "core",
        profile: "github",
      }),
    ).toEqual([
      "node --import tsx scripts/run-oxlint-shards.mts --only=core --split-core --core-stripe=1/5 --threads=1",
      "node --import tsx scripts/run-oxlint-shards.mts --only=extensions --extension-stripe=1/6 --threads=1",
    ]);
    for (const scenario of [
      {
        capability: false,
        lane: "check" as const,
        profile: "github" as const,
        expectedGoEnv: { GOMAXPROCS: "2", GOGC: "30", GOMEMLIMIT: "3GiB" },
      },
      { capability: true, lane: "check" as const, profile: "hybrid" as const },
    ]) {
      expect(runLintOwner(scenario)).toEqual([
        "node --import tsx scripts/run-oxlint-shards.mts --only=extensions --only=scripts --threads=1",
      ]);
    }
    expect(runLintOwner({ capability: true, lane: "check", profile: "blacksmith" })).toEqual([
      "node --import tsx scripts/run-oxlint-shards.mts --threads=8",
    ]);
    expect(
      runLintOwner({ capability: true, lane: "check", profile: "github", releaseGate: true }),
    ).toEqual(["node --import tsx scripts/run-oxlint-shards.mts --only=scripts --threads=1"]);
    for (const scenario of [
      {
        capability: false,
        lane: "core" as const,
        profile: "github" as const,
        expectedGoEnv: { GOMAXPROCS: "2" },
      },
      { capability: true, lane: "core" as const, profile: "hybrid" as const },
      {
        capability: true,
        lane: "core" as const,
        profile: "github" as const,
        releaseGate: true,
      },
    ]) {
      expect(runLintOwner(scenario)).toEqual([
        "node --import tsx scripts/run-oxlint-shards.mts --only=core --split-core --core-stripe=1/5 --threads=1",
      ]);
    }

    for (const lane of ["check", "core"] as const) {
      runLintOwner({ capability: true, cpuCount: 4, lane, profile: "hybrid" });
      runLintOwner({
        capability: true,
        lane,
        profile: "github",
        goEnv: { GOMAXPROCS: "3", GOGC: "80", GOMEMLIMIT: "5GiB" },
      });
    }
    runLintOwner({ capability: true, cpuCount: 4, lane: "check", profile: "blacksmith" });
    for (const [profile, cpuCount] of [
      ["hybrid", 32],
      ["blacksmith", 4],
    ] as const) {
      runLintOwner({
        capability: true,
        cpuCount,
        frozenTarget: true,
        lane: "check",
        profile,
        expectedGoEnv: { GOMAXPROCS: "2", GOGC: "30", GOMEMLIMIT: "3GiB" },
      });
    }
    runLintOwner({
      capability: true,
      frozenTarget: true,
      lane: "check",
      profile: "blacksmith",
    });
    expect(coreLintStep.env.FROZEN_TARGET).toBe("${{ needs.preflight.outputs.frozen_target }}");
  });

  it.skipIf(process.platform === "win32").each(
    (["bundled-protocol", "guards", "npm-lock"] as const).flatMap((task) =>
      (["pull_request", "push", "workflow_dispatch"] as const).map((eventName) => ({
        task,
        eventName,
      })),
    ),
  )(
    "uses prefetched CI base without later network access ($task, $eventName)",
    async ({ task, eventName }) => {
      const base = "c".repeat(40);
      const baseRef = "refs/remotes/origin/ci-ratchet-base";
      const jobName = task === "bundled-protocol" ? "checks-fast-core" : "check-shard";
      const job = readCiWorkflow().jobs[jobName];
      const needsBase =
        task === "bundled-protocol" ||
        (task === "guards" ? eventName === "pull_request" : eventName !== "workflow_dispatch");
      const checkoutBase = evaluateWorkflowExpression(job.env?.CHECKOUT_BASE_SHA ?? "${{ '' }}", {
        eventName,
        repository: "fixture/checkout",
        runAttempt: 1,
        matrix: { task },
        preflightOutputs: { diff_base_revision: base },
      });
      const report = await runCiGitStep({
        job: jobName,
        step:
          task === "bundled-protocol"
            ? "Run ${{ matrix.task }} (${{ matrix.runtime }})"
            : "Run check shard",
        checkoutBeforeStep: true,
        // The authenticated checkout and trusted harness fetch succeed. Network
        // access is unavailable afterward, even though the base is already local.
        fetchResults: [0, 0, 128],
        baseAvailableAfter: 0,
        revisions: { [`${baseRef}^{commit}`]: base },
        env: {
          TASK: task,
          GITHUB_EVENT_NAME: eventName,
          CHECKOUT_KIND: "linux-node",
          CHECKOUT_BASE_SHA: String(checkoutBase),
          CHECKOUT_TOKEN: "fixture-checkout-token",
        },
      });
      expect(report.code, report.output).toBe(0);
      expect(report.fetches).toHaveLength(2);
      const sourceFetch = report.fetches.find(({ cwd }) => cwd === report.workspace);
      expect(sourceFetch?.args.includes(`+${base}:refs/remotes/origin/ci-ratchet-base`)).toBe(
        needsBase,
      );
      const consumers = report.commands.filter(({ tool }) => tool === "node" || tool === "pnpm");
      if (task === "bundled-protocol") {
        expect(consumers.map(({ args }) => args)).toEqual([["test:bundled"], ["protocol:check"]]);
      } else if (task === "guards") {
        const tempReport = consumers.find(
          ({ args }) => args[0] === "scripts/report-test-temp-creations.mjs",
        );
        expect(tempReport?.args).toEqual(
          needsBase
            ? [
                "scripts/report-test-temp-creations.mjs",
                "--base",
                base,
                "--head",
                "HEAD",
                "--no-merge-base",
              ]
            : undefined,
        );
      } else {
        expect(consumers.filter(({ tool }) => tool === "pnpm").map(({ args }) => args)).toEqual([
          needsBase
            ? ["deps:npm-lock:check:changed", "--base", base, "--head", "HEAD"]
            : ["deps:npm-lock:check"],
        ]);
      }
    },
    55_000,
  );

  it("runs the startup corpus once when a canonical PR admits both complete Node files", () => {
    const revision = "a".repeat(40);
    const shards = createNodeTestShardBundles({
      compactMode: "pull-request",
      includeReleaseOnlyPluginShards: false,
    });
    const manifest = runCiManifestFixture({
      bundledPlanner: true,
      eventName: "pull_request",
      nodeTestShards: shards,
      startupCorpusCoverage: true,
      changedPaths: ["scripts/lib/ci-node-test-plan.mts"],
      scopeEnv: { OPENCLAW_CI_WORKFLOW_REVISION: revision },
    });
    expect(manifest.status, manifest.output).toBe(0);
    expect(manifest.outputs.startup_corpus_node_revision).toBe(revision);
    expect(manifest.outputs.run_checks_node_core_nondist).toBe("true");
    const step = readCiWorkflow().jobs["checks-fast-core"].steps.find(
      (entry: WorkflowStep) => entry.name === "Check startup corpus",
    );
    expect(
      evaluateWorkflowExpression(`\${{ ${step.if} }}`, {
        eventName: "pull_request",
        repository: "openclaw/openclaw",
        matrix: { task: "baseline-ratchets" },
        runAttempt: 1,
        preflightOutputs: { ...manifest.outputs, checkout_revision: revision },
      }),
    ).toBe(false);
    for (const result of ["failure", "skipped"]) {
      expect(
        runCiGateFixture(
          `checks-fast-core=success|true\nchecks-node-core-test-nondist-shard=${result}|true`,
        ).status,
      ).toBe(1);
    }
  });

  it.each<{ label: string } & Partial<Parameters<typeof runCiManifestFixture>[0]>>([
    { label: "missing planner capability", startupCorpusCoverage: false },
    { label: "different source tree", scopeEnv: { OPENCLAW_CI_WORKFLOW_REVISION: "b".repeat(40) } },
    {
      label: "unknown source",
      scopeEnv: { OPENCLAW_CI_CHECKOUT_REVISION: "", OPENCLAW_CI_WORKFLOW_REVISION: "" },
    },
    { label: "fast-only PR", nodeFastOnly: true },
    { label: "Node not admitted", runNode: false },
    { label: "different repository", repository: "fixture/openclaw" },
    { label: "release merge", eventName: "workflow_dispatch", releaseGate: true },
    {
      label: "frozen target",
      eventName: "workflow_dispatch",
      scopeEnv: { OPENCLAW_CI_WORKFLOW_REVISION: "b".repeat(40) },
    },
  ])(
    "retains the startup corpus without a coverage receipt: $label",
    ({ label: _label, ...options }) => {
      const manifest = runCiManifestFixture({
        bundledPlanner: true,
        startupCorpusCoverage: true,
        eventName: "pull_request",
        changedPaths: ["scripts/lib/ci-node-test-plan.mts"],
        scopeEnv: { OPENCLAW_CI_WORKFLOW_REVISION: "a".repeat(40) },
        nodeTestShards: [
          {
            checkName: "complete-corpus",
            shardName: "complete-corpus",
            requiresDist: false,
            configs: [],
            runner: "ubuntu-24.04",
            groups: [
              {
                shard_name: "core-runtime-config",
                requiresDist: false,
                runner: "ubuntu-24.04",
                configs: ["test/vitest/vitest.runtime-config.config.ts"],
                includePatterns: [
                  "src/config/config-startup-corpus.test.ts",
                  "src/config/state-startup-corpus.test.ts",
                ],
              },
            ],
          },
        ],
        ...options,
      });
      expect(manifest.status, manifest.output).toBe(0);
      expect(manifest.outputs.startup_corpus_node_revision).toBe("");
    },
  );

  it.each(["", "b".repeat(40)])(
    "retains the startup corpus for an unbound receipt %j",
    (revision) => {
      const step = readCiWorkflow().jobs["checks-fast-core"].steps.find(
        (entry: WorkflowStep) => entry.name === "Check startup corpus",
      );
      expect(
        evaluateWorkflowExpression(`\${{ ${step.if} }}`, {
          eventName: "pull_request",
          repository: "openclaw/openclaw",
          matrix: { task: "baseline-ratchets" },
          runAttempt: 1,
          preflightOutputs: {
            startup_corpus_node_revision: revision,
            checkout_revision: "a".repeat(40),
          },
        }),
      ).toBe(true);
    },
  );

  it("runs the startup corpus once on full canonical main pushes", () => {
    const files = [
      "src/config/config-startup-corpus.test.ts",
      "src/config/state-startup-corpus.test.ts",
    ];
    const groups = createNodeTestShardBundles({
      compactMode: "push",
      includeReleaseOnlyPluginShards: false,
    }).flatMap((shard) => shard.groups);
    const steps: WorkflowStep[] = readCiWorkflow().jobs["checks-fast-core"].steps;
    for (const file of files) {
      expect(
        buildVitestRunPlans([file]).map((plan) => plan.config),
        file,
      ).toEqual(["test/vitest/vitest.runtime-config.config.ts"]);
      const nodeOwners = groups.filter(
        (group) =>
          group.configs.includes("test/vitest/vitest.runtime-config.config.ts") &&
          (!group.includePatterns ||
            group.includePatterns.some((pattern) => minimatch(file, pattern))),
      );
      expect(nodeOwners, file).toHaveLength(1);
      const extraOwners = steps.filter(
        (step) =>
          step.run?.includes(file) &&
          (!step.if ||
            evaluateWorkflowExpression(`\${{ ${step.if} }}`, {
              eventName: "push",
              repository: "openclaw/openclaw",
              ref: "refs/heads/main",
              matrix: { task: "baseline-ratchets" },
              runCheck: true,
              runAttempt: 1,
            })),
      );
      expect(nodeOwners.length + extraOwners.length, file).toBe(1);
    }
  });

  it.each([
    { eventName: "pull_request", runCheck: true },
    { eventName: "pull_request", runCheck: false },
    { eventName: "push", runCheck: false },
    { eventName: "push", ref: "refs/heads/release" },
    { eventName: "push", repository: "fixture/openclaw" },
    { eventName: "workflow_dispatch", releaseGate: false },
    { eventName: "workflow_dispatch", releaseGate: true },
  ] as const)("retains the startup corpus outside full canonical main: %j", (scenario) => {
    const steps: WorkflowStep[] = readCiWorkflow().jobs["checks-fast-core"].steps;
    const selected = steps.filter(
      (step) =>
        step.run?.includes("src/config/state-startup-corpus.test.ts") &&
        (!step.if ||
          evaluateWorkflowExpression(`\${{ ${step.if} }}`, {
            repository: "openclaw/openclaw",
            matrix: { task: "baseline-ratchets" },
            runAttempt: 1,
            ...scenario,
          })),
    );
    expect(selected).toHaveLength(1);
    expect(selected[0]?.run).toContain("src/config/config-startup-corpus.test.ts");
  });

  it("runs all baseline ratchets against the exact tested tree", () => {
    const workflow = readCiWorkflow();
    const maxLinesRatchet = readFileSync("scripts/check-max-lines-ratchet.mts", "utf8");
    const checksFastJob = workflow.jobs["checks-fast-core"];
    const checksFastSteps = checksFastJob.steps;
    const checkout = checksFastSteps.find((step: WorkflowStep) => step.name === "Checkout");
    const checksFastRun = checksFastSteps.find(
      (step: WorkflowStep) => step.name === "Run ${{ matrix.task }} (${{ matrix.runtime }})",
    );
    const releaseGateMerge = checksFastSteps.find(
      (step: WorkflowStep) => step.name === "Prepare release-gate ratchet merge tree",
    );
    expect(
      checksFastSteps.some((step: WorkflowStep) => step.name === "Resolve manual protocol base"),
    ).toBe(false);

    expect(workflow.jobs["checks-fast-core"].permissions).toEqual({
      contents: "read",
      "pull-requests": "read",
    });
    expect(checkout.env.CHECKOUT_SHA).toBe("${{ needs.preflight.outputs.checkout_revision }}");
    expect(releaseGateMerge.if).toBe(
      "(matrix.task == 'baseline-ratchets' || startsWith(matrix.task, 'release-lint-')) && github.event_name == 'workflow_dispatch' && inputs.release_gate",
    );
    expect(checksFastRun.run).toContain("baseline-ratchets)");
    expect(checksFastRun.run).toContain("coercion-helpers)");
    expect(checksFastRun.run).toContain("pnpm check:coercion-helpers");
    expect(checksFastRun.run).toContain("bun-launcher)");
    expect(checksFastRun.run).toContain(
      "OPENCLAW_E2E_SKIP_BUILD=1 OPENCLAW_TEST_BUN_LAUNCHER=1 pnpm test test/openclaw-launcher.e2e.test.ts",
    );
    expect(checksFastRun.run).toContain(
      "for required_script in check:max-lines-ratchet check:assertion-safety config:docs:check plugins:inventory:check; do",
    );
    expect(checksFastRun.run).toContain('has_package_script "$required_script"');
    expect(checksFastRun.env.RATCHET_PR_HEAD_SHA).toBe(
      "${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || '' }}",
    );
    expect(checksFastRun.env).not.toHaveProperty("RATCHET_EVENT_BASE_SHA");
    expect(checksFastRun.env).not.toHaveProperty("RATCHET_MANUAL_TARGET_SHA");
    expect(checksFastRun.env).not.toHaveProperty("GH_TOKEN");
    expect(checksFastRun.env).not.toHaveProperty("PROTOCOL_MANUAL_BASE_SHA");
    expect(checksFastRun.env.PROTOCOL_SINCE_BASE_SHA).toBe(
      "${{ needs.preflight.outputs.diff_base_revision }}",
    );
    expect(releaseGateMerge.run).toContain(
      'gh api --method GET "repos/${GITHUB_REPOSITORY}/pulls/${PULL_REQUEST_NUMBER}"',
    );
    expect(releaseGateMerge.run).toContain(
      "release-gate pull request must be open and match the target head",
    );
    expect(releaseGateMerge.run).toContain("for attempt in {1..6}");
    expect(releaseGateMerge.run).toContain(
      '"+refs/pull/${PULL_REQUEST_NUMBER}/merge:refs/remotes/origin/ci-ratchet-merge"',
    );
    expect(releaseGateMerge.run).toContain('"$merge_head" == "$TARGET_SHA"');
    expect(releaseGateMerge.run).toContain('git show -s --format=%P "$merge_sha"');
    expect(releaseGateMerge.run).toContain(
      "Freeze GitHub's canonical merge snapshot once it contains the exact head",
    );
    expect(releaseGateMerge.run).toContain(
      "Base freshness belongs to the landing gate; chasing moving main here can never converge",
    );
    expect(releaseGateMerge.run).toContain(
      "release-gate merge tree did not refresh to the target head",
    );
    expect(releaseGateMerge.run).not.toContain(".base.sha");
    expect(releaseGateMerge.run).toContain('--git 0 checkout --detach "$merge_sha"');
    expect(releaseGateMerge.run).toContain(
      'echo "RATCHET_BASE_REF=${frozen_base_sha}" >> "$GITHUB_ENV"',
    );
    expect(checksFastRun.run).not.toContain("PROTOCOL_MANUAL_BASE_SHA");
    expect(checksFastRun.run).not.toContain("protocol-since-base");
    expect(checksFastRun.run).toContain(
      'test "$(git rev-parse refs/remotes/origin/ci-ratchet-base^{commit})" = "$PROTOCOL_SINCE_BASE_SHA"',
    );
    expect(checksFastRun.run).toContain(
      'base_ref="${RATCHET_BASE_REF:-refs/remotes/origin/ci-ratchet-base}"',
    );
    expect(checksFastRun.run).toContain('git cat-file -e "${base_ref}^{commit}"');
    expect(checksFastRun.run).toContain(
      "mapfile -t merge_parents < <(git cat-file -p HEAD | sed -n 's/^parent //p')",
    );
    expect(checksFastRun.run).toContain('"${#merge_parents[@]}" != "2"');
    expect(checksFastRun.run).toContain('"${merge_parents[1]:-}" != "$RATCHET_PR_HEAD_SHA"');
    expect(checksFastRun.run).toContain('prepared_base="$(git rev-parse "$base_ref")"');
    expect(checksFastRun.run).toContain('"${merge_parents[0]}" != "$prepared_base"');
    expect(checksFastRun.run).not.toContain("ci-ratchet-target^");
    expect(checksFastRun.run).not.toContain("resolve_manual_merge_base");
    expect(checksFastRun.run).not.toContain("+${merge_base}:refs/remotes/origin/ci-ratchet-base");
    expect(checksFastRun.run).toContain('pnpm check:max-lines-ratchet --base "$base_ref"');
    expect(checksFastRun.run).toContain('pnpm check:assertion-safety --base "$base_ref"');
    expect(checksFastRun.run).toContain("pnpm config:docs:check");
    expect(checksFastRun.run).toContain("pnpm plugins:inventory:check");
    expect(maxLinesRatchet).toContain(
      'import { main as checkEnvVarCount } from "./check-env-var-count.mts";',
    );
    expect(maxLinesRatchet).toContain("checkEnvVarCount(envVarCountArgs(argv), root);");
    expect(checksFastRun.run).toContain(
      '--only=core --split-core --core-stripe="${stripe}/5" --threads=1',
    );
    expect(checksFastRun.run).toContain(
      "node --import tsx scripts/run-oxlint-shards.mts --only=extensions --threads=1",
    );
    expect(checksFastRun.run).not.toContain(
      "node scripts/run-oxlint.mjs src ui/src packages extensions",
    );

    const fastOnly = runCiManifestFixture({
      bundledPlanner: true,
      eventName: "pull_request",
      historicalCompatibility: false,
      nodeFastOnly: true,
      nodeFastPluginContracts: true,
    });
    expect(fastOnly.status, fastOnly.output).toBe(0);
    expect(fastOnly.outputs.run_check).toBe("false");
    expect(fastOnly.outputs.run_checks_fast_core).toBe("true");
    expect(
      JSON.parse(expectDefined(fastOnly.outputs.checks_fast_core_matrix, "fast-only checks matrix"))
        .include,
    ).toEqual([
      {
        check_name: "checks-fast-baseline-ratchets",
        runtime: "node",
        task: "baseline-ratchets",
      },
      {
        check_name: "checks-fast-coercion-helpers",
        runtime: "node",
        task: "coercion-helpers",
      },
    ]);

    const releaseGate = runCiManifestFixture({
      bundledPlanner: true,
      eventName: "workflow_dispatch",
      historicalCompatibility: false,
      releaseGate: true,
      runnerProfile: "github",
    });
    expect(releaseGate.status, releaseGate.output).toBe(0);
    expect(
      JSON.parse(
        expectDefined(releaseGate.outputs.checks_fast_core_matrix, "release-gate checks matrix"),
      ).include.filter((entry: { task: string }) => entry.task.startsWith("release-lint-")),
    ).toEqual([
      ...Array.from({ length: 5 }, (_, index) => {
        const stripe = index + 1;
        return {
          check_name: `checks-fast-release-lint-core-${stripe}`,
          runtime: "node",
          stripe,
          task: `release-lint-core-${stripe}`,
        };
      }),
      {
        check_name: "checks-fast-release-lint-extensions",
        runtime: "node",
        task: "release-lint-extensions",
      },
    ]);
  });

  it.each([
    {
      label: "test-only routing",
      changedPath: "test/scripts/changed-path-facts.test.ts",
      taskOverride: null,
    },
    {
      label: "source-only routing",
      changedPath: "scripts/lib/changed-path-facts.mjs",
      taskOverride: null,
    },
    {
      label: "legacy combined contract and routing task",
      changedPath: "test/scripts/changed-path-facts.test.ts",
      taskOverride: "contracts-plugins-ci-routing",
    },
  ])(
    "executes standalone changed-path-facts coverage for $label",
    ({ changedPath, taskOverride }) => {
      const root = tempDirs.make("openclaw-fast-ci-routing-");
      const changedPaths = [changedPath];
      const scopeEnv = Object.fromEntries(
        Object.entries(runCiChangedScopeFixture(changedPaths)).map(([key, value]) => [
          `OPENCLAW_CI_${key.toUpperCase()}`,
          value,
        ]),
      );
      const manifest = runCiManifestFixture({
        bundledPlanner: true,
        eventName: "pull_request",
        historicalCompatibility: false,
        changedPaths,
        scopeEnv: { ...scopeEnv, OPENCLAW_CI_DOCS_CHANGED: "false" },
      });
      expect(manifest.status, manifest.output).toBe(0);
      expect(
        Object.entries(manifest.outputs)
          .filter(([key, value]) => key.startsWith("run_") && value === "true")
          .map(([key]) => key)
          .toSorted(),
      ).toEqual([
        "run_checks_fast_core",
        "run_format_check",
        "run_node",
        "run_protocol_event_coverage",
      ]);
      for (const matrix of [
        "checks_node_core_nondist_matrix",
        "plugin_contracts_matrix",
        "channel_contracts_matrix",
        "checks_windows_matrix",
        "macos_node_matrix",
        "android_matrix",
      ]) {
        expect(JSON.parse(expectDefined(manifest.outputs[matrix], matrix)).include, matrix).toEqual(
          [],
        );
      }
      const fastTasks = JSON.parse(
        expectDefined(manifest.outputs.checks_fast_core_matrix, "fast checks matrix"),
      ).include as Array<{ task: string }>;
      expect(fastTasks.map(({ task }) => task)).toEqual([
        "baseline-ratchets",
        "coercion-helpers",
        "ci-routing",
      ]);
      const routingTask = expectDefined(
        fastTasks.find(({ task }) => task === "ci-routing"),
        "CI routing task",
      );
      const runStep = readCiWorkflow().jobs["checks-fast-core"].steps.find(
        (step: WorkflowStep) => step.name === "Run ${{ matrix.task }} (${{ matrix.runtime }})",
      );
      const fakeBin = path.join(root, "bin");
      const callsPath = path.join(root, "pnpm-calls.jsonl");
      mkdirSync(fakeBin);
      writeExecutable(path.join(fakeBin, "pnpm"), [
        "#!/usr/bin/env node",
        'require("node:fs").appendFileSync(process.env.PNPM_CALLS, JSON.stringify(process.argv.slice(2)) + "\\n");',
      ]);
      // The current manifest selects ci-routing; exercise the retained combined Bash case directly.
      const run = spawnSync("bash", ["-c", runStep.run], {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
          PNPM_CALLS: callsPath,
          TASK: taskOverride ?? routingTask.task,
        },
      });
      expect(run.status, `${run.stdout}${run.stderr}`).toBe(0);
      const calls = readFileSync(callsPath, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as string[]);
      expect(calls.map(([command]) => command)).toEqual(
        taskOverride ? ["test:contracts:plugins", "test"] : ["test"],
      );
      expect(
        calls.find(([command]) => command === "test"),
        "executed routing test argv",
      ).toContain("test/scripts/changed-path-facts.test.ts");
    },
  );

  it.skipIf(process.platform === "win32").each([
    { label: "base branch correction", context: "branch", direct: "a", accepted: true },
    { label: "base tag correction", context: "tag", direct: "a", accepted: true },
    { label: "annotated base tag", context: "tag", direct: "c", peeled: "a", accepted: true },
    {
      label: "versioned correction without a base lookup",
      context: "branch",
      packageVersion: "2026.9.1-1",
      accepted: true,
    },
    { label: "missing base tag", context: "branch", accepted: false },
    { label: "different base source", context: "branch", direct: "c", accepted: false },
    { label: "different peeled source", context: "tag", direct: "a", peeled: "c", accepted: false },
  ])(
    "binds npm stable $label to the exact source",
    ({ context, direct, peeled, packageVersion, accepted }) => {
      const result = runCiManifestFixture({
        bundledPlanner: true,
        packageVersion: packageVersion ?? "2026.9.1",
        remoteTagRefs: {
          ...(direct ? { "refs/tags/v2026.9.1": direct.repeat(40) } : {}),
          ...(peeled ? { "refs/tags/v2026.9.1^{}": peeled.repeat(40) } : {}),
        },
        scopeEnv: {
          OPENCLAW_CI_RELEASE_SCOPE: "npm-stable",
          OPENCLAW_CI_TARGET_REF: "a".repeat(40),
          OPENCLAW_CI_TARGET_CONTEXT_REF: context === "branch" ? "release/2026.9.1-1" : "",
          OPENCLAW_CI_TARGET_CONTEXT_TARGET: String(context === "branch"),
          OPENCLAW_CI_HISTORICAL_TARGET_TAG: context === "tag" ? "v2026.9.1-1" : "",
          OPENCLAW_CI_HISTORICAL_TARGET: String(context === "tag"),
        },
      });
      expect(result.status === 0, result.output).toBe(accepted);
      if (accepted) {
        expect(result.outputs.run_ios_build).toBe("false");
        expect(result.outputs.run_node).toBe("true");
      } else {
        expect(result.output).toContain(
          direct ? "correction base v2026.9.1 does not resolve" : "HTTP 404",
        );
        expect(result.outputs).not.toHaveProperty("run_node");
      }
    },
  );

  it.each<{ label: string } & Omit<Parameters<typeof runCiManifestFixture>[0], "bundledPlanner">>([
    { label: "stable target", packageVersion: "2026.9.1" },
    { label: "alpha target", packageVersion: "2026.9.1-alpha.1" },
    { label: "PR event", eventName: "pull_request" as const },
    { label: "fork repository", repository: "example/openclaw" },
    { label: "PR release gate", releaseGate: true },
    { label: "PR number", scopeEnv: { OPENCLAW_CI_PULL_REQUEST_NUMBER: "123" } },
    { label: "mutable target", scopeEnv: { OPENCLAW_CI_TARGET_REF: "release/2026.9.1" } },
    { label: "wrong target", scopeEnv: { OPENCLAW_CI_TARGET_REF: "c".repeat(40) } },
    { label: "unvalidated branch", scopeEnv: { OPENCLAW_CI_TARGET_CONTEXT_TARGET: "false" } },
    {
      label: "wrong release train",
      scopeEnv: { OPENCLAW_CI_TARGET_CONTEXT_REF: "release/2026.9.2" },
    },
    {
      label: "wrong release tag",
      scopeEnv: {
        OPENCLAW_CI_TARGET_CONTEXT_TARGET: "false",
        OPENCLAW_CI_HISTORICAL_TARGET: "true",
        OPENCLAW_CI_HISTORICAL_TARGET_TAG: "v2026.9.2-beta.1",
      },
    },
    { label: "unknown scope", scopeEnv: { OPENCLAW_CI_RELEASE_SCOPE: "package" } },
    ...["2026.9.1-beta.1", "2026.9.1-alpha.1", "2026.9.33", "2026.9.33-1"].map(
      (packageVersion) => ({
        label: `npm-stable with ${packageVersion}`,
        packageVersion,
        scopeEnv: { OPENCLAW_CI_RELEASE_SCOPE: "npm-stable" },
      }),
    ),
    {
      label: "correction package in a different release context",
      packageVersion: "2026.9.1-1",
      scopeEnv: { OPENCLAW_CI_RELEASE_SCOPE: "npm-stable" },
    },
  ])(
    "rejects scoped npm CI qualification for $label",
    ({ label: _label, scopeEnv, ...options }) => {
      const result = runCiManifestFixture({
        bundledPlanner: true,
        historicalCompatibility: false,
        packageVersion: "2026.9.1-beta.1",
        ...options,
        scopeEnv: {
          OPENCLAW_CI_RELEASE_SCOPE: "npm-beta",
          OPENCLAW_CI_TARGET_REF: "a".repeat(40),
          OPENCLAW_CI_TARGET_CONTEXT_REF: "release/2026.9.1",
          OPENCLAW_CI_TARGET_CONTEXT_TARGET: "true",
          ...scopeEnv,
        },
      });
      expect(result.status, result.output).not.toBe(0);
      expect(result.output).toContain("release_scope");
      expect(result.outputs).not.toHaveProperty("run_node");
    },
  );

  it.each([
    ["pull_request", "openclaw/openclaw", true],
    ["pull_request", "example/openclaw", false],
    ["push", "openclaw/openclaw", false],
    ["workflow_dispatch", "openclaw/openclaw", false],
  ] as const)(
    "forwards changed paths only to canonical PR fallback (%s, %s)",
    (eventName, repository, forwardsChangedPaths) => {
      const changedPaths = [
        "src/plugins/manifest-tool-availability.ts",
        "src/plugins/tools.optional.test.ts",
      ];
      const manifest = runCiManifestFixture({
        bundledPlanner: true,
        changedPaths,
        eventName,
        repository,
      });
      expect(manifest.status, manifest.output).toBe(0);
      const rows = JSON.parse(
        expectDefined(manifest.outputs.checks_node_core_nondist_matrix, "fallback matrix"),
      ).include;
      expect(rows).toHaveLength(1);
      expect(rows[0].check_name).toBe("bundled-node-plan");
      expect(rows[0].includePatterns).toEqual(forwardsChangedPaths ? changedPaths : undefined);
    },
  );

  it.each([false, true])(
    "projects immutable reader history only when the selected target has the reader (present=%s)",
    (historicalReader) => {
      const manifest = runCiManifestFixture({
        bundledPlanner: true,
        changedPaths: ["src/audit/message-delivery-progress-store.test.ts"],
        eventName: "pull_request",
        historicalReader,
      });
      expect(manifest.status, manifest.output).toBe(0);
      const rows = JSON.parse(
        expectDefined(manifest.outputs.checks_node_core_nondist_matrix, "reader matrix"),
      ).include;
      expect(rows).toHaveLength(1);
      expect(rows[0].git_commits).toEqual(
        historicalReader ? ["5dc4cf602bc5e263e83cd16a12bb1e100544f4c3"] : [],
      );
    },
  );

  it.each([
    ["pull_request", "compact", "blacksmith", 120],
    ["pull_request", "precise", "github", 120],
    ["push", "compact", "hybrid", 64],
    ["workflow_dispatch", "compact", "blacksmith", null],
  ] as const)(
    "bounds the final Node matrix for %s %s plans",
    (eventName, selection, runnerProfile, limit) => {
      for (const count of [limit ?? 120, (limit ?? 120) + 1]) {
        const hasFallback = eventName === "pull_request" && selection === "compact";
        const nodeTestShards = Array.from({ length: count - Number(hasFallback) }, (_, index) => ({
          checkName: `node-admission-${index}`,
          shardName: `node-admission-${index}`,
          configs: ["test/vitest/vitest.infra.config.ts"],
          runner: "ubuntu-24.04",
          requiresDist: false,
        }));
        const result = runCiManifestFixture({
          bundledPlanner: true,
          changedPaths: ["extensions/matrix/src/channel.ts"],
          changedPlannerSource:
            selection === "precise"
              ? `export { createNodeTestShards as createChangedNodeTestShards } from "./ci-node-test-plan.mts";
                 export const createChangedExtensionFallbackShards = () => [];`
              : undefined,
          eventName,
          nodeTestShards: [
            ...nodeTestShards,
            {
              checkName: "node-admission-dist",
              shardName: "node-admission-dist",
              configs: ["test/vitest/vitest.infra.config.ts"],
              runner: "ubuntu-24.04",
              requiresDist: true,
            },
          ],
          runnerProfile,
        });
        if (limit !== null && count > limit) {
          expect(result.status, result.output).toBe(1);
          expect(result.output).toContain(
            `Canonical ${eventName} Node matrix has ${count} jobs, exceeding limit ${limit}`,
          );
          expect(result.outputs.checks_node_core_nondist_matrix).toBeUndefined();
          expect(result.outputs.run_checks_node_core_nondist).toBeUndefined();
        } else {
          expect(result.status, result.output).toBe(0);
          const rows = JSON.parse(
            expectDefined(result.outputs.checks_node_core_nondist_matrix, "bounded Node matrix"),
          ).include;
          expect(rows.map((row: { check_name: string }) => row.check_name)).toEqual([
            ...(hasFallback ? ["changed-extension-fallback-plan"] : []),
            ...nodeTestShards.map((shard) => shard.checkName),
          ]);
          expect(result.outputs.run_checks_node_core_dist).toBe("true");
        }
      }
    },
  );

  it("admits slow compact and plugin fallback rows before shorter work", () => {
    const result = runCiManifestFixture({
      bundledPlanner: true,
      changedPaths: ["extensions/matrix/src/channel.ts"],
      eventName: "pull_request",
      nodeTestShards: [30, 240, 240].map((predictedSeconds, index) => ({
        checkName: `compact-${index}`,
        shardName: `compact-${index}`,
        configs: ["test/vitest/vitest.infra.config.ts"],
        runner: "ubuntu-24.04",
        requiresDist: false,
        predictedSeconds,
      })),
    });
    expect(result.status, result.output).toBe(0);
    const rows = JSON.parse(
      expectDefined(result.outputs.checks_node_core_nondist_matrix, "Node matrix"),
    ).include;
    expect(rows.map((row: { check_name: string }) => row.check_name)).toEqual([
      "compact-1",
      "compact-2",
      "changed-extension-fallback-plan",
      "compact-0",
    ]);
    expect(rows.map((row: { predicted_seconds: number }) => row.predicted_seconds)).toEqual([
      240, 240, 120, 30,
    ]);
  });

  it.each([
    { label: "current", frozenTarget: false, compatibilityTarget: false, shards: [1, 2, 3] },
    { label: "frozen current", frozenTarget: true, compatibilityTarget: false, shards: [1] },
    { label: "frozen legacy", frozenTarget: true, compatibilityTarget: true, shards: [1] },
  ])("executes the $label standalone UI envelope", async (scenario) => {
    const workflow = readCiWorkflow();
    const ui = workflow.jobs["checks-ui"];
    const lint = ui.steps.find(
      (step: WorkflowStep) => step.name === "Lint Control UI window.open usage",
    );
    const test = ui.steps.find((step: WorkflowStep) => step.name === "Test Control UI");
    const context = {
      eventName: scenario.frozenTarget ? "workflow_dispatch" : "pull_request",
      frozenTarget: scenario.frozenTarget,
      preflightOutputs: { compatibility_target: String(scenario.compatibilityTarget) },
      repository: "openclaw/openclaw",
      runAttempt: 1,
      runnerBackend: "hybrid",
    } as const;
    // A workflow job without a matrix executes once.
    const shards = ui.strategy
      ? evaluateWorkflowExpression(ui.strategy.matrix.shard, context)
      : [1];
    expect(shards).toEqual(scenario.shards);
    if (!scenario.frozenTarget) {
      expect(ui.strategy).toMatchObject({ "fail-fast": false, "max-parallel": 3 });
    }
    expect(ui.needs).toEqual(["preflight"]);
    expect(ui.if).toBe("needs.preflight.outputs.run_ui_tests == 'true'");
    expect(ui.permissions).toEqual({ contents: "read" });
    expect(ui["timeout-minutes"]).toBe(20);
    expect(workflow.jobs["ci-gate"].needs).toContain("checks-ui");

    const root = tempDirs.make("openclaw-ui-workflow-");
    const bin = path.join(root, "bin");
    const callsPath = path.join(root, "calls.txt");
    const argsPath = path.join(root, "vitest-args.json");
    mkdirSync(bin);
    for (const command of ["node", "pnpm"]) {
      writeExecutable(path.join(bin, command), [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        `printf '%s\\n' '${command} '"$*" >> "$UI_COMMAND_CALLS"`,
        ...(command === "node"
          ? ['printf "%s\\n" "$OPENCLAW_NODE_TEST_VITEST_ARGS_JSON" > "$UI_VITEST_ARGS"']
          : []),
      ]);
    }
    for (const shard of scenario.shards) {
      const rowContext = { ...context, matrix: { shard } };
      const resolveValue = (value: unknown): string =>
        typeof value === "string" && value.startsWith("${{")
          ? String(evaluateWorkflowExpression(value, rowContext))
          : String(value);
      expect(resolveValue(ui.name)).toBe(
        scenario.frozenTarget ? "checks-ui" : `checks-ui (${shard}/3)`,
      );
      expect(evaluateWorkflowExpression(ui["runs-on"], rowContext)).toBe(
        scenario.frozenTarget ? "ubuntu-24.04" : "blacksmith-8vcpu-ubuntu-2404",
      );
      const env = Object.fromEntries(
        Object.entries({ ...ui.env, ...test.env }).map(([key, value]) => [
          key,
          resolveValue(value),
        ]),
      );
      expect(env.OPENCLAW_NODE_TEST_PLAN_CONCURRENCY).toBe("1");
      const flags = [
        "--maxWorkers",
        "3",
        "--reporter=verbose",
        "--reporter=github-actions",
        "--reporter=./scripts/lib/vitest-resource-reporter.mts",
        ...(scenario.frozenTarget ? [] : [`--shard=${shard}/3`]),
      ];
      const steps = [
        ...(!lint.if || evaluateWorkflowExpression(lint.if, rowContext) ? [lint] : []),
        test,
      ];
      for (const step of steps) {
        const result = runWorkflowShellScript(step.run, {
          cwd: root,
          env: {
            ...process.env,
            ...env,
            PATH: `${bin}:${process.env.PATH ?? ""}`,
            UI_COMMAND_CALLS: callsPath,
            UI_VITEST_ARGS: argsPath,
          },
        });
        expect(result.status, result.stdout + result.stderr).toBe(0);
      }
      if (!scenario.compatibilityTarget) {
        env.OPENCLAW_NODE_TEST_VITEST_ARGS_JSON = readFileSync(argsPath, "utf8");
        expect(JSON.parse(env.OPENCLAW_NODE_TEST_VITEST_ARGS_JSON)).toEqual(flags);
        const forwarded: string[][] = [];
        expect(
          await runShardPlans(resolveShardPlans(env), {
            concurrency: Number(env.OPENCLAW_NODE_TEST_PLAN_CONCURRENCY),
            env,
            scratchDir: root,
            runChild: async (args, childEnv) => {
              forwarded.push(args);
              expect(childEnv.OPENCLAW_TEST_PROJECTS_PARALLEL).toBe("1");
              return 0;
            },
          }),
        ).toBe(0);
        expect(forwarded).toEqual([["ui/vitest.config.ts", "--", ...flags]]);
      }
    }
    const calls = readFileSync(callsPath, "utf8").trim().split("\n");
    expect(calls.filter((call) => call === "pnpm lint:ui:no-raw-window-open")).toHaveLength(1);
    expect(calls.filter((call) => call !== "pnpm lint:ui:no-raw-window-open")).toEqual(
      scenario.compatibilityTarget
        ? ["pnpm --dir ui test --testTimeout=30000 --isolate"]
        : scenario.shards.map(() => "node --import tsx scripts/ci-run-node-test-shard.mts"),
    );
  });

  it("keeps private Control UI servers and resource-sensitive files under one serial owner", () => {
    const trackedUiE2eFiles = execFileSync(
      "git",
      [
        "ls-files",
        "--",
        ":(glob)ui/src/**/*.e2e.test.ts",
        ":(glob)extensions/*/browser/**/*.e2e.test.ts",
      ],
      { encoding: "utf8" },
    )
      .trim()
      .split("\n")
      .filter(Boolean)
      .toSorted();
    const helperPrivateServerFiles = trackedUiE2eFiles.filter((file) => {
      const sourceFile = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      let ownsPrivateServer = false;
      const visit = (node: ts.Node, inSuiteServer = false) => {
        if (ownsPrivateServer) {
          return;
        }
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
          // A Gateway or Vite proxy acquired by the suite owns its UI server;
          // a separate backend in a test can still use the shared UI bundle.
          if (
            inSuiteServer &&
            (node.expression.text === "createOpenClawTestInstance" ||
              node.expression.text === "startProductionControlUiE2eServer" ||
              node.expression.text === "createServer")
          ) {
            ownsPrivateServer = true;
            return;
          }
          const options = node.arguments[0];
          if (
            node.expression.text === "createControlUiE2eSuite" &&
            options &&
            ts.isObjectLiteralExpression(options)
          ) {
            for (const property of options.properties) {
              if (
                (ts.isMethodDeclaration(property) || ts.isPropertyAssignment(property)) &&
                (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
                property.name.text === "startServer"
              ) {
                visit(property, true);
              }
            }
          }
          if (
            node.expression.text === "createQuotaResetFixture" ||
            (node.expression.text === "createSessionManagementE2eSuite" &&
              node.arguments[0]?.kind === ts.SyntaxKind.TrueKeyword)
          ) {
            ownsPrivateServer = true;
            return;
          }
          const buildInfo = node.arguments[1];
          if (
            node.expression.text === "createSidebarFooterProofSuite" &&
            buildInfo &&
            !(ts.isIdentifier(buildInfo) && buildInfo.text === "undefined")
          ) {
            ownsPrivateServer = true;
            return;
          }
        }
        ts.forEachChild(node, (child) => visit(child, inSuiteServer));
      };
      visit(sourceFile);
      return ownsPrivateServer;
    });
    const directPrivateServerFiles = trackedUiE2eFiles.filter((file) => {
      const source = readFileSync(file, "utf8");
      return /\bsource:\s*true\b/u.test(source) || /\bstartControlUiE2eServer\(\s*\{/u.test(source);
    });
    const privateServerFiles = [
      ...new Set([...directPrivateServerFiles, ...helperPrivateServerFiles]),
    ].toSorted();

    expect(privateServerFiles).toEqual(uiE2ePrivateServerTestFiles);
    expect(helperPrivateServerFiles.toSorted()).toEqual([
      "ui/src/e2e/agent-file-lifecycle.real-gateway.e2e.test.ts",
      "ui/src/e2e/chat-agent-avatar.real-gateway.e2e.test.ts",
      "ui/src/e2e/chat-composer-websearch-kill-switch.real-gateway.e2e.test.ts",
      "ui/src/e2e/chat-loading-performance.real-gateway.e2e.test.ts",
      "ui/src/e2e/chat-project-media.real-gateway.e2e.test.ts",
      "ui/src/e2e/chat-stop-finished-run.real-gateway.e2e.test.ts",
      "ui/src/e2e/chat-thinking-metadata.real-gateway.e2e.test.ts",
      "ui/src/e2e/chat-widget-sandbox.real-gateway.e2e.test.ts",
      "ui/src/e2e/child-session-load-errors.e2e.test.ts",
      "ui/src/e2e/command-palette-catalog.real-gateway.e2e.test.ts",
      "ui/src/e2e/cron-duration-save.real-gateway.e2e.test.ts",
      "ui/src/e2e/desktop-resize.real-gateway.e2e.test.ts",
      "ui/src/e2e/device-platform-family.real-gateway.e2e.test.ts",
      "ui/src/e2e/mobile-chat-session-menu.e2e.test.ts",
      "ui/src/e2e/mobile-sidebar-session-menu.e2e.test.ts",
      "ui/src/e2e/model-api-keys.real-gateway.e2e.test.ts",
      "ui/src/e2e/model-catalog-partial-refresh.real-gateway.e2e.test.ts",
      "ui/src/e2e/model-picker-search.real-gateway.e2e.test.ts",
      "ui/src/e2e/new-session-page.cloud-startup.runtime-load.e2e.test.ts",
      "ui/src/e2e/quota-reset-status.real-gateway.e2e.test.ts",
      "ui/src/e2e/session-management.delete.e2e.test.ts",
      "ui/src/e2e/sidebar-account-footer.e2e.test.ts",
    ]);
    expect(uiE2eRealGatewayTestFiles.every((file) => uiE2eSerialTestFiles.includes(file))).toBe(
      true,
    );
    expect(uiE2eSerialTestFiles).toContain(uiE2eRuntimeBudgetTestFile);

    const config = createUiE2eVitestConfig({}, []);
    const projects = config.test?.projects as Array<{
      cacheDir: string;
      test: {
        exclude: string[];
        fileParallelism: boolean;
        globalSetup?: string[];
        include: string[];
        maxWorkers?: number;
        name: string;
        sequence: { groupOrder: number };
      };
    }>;
    const selectedFiles = (test: { exclude: string[]; include: string[] }) =>
      globSync(test.include, { cwd: process.cwd(), exclude: test.exclude }).toSorted();
    const rootTest = config.test as { exclude: string[]; include: string[] };
    expect(config.test?.globalSetup).toEqual([]);
    expect(config.test?.include).toEqual([
      "ui/src/**/*.e2e.test.ts",
      "extensions/*/browser/**/*.e2e.test.ts",
    ]);
    expect(projects.map((project) => project.test.name)).toEqual([
      "ui-e2e-bundled",
      "ui-e2e-standalone",
      "ui-e2e-serial",
      "ui-e2e-serial-standalone",
    ]);
    const chromiumSetup = "test/vitest/vitest.ui-e2e.global-setup.ts";
    const bundledSetup = "test/vitest/vitest.ui-e2e.bundled.global-setup.ts";
    expect(projects.map((project) => project.test.globalSetup)).toEqual([
      [chromiumSetup, bundledSetup],
      [chromiumSetup],
      [chromiumSetup, bundledSetup],
      [chromiumSetup],
    ]);
    expect(new Set(projects.map((project) => project.cacheDir)).size).toBe(projects.length);
    expect(config.test?.maxWorkers).toBe(Math.min(2, sharedVitestConfig.test.maxWorkers));
    expect(projects[0]?.test).toMatchObject({
      fileParallelism: sharedVitestConfig.test.fileParallelism,
      maxWorkers: undefined,
      sequence: { groupOrder: 0 },
    });
    expect(projects[1]?.test).toMatchObject({
      fileParallelism: sharedVitestConfig.test.fileParallelism,
      maxWorkers: undefined,
      sequence: { groupOrder: 0 },
    });
    for (const project of projects.slice(2)) {
      expect(project.test).toMatchObject({
        exclude: expect.not.arrayContaining(uiE2eRealGatewayTestFiles),
        fileParallelism: false,
        maxWorkers: 1,
        sequence: { groupOrder: 1 },
      });
    }
    expect(projects[0]?.test.exclude).toEqual(expect.arrayContaining(uiE2eSerialTestFiles));

    const realGateway = new Set(uiE2eRealGatewayTestFiles);
    const ordinary = trackedUiE2eFiles.filter((file) => !realGateway.has(file));
    const serial = new Set(uiE2eSerialTestFiles);
    const localSelected = projects.map((project) => selectedFiles(project.test));
    expect(selectedFiles(rootTest)).toEqual(trackedUiE2eFiles);
    expect(localSelected.slice(0, 2).flat().toSorted()).toEqual(
      trackedUiE2eFiles.filter((file) => !serial.has(file)),
    );
    expect(localSelected.slice(2).flat().toSorted()).toEqual(uiE2eSerialTestFiles);
    expect(localSelected[1]).toEqual([
      "ui/src/e2e/board-fixture.e2e.test.ts",
      "ui/src/e2e/control-ui-retained-assets.e2e.test.ts",
      "ui/src/e2e/service-worker-update.e2e.test.ts",
    ]);
    expect(localSelected[3]).toEqual(uiE2ePrivateServerTestFiles);
    expect(localSelected.flat().toSorted()).toEqual(trackedUiE2eFiles);
    expect(new Set(localSelected.flat()).size).toBe(trackedUiE2eFiles.length);

    const ordinaryConfig = createUiE2eVitestConfig({ OPENCLAW_UI_E2E_SKIP_REAL_GATEWAY: "1" }, []);
    const ordinaryProjects = ordinaryConfig.test?.projects as typeof projects;
    const ordinarySelected = ordinaryProjects.map((project) => selectedFiles(project.test));
    expect(selectedFiles(ordinaryConfig.test as typeof rootTest)).toEqual(ordinary);
    expect(ordinarySelected.slice(0, 2).flat().toSorted()).toEqual(
      ordinary.filter((file) => !serial.has(file)),
    );
    expect(ordinarySelected.slice(2).flat().toSorted()).toEqual(
      ordinary.filter((file) => serial.has(file)),
    );
    expect(ordinarySelected.flat().toSorted()).toEqual(ordinary);
    expect(new Set(ordinarySelected.flat()).size).toBe(ordinary.length);

    const bundledFile = expectDefined(ordinarySelected[0]?.[0], "bundled Control UI E2E file");
    const serialFile = expectDefined(ordinarySelected[3]?.[0], "serial Control UI E2E file");
    const narrowedByArgv = createUiE2eVitestConfig({}, ["node", "vitest", serialFile]);
    const argvProjects = narrowedByArgv.test?.projects as typeof projects;
    expect(argvProjects.map((project) => selectedFiles(project.test))).toEqual([
      [],
      [],
      [],
      [serialFile],
    ]);

    const includeDir = tempDirs.make("openclaw-ui-e2e-project-includes-");
    const includeFile = path.join(includeDir, "include.json");
    writeFileSync(includeFile, JSON.stringify([bundledFile, serialFile]));
    const narrowedByFile = createUiE2eVitestConfig(
      { OPENCLAW_UI_E2E_SKIP_REAL_GATEWAY: "1", OPENCLAW_VITEST_INCLUDE_FILE: includeFile },
      [],
    );
    const includeProjects = narrowedByFile.test?.projects as typeof projects;
    expect(includeProjects.map((project) => selectedFiles(project.test))).toEqual([
      [bundledFile],
      [],
      [],
      [serialFile],
    ]);

    writeFileSync(includeFile, JSON.stringify(["ui/src/e2e/*.e2e.test.ts"]));
    const narrowedByGlob = createUiE2eVitestConfig(
      { OPENCLAW_UI_E2E_SKIP_REAL_GATEWAY: "1", OPENCLAW_VITEST_INCLUDE_FILE: includeFile },
      [],
    );
    const globProjects = narrowedByGlob.test?.projects as typeof projects;
    const expectedGlobFiles = ordinary.filter((file) =>
      path.matchesGlob(file, "ui/src/e2e/*.e2e.test.ts"),
    );
    expect(globProjects.flatMap((project) => selectedFiles(project.test)).toSorted()).toEqual(
      expectedGlobFiles,
    );
    expect(new Set(globProjects.flatMap((project) => selectedFiles(project.test))).size).toBe(
      expectedGlobFiles.length,
    );
  });

  it("retains shared worker limits and local throttling in the bundled UI project", () => {
    const original = sharedVitestConfig.test;
    try {
      for (const [maxWorkers, fileParallelism, expectedWorkers] of [
        [1, false, 1],
        [8, true, 2],
      ] as const) {
        sharedVitestConfig.test = { ...original, maxWorkers, fileParallelism };
        const config = createUiE2eVitestConfig({}, []);
        const projects = config.test?.projects as Array<{
          test: { maxWorkers?: number; fileParallelism: boolean };
        }>;
        expect(config.test?.maxWorkers).toBe(expectedWorkers);
        expect(projects.map((project) => project.test.maxWorkers)).toEqual([
          undefined,
          undefined,
          1,
          1,
        ]);
        expect(projects.map((project) => project.test.fileParallelism)).toEqual([
          fileParallelism,
          fileParallelism,
          false,
          false,
        ]);
      }
    } finally {
      sharedVitestConfig.test = original;
    }
  });

  it("uses the target-owned UI project capability for frozen manual matrices and commands", () => {
    for (const [runnerBackend, legacyJobCount] of [
      ["blacksmith", 4],
      ["github", 14],
      ["hybrid", 14],
    ] as const) {
      for (const uiE2eProjectsCapability of [false, true]) {
        const jobCount = uiE2eProjectsCapability ? 13 : legacyJobCount;
        const manifest = runCiManifestFixture({
          bundledPlanner: true,
          eventName: "workflow_dispatch",
          historicalCompatibility: false,
          runnerBackend,
          uiE2eProjectsCapability,
        });
        expect(manifest.status, manifest.output).toBe(0);
        expect(manifest.outputs.frozen_target).toBe("true");
        expect(manifest.outputs.compatibility_target).toBe("false");
        expect(
          JSON.parse(
            expectDefined(manifest.outputs.ui_e2e_matrix, `${runnerBackend} UI E2E matrix`),
          ),
        ).toEqual({
          include: Array.from({ length: jobCount }, (_, index) => {
            const shard = index + 1;
            return {
              shard,
              shard_count: jobCount,
              task: shard === jobCount ? "browser-extension" : "control-ui",
              vitest_shard_count: jobCount - 1,
            };
          }),
        });
      }
    }

    const uiE2E = readCiWorkflow().jobs["checks-ui-e2e"];
    const scenario = expectDefined(
      uiE2E.steps.find((step: WorkflowStep) => step.name === "Test Control UI end-to-end"),
      "Control UI E2E suite",
    );
    const commandRoot = tempDirs.make("openclaw-ui-e2e-project-command-");
    const commandBin = path.join(commandRoot, "bin");
    const commandArgs = path.join(commandRoot, "args");
    mkdirSync(commandBin);
    writeFileSync(
      path.join(commandBin, "node"),
      '#!/bin/sh\nprintf "%s\\n" "$@" > "$UI_E2E_COMMAND_ARGS"\n',
      { mode: 0o755 },
    );
    const runCommand = (env: Record<string, string>) => {
      const result = runWorkflowShellScript(expectDefined(scenario.run, "UI E2E command"), {
        cwd: commandRoot,
        env: {
          ...process.env,
          ...env,
          PATH: `${commandBin}:${process.env.PATH ?? ""}`,
          UI_E2E_COMMAND_ARGS: commandArgs,
        },
      });
      expect(result.status, result.stdout + result.stderr).toBe(0);
      return readFileSync(commandArgs, "utf8").trim().split("\n");
    };
    expect(runCommand({ VITEST_SHARD_COUNT: "3", VITEST_SHARD_INDEX: "1" })).toEqual([
      "scripts/run-vitest.mjs",
      "run",
      "--config",
      "test/vitest/vitest.ui-e2e.config.ts",
      "--configLoader",
      "runner",
      "--shard",
      "1/3",
    ]);

    expect(
      evaluateWorkflowExpression(`\${{ ${uiE2E.if} }}`, {
        eventName: "workflow_dispatch",
        preflightOutputs: { compatibility_target: "true", run_ui_tests: "true" },
        repository: "openclaw/openclaw",
        runAttempt: 1,
      }),
    ).toBe(false);
  });

  it("gates current Control UI changes on ordinary and real-Gateway Chromium E2E", () => {
    const workflow = readCiWorkflow();
    const ui = workflow.jobs["checks-ui"];
    const uiE2e = workflow.jobs["checks-ui-e2e"];
    const uiE2eRealGateway = workflow.jobs["checks-ui-e2e-real-gateway"];

    expect(uiE2e.permissions).toEqual({ contents: "read" });
    expect(uiE2e.needs).toEqual(["preflight"]);
    expect(uiE2e.if).toBe(
      "needs.preflight.outputs.run_ui_e2e == 'true' && needs.preflight.outputs.compatibility_target != 'true'",
    );
    expect(uiE2e["runs-on"]).not.toBe(ui["runs-on"]);
    expect(uiE2e["timeout-minutes"]).toBe(25);
    expect(uiE2e.env).toEqual({ OPENCLAW_UI_E2E_SKIP_REAL_GATEWAY: "1" });
    expect(uiE2e.strategy["fail-fast"]).toBe(false);
    expect(uiE2e.strategy["max-parallel"]).toBe(14);
    expect(uiE2e.strategy.matrix).toBe("${{ fromJson(needs.preflight.outputs.ui_e2e_matrix) }}");
    const expectedUiE2eMatrices = [6, 12].map((vitestShardCount) => ({
      include: Array.from({ length: vitestShardCount + 1 }, (_, index) => {
        const shard = index + 1;
        return {
          shard,
          shard_count: vitestShardCount + 1,
          task: shard === vitestShardCount + 1 ? "browser-extension" : "control-ui",
          vitest_shard_count: vitestShardCount,
        };
      }),
    }));
    for (const runnerBackend of ["blacksmith", "github", "hybrid"] as const) {
      for (const eventName of ["push", "pull_request"] as const) {
        for (const runAttempt of ["1", "2", ""]) {
          const manifest = runCiManifestFixture({
            bundledPlanner: true,
            changedPaths: [],
            eventName,
            historicalCompatibility: false,
            runnerBackend,
            uiE2eProjectsCapability: true,
            scopeEnv: { GITHUB_RUN_ATTEMPT: runAttempt },
          });
          const assertionName = `${runnerBackend} ${eventName} attempt ${runAttempt || "missing"}`;
          expect(manifest.status, manifest.output).toBe(0);
          expect(
            JSON.parse(expectDefined(manifest.outputs.ui_e2e_matrix, assertionName)),
            assertionName,
          ).toEqual(
            expectedUiE2eMatrices[
              (runnerBackend === "blacksmith" || runnerBackend === "hybrid") && runAttempt === "1"
                ? 0
                : 1
            ],
          );
        }
      }
    }
    expect(workflow.jobs["ci-gate"].needs).toContain("checks-ui-e2e");
    expect(workflow.jobs["ci-gate"].needs).toContain("checks-ui-e2e-real-gateway");

    expect(uiE2eRealGateway.permissions).toEqual(uiE2e.permissions);
    expect(uiE2eRealGateway.needs).toEqual(uiE2e.needs);
    expect(uiE2eRealGateway.if).toBe(uiE2e.if);
    expect(uiE2eRealGateway.env).toBeUndefined();

    const uiE2eSetup = expectDefined(
      uiE2e.steps.find((step: WorkflowStep) => step.name === "Setup Node environment"),
      "Control UI E2E Node setup",
    );
    expect(uiE2eSetup.uses).toBe("./.ci-harness/.github/actions/setup-node-env");
    const expectedSharedUiE2eSetup = {
      "cache-mode": "${{ needs.preflight.outputs.cache_mode }}",
      "node-version": "24.x",
      "install-bun": "false",
      "dependency-cache": expect.any(String),
    } as const;
    const expectedUiE2eSetup = {
      ...expectedSharedUiE2eSetup,
      "restore-test-caches":
        "${{ (needs.preflight.outputs.runner_profile == 'github' || needs.preflight.outputs.runner_profile == 'hybrid') && 'true' || 'false' }}",
    } as const;
    expect(uiE2eSetup.with).toEqual(expectedUiE2eSetup);
    const realGatewaySetup = expectDefined(
      uiE2eRealGateway.steps.find((step: WorkflowStep) => step.name === "Setup Node environment"),
      "real-Gateway Control UI E2E Node setup",
    );
    expect(realGatewaySetup).toMatchObject({
      uses: uiE2eSetup.uses,
      with: expectedSharedUiE2eSetup,
    });
    expect(realGatewaySetup.with).toEqual(expectedSharedUiE2eSetup);

    // Failed-job retries reuse the six-row matrix while live routing selects
    // hosted runners. Both widths must retain the cache and contributor boundaries.
    const routedUiE2eJobs = [
      ...expectedUiE2eMatrices
        .flatMap(({ include }) => include)
        .map((matrix) => ({
          job: uiE2e,
          name: `checks-ui-e2e (${matrix.shard}/${matrix.shard_count})`,
          setup: uiE2eSetup,
          matrix,
          blacksmithRunner:
            matrix.task === "control-ui"
              ? "blacksmith-32vcpu-ubuntu-2404"
              : "blacksmith-8vcpu-ubuntu-2404",
        })),
      {
        job: uiE2eRealGateway,
        name: "checks-ui-e2e-real-gateway",
        setup: realGatewaySetup,
        matrix: {},
        blacksmithRunner: "blacksmith-32vcpu-ubuntu-2404",
      },
    ] as const;
    const routingScenarios = [
      {
        name: "same-repo pull request first attempt",
        context: {
          eventName: "pull_request",
          headRepository: "openclaw/openclaw",
          repository: "openclaw/openclaw",
          runAttempt: 1,
        },
        expected: { blacksmith: true, dependencyCache: "true" },
      },
      {
        name: "same-repo pull request with GitHub backend",
        context: {
          eventName: "pull_request",
          headRepository: "openclaw/openclaw",
          repository: "openclaw/openclaw",
          runnerBackend: "github",
          runAttempt: 1,
        },
        expected: { blacksmith: false, dependencyCache: "false" },
      },
      {
        name: "same-repo pull request with hybrid backend",
        context: {
          eventName: "pull_request",
          headRepository: "openclaw/openclaw",
          repository: "openclaw/openclaw",
          runnerBackend: "hybrid",
          runAttempt: 1,
        },
        expected: { blacksmith: true, dependencyCache: "true" },
      },
      {
        name: "same-repo pull request retry",
        context: {
          eventName: "pull_request",
          headRepository: "openclaw/openclaw",
          repository: "openclaw/openclaw",
          runAttempt: 2,
        },
        expected: { blacksmith: false, dependencyCache: "false" },
      },
      {
        name: "same-repo pull request with hybrid backend retry",
        context: {
          eventName: "pull_request",
          headRepository: "openclaw/openclaw",
          repository: "openclaw/openclaw",
          runnerBackend: "hybrid",
          runAttempt: 2,
        },
        expected: { blacksmith: false, dependencyCache: "false" },
      },
      {
        name: "canonical hybrid push retry",
        context: {
          eventName: "push",
          repository: "openclaw/openclaw",
          runnerBackend: "hybrid",
          runAttempt: 2,
        },
        expected: { blacksmith: false, dependencyCache: "false" },
      },
      {
        // Runner routing follows contributor trust; the exact dependency cache
        // stays fork-gated either way, so a fork never writes what main reads.
        name: "fork pull request from returning contributor",
        context: {
          authorAssociation: "CONTRIBUTOR",
          eventName: "pull_request",
          headRepository: "contributor/openclaw",
          repository: "openclaw/openclaw",
          runAttempt: 1,
        },
        expected: { blacksmith: true, dependencyCache: "false" },
      },
      {
        name: "fork pull request from unknown author",
        context: {
          authorAssociation: "NONE",
          eventName: "pull_request",
          headRepository: "contributor/openclaw",
          repository: "openclaw/openclaw",
          runAttempt: 1,
        },
        expected: { blacksmith: false, dependencyCache: "false" },
      },
      {
        name: "workflow dispatch",
        context: {
          eventName: "workflow_dispatch",
          repository: "openclaw/openclaw",
          runAttempt: 1,
        },
        expected: { blacksmith: false, dependencyCache: "false" },
      },
      {
        name: "canonical push retry",
        context: {
          eventName: "push",
          repository: "openclaw/openclaw",
          runAttempt: 2,
        },
        expected: { blacksmith: true, dependencyCache: "true" },
      },
    ] as const;
    for (const { blacksmithRunner, job, matrix, name: jobName, setup } of routedUiE2eJobs) {
      for (const { context, expected, name: scenarioName } of routingScenarios) {
        const assertionName = `${jobName}: ${scenarioName}`;
        const expectedRunner = expected.blacksmith ? blacksmithRunner : "ubuntu-24.04";
        expect(
          evaluateWorkflowExpression(job["runs-on"], { ...context, matrix }),
          assertionName,
        ).toBe(expectedRunner);
        expect(
          evaluateWorkflowExpression(setup.with?.["dependency-cache"], {
            ...context,
            matrix,
            runnerEnvironment: expected.blacksmith ? "self-hosted" : "github-hosted",
          }),
          assertionName,
        ).toBe(expected.dependencyCache);
        expect(setup.with?.["cache-mode"], assertionName).toBe(
          "${{ needs.preflight.outputs.cache_mode }}",
        );
      }
    }

    const chromiumInstall = expectDefined(
      uiE2e.steps.find((step: WorkflowStep) => step.name === "Install Playwright Chromium"),
      "Control UI E2E Chromium installation",
    );
    expect(chromiumInstall.env.FROZEN_TARGET).toBe("${{ needs.preflight.outputs.frozen_target }}");
    expect(chromiumInstall.run).toContain(
      "node --import tsx scripts/ensure-playwright-chromium.mts",
    );
    expect(chromiumInstall.run).toContain("node scripts/ensure-playwright-chromium.mjs");
    const chromiumCache = expectDefined(
      uiE2e.steps.find((step: WorkflowStep) => step.name === "Cache Playwright Chromium"),
      "Control UI E2E Chromium cache",
    );
    const realGatewayChromiumInstall = expectDefined(
      uiE2eRealGateway.steps.find(
        (step: WorkflowStep) => step.name === "Install Playwright Chromium",
      ),
      "real-Gateway Control UI E2E Chromium installation",
    );
    expect(realGatewayChromiumInstall).toEqual(chromiumInstall);
    const realGatewayChromiumCache = expectDefined(
      uiE2eRealGateway.steps.find(
        (step: WorkflowStep) => step.name === "Cache Playwright Chromium",
      ),
      "real-Gateway Control UI E2E Chromium cache",
    );
    expect(realGatewayChromiumCache).toEqual(chromiumCache);

    const scenario = expectDefined(
      uiE2e.steps.find((step: WorkflowStep) => step.name === "Test Control UI end-to-end"),
      "Control UI E2E suite",
    );
    expect(scenario.if).toBe("matrix.task == 'control-ui'");
    expect(scenario.env).toEqual({
      OPENCLAW_UI_E2E_DIAGNOSTIC_DIR:
        ".artifacts/control-ui-e2e-timeouts/shard-${{ matrix.shard }}-attempt-${{ github.run_attempt }}",
      VITEST_SHARD_INDEX: "${{ matrix.shard }}",
      VITEST_SHARD_COUNT: "${{ matrix.vitest_shard_count }}",
    });
    expect(scenario.run).not.toContain("--project");
    const timeoutDiagnostics = expectDefined(
      uiE2e.steps.find(
        (step: WorkflowStep) => step.name === "Upload Control UI E2E timeout diagnostics",
      ),
      "Control UI E2E timeout diagnostic upload",
    );
    expect(timeoutDiagnostics).toEqual({
      name: "Upload Control UI E2E timeout diagnostics",
      if: "failure() && matrix.task == 'control-ui'",
      uses: UPLOAD_ARTIFACT_V7,
      with: {
        name: "control-ui-e2e-timeout-${{ matrix.shard }}-${{ github.run_attempt }}",
        path: ".artifacts/control-ui-e2e-timeouts/shard-${{ matrix.shard }}-attempt-${{ github.run_attempt }}",
        "if-no-files-found": "ignore",
        "retention-days": 7,
      },
    });
    const browserExtension = expectDefined(
      uiE2e.steps.find(
        (step: WorkflowStep) => step.name === "Test browser extension bootstrap end-to-end",
      ),
      "browser extension bootstrap E2E suite",
    );
    expect(browserExtension.if).toBe("matrix.task == 'browser-extension'");
    expect(browserExtension.run).toBe("pnpm test:e2e:browser-extension");
    for (const { job } of routedUiE2eJobs) {
      const jobContract = JSON.stringify(job);
      expect(jobContract).not.toContain("OPENCLAW_UI_E2E_ALLOW_MISSING_CHROMIUM");
      expect(jobContract).not.toContain("OPENCLAW_VITEST_NO_OUTPUT_RETRY");
    }

    const realGatewaySteps = uiE2eRealGateway.steps.filter((step: WorkflowStep) =>
      step.name?.includes("with a real Gateway"),
    );
    expect(realGatewaySteps).toHaveLength(1);
    const realGatewayStep = expectDefined(
      realGatewaySteps[0],
      "combined real-Gateway Control UI E2E suite",
    );
    expect(realGatewayStep.run).not.toContain("--retry");
    expect(realGatewayStep.run).not.toContain("--hookTimeout");
    expect(realGatewayStep.run).not.toContain("--testTimeout");

    const proofUploadIndex = uiE2eRealGateway.steps.findIndex(
      (step: WorkflowStep) => step.name === "Upload sanitized Control UI real-Gateway proof",
    );
    const proofUpload = uiE2eRealGateway.steps[proofUploadIndex];
    const realGatewayIndex = uiE2eRealGateway.steps.indexOf(realGatewayStep);
    // Same-origin admission compares exact build IDs, including the build timestamp.
    // Include private QA so media bootstrap cannot rebuild runtime behind the UI.
    const realGatewayBuild = expectDefined(
      uiE2eRealGateway.steps.find((step: WorkflowStep) => step.run === "pnpm build:ci-artifacts"),
      "paired runtime and Control UI build",
    );
    expect(realGatewayBuild.if).toBeUndefined();
    expect(realGatewayBuild["continue-on-error"]).toBeUndefined();
    expect(realGatewayBuild.env).toEqual({ OPENCLAW_BUILD_PRIVATE_QA: "1" });
    const realGatewayBuildIndex = uiE2eRealGateway.steps.indexOf(realGatewayBuild);
    expect(realGatewayBuildIndex).toBeGreaterThan(uiE2eRealGateway.steps.indexOf(realGatewaySetup));
    expect(realGatewayBuildIndex).toBeLessThan(realGatewayIndex);
    const desktopProof = expectDefined(
      uiE2eRealGateway.steps.find(
        (step: WorkflowStep) => step.name === "Prove desktop resize over node and SSH",
      ),
      "real desktop fixture proof",
    );
    expect(desktopProof).toEqual({
      name: "Prove desktop resize over node and SSH",
      env: {
        FROZEN_TARGET: "${{ needs.preflight.outputs.frozen_target }}",
        DESKTOP_PROOF_CHECKOUT_SHA: "${{ needs.preflight.outputs.checkout_revision }}",
        DESKTOP_PROOF_PR_HEAD_SHA: "${{ github.event.pull_request.head.sha }}",
        DESKTOP_PROOF_PR_BASE_SHA: "${{ github.event.pull_request.base.sha }}",
        DESKTOP_PROOF_WORKFLOW_SHA: "${{ github.workflow_sha }}",
      },
      run: expect.stringContaining('node --import tsx "$bootstrap"'),
    });
    expect(uiE2eRealGateway.steps.indexOf(desktopProof)).toBeGreaterThan(realGatewayBuildIndex);
    expect(uiE2eRealGateway.steps.indexOf(desktopProof)).toBeLessThan(realGatewayIndex);
    expect(realGatewayStep.run).not.toContain("desktop-resize.real-gateway.e2e.test.ts");
    const desktopUpload = expectDefined(
      uiE2eRealGateway.steps.find(
        (step: WorkflowStep) => step.name === "Upload sanitized desktop resize proof",
      ),
      "sanitized desktop upload",
    );
    expect(desktopUpload).toEqual({
      name: "Upload sanitized desktop resize proof",
      if: "always()",
      uses: UPLOAD_ARTIFACT_V7,
      with: {
        name: "desktop-resize-proof-${{ github.run_id }}-${{ github.run_attempt }}",
        path: ".artifacts/control-ui-e2e/real-gateway/desktop-resize",
        "if-no-files-found": "warn",
        "retention-days": 14,
      },
    });
    expect(uiE2eRealGateway.steps.indexOf(desktopUpload)).toBeGreaterThan(realGatewayIndex);
    expect(realGatewayStep.env).toEqual({
      FROZEN_TARGET: "${{ needs.preflight.outputs.frozen_target }}",
      OPENCLAW_CAPTURE_UI_PROOF:
        "${{ github.event_name == 'workflow_dispatch' && inputs.capture_ui_proof && '1' || '0' }}",
      OPENCLAW_UI_E2E_ARTIFACT_DIR: proofUpload.with.path,
    });
    expect(proofUploadIndex).toBeGreaterThan(realGatewayIndex);
  });

  it.each([
    { failed: false, captured: false },
    { failed: false, captured: true },
    { failed: true, captured: false },
    { failed: true, captured: true },
  ])("uploads only captured synthetic widget failures: %j", ({ failed, captured }) => {
    const artifactRoot = ".artifacts/control-ui-e2e/control-ui-authenticated-widget-sandbox-*";
    const timeline = `${artifactRoot}/widget-prompt-failure.json`;
    for (const job of [
      readCiWorkflow().jobs["checks-ui-e2e"],
      readWorkflow(".github/workflows/openclaw-repo-e2e-reusable.yml").jobs.test,
    ]) {
      const upload = expectDefined(
        job.steps.find(
          (step: WorkflowStep) => step.name === "Upload synthetic widget prompt failure evidence",
        ),
        "synthetic widget upload",
      );
      expect(
        evaluateWorkflowExpression(`\${{ ${upload.if} }}`, {
          eventName: "workflow_dispatch",
          repository: "openclaw/openclaw",
          runAttempt: 1,
          failed,
          fileHashes: captured ? { [timeline]: "present" } : {},
        }),
      ).toBe(failed && captured);
      expect(upload.uses).toBe(UPLOAD_ARTIFACT_V7);
      expect(upload.with.path.trim().split("\n")).toEqual([
        timeline,
        `${artifactRoot}/*.png`,
        `${artifactRoot}/*.webm`,
      ]);
      expect(upload.with["retention-days"]).toBe(7);
      expect(upload.with["if-no-files-found"]).toBe("error");
    }
  });

  it.each([
    { frozen: false, prebuilt: true, childExit: 0 },
    { frozen: true, prebuilt: true, childExit: 0 },
    { frozen: true, prebuilt: false, childExit: 0 },
    { frozen: false, prebuilt: false, childExit: 0 },
    { frozen: true, prebuilt: true, childExit: 42 },
  ])(
    "selects the complete real-Gateway command without retrying failures (frozen: $frozen, prebuilt: $prebuilt, exit: $childExit)",
    ({ frozen, prebuilt, childExit }) => {
      const step = expectDefined(
        readCiWorkflow().jobs["checks-ui-e2e-real-gateway"].steps.find(
          (candidate: WorkflowStep) =>
            candidate.name === "Test Control UI suites with a real Gateway",
        ),
        "real-Gateway command",
      );
      const directory = tempDirs.make("openclaw-real-gateway-command-");
      const bin = path.join(directory, "bin");
      const argsPath = path.join(directory, "args");
      const callsPath = path.join(directory, "calls");
      const prebuiltConfig = "test/vitest/vitest.ui-e2e-prebuilt.config.ts";
      const serialConfig = "test/vitest/vitest.ui-e2e.config.ts";
      mkdirSync(bin);
      mkdirSync(path.join(directory, "test/vitest"), { recursive: true });
      writeFileSync(path.join(directory, serialConfig), "export default {};\n");
      if (prebuilt) {
        writeFileSync(path.join(directory, prebuiltConfig), "export default {};\n");
      }
      writeFileSync(
        path.join(bin, "node"),
        '#!/bin/sh\nprintf "%s\\n" "$@" > "$REAL_GATEWAY_COMMAND_ARGS"\nprintf "called\\n" >> "$REAL_GATEWAY_COMMAND_CALLS"\nexit "$REAL_GATEWAY_COMMAND_EXIT"\n',
        { mode: 0o755 },
      );
      const result = runWorkflowShellScript(expectDefined(step.run, "real-Gateway script"), {
        cwd: directory,
        env: {
          ...process.env,
          FROZEN_TARGET: String(frozen),
          REAL_GATEWAY_COMMAND_ARGS: argsPath,
          REAL_GATEWAY_COMMAND_CALLS: callsPath,
          REAL_GATEWAY_COMMAND_EXIT: String(childExit),
          PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        },
      });
      const missingCurrentConfig = !prebuilt && !frozen;
      expect(result.status, result.stdout + result.stderr).toBe(
        missingCurrentConfig ? 1 : childExit,
      );
      if (missingCurrentConfig) {
        expect(result.stderr).toContain(`Current target is missing ${prebuiltConfig}`);
        expect(existsSync(callsPath)).toBe(false);
        return;
      }
      expect(readFileSync(callsPath, "utf8").trim().split("\n")).toEqual(["called"]);
      const args = readFileSync(argsPath, "utf8").trim().split("\n");
      expect(args.slice(0, 6)).toEqual([
        "scripts/run-vitest.mjs",
        "run",
        "--config",
        prebuilt ? prebuiltConfig : serialConfig,
        "--configLoader",
        "runner",
      ]);
      expect(args.slice(6).toSorted()).toEqual(
        uiE2eRealGatewayTestFiles
          .filter((file) => file !== "ui/src/e2e/desktop-resize.real-gateway.e2e.test.ts")
          .toSorted(),
      );
      expect(
        resolveRunVitestSpawnEnv(
          { CI: "true", OPENCLAW_VITEST_NO_OUTPUT_TIMEOUT_MS: "120000" },
          args.slice(1),
        ).OPENCLAW_VITEST_NO_OUTPUT_TIMEOUT_MS,
      ).toBe("300000");
    },
  );

  it.each([
    { frozen: false, available: true, exit: 0 },
    { frozen: true, available: true, exit: 0 },
    { frozen: false, available: true, exit: 42 },
    { frozen: true, available: false, exit: 0 },
    { frozen: false, available: false, exit: 0 },
  ])(
    "runs available desktop proof and preserves frozen omissions: %j",
    ({ frozen, available, exit }) => {
      const step = expectDefined(
        readCiWorkflow().jobs["checks-ui-e2e-real-gateway"].steps.find(
          (candidate: WorkflowStep) => candidate.name === "Prove desktop resize over node and SSH",
        ),
        "desktop proof command",
      );
      const directory = tempDirs.make("desktop-proof-command-");
      const bin = path.join(directory, "bin");
      const calls = path.join(directory, "calls");
      mkdirSync(bin);
      mkdirSync(path.join(directory, "scripts"));
      if (available) {
        writeFileSync(path.join(directory, "scripts/test-desktop-resize-real.mts"), "");
      }
      writeFileSync(
        path.join(bin, "node"),
        '#!/bin/sh\nprintf "%s\\n" "$@" > "$DESKTOP_CALLS"\nexit "$DESKTOP_EXIT"\n',
        { mode: 0o755 },
      );
      const result = runWorkflowShellScript(expectDefined(step.run, "desktop proof script"), {
        cwd: directory,
        env: {
          ...process.env,
          FROZEN_TARGET: String(frozen),
          DESKTOP_CALLS: calls,
          DESKTOP_EXIT: String(exit),
          PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
        },
      });
      expect(result.status, result.stdout + result.stderr).toBe(available ? exit : frozen ? 0 : 1);
      if (available) {
        expect(readFileSync(calls, "utf8").trim().split("\n")).toEqual([
          "--import",
          "tsx",
          "scripts/test-desktop-resize-real.mts",
        ]);
      } else {
        expect(existsSync(calls)).toBe(false);
        expect(frozen ? result.stdout : result.stderr).toContain(
          frozen ? "no desktop resize proof produced" : "Current target is missing",
        );
      }
    },
  );

  it("builds artifacts once and smoke-tests the built CLI with Node and Bun", () => {
    const workflow = readCiWorkflow();
    const buildArtifactSteps = workflow.jobs["build-artifacts"].steps;
    const setupStep = buildArtifactSteps.find(
      (step: WorkflowStep) => step.name === "Setup Node environment",
    );
    const buildDistStep = buildArtifactSteps.find(
      (step: WorkflowStep) => step.name === "Build dist",
    );
    const nodeHelpSmoke = buildArtifactSteps.find(
      (step: WorkflowStep) => step.name === "Smoke test CLI launcher help",
    );
    const nodeStatusSmoke = buildArtifactSteps.find(
      (step: WorkflowStep) => step.name === "Smoke test CLI launcher status json",
    );
    const bunSmoke = buildArtifactSteps.find(
      (step: WorkflowStep) => step.name === "Smoke test built CLI with Bun",
    );

    expect(
      buildArtifactSteps.some(
        (step: WorkflowStep) =>
          typeof step.uses === "string" && step.uses.endsWith("/ensure-base-commit"),
      ),
    ).toBe(false);
    expect(setupStep.with["install-bun"]).toBe("true");
    expect(buildDistStep.run).toBe("pnpm build:ci-artifacts");
    expect(buildArtifactSteps.map((step: WorkflowStep) => step.name)).not.toContain(
      "Build Control UI",
    );
    expect(buildArtifactSteps.some((step: WorkflowStep) => step.run === "pnpm ui:build")).toBe(
      false,
    );
    expect(nodeHelpSmoke.run).toBe("node openclaw.mjs --help");
    expect(nodeStatusSmoke.run).toBe("node openclaw.mjs status --json --timeout 1");
    expect(bunSmoke.run).toContain("bun openclaw.mjs --help");
    expect(bunSmoke.run).toContain("bun openclaw.mjs status --json --timeout 1");
  });

  it("keeps automatic source-only Control UI locale drift advisory and manual CI strict", () => {
    const workflow = readCiWorkflow();
    const workflowSource = readFileSync(".github/workflows/ci.yml", "utf8");
    const buildArtifactSteps = workflow.jobs["build-artifacts"].steps;
    const localeJob = workflow.jobs["control-ui-i18n"];
    const sourceStep = localeJob.steps.find(
      (step: WorkflowStep) => step.name === "Verify Control UI i18n source",
    );
    const localeStep = localeJob.steps.find(
      (step: WorkflowStep) => step.name === "Check Control UI locale parity",
    );

    expect(buildArtifactSteps).not.toContainEqual(
      expect.objectContaining({ run: "pnpm ui:i18n:check" }),
    );
    expect(JSON.parse(readFileSync("package.json", "utf8")).scripts["test:ui"]).not.toContain(
      "ui:i18n:check",
    );
    expect(workflowSource.match(/pnpm ui:i18n:verify/gu)).toHaveLength(1);
    expect(workflowSource.match(/pnpm ui:i18n:check/gu)).toHaveLength(1);
    expect(readFileSync("ui/src/i18n/test/translate.test.ts", "utf8")).not.toContain(
      "keeps shipped locales structurally aligned with English",
    );
    expect(localeJob.needs).toEqual(["preflight"]);
    expect(localeJob.if).toBe("needs.preflight.outputs.run_control_ui_i18n == 'true'");
    expect(localeJob["continue-on-error"]).toBeUndefined();
    expect(localeJob.env.COMPATIBILITY_TARGET).toBe(
      "${{ needs.preflight.outputs.compatibility_target }}",
    );
    expect(workflow.jobs.preflight.outputs.strict_control_ui_i18n).toBe(
      "${{ github.event_name == 'workflow_dispatch' && !inputs.release_gate && 'true' || steps.changed_scope.outputs.strict_control_ui_i18n }}",
    );
    expect(
      evaluateWorkflowExpression(
        "${{ github.event_name == 'workflow_dispatch' && !inputs.release_gate && 'true' || 'false' }}",
        {
          eventName: "workflow_dispatch",
          releaseGate: false,
          repository: "openclaw/openclaw",
          runAttempt: 1,
        },
      ),
    ).toBe("true");
    expect(
      evaluateWorkflowExpression(
        "${{ github.event_name == 'workflow_dispatch' && !inputs.release_gate && 'true' || 'false' }}",
        {
          eventName: "workflow_dispatch",
          releaseGate: true,
          repository: "openclaw/openclaw",
          runAttempt: 1,
        },
      ),
    ).toBe("false");
    expect(sourceStep["continue-on-error"]).toBeUndefined();
    const compatibilityWithoutVerify = runControlUiI18nSourceFixture({
      compatibilityTarget: true,
      hasVerifyScript: false,
    });
    expect(compatibilityWithoutVerify.status, compatibilityWithoutVerify.output).toBe(0);
    expect(compatibilityWithoutVerify.calls).toEqual([]);
    expect(compatibilityWithoutVerify.summary).toContain(
      "Skipping ui:i18n:verify: unavailable on the selected compatibility target.",
    );

    const currentWithoutVerify = runControlUiI18nSourceFixture({
      compatibilityTarget: false,
      hasVerifyScript: false,
    });
    expect(currentWithoutVerify.status).toBe(1);
    expect(currentWithoutVerify.calls).toEqual([]);
    expect(currentWithoutVerify.output).toContain(
      "ui:i18n:verify is required for non-compatibility targets.",
    );

    const currentWithVerify = runControlUiI18nSourceFixture({
      compatibilityTarget: false,
      hasVerifyScript: true,
    });
    expect(currentWithVerify.status, currentWithVerify.output).toBe(0);
    expect(currentWithVerify.calls).toEqual(["ui:i18n:verify"]);
    expect(localeStep["continue-on-error"]).toBe(
      "${{ needs.preflight.outputs.strict_control_ui_i18n != 'true' }}",
    );
    expect(localeStep.run).toBe("pnpm ui:i18n:check");
  });

  it("measures startup memory before the built artifact-check wave", () => {
    const workflow = readCiWorkflow();
    const steps = workflow.jobs["build-artifacts"].steps;
    const verifierStep = steps.find(
      (step: WorkflowStep) => step.name === "Run built artifact checks",
    );

    // The verifiers always run, so the shared step cannot be gated on the
    // selected checks; each check keeps its own RUN_* gate inside the body.
    expect(verifierStep.if).toBeUndefined();
    expect(steps.some((step: WorkflowStep) => step.name === "Verify built runtime artifacts")).toBe(
      false,
    );
    // RSS measures an unloaded command on every runner, including Blacksmith.
    const startupMemory = verifierStep.run.indexOf('run_verifier "startup-memory"');
    const memoryBarrier = verifierStep.run.indexOf("\nwait_checks\n", startupMemory);
    expect(memoryBarrier).toBeGreaterThan(startupMemory);
    expect(memoryBarrier).toBeLessThan(
      verifierStep.run.indexOf('run_verifier "doctor-plugin-index"'),
    );
    expect(verifierStep.env.OPENCLAW_STARTUP_MEMORY_PLUGINS_LIST_MB).toBe(
      "${{ runner.environment == 'github-hosted' && '425' || '400' }}",
    );
    expect(verifierStep.env.PARALLEL_BUILT_VERIFIERS).toBe(
      "${{ runner.environment != 'github-hosted' && 'true' || 'false' }}",
    );
    expect(verifierStep.run).toContain(
      'OPENCLAW_VITEST_FS_MODULE_CACHE_PATH="${RUNNER_TEMP}/vitest-module-cache/${name}"',
    );
    expect(verifierStep.run).toContain(
      "test/scripts/doctor-config-preflight-plugin-index.built-cli.e2e.test.ts",
    );
    expect(verifierStep.run).toContain(
      "env OPENCLAW_E2E_USE_PREBUILT_DIST=1 OPENCLAW_VITEST_NO_OUTPUT_TIMEOUT_MS=660000 node scripts/run-vitest.mjs run",
    );
    expect(verifierStep.run).toContain("--config test/vitest/vitest.e2e.config.ts");
    expect(verifierStep.run).toContain("Selected target predates");
    expect(verifierStep.run).toContain("pnpm test:build:singleton");
    // The startup asset rebuild must complete before any verifier forks so
    // concurrent readers never observe dist mid-write.
    expect(verifierStep.run).toContain("scripts/ensure-cli-startup-build.mts");
    expect(verifierStep.run).toContain("scripts/check-cli-startup-memory.mjs");
    expect(verifierStep.run).toContain(".artifacts/startup-memory/summary.md");
    expect(verifierStep.env.RUN_CHANNELS).toBe("${{ needs.preflight.outputs.run_checks }}");
    expect(verifierStep.env.FROZEN_TARGET).toBe("${{ needs.preflight.outputs.frozen_target }}");
    const pluginSingleton = verifierStep.run.indexOf(
      'run_verifier "plugin-singleton" pnpm test:build:singleton',
    );
    const pluginWriterBarrier = verifierStep.run.indexOf("\nwait_checks\n", pluginSingleton);
    const parallelGatewayWatch = verifierStep.run.indexOf(
      'if [ "$RUN_GATEWAY_WATCH" = "true" ] && [ "$PARALLEL_GATEWAY_WATCH" = "true" ]; then',
    );
    const gatewayWriterBarrier = verifierStep.run.indexOf(
      "\n  wait_checks\n",
      parallelGatewayWatch,
    );
    const firstReader = verifierStep.run.indexOf(
      'run_verifier "doctor-plugin-index" run_doctor_plugin_index',
    );
    expect(pluginWriterBarrier).toBeGreaterThan(pluginSingleton);
    expect(parallelGatewayWatch).toBeGreaterThan(pluginWriterBarrier);
    expect(gatewayWriterBarrier).toBeGreaterThan(parallelGatewayWatch);
    expect(firstReader).toBeGreaterThan(gatewayWriterBarrier);
    // Every verifier reports through the shared results map so a failure can
    // never be swallowed by the wave.
    for (const name of [
      "doctor-plugin-index",
      "plugin-singleton",
      "sqlite-session-lifecycle",
      "startup-memory",
    ]) {
      expect(verifierStep.run).toContain(`run_verifier "${name}"`);
      expect(verifierStep.run).toContain(`["${name}"]="skipped"`);
    }
    expect(verifierStep.run).toContain(
      "for name in channels core-support-boundary doctor-plugin-index gateway-watch plugin-singleton sqlite-session-lifecycle startup-memory tui-pty; do",
    );
  });

  it.each([
    { frozen: false, present: true, expected: true },
    { frozen: false, present: false, expected: true },
    { frozen: true, present: true, expected: true },
    { frozen: true, present: false, expected: false },
  ])(
    "gates browser native-host proof (frozen=$frozen, present=$present)",
    ({ frozen, present, expected }) => {
      const step = readCiWorkflow().jobs["build-artifacts"].steps.find(
        (entry: WorkflowStep) => entry.name === "Verify built browser native host",
      );
      const file = "extensions/browser/src/browser/extension-install.native-host.e2e.test.ts";
      expect(
        step.if === undefined ||
          evaluateWorkflowExpression(step.if, {
            eventName: "workflow_dispatch",
            repository: "openclaw/openclaw",
            runAttempt: 1,
            frozenTarget: frozen,
            fileHashes: present ? { [file]: "fixture-hash" } : {},
          }),
      ).toBe(expected);
    },
  );

  it.each([
    "passed",
    "skipped",
    "pending",
    "todo",
    "absent",
    "wrong-name",
    "wrong-file",
    "failed",
    "suite-failed",
    "duplicate",
    "malformed",
    "missing-report",
  ])("validates browser native-host proof report: %s", (state) => {
    const steps = readCiWorkflow().jobs["build-artifacts"].steps;
    const step = steps.find(
      (entry: WorkflowStep) => entry.name === "Verify built browser native host",
    );
    expect(steps.indexOf(step)).toBeGreaterThan(
      steps.findIndex((entry: WorkflowStep) => entry.name === "Build dist"),
    );
    expect(step["continue-on-error"]).not.toBe(true);
    const root = tempDirs.make("openclaw-browser-proof-report-");
    const file = "extensions/browser/src/browser/extension-install.native-host.e2e.test.ts";
    const fullName =
      "native host registration launches with the exact custom installation context when Chrome has no selectors";
    const assertion = {
      fullName: state === "wrong-name" ? "another test" : fullName,
      status: ["skipped", "pending", "todo", "failed"].includes(state) ? state : "passed",
    };
    const assertions =
      state === "absent" ? [] : state === "duplicate" ? [assertion, assertion] : [assertion];
    const report = {
      success: state !== "failed" && state !== "suite-failed",
      numFailedTestSuites: state === "suite-failed" ? 1 : 0,
      numPendingTestSuites: 0,
      numTotalTests: assertions.length,
      numPassedTests: assertions.filter((entry) => entry.status === "passed").length,
      numFailedTests: state === "failed" ? 1 : 0,
      numPendingTests: ["skipped", "pending"].includes(state) ? 1 : 0,
      numTodoTests: state === "todo" ? 1 : 0,
      testResults: [
        {
          name: path.join(root, state === "wrong-file" ? "other.test.ts" : file),
          status: state === "suite-failed" ? "failed" : "passed",
          assertionResults: assertions,
        },
      ],
    };
    mkdirSync(path.join(root, "scripts"));
    // A previous successful report must not satisfy a run that emits no report.
    writeFileSync(path.join(root, "browser-native-host.json"), JSON.stringify(report));
    // Execute the workflow's shell and validator; replace only the expensive
    // Vitest process with a controlled reporter at its external boundary.
    writeFileSync(
      path.join(root, "scripts/run-vitest.mjs"),
      `
      import fs from 'node:fs';
      const args = process.argv.slice(2);
      fs.writeFileSync('invocation.json', JSON.stringify({ args, prebuilt: process.env.OPENCLAW_E2E_USE_PREBUILT_DIST }));
      const outputIndex = args.indexOf('--outputFile.json');
      if (outputIndex >= 0 && ${JSON.stringify(state)} !== 'missing-report') {
        fs.writeFileSync(args[outputIndex + 1], ${JSON.stringify(state === "malformed" ? "{" : JSON.stringify(report))});
      }
    `,
    );
    const result = runWorkflowShellScript(step.run, {
      cwd: root,
      env: { ...process.env, ...step.env, RUNNER_TEMP: root },
    });
    expect(result.status, result.stderr).toBe(state === "passed" ? 0 : 1);
    if (state === "passed") {
      expect(JSON.parse(readFileSync(path.join(root, "invocation.json"), "utf8"))).toEqual({
        prebuilt: "1",
        args: [
          "run",
          "--config",
          "test/vitest/vitest.e2e.config.ts",
          file,
          "--reporter=default",
          "--reporter=json",
          "--outputFile.json",
          path.join(root, "browser-native-host.json"),
        ],
      });
    }
  });

  it.each([
    { selected: false, exitCode: 0 },
    { selected: true, exitCode: 0 },
    { selected: true, exitCode: 1 },
    { selected: true, exitCode: 143 },
  ])(
    "runs the built SQLite verifier (selected=$selected, exit=$exitCode)",
    ({ selected, exitCode }) => {
      const workflow = readCiWorkflow();
      const additionalJob = workflow.jobs["check-additional-shard"];
      const additionalRunStep = additionalJob.steps.find(
        (step: WorkflowStep) => step.name === "Run additional check shard",
      );
      const verifier = workflow.jobs["build-artifacts"].steps.find(
        (step: WorkflowStep) => step.name === "Run built artifact checks",
      );
      const selection = expectDefined(
        verifier.run.match(
          /if \[ "\$RUN_SQLITE_SESSION_LIFECYCLE" = "true" \]; then\n[\s\S]*?\nfi/u,
        )?.[0],
        "scoped SQLite verifier invocation",
      );

      expect(readFrozenAdditionalCheckRows()).not.toContainEqual(
        expect.objectContaining({ group: "sqlite-session-flip-proof" }),
      );
      expect(additionalRunStep.run).not.toContain("sqlite-session-flip-proof)");
      expect(workflow.jobs["sqlite-session-lifecycle"]).toBeUndefined();
      expect(verifier.env.RUN_SQLITE_SESSION_LIFECYCLE).toBe(
        "${{ needs.preflight.outputs.run_sqlite_session_lifecycle }}",
      );
      expect(workflow.jobs["ci-gate"].needs).toContain("build-artifacts");
      expect(workflow.jobs["ci-gate"].needs).not.toContain("sqlite-session-lifecycle");
      const memoryBarrier = verifier.run.indexOf(
        "\nwait_checks\n",
        verifier.run.indexOf('run_verifier "startup-memory"'),
      );
      expect(verifier.run.indexOf(selection)).toBeGreaterThan(memoryBarrier);
      expect(verifier.run.indexOf(selection)).toBeLessThan(
        verifier.run.indexOf('start_check "channels"'),
      );
      const root = tempDirs.make("openclaw-sqlite-verifier-");
      mkdirSync(path.join(root, "scripts"));
      writeFileSync(
        path.join(root, "scripts/run-vitest.mjs"),
        `
      import { writeFileSync } from "node:fs";
      writeFileSync("invocation.json", JSON.stringify({
        args: process.argv.slice(2),
        prebuilt: process.env.OPENCLAW_E2E_USE_PREBUILT_DIST,
        watchdog: process.env.OPENCLAW_VITEST_NO_OUTPUT_TIMEOUT_MS,
      }));
      process.exit(${exitCode});
    `,
      );
      // Exercise the selected command at the existing verifier boundary. The full
      // wave's associative-array scheduler needs native CI's Bash for execution.
      const result = runWorkflowShellScript(
        `
      run_verifier() {
        printf '%s\\n' "$1" > verifier-name
        shift
        "$@"
      }
      ${selection}
    `,
        { cwd: root, env: { ...process.env, RUN_SQLITE_SESSION_LIFECYCLE: String(selected) } },
      );
      expect(result.status, result.stderr).toBe(selected ? exitCode : 0);
      expect(existsSync(path.join(root, "invocation.json"))).toBe(selected);
      if (selected) {
        expect(readFileSync(path.join(root, "verifier-name"), "utf8").trim()).toBe(
          "sqlite-session-lifecycle",
        );
        expect(JSON.parse(readFileSync(path.join(root, "invocation.json"), "utf8"))).toEqual({
          args: [
            "run",
            "--config",
            "test/vitest/vitest.e2e.config.ts",
            "test/scripts/sqlite-sessions-transcripts-flip-proof.built-cli.e2e.test.ts",
          ],
          prebuilt: "1",
          watchdog: "660000",
        });
      }
    },
  );

  it("restores dist in PR CI and saves it only from the trusted warmer", () => {
    const workflow = readCiWorkflow();
    const buildArtifactSteps = workflow.jobs["build-artifacts"].steps;
    const stepNames = buildArtifactSteps.map((step: WorkflowStep) => step.name);
    const restoreStep = buildArtifactSteps.find(
      (step: WorkflowStep) => step.name === "Restore dist build cache",
    );
    const buildDistStep = buildArtifactSteps.find(
      (step: WorkflowStep) => step.name === "Build dist",
    );
    const warmer = parse(readFileSync(".github/workflows/vitest-cache-warm.yml", "utf8"));
    const warmerSteps = warmer.jobs.warm.steps as WorkflowStep[];
    const saveStep = expectDefined(
      warmerSteps.find((step) => step.name === "Save dist build cache"),
      "trusted dist cache save",
    );

    expect(stepNames.indexOf("Restore dist build cache")).toBeLessThan(
      stepNames.indexOf("Build dist"),
    );
    expect(stepNames.indexOf("Build dist")).toBeLessThan(
      stepNames.indexOf("Pack built runtime artifacts"),
    );
    expect(stepNames).not.toContain("Save dist build cache");
    expect(restoreStep.uses).toBe(CACHE_V5);
    expect(buildDistStep.if).toBe("steps.dist_build_cache.outputs.cache-hit != 'true'");
    expect(saveStep.uses).toBe("actions/cache/save@55cc8345863c7cc4c66a329aec7e433d2d1c52a9");
    expect(saveStep.if).toContain("steps.setup-node-env.outputs.cache-mode == 'read-write'");
    expect(saveStep.with?.key).toBe("${{ runner.os }}-dist-build-v3-${{ github.sha }}");
    expect(restoreStep.with.path).toContain("dist/");
    expect(restoreStep.with.path).toContain("dist-runtime/");
    expect(restoreStep.with.path).toContain("packages/*/dist/");
    expect(saveStep.with?.path).toContain("packages/*/dist/");
    expect(restoreStep.with.key).toContain("dist-build-v3-");
    expect(
      buildArtifactSteps.find((step: WorkflowStep) => step.name === "Pack built runtime artifacts")
        .run,
    ).toContain("packages/*/dist");
    expect(restoreStep.with.path).toContain("extensions/*/src/host/**/.bundle.hash");
    expect(restoreStep.with.path).toContain("extensions/*/src/host/**/*.bundle.js");
    expect(warmerSteps.indexOf(saveStep)).toBeGreaterThan(
      warmerSteps.findIndex((step) => step.name === "Warm build cache"),
    );
    expect(buildArtifactSteps.map((step: WorkflowStep) => step.name)).not.toContain(
      "Cache dist build",
    );
  });

  it("keeps the full built TUI PTY suite out of the artifact canary gate", () => {
    const workflow = readCiWorkflow();
    const buildArtifactSteps = workflow.jobs["build-artifacts"].steps;
    const builtArtifactChecks = buildArtifactSteps.find(
      (step: WorkflowStep) => step.name === "Run built artifact checks",
    );
    const run = builtArtifactChecks.run;

    expect(builtArtifactChecks.env.PARALLEL_GATEWAY_WATCH).toBe(
      "${{ runner.environment != 'github-hosted' && 'true' || 'false' }}",
    );
    expect(run).toContain('start_check "channels"');
    expect(run).toContain('start_check "core-support-boundary"');
    expect(run).toContain('start_check "gateway-watch"');
    expect(run).toContain(
      'if [ "$RUN_GATEWAY_WATCH" = "true" ] && [ "$PARALLEL_GATEWAY_WATCH" = "true" ]; then',
    );
    expect(run).toContain(
      'if [ "$RUN_GATEWAY_WATCH" = "true" ] && [ "$PARALLEL_GATEWAY_WATCH" != "true" ]; then',
    );
    const firstWait = run.indexOf(
      "\nwait_checks\n",
      run.indexOf('start_check "core-support-boundary"'),
    );
    const hostedGatewayWatch = run.indexOf(
      'if [ "$RUN_GATEWAY_WATCH" = "true" ] && [ "$PARALLEL_GATEWAY_WATCH" != "true" ]; then',
    );
    const tuiPty = run.indexOf('if [ "$RUN_TUI_PTY" = "true" ]; then');
    const hostedGatewayWait = run.indexOf("\n  wait_checks\n", hostedGatewayWatch);
    const tuiPtyWait = run.indexOf("\n  wait_checks\n", tuiPty);
    expect(firstWait).toBeGreaterThan(run.indexOf('start_check "core-support-boundary"'));
    expect(hostedGatewayWatch).toBeGreaterThan(firstWait);
    expect(hostedGatewayWait).toBeGreaterThan(hostedGatewayWatch);
    expect(tuiPty).toBeGreaterThan(hostedGatewayWait);
    expect(tuiPtyWait).toBeGreaterThan(tuiPty);
    expect(run.slice(tuiPty, tuiPtyWait)).toContain("src/tui/tui-pty-local.e2e.test.ts");
    expect(run.slice(tuiPty, tuiPtyWait)).toContain("--testNamePattern");
    expect(run.slice(tuiPty, tuiPtyWait)).toContain(
      "launches openclaw (chat as local mode|tui against a real Gateway) through a real PTY",
    );
    expect(run).toContain("wait_checks()");
    // Startup memory, artifact writers, and TUI retain explicit barriers;
    // hosted runners also serialize the remaining verifiers inside run_verifier.
    expect(run.match(/wait_checks$/gmu)).toHaveLength(7);
  });

  it("keeps docs i18n CI on the workflow-owned Go toolchain", () => {
    const workflow = readCiWorkflow();
    const nodeTestJob = workflow.jobs["checks-node-core-test-nondist-shard"];
    const setupGoStep = nodeTestJob.steps.find(
      (step: WorkflowStep) => step.name === "Setup Go for docs i18n",
    );
    const verifyGoStep = nodeTestJob.steps.find(
      (step: WorkflowStep) => step.name === "Verify docs i18n Go toolchain",
    );
    const resolveGoCacheStep = nodeTestJob.steps.find(
      (step: WorkflowStep) => step.name === "Resolve docs i18n Go cache",
    );
    const restoreGoCacheStep = nodeTestJob.steps.find(
      (step: WorkflowStep) => step.name === "Restore docs i18n Go cache",
    );
    const saveGoCacheStep = nodeTestJob.steps.find(
      (step: WorkflowStep) => step.name === "Save docs i18n Go cache",
    );
    expect(setupGoStep).toMatchObject({
      if: "matrix.requires_go == true",
      uses: SETUP_GO_V6,
      with: {
        cache: false,
        "go-version": "1.27.1",
      },
    });
    expect(setupGoStep.with).not.toHaveProperty("go-version-file");
    expect(resolveGoCacheStep).toMatchObject({
      if: "matrix.requires_go == true && needs.preflight.outputs.cache_mode != 'off'",
      env: {
        DEPENDENCY_HASH: "${{ hashFiles('scripts/docs-i18n/go.sum') }}",
      },
    });
    expect(resolveGoCacheStep.run).toContain(
      "key=setup-go-${RUNNER_OS}-${arch}-${image_prefix}go-${version#go}-${DEPENDENCY_HASH}",
    );
    expect(restoreGoCacheStep).toMatchObject({
      if: "matrix.requires_go == true && needs.preflight.outputs.cache_mode != 'off'",
      uses: CACHE_V5,
    });
    expect(saveGoCacheStep).toMatchObject({
      if: expect.stringContaining("needs.preflight.outputs.cache_write_allowed == 'true'"),
      uses: CACHE_SAVE_V5,
    });
    expect(verifyGoStep).toMatchObject({
      if: "matrix.requires_go == true",
      run: 'test "$(go env GOVERSION)" = "go1.27.1"',
    });

    const goMod = readTrackedText("scripts/docs-i18n/go.mod");
    expect(goMod).toMatch(/^go 1\.26\.0$/mu);
    expect(goMod).toMatch(/^toolchain go1\.27\.1$/mu);

    const tooling = {
      configs: ["test/vitest/vitest.tooling.config.ts"],
      shard_name: "core-tooling-1",
    };
    const goTest = "test/scripts/docs-i18n.test.ts";
    const otherTest = "test/scripts/ci-git-owner.test.ts";
    const selections = [
      { includePatterns: [goTest] },
      { includePatterns: [otherTest] },
      { includePatterns: ["test/scripts/docs-*.test.ts"] },
      { targets: [goTest] },
      { targets: [otherTest] },
      {},
      { groups: [{ ...tooling, includePatterns: [otherTest] }] },
      {
        groups: [
          { ...tooling, includePatterns: [otherTest] },
          { ...tooling, includePatterns: [goTest] },
        ],
      },
      { groups: [{ ...tooling, configs: ["test/vitest/legacy-tooling.config.ts"] }] },
      { groups: [{ ...tooling, configs: ["test/vitest/vitest.tooling-isolated.config.ts"] }] },
      { groups: [{ ...tooling, configs: ["test/vitest/vitest.tooling-docker.config.ts"] }] },
      {
        groups: [
          {
            ...tooling,
            configs: [
              "test/vitest/vitest.tooling-docker.config.ts",
              "test/vitest/vitest.tooling-isolated.config.ts",
            ],
          },
        ],
      },
      {
        groups: [
          {
            ...tooling,
            configs: [...tooling.configs, "test/vitest/vitest.tooling-isolated.config.ts"],
          },
        ],
      },
      {
        groups: [
          {
            ...tooling,
            configs: [
              "test/vitest/vitest.tooling-isolated.config.ts",
              "test/vitest/legacy-tooling.config.ts",
            ],
          },
        ],
      },
      { groups: [{ ...tooling, configs: undefined }] },
      {
        groups: [
          {
            ...tooling,
            configs: ["test/vitest/vitest.tooling-isolated.config.ts"],
            includePatterns: [goTest],
          },
        ],
      },
    ];
    const result = runCiManifestFixture({
      bundledPlanner: true,
      nodeTestShards: selections.map((selection, index) =>
        Object.assign(
          {
            checkName: `tooling-${index}`,
            configs: tooling.configs,
            requiresDist: false,
            runner: "ubuntu-24.04",
            shardName: "groups" in selection ? "compact-small-1" : "core-tooling-1",
          },
          selection,
        ),
      ),
    });
    expect(result.status, result.output).toBe(0);
    const matrix = JSON.parse(
      expectDefined(result.outputs.checks_node_core_nondist_matrix, "non-dist Node matrix"),
    ) as {
      include: { requires_go: boolean }[];
    };
    expect(matrix.include.map((row) => row.requires_go)).toEqual([
      true,
      false,
      true,
      true,
      false,
      true,
      false,
      true,
      true,
      false,
      false,
      false,
      true,
      true,
      true,
      true,
    ]);
  });

  it("packs grouped Node matrix rows and unpacks them in the shard runner", () => {
    const groups = [
      {
        configs: ["test/vitest/vitest.unit-fast.config.ts"],
        env: undefined,
        includePatterns: ["src/a.test.ts", "src/b.test.ts"],
        requiresDist: false,
        runner: "ubuntu-24.04",
        shard_name: "core-unit-fast-1",
        timing_key: "core-unit-fast-1#include-2-abcd",
      },
      {
        configs: ["test/vitest/vitest.infra.config.ts"],
        env: { OPENCLAW_VITEST_MAX_WORKERS: "2" },
        requiresDist: false,
        runner: "ubuntu-24.04",
        shard_name: "core-runtime-infra-misc",
      },
    ];
    const projectedGroups = groups.map(
      ({ configs, env, includePatterns, shard_name, timing_key }) => ({
        configs,
        env,
        includePatterns,
        shard_name,
        timing_key,
      }),
    );
    const manifest = runCiManifestFixture({
      bundledPlanner: true,
      nodeTestShards: [
        {
          checkName: "checks-node-compact-small-1",
          groups,
          requiresDist: false,
          runner: "ubuntu-24.04",
          shardName: "compact-small-1",
        },
      ],
    });
    expect(manifest.status, manifest.output).toBe(0);
    const [row] = JSON.parse(
      expectDefined(manifest.outputs.checks_node_core_nondist_matrix, "packed Node matrix"),
    ).include;
    expect(row).toMatchObject({
      check_name: "checks-node-compact-small-1",
      groups_gzip_base64: expect.any(String),
      requires_go: false,
    });
    expect(row).not.toHaveProperty("groups");
    const runStep = readCiWorkflow().jobs["checks-node-core-test-nondist-shard"].steps.find(
      (step: WorkflowStep) => step.name === "Run Node test shard",
    );
    const context = {
      eventName: "pull_request" as const,
      matrix: row,
      repository: "openclaw/openclaw",
      runAttempt: 1,
    };
    const packedEnv = evaluateWorkflowExpression(
      runStep.env.OPENCLAW_NODE_TEST_GROUPS_GZIP_BASE64,
      context,
    );
    const legacyEnv = evaluateWorkflowExpression(
      runStep.env.OPENCLAW_NODE_TEST_GROUPS_JSON,
      context,
    );
    expect(legacyEnv).toBe("");
    expect(
      resolveShardPlans({ OPENCLAW_NODE_TEST_GROUPS_GZIP_BASE64: String(packedEnv) }).map((plan) =>
        plan.kind === "group" ? plan.plan : plan,
      ),
    ).toEqual(projectedGroups);
  });

  it.each(["github", "hybrid", "blacksmith"] as const)(
    "keeps the complete %s manifest output below the safety budget",
    (runnerProfile) => {
      const manifest = runCiManifestFixture({
        bundledPlanner: true,
        changedPaths: ["src/auto-reply/full-plan.ts"],
        eventName: "pull_request",
        nodeTestShards: createNodeTestShardBundles({
          compactMode: "pull-request",
          includeReleaseOnlyPluginShards: false,
          runnerBackend: runnerProfile,
        }),
        runnerProfile,
      });
      expect(manifest.status, manifest.output).toBe(0);
      expect(manifest.outputChars, runnerProfile).toBeLessThan(262_144);
    },
  );

  it("uses projected legacy groups for historical targets without the codec", () => {
    const groups = [
      {
        configs: ["test/vitest/vitest.infra.config.ts"],
        env: { OPENCLAW_CI_TEST_GROUP: "legacy" },
        includePatterns: ["src/legacy.test.ts"],
        requiresDist: false,
        runner: "ubuntu-24.04",
        shard_name: "core-legacy",
        timing_key: "core-legacy#include-1-abcd",
      },
    ];
    const ungrouped = runCiManifestFixture({
      bundledPlanner: true,
      historicalCompatibility: false,
      nodeTestGroupsCodec: false,
    });
    expect(ungrouped.status, ungrouped.output).toBe(0);
    expect(ungrouped.outputs.frozen_target).toBe("true");
    expect(ungrouped.outputs.compatibility_target).toBe("false");
    const rows = JSON.parse(
      expectDefined(ungrouped.outputs.checks_node_core_nondist_matrix, "manual target matrix"),
    ).include;
    expect(rows).toEqual([expect.objectContaining({ check_name: "bundled-node-plan" })]);
    expect(rows[0]).not.toHaveProperty("groups_gzip_base64");

    const grouped = runCiManifestFixture({
      bundledPlanner: true,
      historicalCompatibility: true,
      nodeTestGroupsCodec: false,
      nodeTestShards: [
        {
          checkName: "checks-node-compact-small-1",
          groups,
          requiresDist: false,
          runner: "ubuntu-24.04",
          shardName: "compact-small-1",
        },
      ],
    });
    expect(grouped.status, grouped.output).toBe(0);
    const [row] = JSON.parse(
      expectDefined(grouped.outputs.checks_node_core_nondist_matrix, "legacy Node matrix"),
    ).include;
    expect(row).not.toHaveProperty("groups_gzip_base64");
    expect(Object.keys(row.groups[0]).toSorted()).toEqual([
      "configs",
      "env",
      "includePatterns",
      "shard_name",
      "timing_key",
    ]);
    const runStep = readCiWorkflow().jobs["checks-node-core-test-nondist-shard"].steps.find(
      (step: WorkflowStep) => step.name === "Run Node test shard",
    );
    const context = {
      eventName: "workflow_dispatch" as const,
      matrix: row,
      repository: "openclaw/openclaw",
      runAttempt: 1,
    };
    const packedEnv = evaluateWorkflowExpression(
      runStep.env.OPENCLAW_NODE_TEST_GROUPS_GZIP_BASE64,
      context,
    );
    const legacyEnv = evaluateWorkflowExpression(
      runStep.env.OPENCLAW_NODE_TEST_GROUPS_JSON,
      context,
    );
    expect(packedEnv).toBe("");
    expect(
      resolveShardPlans({ OPENCLAW_NODE_TEST_GROUPS_JSON: String(legacyEnv) }).map((plan) =>
        plan.kind === "group" ? plan.plan : plan,
      ),
    ).toEqual(row.groups);
  });

  it("provisions ripgrep for real filesystem contract selections", () => {
    const contract = "src/agents/filesystem-tools-output-contract.test.ts";
    const nativeTools = "src/agents/sessions/tools/index.test.ts";
    const bytePaths = "src/agents/sessions/tools/grep.byte-path.test.ts";
    const unrelated = "src/agents/run-wait.test.ts";
    const selections = [
      { targets: [contract] },
      { includePatterns: [contract] },
      { includePatterns: ["src/agents/filesystem-*.test.ts"] },
      { targets: [nativeTools] },
      { targets: [bytePaths] },
      { includePatterns: [bytePaths] },
      { groups: [{ shard_name: "agentic-agents-support", targets: [bytePaths] }] },
      { groups: [{ shard_name: "agentic-agents-support", includePatterns: [bytePaths] }] },
      { includePatterns: [unrelated] },
      { shardName: "agentic-agents-core-runtime" },
      { shardName: "agentic-agents-support" },
      { shardName: "agentic-agents-core-runtime", includePatterns: [unrelated] },
      { groups: [{ shard_name: "agentic-agents-core-runtime", includePatterns: [contract] }] },
      { groups: [{ shard_name: "agentic-agents-support", includePatterns: [nativeTools] }] },
      { groups: [{ shard_name: "agentic-agents-core-runtime", includePatterns: [unrelated] }] },
      { groups: [{ shard_name: "agentic-agents-core-runtime" }] },
    ];
    const result = runCiManifestFixture({
      bundledPlanner: true,
      nodeTestShards: selections.map((selection, index) =>
        Object.assign(
          {
            checkName: `grep-${index}`,
            configs: ["test/vitest/vitest.agents-core.config.ts"],
            requiresDist: false,
            runner: "ubuntu-24.04",
            shardName: "compact-small-1",
          },
          selection,
        ),
      ),
    });
    expect(result.status, result.output).toBe(0);
    const matrix = JSON.parse(
      expectDefined(result.outputs.checks_node_core_nondist_matrix, "non-dist Node matrix"),
    ) as { include: { requires_ripgrep?: boolean }[] };
    expect(matrix.include.map((row) => Boolean(row.requires_ripgrep))).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      true,
      true,
      false,
      true,
      true,
      false,
      true,
    ]);
  });

  it("fails and retries quiet Node test shard stalls quickly", () => {
    const workflow = readCiWorkflow();
    const preflightJob = workflow.jobs.preflight;
    const manifestStep = preflightJob.steps.find(
      (step: WorkflowStep) => step.name === "Build CI manifest",
    );
    const nodeTestJob = workflow.jobs["checks-node-core-test-nondist-shard"];
    const runStep = nodeTestJob.steps.find(
      (step: WorkflowStep) => step.name === "Run Node test shard",
    );
    const buildRuntimeStep = nodeTestJob.steps.find(
      (step: WorkflowStep) => step.name === "Build Node test runtime",
    );
    const installRipgrepStep = nodeTestJob.steps.find(
      (step: WorkflowStep) => step.name === "Install ripgrep for native grep tests",
    );

    expect(JSON.stringify(preflightJob.steps)).toContain("timeout_minutes: shard.timeoutMinutes");
    expect(manifestStep.run).toContain("pretest_build_mode: shard.pretestBuildMode");
    expect(manifestStep.run).toContain("requires_ripgrep:");
    expect(manifestStep.run).toContain("src/agents/sessions/tools/index.test.ts");
    expect(nodeTestJob["timeout-minutes"]).toBe("${{ matrix.timeout_minutes || 60 }}");
    expect(runStep.env.OPENCLAW_VITEST_NO_OUTPUT_TIMEOUT_MS).toBe(
      "${{ needs.preflight.outputs.compatibility_target == 'true' && '660000' || '300000' }}",
    );
    expect(runStep.env.OPENCLAW_VITEST_NO_OUTPUT_RETRY).toBe("1");
    expect(runStep.env.OPENCLAW_NODE_TEST_ENV_JSON).toBe("${{ toJson(matrix.env) }}");
    expect(runStep.env.OPENCLAW_NODE_TEST_TARGETS_JSON).toBe("${{ toJson(matrix.targets) }}");
    expect(runStep.env.OPENCLAW_NODE_TEST_GROUPS_GZIP_BASE64).toBe(
      "${{ matrix.groups_gzip_base64 || '' }}",
    );
    expect(runStep.env.OPENCLAW_NODE_TEST_GROUPS_JSON).toBe(
      "${{ matrix.groups && toJson(matrix.groups) || '' }}",
    );
    expect(runStep.env.OPENCLAW_NODE_TEST_VITEST_ARGS_JSON).toBe(
      "${{ needs.preflight.outputs.compatibility_target == 'true' && '[\"--hookTimeout=600000\"]' || '[]' }}",
    );
    expect(buildRuntimeStep).toMatchObject({
      if: "matrix.pretest_build_mode != null",
      env: {
        OPENCLAW_BUILD_PRIVATE_QA: "${{ matrix.pretest_build_mode == 'private-qa' && '1' || '0' }}",
        VITEST: "1",
      },
      run: "pnpm build qaRuntime",
    });
    expect(installRipgrepStep).toMatchObject({
      if: "matrix.requires_ripgrep == true && runner.os == 'Linux'",
      run: expect.stringContaining("apt-get install -y --no-install-recommends ripgrep"),
    });
    expect(nodeTestJob.steps.indexOf(buildRuntimeStep)).toBeLessThan(
      nodeTestJob.steps.indexOf(runStep),
    );
    expect(nodeTestJob.steps.indexOf(installRipgrepStep)).toBeLessThan(
      nodeTestJob.steps.indexOf(runStep),
    );
    const trustedRunnerStep = nodeTestJob.steps.find(
      (step: WorkflowStep) => step.name === "Checkout trusted Node shard runner",
    );
    expect(trustedRunnerStep).toMatchObject({
      if: "${{ hashFiles('scripts/ci-run-node-test-shard.mts') == '' }}",
      uses: CHECKOUT_V6,
      with: {
        ref: "${{ github.workflow_sha }}",
        path: ".ci-workflow",
        "sparse-checkout": expect.stringContaining("scripts/ci-run-node-test-shard.mts"),
        "sparse-checkout-cone-mode": false,
        "persist-credentials": false,
      },
    });
    // Non-cone sparse-checkout ignores missing paths silently, so a renamed
    // script would surface only as a runtime module-not-found on the frozen
    // lane. Require every listed path to exist at this revision.
    const sparseCheckoutPaths = String(trustedRunnerStep?.with?.["sparse-checkout"] ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    expect(sparseCheckoutPaths).toContain("scripts/ci-run-node-test-shard.mts");
    for (const sparsePath of sparseCheckoutPaths) {
      expect({ sparsePath, exists: existsSync(sparsePath) }).toEqual({ sparsePath, exists: true });
    }
  });

  it("clamps Node test workers to the detected core count", () => {
    const workflow = readCiWorkflow();
    const nodeTestJob = workflow.jobs["checks-node-core-test-nondist-shard"];
    const resourceStep = nodeTestJob.steps.find(
      (step: WorkflowStep) => step.name === "Configure Node test resources",
    );

    expect(resourceStep.run).toContain('if [ "$workers" -gt "$cores" ]; then');
    expect(resourceStep.run).toContain('workers="$cores"');
    expect(resourceStep.run.indexOf('workers="$cores"')).toBeLessThan(
      resourceStep.run.indexOf("OPENCLAW_VITEST_MAX_WORKERS"),
    );
  });

  it("uses candidate-owned script interfaces for frozen target CI", () => {
    const workflow = readCiWorkflow();
    const buildChecks = workflow.jobs["build-artifacts"].steps.find(
      (step: WorkflowStep) => step.name === "Run built artifact checks",
    );
    const additionalChecks = workflow.jobs["check-additional-shard"].steps.find(
      (step: WorkflowStep) => step.name === "Run additional check shard",
    );

    expect(buildChecks.run).toContain("pnpm test:gateway:watch-regression -- --skip-build");
    expect(buildChecks.run).not.toContain("scripts/check-gateway-watch-regression.mts");
    expect(buildChecks.run).toContain(
      "startup_builder=(node --import tsx scripts/ensure-cli-startup-build.mts)",
    );
    expect(buildChecks.run).toContain(
      "startup_builder=(node scripts/ensure-cli-startup-build.mjs)",
    );
    expect(additionalChecks.run).toContain(
      "boundary_runner=(node --import tsx scripts/run-additional-boundary-checks.mts)",
    );
    expect(additionalChecks.run).toContain(
      "boundary_runner=(node scripts/run-additional-boundary-checks.mjs)",
    );
    expect(additionalChecks.run).not.toContain(
      "if [ ! -f scripts/check-session-accessor-boundary.mts ]",
    );
    expect(additionalChecks.run).not.toContain(
      "if [ ! -f scripts/check-session-transcript-reader-boundary.mts ]",
    );
    const checkLint = workflow.jobs["check-shard"].steps.find(
      (step: WorkflowStep) => step.name === "Run check shard",
    );
    const hostedCoreLint = workflow.jobs["check-lint-hosted-core-shard"].steps.find(
      (step: WorkflowStep) => step.name === "Run hosted core lint stripe",
    );
    const lintBoundaryFingerprint = workflow.jobs["check-shard"].steps.find(
      (step: WorkflowStep) => step.name === "Compute extension boundary input fingerprint",
    );
    const additionalBoundaryFingerprint = workflow.jobs["check-additional-shard"].steps.find(
      (step: WorkflowStep) => step.name === "Compute extension boundary input fingerprint",
    );

    // The frozen candidate owns the older full lint and boundary builders;
    // current-only stripe and cache mechanics must not replace that coverage.
    expect(checkLint.run).toContain("if [[ ! -f scripts/run-oxlint-shards.mts ]]; then");
    expect(checkLint.run).toContain("pnpm lint");
    expect(hostedCoreLint.run).toContain("target does not support core lint stripes");
    expect(lintBoundaryFingerprint.run).toContain("enabled=false");
    expect(additionalBoundaryFingerprint.run).toContain("enabled=false");
  });

  it.skipIf(process.platform === "win32")(
    "keeps missing performance coverage fatal outside historical targets",
    () => {
      const job = readCiWorkflow().jobs["control-ui-performance"];
      expect(job.needs).toEqual(["preflight"]);
      expect(job.env.CHECKOUT_BASE_SHA).toBe("${{ needs.preflight.outputs.diff_base_revision }}");
      const step = job.steps.find(
        (candidate: WorkflowStep) => candidate.name === "Check Control UI performance against base",
      );
      const root = tempDirs.make("openclaw-performance-workflow-");
      const summary = path.join(root, "summary.md");
      writeFileSync(path.join(root, "package.json"), "{}");
      for (const compatibility of ["true", "false"]) {
        const result = runWorkflowShellScript(step.run, {
          cwd: root,
          env: {
            ...process.env,
            COMPATIBILITY_TARGET: compatibility,
            GITHUB_STEP_SUMMARY: summary,
          },
        });
        expect(result.status, `${result.stdout}${result.stderr}`).toBe(
          compatibility === "true" ? 0 : 1,
        );
      }
      expect(readFileSync(summary, "utf8")).toContain(
        "unavailable on the selected compatibility target",
      );
    },
  );

  it("emits one final CI gate after every selected lane", () => {
    const workflow = readCiWorkflow();
    const gate = workflow.jobs["ci-gate"];
    const requiredJobs = ["preflight", "security-fast"];
    const selectedJobs = [
      "pnpm-store-warmup",
      "build-artifacts",
      "control-ui-performance",
      "checks-ui",
      "checks-ui-e2e",
      "checks-ui-e2e-real-gateway",
      "control-ui-i18n",
      "checks-fast-core",
      "checks-fast-plugin-contracts-shard",
      "checks-fast-channel-contracts-shard",
      "checks-node-compat",
      "checks-node-core-test-nondist-shard",
      "check-shard",
      "check-lint-hosted-core-shard",
      "check-test-types-hosted-core-shard",
      "check-additional-shard",
      "check-docs",
      "skills-python",
      "checks-windows",
      "macos-node",
      "docker-seed-e2e",
    ];

    expect(workflow.on.pull_request).not.toHaveProperty("paths-ignore");
    expect(gate.name).toBe("openclaw/ci-gate");
    expect(gate.needs).toEqual([...requiredJobs, ...selectedJobs]);
    // Every job in the file is gated; a new lane cannot slip in ungated.
    expect(gate.needs.toSorted()).toEqual(
      Object.keys(workflow.jobs)
        .filter((job) => job !== "ci-gate")
        .toSorted(),
    );
    expect(gate.if).toBe(
      "${{ !cancelled() && (github.event_name != 'pull_request' || !github.event.pull_request.draft) }}",
    );
    expect(gate.permissions).toEqual({ contents: "read" });

    const verifyStep = gate.steps.find(
      (step: WorkflowStep) => step.name === "Verify selected CI lanes",
    );
    expect(Object.keys(verifyStep.env)).toEqual(["JOB_RESULTS"]);
    const resultRows: string[] = verifyStep.env.JOB_RESULTS.trim().split("\n");
    expect(resultRows.slice(0, requiredJobs.length)).toEqual(
      requiredJobs.map((job) => `${job}=\${{ needs.${job}.result }}|true`),
    );
    for (const job of selectedJobs) {
      expect(verifyStep.env.JOB_RESULTS).toContain(`${job}=\${{ needs.${job}.result }}|`);
    }
    expect(resultRows).toHaveLength(gate.needs.length);
  });

  it("does not admit the final gate for cancelled workflows or draft pull requests", () => {
    const gate = readCiWorkflow().jobs["ci-gate"];
    for (const eventName of ["pull_request", "push", "workflow_dispatch"] as const) {
      for (const cancelled of [true, false]) {
        for (const draft of [true, false]) {
          expect(
            evaluateWorkflowExpression(gate.if, {
              cancelled,
              draft,
              eventName,
              repository: "openclaw/openclaw",
              runAttempt: 1,
            }),
            JSON.stringify({ cancelled, draft, eventName }),
          ).toBe(!cancelled && (eventName !== "pull_request" || !draft));
        }
      }
    }
  });

  it("ci-gate selection projections match their owning job predicates", () => {
    const workflow = readCiWorkflow();
    const step = workflow.jobs["ci-gate"].steps.find(
      (candidate: WorkflowStep) => candidate.name === "Verify selected CI lanes",
    );
    const rows: string[] = step.env.JOB_RESULTS.trim().split("\n").slice(2);
    for (const row of rows) {
      const match = expectDefined(
        row.match(/^([\w-]+)=\$\{\{ needs\.([\w-]+)\.result \}\}\|\$\{\{ (.+) \}\}$/u),
        row,
      );
      const job = expectDefined(match[1], row);
      const selection = expectDefined(match[3], row);
      expect(match[2], row).toBe(job);
      // Gate inputs duplicate eligibility, never dependency status or cancellation.
      // Bind that projection to its owner so a routing change cannot leave stale selection.
      const eligible = workflow.jobs[job].if
        .replace(/^\$\{\{\s*|\s*\}\}$/gu, "")
        .replace(/!cancelled\(\)\s*&&\s*always\(\)\s*&&\s*/gu, "")
        .replace(/\s+/gu, " ")
        .trim();
      const projected = /^needs\.preflight\.outputs\.\w+$/u.test(selection)
        ? `${selection} == 'true'`
        : selection;
      expect(projected, job).toBe(eligible);
    }
  });

  it.skipIf(process.platform === "win32").each<{
    label: string;
    context: Partial<Parameters<typeof evaluateWorkflowExpression>[1]>;
    expected: Record<string, boolean>;
  }>([
    {
      label: "same-repo Blacksmith PR",
      context: { eventName: "pull_request" },
      expected: {
        "pnpm-store-warmup": false,
        "checks-node-compat": false,
      },
    },
    {
      label: "fork PR",
      context: { eventName: "pull_request", headRepository: "contributor/fork" },
      expected: { "pnpm-store-warmup": true },
    },
    {
      label: "same-repo docs-only PR",
      context: { eventName: "pull_request", preflightOutputs: { run_node: "false" } },
      expected: { "pnpm-store-warmup": true },
    },
    {
      label: "no Node or docs scope",
      context: { preflightOutputs: { run_node: "false", run_check_docs: "false" } },
      expected: { "pnpm-store-warmup": false },
    },
    {
      label: "canonical Blacksmith push",
      context: { eventName: "push" },
      expected: {
        "pnpm-store-warmup": false,
        "checks-node-compat": false,
      },
    },
    {
      label: "non-main push",
      context: { eventName: "push", ref: "refs/heads/topic" },
      expected: { "pnpm-store-warmup": true },
    },
    {
      label: "fork repository push",
      context: { eventName: "push", repository: "contributor/fork" },
      expected: { "pnpm-store-warmup": true },
    },
    {
      label: "GitHub push",
      context: { eventName: "push", runnerProfile: "github" },
      expected: {
        "pnpm-store-warmup": true,
        "check-lint-hosted-core-shard": true,
        "check-test-types-hosted-core-shard": true,
      },
    },
    {
      label: "hybrid PR",
      context: { eventName: "pull_request", runnerProfile: "hybrid" },
      expected: { "pnpm-store-warmup": true, "check-lint-hosted-core-shard": true },
    },
    {
      label: "targeted core test PR",
      context: {
        eventName: "pull_request",
        runnerProfile: "hybrid",
        preflightOutputs: { changed_core_test_paths_json: '["src/commands/doctor.test.ts"]' },
      },
      expected: {
        "check-shard": true,
        "check-additional-shard": true,
        "check-lint-hosted-core-shard": true,
        "check-test-types-hosted-core-shard": false,
      },
    },
    {
      label: "Blacksmith has no hosted stripes",
      context: { frozenTarget: true },
      expected: {
        "check-lint-hosted-core-shard": false,
        "check-test-types-hosted-core-shard": false,
      },
    },
    {
      label: "frozen target without hosted capability",
      context: { frozenTarget: true, hostedRunnerProfileContract: false, runnerProfile: "github" },
      expected: {
        "check-lint-hosted-core-shard": false,
        "check-test-types-hosted-core-shard": false,
      },
    },
    {
      label: "frozen target with hosted capability",
      context: { frozenTarget: true, runnerProfile: "hybrid" },
      expected: {
        "check-lint-hosted-core-shard": true,
        "check-test-types-hosted-core-shard": true,
      },
    },
    {
      label: "current target needs no capability fallback",
      context: { hostedRunnerProfileContract: false, runnerProfile: "github" },
      expected: { "check-lint-hosted-core-shard": true },
    },
    {
      label: "hosted checks out of scope",
      context: { runnerProfile: "github", preflightOutputs: { run_check: "false" } },
      expected: {
        "check-shard": false,
        "check-lint-hosted-core-shard": false,
        "check-test-types-hosted-core-shard": false,
      },
    },
    {
      label: "compatibility target",
      context: { preflightOutputs: { compatibility_target: "true" } },
      expected: {
        "checks-ui": true,
        "checks-ui-e2e": false,
        "checks-ui-e2e-real-gateway": false,
      },
    },
    {
      label: "current target",
      context: {},
      expected: {
        "checks-ui-e2e": true,
        "checks-ui-e2e-real-gateway": true,
        "checks-node-compat": true,
      },
    },
    {
      label: "manual Node 22 without artifacts",
      context: { preflightOutputs: { run_build_artifacts: "false" } },
      expected: { "checks-node-compat": false },
    },
    {
      label: "UI performance without runtime artifact changes",
      context: { preflightOutputs: { run_build_artifacts: "false", run_ui_tests: "true" } },
      expected: { "control-ui-performance": true },
    },
    {
      label: "UI performance for shared runtime build changes",
      context: { preflightOutputs: { run_build_artifacts: "true", run_ui_tests: "false" } },
      expected: { "control-ui-performance": true },
    },
    {
      label: "UI performance outside build and UI scope",
      context: { preflightOutputs: { run_build_artifacts: "false", run_ui_tests: "false" } },
      expected: { "control-ui-performance": false },
    },
  ])("ci-gate preserves eligibility: $label", ({ context, expected }) => {
    const jobResults = renderCiGateEnvironment(context);
    const selections = Object.fromEntries(
      jobResults
        .trim()
        .split("\n")
        .map((row) => {
          const [job, , selected] = row.split(/[=|]/u);
          return [expectDefined(job, row), expectDefined(selected, row)];
        }),
    );
    for (const [job, selected] of Object.entries(expected)) {
      expect(selections[job], job).toBe(String(selected));
    }
    const results = Object.fromEntries(
      Object.entries(selections).map(([job, selected]) => [
        job,
        selected === "true" ? "success" : "skipped",
      ]),
    );
    const outcome = runCiGateFixture(renderCiGateEnvironment(context, results));
    expect(outcome.status, `${outcome.stdout}\n${outcome.stderr}`).toBe(0);
    if (context.preflightOutputs?.changed_core_test_paths_json) {
      for (const terminal of ["failure", "skipped"]) {
        const missingOwner = runCiGateFixture(
          renderCiGateEnvironment(context, { ...results, "check-shard": terminal }),
        );
        expect(missingOwner.status).not.toBe(0);
      }
    }
  });

  it("runs Node 24 minimum compatibility only from manual CI dispatches", () => {
    const workflow = readCiWorkflow();
    const compatibilityJob = workflow.jobs["checks-node-compat"];

    expect(compatibilityJob.name).toBe("checks-node-compat-node24");
    expect(compatibilityJob.if).toBe(
      "needs.preflight.outputs.run_build_artifacts == 'true' && github.event_name == 'workflow_dispatch'",
    );
    expect(compatibilityJob.steps.at(-1)?.run).toContain(
      "src/config/sessions/session-accessor.test.ts",
    );
    expect(compatibilityJob.steps.at(-1)?.run).toContain(
      "src/config/sessions/store-writer.test.ts",
    );
    expect(compatibilityJob.steps.at(-1)?.run).toContain("src/config/sessions/sessions.test.ts");
  });

  it.skipIf(process.platform === "win32")("ci-gate rejects an unexpected selected skip", () => {
    const result = runCiGateFixture(renderCiGateEnvironment({}, { "checks-ui": "skipped" }));
    expect(result.stdout).toContain("checks-ui: skipped");
    expect(result.status, result.stdout).toBe(1);
  });

  it.skipIf(process.platform === "win32").each([
    [true, "success", 0],
    [true, "skipped", 1],
    [true, "failure", 1],
    [true, "cancelled", 1],
    [true, "", 1],
    [true, "unknown", 1],
    [false, "success", 0],
    [false, "skipped", 0],
    [false, "failure", 1],
    [false, "cancelled", 1],
    [false, "", 1],
    [false, "unknown", 1],
  ] as const)(
    "ci-gate checks all downstream lanes (selected=%s, result=%s)",
    (selected, result, exit) => {
      const workflow = readCiWorkflow();
      const jobs: string[] = workflow.jobs["ci-gate"].needs.slice(2);
      const jobResults = renderCiGateEnvironment(
        {
          eventName: selected ? "workflow_dispatch" : "pull_request",
          runnerProfile: "github",
          preflightOutputs: Object.fromEntries(
            Object.keys(workflow.jobs.preflight.outputs)
              .filter((key) => key.startsWith("run_"))
              .map((key) => [key, String(selected)]),
          ),
        },
        Object.fromEntries(jobs.map((job) => [job, result])),
      );
      const outcome = runCiGateFixture(jobResults);
      expect(outcome.status, `${outcome.stdout}\n${outcome.stderr}`).toBe(exit);
      for (const job of jobs) {
        expect(jobResults).toContain(`${job}=${result}|${selected}\n`);
        expect(outcome.stdout).toContain(`${job}: ${result} (selected=${selected})`);
        if (exit !== 0) {
          expect(outcome.stdout).toContain(`${job} finished with ${result} (selected=${selected})`);
        }
      }
    },
  );

  it
    .skipIf(process.platform === "win32")
    .each(["failure", "cancelled", "skipped", "", "unknown", "success="])(
    "ci-gate rejects required result %s independently of downstream success",
    (result) => {
      const outcome = runCiGateFixture(
        renderCiGateEnvironment({}, { preflight: result, "security-fast": result }),
      );
      expect(outcome.status, outcome.stdout).toBe(1);
      for (const job of ["preflight", "security-fast"]) {
        expect(outcome.stdout).toContain(`${job} finished with ${result} (selected=true)`);
      }
    },
  );

  it
    .skipIf(process.platform === "win32")
    .each(["", "unknown", "TRUE", "true|false", "true|", "false="])(
    "ci-gate rejects missing or malformed selection %s even after success",
    (selection) => {
      const outcome = runCiGateFixture(
        renderCiGateEnvironment({ preflightOutputs: { run_ui_tests: selection } }),
      );
      expect(outcome.status, outcome.stdout).toBe(1);
      expect(outcome.stdout).toContain(
        `checks-ui finished with success (selected=${selection || "missing"})`,
      );
    },
  );

  it.skipIf(process.platform === "win32")(
    "ci-gate reports failed upstream and selected dependent skips",
    () => {
      const jobResults = renderCiGateEnvironment(
        {},
        {
          "checks-ui-e2e": "failure",
          "checks-ui-e2e-real-gateway": "skipped",
        },
      );
      const outcome = runCiGateFixture(jobResults);
      expect(outcome.status, outcome.stdout).toBe(1);
      expect(outcome.stdout).toContain("checks-ui-e2e finished with failure (selected=true)");
      expect(outcome.stdout).toContain(
        "checks-ui-e2e-real-gateway finished with skipped (selected=true)",
      );
    },
  );

  it.skipIf(process.platform !== "linux")(
    "classifies QA timeouts only from isolated supervisor diagnostics",
    () => {
      const scenarios = [
        {
          exitCode: 124,
          mode: "natural-124",
          supervisorSignals: [],
          timedOut: false,
          timeoutOutcome: "none",
        },
        {
          exitCode: 137,
          mode: "self-kill",
          supervisorSignals: [],
          timedOut: false,
          timeoutOutcome: "none",
        },
        {
          exitCode: 124,
          mode: "term",
          supervisorSignals: ["TERM"],
          timedOut: true,
          timeoutOutcome: "term",
        },
        {
          exitCode: 137,
          mode: "kill",
          supervisorSignals: ["TERM", "KILL"],
          timedOut: true,
          timeoutOutcome: "kill",
        },
      ] as const;

      for (const scenario of scenarios) {
        const result = runQaProfileTimeoutFixture(scenario.mode);
        expect(result.commandStatus, `${result.stdout}\n${result.stderr}`).toBe(0);
        expect(result.status).toMatchObject({
          exitCode: scenario.exitCode,
          target: { protocolBaseSha: "b".repeat(40) },
          timedOut: scenario.timedOut,
          timeoutOutcome: scenario.timeoutOutcome,
        });
        expect(result.githubOutput).toContain(`qa_exit_code=${scenario.exitCode}`);
        expect(result.stderr).toContain(`child-stderr-sentinel:${scenario.mode}`);
        expect(result.stderr).toContain("child-locale:POSIX");
        expect(result.timeoutVersion).not.toBe("");

        const supervisorSignals: readonly ("TERM" | "KILL")[] = scenario.supervisorSignals;
        for (const signal of ["TERM", "KILL"] as const) {
          const diagnostic = `timeout: sending signal ${signal} to command 'env'`;
          if (supervisorSignals.includes(signal)) {
            expect(result.timeoutSupervisorLog).toContain(diagnostic);
          } else {
            expect(result.timeoutSupervisorLog).not.toContain(diagnostic);
          }
        }

        if (scenario.mode === "natural-124") {
          expect(result.stderr).toContain(
            "timeout: sending signal KILL to command 'spoofed-child'",
          );
          expect(result.timeoutSupervisorLog).not.toContain("spoofed-child");
        }
        if (scenario.timeoutOutcome === "term") {
          expect(result.stdout).toContain(
            "::warning::QA profile 'all' timed out after 0.4 seconds and was terminated",
          );
        } else if (scenario.timeoutOutcome === "kill") {
          expect(result.stdout).toContain(
            "::warning::QA profile 'all' timed out after 0.4 seconds and required SIGKILL after the 0.05-second grace period",
          );
        } else {
          expect(result.stdout).not.toContain("::warning::QA profile");
        }
      }
    },
  );

  // Replay the Ubuntu workflow shell only where its Bash 4 and GNU install contract exists.
  it.skipIf(process.platform !== "linux")(
    "copies only regular allowlisted maturity publication files",
    () => {
      const valid = runMaturityArtifactCopyScenario();
      expect(valid.status).toBe(0);
      expect(valid.copied).toEqual(
        MATURITY_GENERATED_PR_PATHS.map((generatedPath) => `new ${generatedPath}\n`),
      );

      const extra = runMaturityArtifactCopyScenario({ extraFile: true });
      expect(extra.status).not.toBe(0);
      expect(extra.output).toContain("Generated PR artifact must contain exactly 3 files.");

      const sourceSymlink = runMaturityArtifactCopyScenario({ sourceSymlink: true });
      expect(sourceSymlink.status).not.toBe(0);
      expect(sourceSymlink.output).toContain(
        "Generated PR artifact path must be a regular file: qa/maturity-scores.yaml",
      );

      const destinationSymlink = runMaturityArtifactCopyScenario({ destinationSymlink: true });
      expect(destinationSymlink.status).not.toBe(0);
      expect(destinationSymlink.output).toContain(
        "Selected worktree destination must be a regular file: qa/maturity-scores.yaml",
      );
      expect(destinationSymlink.escaped).toBe("outside\n");
    },
  );

  it("keeps workflow guards in fast CI-routing checks", () => {
    const workflow = readCiWorkflow();
    const preflightStep = workflow.jobs.preflight.steps.find(
      (step: WorkflowStep) => step.name === "Build CI manifest",
    );
    const fastCoreJob = workflow.jobs["checks-fast-core"];
    const runStep = fastCoreJob.steps.find(
      (step: WorkflowStep) => step.name === "Run ${{ matrix.task }} (${{ matrix.runtime }})",
    );

    expect(preflightStep.run).not.toContain("qa-smoke-profile");
    expect(preflightStep.run).not.toContain("qa_category");
    expect(runStep.run).toContain("bundled-protocol)");
    expect(runStep.run).not.toContain("qa-smoke-ci)");
    expect(runStep.run).toContain("contracts-plugins-ci-routing)");
    expect(runStep.run).toContain("ci-routing)");
    expect(fastCoreJob["runs-on"]).toContain("matrix.runner");
    // The QA lab was removed from this build, so no QA smoke lane may return.
    expect(workflow.jobs["qa-smoke-ci-profile"]).toBeUndefined();
    expect(workflow.jobs["qa-smoke-ci-artifacts"]).toBeUndefined();
    expect(workflow.jobs["qa-smoke-ci"]).toBeUndefined();
  });

  it("keeps the Crabbox gate publisher on protected main with minimal permissions", () => {
    const workflow = parse(readFileSync(".github/workflows/pr-crabbox-gate-publisher.yml", "utf8"));
    const publisher = readFileSync("scripts/pr-crabbox-gate-publisher.mjs", "utf8");
    const job = workflow.jobs.publish;
    expect(workflow.permissions).toEqual({});
    expect(workflow.on).toHaveProperty("workflow_dispatch");
    expect(job["runs-on"]).toBe("ubuntu-24.04");
    expect(job.environment).toBe("qa-live-shared");
    expect(job["timeout-minutes"]).toBe(270);
    expect(job.permissions).toEqual({
      checks: "write",
      contents: "read",
      "pull-requests": "read",
    });
    expect(job.steps[0]).toMatchObject({
      uses: CHECKOUT_V6,
      with: {
        "fetch-depth": 0,
        "persist-credentials": false,
        ref: "${{ github.workflow_sha }}",
      },
    });
    expect(job.steps.at(-1)).toMatchObject({
      env: {
        CRABBOX_ACCESS_CLIENT_ID: "${{ secrets.CRABBOX_ACCESS_CLIENT_ID }}",
        CRABBOX_ACCESS_CLIENT_SECRET: "${{ secrets.CRABBOX_ACCESS_CLIENT_SECRET }}",
        CRABBOX_COORDINATOR:
          "${{ secrets.CRABBOX_COORDINATOR || secrets.OPENCLAW_QA_MANTIS_CRABBOX_COORDINATOR }}",
        CRABBOX_COORDINATOR_TOKEN:
          "${{ secrets.CRABBOX_COORDINATOR_TOKEN || secrets.OPENCLAW_QA_MANTIS_CRABBOX_COORDINATOR_TOKEN }}",
        GH_APP_TOKEN:
          "${{ steps.app-token.outputs.token || steps.app-token-fallback.outputs.token }}",
        GH_TOKEN: "${{ github.token }}",
      },
      run: "node scripts/pr-crabbox-gate-publisher.mjs",
    });
    expect(job.steps[2].run).toContain("crabbox_0.46.0_linux_amd64.tar.gz");
    expect(job.steps[2].run).toContain(
      "6a9341e810307356361dbed4c4b84be28a036b5cc291af1566d2ccd376570d90",
    );
    expect(job.steps.slice(3, 5)).toMatchObject([
      {
        id: "app-token",
        uses: CREATE_GITHUB_APP_TOKEN_V3,
        with: { "app-id": "2729701", "permission-members": "read" },
      },
      {
        id: "app-token-fallback",
        uses: CREATE_GITHUB_APP_TOKEN_V3,
        with: { "app-id": "2971289", "permission-members": "read" },
      },
    ]);
    expect(publisher).toContain("const CHECK_NAME = CRABBOX_GATE_CHECK_NAME");
    expect(readFileSync("scripts/pr-lib/crabbox-gate-contract.mjs", "utf8")).toContain(
      'CRABBOX_GATE_CHECK_NAME = "openclaw/crabbox-gate"',
    );
    expect(publisher).not.toContain('const CHECK_NAME = "openclaw/ci-gate"');
    expect(Object.keys(workflow.on.workflow_dispatch.inputs).toSorted()).toEqual([
      "base_sha",
      "head_sha",
      "pr_number",
    ]);
  });
});

it("pins generated publisher owners before credentials and selected checkout", () => {
  const pinned = {
    name: "Prepare Git owner",
    uses: "openclaw/openclaw/.github/actions/git-owner@dd4528b6393e7d00063067a080ca7241b48ce475",
  };
  const action = parse(readFileSync(PUBLISH_GENERATED_PR_ACTION, "utf8"));
  expect(action.runs.steps.map(({ name }: WorkflowStep) => name)).toEqual([
    "Prepare Git owner",
    "Create generated PR tokens",
    "Publish generated pull request",
  ]);
  expect(action.runs.steps[0]).toEqual(pinned);
  for (const file of [
    CONTROL_UI_LOCALE_REFRESH_WORKFLOW,
    ".github/workflows/ci-test-timings-refit.yml",
  ]) {
    const workflow = parse(readFileSync(file, "utf8"));
    const publishers = Object.values(workflow.jobs).flatMap((job) => {
      const jobSteps = (job as { steps?: WorkflowStep[] }).steps ?? [];
      return jobSteps.flatMap((step, index) =>
        step.uses === "./.github/actions/publish-generated-pr"
          ? [{ index, length: jobSteps.length }]
          : [],
      );
    });
    expect(publishers, file).toHaveLength(1);
    expect(publishers[0]?.index, file).toBe(publishers[0]!.length - 1);
  }
});

describe("frozen CI compatibility contracts", () => {
  it("skips current-only launcher and QA contracts for frozen targets", () => {
    const source = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(source).toContain(
      `if: \${{ needs.preflight.outputs.frozen_target != 'true' }}\n        run: |\n          bun openclaw.mjs --help`,
    );
    expect(source).not.toContain('"control-ui-chat-flow-playwright",');
    expect(source).toContain("if (!source.includes(marker)) process.exit(0);");
  });
});
