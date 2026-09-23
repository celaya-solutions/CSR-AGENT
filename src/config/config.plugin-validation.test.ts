// Covers plugin config validation and manifest-backed constraints.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { clearLoadInstalledPluginIndexInstallRecordsCache } from "../plugins/installed-plugin-index-records.js";
import { writePersistedInstalledPluginIndex } from "../plugins/installed-plugin-index-store-write.js";
import type { PluginManifestRecord } from "../plugins/manifest-registry.js";
import { shouldSuppressMissingCodexPluginDiagnostics } from "./codex-plugin-diagnostics.js";
import { resolveConfigWidePluginManifestRegistry } from "./io.plugin-metadata.js";
import { validateConfigObjectWithPlugins as validateConfigObjectWithPluginsRaw } from "./validation.js";

vi.unmock("../version.js");

async function chmodSafeDir(dir: string) {
  if (process.platform === "win32") {
    return;
  }
  await fs.chmod(dir, 0o755);
}

async function mkdirSafe(dir: string) {
  await fs.mkdir(dir, { recursive: true });
  await chmodSafeDir(dir);
}

async function writePluginFixture(params: {
  dir: string;
  id: string;
  schema: Record<string, unknown>;
  channels?: string[];
}) {
  await mkdirSafe(params.dir);
  await fs.writeFile(
    path.join(params.dir, "index.js"),
    `export default { id: "${params.id}", register() {} };`,
    "utf-8",
  );
  const manifest: Record<string, unknown> = {
    id: params.id,
    configSchema: params.schema,
  };
  if (params.channels) {
    manifest.channels = params.channels;
  }
  await fs.writeFile(
    path.join(params.dir, "openclaw.plugin.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8",
  );
}

async function writeBundleFixture(params: {
  dir: string;
  format: "codex" | "claude";
  name: string;
}) {
  await mkdirSafe(params.dir);
  const manifestDir = path.join(
    params.dir,
    params.format === "codex" ? ".codex-plugin" : ".claude-plugin",
  );
  await mkdirSafe(manifestDir);
  await fs.writeFile(
    path.join(manifestDir, "plugin.json"),
    JSON.stringify({ name: params.name }, null, 2),
    "utf-8",
  );
}

async function writeManifestlessClaudeBundleFixture(params: { dir: string }) {
  await mkdirSafe(params.dir);
  await mkdirSafe(path.join(params.dir, "commands"));
  await fs.writeFile(
    path.join(params.dir, "commands", "review.md"),
    "---\ndescription: fixture\n---\n",
    "utf-8",
  );
  await fs.writeFile(path.join(params.dir, "settings.json"), '{"hideThinkingBlock":true}', "utf-8");
}

function expectRemovedPluginWarnings(
  result: { ok: boolean; warnings?: Array<{ path: string; message: string }> },
  removedId: string,
  removedLabel: string,
) {
  expect(result.ok).toBe(true);
  if (result.ok) {
    const message = `plugin removed: ${removedLabel} (stale config entry ignored; remove it from plugins config)`;
    expectPathMessage(result.warnings, `plugins.entries.${removedId}`, message);
    expectPathMessage(result.warnings, "plugins.allow", message);
    expectPathMessage(result.warnings, "plugins.deny", message);
    expectPathMessage(result.warnings, "plugins.slots.memory", message);
  }
}

function expectPathMessage(
  entries: readonly { path: string; message: string }[] | undefined,
  pathValue: string,
  message: string,
) {
  expect(entries?.some((entry) => entry.path === pathValue && entry.message === message)).toBe(
    true,
  );
}

function expectPathMessageIncludes(
  entries: readonly { path: string; message: string }[] | undefined,
  pathValue: string,
  fragment: string,
) {
  expect(
    entries?.some((entry) => entry.path === pathValue && entry.message.includes(fragment)),
  ).toBe(true);
}

function expectNoPath(
  entries: readonly { path: string; message: string }[] | undefined,
  pathValue: string,
) {
  expect(entries?.some((entry) => entry.path === pathValue)).toBe(false);
}

describe("config plugin validation", () => {
  let fixtureRoot = "";
  let suiteHome = "";
  let badPluginDir = "";
  let enumPluginDir = "";
  let chatPluginDir = "";
  let googleOverridePluginDir = "";
  let bundlePluginDir = "";
  let manifestlessClaudeBundleDir = "";
  let blockedPluginDir = "";
  let malformedSchemaPluginDir = "";
  const suiteEnv = () =>
    ({
      HOME: suiteHome,
      OPENCLAW_HOME: undefined,
      OPENCLAW_STATE_DIR: path.join(suiteHome, ".openclaw"),
      OPENCLAW_BUNDLED_PLUGINS_DIR: undefined,
      OPENCLAW_VERSION: undefined,
      VITEST: "true",
    }) satisfies NodeJS.ProcessEnv;

  const withCanonicalAgentEntries = (raw: unknown): unknown => {
    const next = structuredClone(raw);
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      return next;
    }
    const agents = (next as { agents?: unknown }).agents;
    if (!agents || typeof agents !== "object" || Array.isArray(agents)) {
      return next;
    }
    const mutableAgents = agents as { entries?: unknown; list?: unknown };
    if (!Array.isArray(mutableAgents.list)) {
      return next;
    }
    mutableAgents.entries = Object.fromEntries(
      mutableAgents.list.flatMap((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          return [];
        }
        const { id, ...entry } = value as Record<string, unknown>;
        return typeof id === "string" && id.trim() ? [[id, entry]] : [];
      }),
    );
    delete mutableAgents.list;
    return next;
  };

  const validateConfigObjectWithPlugins = (
    raw: unknown,
    options: Parameters<typeof validateConfigObjectWithPluginsRaw>[1] = {},
  ) =>
    validateConfigObjectWithPluginsRaw(withCanonicalAgentEntries(raw), {
      ...options,
      env: options.env ?? suiteEnv(),
    });

  const validateInSuite = (raw: unknown) => validateConfigObjectWithPlugins(raw);

  const validateRemovedPluginConfig = (removedId: string, enabled = true) =>
    validateInSuite({
      agents: { list: [{ id: "openclaw" }] },
      plugins: {
        enabled: false,
        entries: { [removedId]: { enabled } },
        allow: [removedId],
        deny: [removedId],
        slots: { memory: removedId },
      },
    });

  beforeAll(async () => {
    fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-config-plugin-validation-"));
    await chmodSafeDir(fixtureRoot);
    suiteHome = path.join(fixtureRoot, "home");
    await mkdirSafe(suiteHome);
    badPluginDir = path.join(suiteHome, "bad-plugin");
    enumPluginDir = path.join(suiteHome, "enum-plugin");
    chatPluginDir = path.join(suiteHome, "chat-plugin");
    await writePluginFixture({
      dir: badPluginDir,
      id: "bad-plugin",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          value: { type: "boolean" },
        },
        required: ["value"],
      },
    });
    await writePluginFixture({
      dir: enumPluginDir,
      id: "enum-plugin",
      schema: {
        type: "object",
        properties: {
          fileFormat: {
            type: "string",
            enum: ["markdown", "html"],
          },
        },
        required: ["fileFormat"],
      },
    });
    await writePluginFixture({
      dir: chatPluginDir,
      id: "chat-plugin",
      channels: ["chat"],
      schema: { type: "object" },
    });
    googleOverridePluginDir = path.join(suiteHome, "google");
    await writePluginFixture({
      dir: googleOverridePluginDir,
      id: "google",
      schema: {
        type: "object",
        properties: {
          apiKey: { type: "string" },
        },
      },
    });
    bundlePluginDir = path.join(suiteHome, "bundle-plugin");
    await writeBundleFixture({
      dir: bundlePluginDir,
      format: "codex",
      name: "Bundle Fixture",
    });
    manifestlessClaudeBundleDir = path.join(suiteHome, "manifestless-claude-bundle");
    await writeManifestlessClaudeBundleFixture({
      dir: manifestlessClaudeBundleDir,
    });
    blockedPluginDir = path.join(suiteHome, "blocked-plugin");
    await writePluginFixture({
      dir: blockedPluginDir,
      id: "blocked-plugin",
      schema: { type: "object" },
    });
    malformedSchemaPluginDir = path.join(suiteHome, "malformed-schema-plugin");
    await writePluginFixture({
      dir: malformedSchemaPluginDir,
      id: "malformed-schema-plugin",
      schema: {
        type: "object",
        properties: { mode: { $ref: "#/$defs/Mode" } },
      },
    });
  });

  afterAll(async () => {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  });

  it("reports a malformed plugin configSchema as an issue instead of throwing", () => {
    const res = validateInSuite({
      agents: { list: [{ id: "openclaw" }] },
      plugins: {
        enabled: true,
        load: { paths: [malformedSchemaPluginDir] },
        entries: { "malformed-schema-plugin": { enabled: true } },
        allow: ["malformed-schema-plugin"],
      },
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expectPathMessageIncludes(
        res.issues,
        "plugins.entries.malformed-schema-plugin.config",
        "invalid schema",
      );
    }
  });

  it("keeps malformed bundled plugin schemas on the throwing path", () => {
    const bundledRecord = {
      id: "bundled-schema-plugin",
      channels: [],
      cliBackends: [],
      configSchema: {
        type: "object",
        properties: { mode: { $ref: "#/$defs/Mode" } },
      },
      hooks: [],
      manifestPath: "/bundled/schema/openclaw.plugin.json",
      origin: "bundled",
      providers: [],
      rootDir: "/bundled/schema",
      skills: [],
      source: "/bundled/schema/index.js",
    } satisfies PluginManifestRecord;

    expect(() =>
      validateConfigObjectWithPlugins(
        {
          agents: { list: [{ id: "openclaw" }] },
          plugins: { entries: { "bundled-schema-plugin": { enabled: true } } },
        },
        {
          pluginMetadataSnapshot: {
            manifestRegistry: { diagnostics: [], plugins: [bundledRecord] },
          },
        },
      ),
    ).toThrow("invalid schema");
  });

  it("reports missing plugin refs across entries and allowlist surfaces", () => {
    const missingPath = path.join(suiteHome, "missing-plugin-dir");
    const res = validateInSuite({
      agents: { list: [{ id: "openclaw" }] },
      plugins: {
        enabled: true,
        load: { paths: [missingPath] },
        entries: {
          "missing-plugin": { enabled: true },
          "missing-slot": { enabled: false },
        },
        allow: ["missing-allow", "missing-slot"],
        deny: ["missing-deny"],
        slots: { memory: "missing-slot" },
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expectPathMessage(res.issues, "plugins.slots.memory", "plugin not found: missing-slot");
      expect(res.warnings).toEqual(
        expect.arrayContaining([
          {
            path: "plugins.entries.missing-plugin",
            message:
              "plugin not found: missing-plugin (stale config entry ignored; remove it from plugins config)",
          },
          {
            path: "plugins.allow",
            message:
              "plugin not found: missing-allow (stale config entry ignored; remove it from plugins config)",
          },
          {
            path: "plugins.deny",
            message:
              "plugin not found: missing-deny (stale config entry ignored; remove it from plugins config)",
          },
        ]),
      );
      expect(res.warnings.filter((warning) => warning.path.startsWith("plugins."))).toEqual([
        {
          path: "plugins.entries.missing-plugin",
          message:
            "plugin not found: missing-plugin (stale config entry ignored; remove it from plugins config)",
        },
        {
          path: "plugins.allow",
          message:
            "plugin not found: missing-allow (stale config entry ignored; remove it from plugins config)",
        },
        {
          path: "plugins.deny",
          message:
            "plugin not found: missing-deny (stale config entry ignored; remove it from plugins config)",
        },
      ]);
    }
  });

  it.each([
    {
      name: "an exact explicit disable marker",
      pluginId: "missing-plugin",
      entry: { enabled: false },
      warningPaths: [],
    },
    {
      name: "a disabled entry that retains settings",
      pluginId: "missing-plugin",
      entry: { enabled: false, config: { stale: true } },
      warningPaths: ["plugins.entries.missing-plugin", "plugins.allow"],
    },
  ])(
    "handles $name for missing $pluginId in the allowlist",
    ({ pluginId, entry, warningPaths }) => {
      const plugins = { entries: { [pluginId]: entry }, allow: [pluginId] };
      const res = validateConfigObjectWithPlugins(
        {
          agents: { list: [{ id: "openclaw" }] },
          plugins,
        },
        {
          pluginMetadataSnapshot: {
            manifestRegistry: { plugins: [], diagnostics: [] },
          },
        },
      );

      expect(res.ok).toBe(true);
      expect(
        (res.warnings ?? [])
          .filter((warning) => warning.path.startsWith("plugins."))
          .map((warning) => warning.path),
      ).toEqual(warningPaths);
      if (res.ok) {
        expect(res.config.plugins).toMatchObject(plugins);
      }
    },
  );

  it("warns instead of failing for stale plugins.deny entries", () => {
    const res = validateInSuite({
      agents: { list: [{ id: "openclaw" }] },
      plugins: {
        entries: { "missing-deny": { enabled: false } },
        deny: ["missing-deny"],
      },
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.warnings).toContainEqual({
        path: "plugins.deny",
        message:
          "plugin not found: missing-deny (stale config entry ignored; remove it from plugins config)",
      });
    }
  });

  describe("missing Codex plugin diagnostics", () => {
    it("keeps the two-argument diagnostic API correct for a legacy list", () => {
      expect(
        shouldSuppressMissingCodexPluginDiagnostics(
          {
            agents: {
              list: [
                {
                  id: "10",
                  default: true,
                  model: "anthropic/claude-sonnet-4-6",
                },
                { id: "2", model: "openai/gpt-5.6" },
              ],
            },
            plugins: { entries: { codex: {} } },
          },
          suiteEnv(),
        ),
      ).toBe(false);
    });
  });

  it("keeps blocked official external memory slot plugins fatal", () => {
    const res = validateConfigObjectWithPlugins(
      {
        agents: { list: [{ id: "openclaw" }] },
        plugins: {
          slots: { memory: "memory-lancedb" },
          entries: { "memory-lancedb": { enabled: true } },
        },
      },
      {
        env: suiteEnv(),
        pluginMetadataSnapshot: {
          manifestRegistry: {
            plugins: [],
            diagnostics: [
              {
                level: "warn",
                pluginId: "memory-lancedb",
                message: "blocked plugin candidate: fixture safety block",
              },
            ],
          },
        },
      },
    );

    expect(res.ok).toBe(false);
    if (res.ok) {
      return;
    }
    expectPathMessageIncludes(
      res.issues,
      "plugins.slots.memory",
      "plugin present but blocked: memory-lancedb",
    );
    expectPathMessageIncludes(
      res.warnings,
      "plugins.entries.memory-lancedb",
      "plugin present but blocked: memory-lancedb",
    );
    expect(
      res.warnings?.some((warning) =>
        warning.message.includes("plugin not installed: memory-lancedb"),
      ),
    ).toBe(false);
  });

  it.runIf(process.platform !== "win32")(
    "reports configured blocked plugins without stale not-found wording",
    async () => {
      await fs.chmod(blockedPluginDir, 0o777);
      try {
        const res = validateInSuite({
          agents: { list: [{ id: "openclaw" }] },
          plugins: {
            enabled: true,
            load: { paths: [blockedPluginDir] },
            entries: { "blocked-plugin": { enabled: true } },
            allow: ["blocked-plugin"],
          },
        });

        expect(res.ok).toBe(true);
        if (!res.ok) {
          return;
        }
        expectPathMessageIncludes(
          res.warnings,
          "plugins.entries.blocked-plugin",
          "plugin present but blocked: blocked-plugin",
        );
        expectPathMessageIncludes(
          res.warnings,
          "plugins.allow",
          "plugin present but blocked: blocked-plugin",
        );
        expect(
          res.warnings.some(
            (warning) =>
              warning.message.includes("plugin not found: blocked-plugin") ||
              warning.message.includes("remove it from plugins config"),
          ),
        ).toBe(false);
      } finally {
        await chmodSafeDir(blockedPluginDir);
      }
    },
  );

  it("maps legacy blocked diagnostics without plugin ids to configured load paths", () => {
    const res = validateConfigObjectWithPlugins(
      {
        agents: { list: [{ id: "openclaw" }] },
        plugins: {
          enabled: true,
          load: { paths: [blockedPluginDir] },
          entries: { "blocked-plugin": { enabled: true } },
          allow: ["blocked-plugin"],
        },
      },
      {
        env: suiteEnv(),
        pluginMetadataSnapshot: {
          manifestRegistry: {
            plugins: [],
            diagnostics: [
              {
                level: "warn",
                source: path.join(blockedPluginDir, "index.js"),
                message: `blocked plugin candidate: world-writable path (${blockedPluginDir}, mode=0777)`,
              },
            ],
          },
        },
      },
    );

    expect(res.ok).toBe(true);
    if (!res.ok) {
      return;
    }
    expectPathMessageIncludes(
      res.warnings,
      "plugins.entries.blocked-plugin",
      "plugin present but blocked: blocked-plugin",
    );
    expectPathMessageIncludes(
      res.warnings,
      "plugins.allow",
      "plugin present but blocked: blocked-plugin",
    );
    expect(
      res.warnings.some((warning) => warning.message.includes("plugin not found: blocked-plugin")),
    ).toBe(false);
  });

  it("warns for broken discovered plugins that are not referenced by config", () => {
    const res = validateConfigObjectWithPlugins(
      {
        agents: { list: [{ id: "openclaw" }] },
        plugins: {
          allow: ["telegram"],
        },
      },
      {
        env: suiteEnv(),
        pluginMetadataSnapshot: {
          manifestRegistry: {
            plugins: [],
            diagnostics: [
              {
                level: "error",
                pluginId: "broken-local",
                source: path.join(suiteHome, "extensions", "broken-local", "openclaw.plugin.json"),
                message: "plugin manifest entry does not exist: dist/index.js",
              },
            ],
          },
        },
      },
    );

    expect(res.ok).toBe(true);
    if (!res.ok) {
      return;
    }
    expectPathMessage(
      res.warnings,
      "plugins",
      "plugin broken-local: plugin manifest entry does not exist: dist/index.js",
    );
    expectNoPath(res.warnings, "plugins.entries.broken-local");
  });

  it("keeps broken discovered plugins fatal when config references them", () => {
    const res = validateConfigObjectWithPlugins(
      {
        agents: { list: [{ id: "openclaw" }] },
        plugins: {
          entries: {
            "broken-local": { enabled: true },
          },
        },
      },
      {
        env: suiteEnv(),
        pluginMetadataSnapshot: {
          manifestRegistry: {
            plugins: [],
            diagnostics: [
              {
                level: "error",
                pluginId: "broken-local",
                source: path.join(suiteHome, "extensions", "broken-local", "openclaw.plugin.json"),
                message: "plugin manifest entry does not exist: dist/index.js",
              },
            ],
          },
        },
      },
    );

    expect(res.ok).toBe(false);
    if (res.ok) {
      return;
    }
    expectPathMessage(
      res.issues,
      "plugins.entries.broken-local",
      "plugin broken-local: plugin manifest entry does not exist: dist/index.js",
    );
  });

  it("does not source-match blocked diagnostics that already name a different plugin id", () => {
    const aliasDir = path.join(suiteHome, "alias-dir");
    const res = validateConfigObjectWithPlugins(
      {
        agents: { list: [{ id: "openclaw" }] },
        plugins: {
          enabled: true,
          load: { paths: [aliasDir] },
          entries: {
            "actual-id": { enabled: true },
            "alias-dir": { enabled: true },
          },
          allow: ["actual-id", "alias-dir"],
        },
      },
      {
        env: suiteEnv(),
        pluginMetadataSnapshot: {
          manifestRegistry: {
            plugins: [],
            diagnostics: [
              {
                level: "warn",
                pluginId: "actual-id",
                source: path.join(aliasDir, "index.js"),
                message: `blocked plugin candidate: world-writable path (${aliasDir}, mode=0777)`,
              },
            ],
          },
        },
      },
    );

    expect(res.ok).toBe(true);
    if (!res.ok) {
      return;
    }
    expectPathMessageIncludes(
      res.warnings,
      "plugins.entries.actual-id",
      "plugin present but blocked: actual-id",
    );
    expectPathMessageIncludes(
      res.warnings,
      "plugins.allow",
      "plugin present but blocked: actual-id",
    );
    const aliasMessage =
      "plugin not found: alias-dir (stale config entry ignored; remove it from plugins config)";
    expectPathMessage(res.warnings, "plugins.entries.alias-dir", aliasMessage);
    expectPathMessage(res.warnings, "plugins.allow", aliasMessage);
    expect(
      res.warnings.some((warning) =>
        warning.message.includes("plugin present but blocked: alias-dir"),
      ),
    ).toBe(false);
  });

  it("warns instead of failing for stale channel config backed by missing plugin refs", () => {
    const res = validateInSuite({
      agents: { list: [{ id: "openclaw" }] },
      channels: {
        "missing-chat": { token: "stale" },
      },
      plugins: {
        allow: ["missing-chat"],
        entries: { "missing-chat": { enabled: true } },
      },
    });

    expect(res.ok).toBe(true);
    if (!res.ok) {
      return;
    }
    expect(res.warnings).toContainEqual({
      path: "channels.missing-chat",
      message:
        "unknown channel id: missing-chat (stale channel plugin config ignored; run openclaw doctor --fix to remove stale config, or install the plugin)",
    });
    expect(res.warnings).toContainEqual({
      path: "plugins.allow",
      message:
        "plugin not found: missing-chat (stale config entry ignored; remove it from plugins config)",
    });
    expect(res.warnings).toContainEqual({
      path: "plugins.entries.missing-chat",
      message:
        "plugin not found: missing-chat (stale config entry ignored; remove it from plugins config)",
    });
  });

  it("keeps unknown channel typos fatal when there is no stale plugin evidence", () => {
    const res = validateInSuite({
      agents: { list: [{ id: "openclaw" }] },
      channels: {
        telegarm: { botToken: "typo" },
      },
      plugins: {
        allow: ["telegram"],
      },
    });

    expect(res.ok).toBe(false);
    if (res.ok) {
      return;
    }
    expect(res.issues.filter((issue) => issue.path === "channels.telegarm")).toEqual([
      {
        path: "channels.telegarm",
        message: "unknown channel id: telegarm",
      },
    ]);
    expectNoPath(res.warnings, "channels.telegarm");
  });

  it("warns when plugins.allow contains a channel id without a plugin manifest (#76872)", () => {
    const res = validateConfigObjectWithPlugins(
      {
        agents: { list: [{ id: "openclaw" }] },
        channels: {
          discord: { token: "xxx" },
        },
        plugins: {
          allow: ["discord"],
        },
      },
      {
        env: suiteEnv(),
        pluginMetadataSnapshot: {
          manifestRegistry: {
            plugins: [],
            diagnostics: [],
          },
        },
      },
    );

    expect(res.ok).toBe(true);
    expect(res.warnings ?? []).toEqual([
      {
        path: "plugins.allow",
        message:
          "plugin not found: discord (stale config entry ignored; remove it from plugins config)",
      },
    ]);
  });

  it("uses persisted installed-plugin records as stale channel evidence", async () => {
    const stateDir = path.join(suiteHome, ".openclaw");
    clearLoadInstalledPluginIndexInstallRecordsCache();
    await writePersistedInstalledPluginIndex(
      {
        version: 1,
        hostContractVersion: "test",
        compatRegistryVersion: "test",
        migrationVersion: 1,
        policyHash: "test",
        generatedAtMs: 1,
        installRecords: {
          "missing-sms": {
            source: "npm",
            spec: "missing-sms@1.0.0",
            installedAt: "2026-04-12T00:00:00.000Z",
          },
        },
        plugins: [],
        diagnostics: [],
      },
      { stateDir },
    );
    clearLoadInstalledPluginIndexInstallRecordsCache();
    try {
      const res = validateInSuite({
        agents: { list: [{ id: "openclaw" }] },
        channels: {
          "missing-sms": { token: "stale" },
        },
      });

      expect(res.ok).toBe(true);
      if (!res.ok) {
        return;
      }
      expect(res.warnings).toContainEqual({
        path: "channels.missing-sms",
        message:
          "unknown channel id: missing-sms (stale channel plugin config ignored; run openclaw doctor --fix to remove stale config, or install the plugin)",
      });
    } finally {
      await writePersistedInstalledPluginIndex(
        {
          version: 1,
          hostContractVersion: "test",
          compatRegistryVersion: "test",
          migrationVersion: 1,
          policyHash: "test",
          generatedAtMs: 2,
          installRecords: {},
          plugins: [],
          diagnostics: [],
        },
        { stateDir },
      );
      clearLoadInstalledPluginIndexInstallRecordsCache();
    }
  });

  it("warns with actionable guidance when a runtime command name is used in plugins.allow", () => {
    const res = validateInSuite({
      agents: { list: [{ id: "openclaw" }] },
      plugins: {
        allow: ["dreaming"],
        entries: {
          dreaming: { enabled: false },
          "memory-core": {
            config: { dreaming: { enabled: true } },
          },
        },
      },
    });
    // Should not produce the generic "plugin not found" warning.
    expect(
      res.warnings?.some(
        (w) => w.path === "plugins.allow" && w.message.includes("plugin not found: dreaming"),
      ),
    ).toBe(false);
    // Should produce a helpful redirect to the parent plugin.
    expect(
      res.warnings?.some(
        (w) =>
          w.path === "plugins.allow" &&
          w.message.includes('"dreaming" is not a plugin') &&
          w.message.includes("memory-core"),
      ),
    ).toBe(true);
  });

  it("does not fail validation for the implicit default memory slot when plugins config is explicit", () => {
    const res = validateConfigObjectWithPlugins(
      {
        agents: { list: [{ id: "openclaw" }] },
        plugins: {
          entries: { acpx: { enabled: true } },
        },
      },
      {
        env: {
          ...suiteEnv(),
          OPENCLAW_BUNDLED_PLUGINS_DIR: path.join(suiteHome, "missing-bundled-plugins"),
        },
      },
    );
    expect(res.ok).toBe(true);
  });

  it.each([true, false])("warns for removed legacy plugin ids with enabled=%s", (enabled) => {
    const removedId = "google-antigravity-auth";
    const res = validateRemovedPluginConfig(removedId, enabled);
    expectRemovedPluginWarnings(res, removedId, removedId);
  });

  it("warns for removed google gemini auth plugin ids instead of failing validation", () => {
    const removedId = "google-gemini-cli-auth";
    const res = validateRemovedPluginConfig(removedId);
    expectRemovedPluginWarnings(res, removedId, removedId);
  });

  it("warns for removed skill-workshop plugin id instead of failing validation", () => {
    const removedId = "skill-workshop";
    const res = validateRemovedPluginConfig(removedId);
    expect(res.ok).toBe(true);
    const message =
      "plugin removed: skill-workshop (stale plugin config ignored; Skill Workshop is built into OpenAgent skills now. Use skills.workshop settings and openclaw skills workshop commands, then remove this plugins config entry)";
    expectPathMessage(res.warnings, `plugins.entries.${removedId}`, message);
    expectPathMessage(res.warnings, "plugins.allow", message);
    expectPathMessage(res.warnings, "plugins.deny", message);
    expectPathMessage(res.warnings, "plugins.slots.memory", message);
  });

  it("does not auto-allow config-loaded overrides of bundled web search plugin ids", () => {
    const res = validateInSuite({
      plugins: {
        allow: ["imessage", "memory-core"],
        load: {
          paths: [googleOverridePluginDir],
        },
        entries: {
          google: {
            config: {
              apiKey: "test-google-key",
            },
          },
        },
      },
    });

    expect(res.ok).toBe(true);
    if (!res.ok) {
      return;
    }
    expect(res.warnings).toContainEqual({
      path: "plugins.entries.google",
      message: "plugin disabled (not in allowlist) but config is present",
    });
  });

  it("uses manifest defaults when warning about configured bundled plugins (#122746)", () => {
    const res = validateInSuite({
      plugins: {
        entries: {
          openai: { config: { personality: "friendly" } },
          "llm-task": { config: { maxTokens: 1024 } },
        },
      },
    });

    expect(res.ok).toBe(true);
    if (!res.ok) {
      return;
    }
    expectNoPath(res.warnings, "plugins.entries.openai");
    expectPathMessage(
      res.warnings,
      "plugins.entries.llm-task",
      "plugin disabled (bundled (disabled by default)) but config is present",
    );
  });

  it("ignores standalone helper scripts in auto-discovered global extensions", async () => {
    const helperPath = path.join(suiteHome, ".openclaw", "extensions", "my-helper.mjs");
    await mkdirSafe(path.dirname(helperPath));
    await fs.writeFile(helperPath, "export default {};\n", "utf-8");
    try {
      const res = validateInSuite({
        agents: { list: [{ id: "openclaw" }] },
        plugins: { enabled: true },
      });

      expect(res.ok).toBe(true);
    } finally {
      await fs.rm(helperPath, { force: true });
    }
  });

  it("discovers legacy-root workspace plugins before ownership materialization", async () => {
    const workspaceDir = path.join(fixtureRoot, "legacy-root-workspace");
    const pluginId = "legacy-root-channel";
    const channelId = "legacy-root";
    await writePluginFixture({
      dir: path.join(workspaceDir, ".openclaw", "extensions", pluginId),
      id: pluginId,
      channels: [channelId],
      schema: { type: "object" },
    });
    const env = suiteEnv();

    const res = validateConfigObjectWithPlugins(
      {
        agents: {
          defaults: { workspace: workspaceDir },
          entries: { ops: { default: true }, research: {} },
        },
        channels: { [channelId]: {} },
        plugins: { entries: { [pluginId]: { enabled: true } } },
      },
      {
        env,
        loadPluginMetadataSnapshot: (config) => ({
          manifestRegistry: resolveConfigWidePluginManifestRegistry({
            config,
            env,
            allowCurrent: false,
          }),
        }),
      },
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.config.bindings).toContainEqual({
        agentId: "ops",
        match: { channel: channelId, accountId: "*" },
      });
    }
  });

  it("surfaces plugin config diagnostics", () => {
    const res = validateInSuite({
      agents: { list: [{ id: "openclaw" }] },
      plugins: {
        enabled: true,
        load: { paths: [badPluginDir] },
        entries: { "bad-plugin": { config: { value: "nope" } } },
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      const hasIssue = res.issues.some(
        (issue) =>
          issue.path.startsWith("plugins.entries.bad-plugin.config") &&
          issue.message.includes("invalid config"),
      );
      expect(hasIssue).toBe(true);
    }
  });

  it("accepts dynamic Codex marketplaces and surfaces unsafe identifiers as diagnostics", () => {
    const config = {
      agents: { list: [{ id: "openclaw" }] },
      plugins: {
        entries: {
          codex: {
            enabled: true,
            config: {
              codexPlugins: {
                enabled: true,
                plugins: {
                  github: {
                    enabled: true,
                    marketplaceName: "openai-monorepo",
                    pluginName: "github",
                  },
                },
              },
            },
          },
        },
      },
    };
    const options = {
      env: {
        ...suiteEnv(),
        OPENCLAW_BUNDLED_PLUGINS_DIR: path.join(process.cwd(), "extensions"),
      },
    };

    expect(validateConfigObjectWithPlugins(config, options).ok).toBe(true);

    config.plugins.entries.codex.config.codexPlugins.plugins.github.marketplaceName =
      "../unsafe-marketplace";
    const res = validateConfigObjectWithPlugins(config, options);

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expectPathMessageIncludes(
        res.issues,
        "plugins.entries.codex.config.codexPlugins.plugins.github.marketplaceName",
        "invalid config",
      );
    }
  });

  it("admits the beta.2 Codex untrusted policy for doctor migration", () => {
    const res = validateConfigObjectWithPlugins(
      {
        agents: { list: [{ id: "openclaw" }] },
        plugins: {
          entries: {
            codex: {
              enabled: true,
              config: {
                appServer: {
                  mode: "guardian",
                  approvalPolicy: "untrusted",
                  sandbox: "workspace-write",
                  approvalsReviewer: "user",
                },
              },
            },
          },
        },
      },
      {
        env: {
          ...suiteEnv(),
          OPENCLAW_BUNDLED_PLUGINS_DIR: path.join(process.cwd(), "extensions"),
        },
      },
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.config.plugins?.entries?.codex?.config).toMatchObject({
        appServer: { approvalPolicy: "untrusted" },
      });
    }
  });

  it("accepts ask destructive policy without dropping adjacent Codex plugin config", () => {
    const res = validateConfigObjectWithPlugins(
      {
        agents: { list: [{ id: "openclaw" }] },
        plugins: {
          entries: {
            codex: {
              enabled: true,
              config: {
                codexDynamicToolsLoading: "direct",
                codexPlugins: {
                  enabled: true,
                  allow_destructive_actions: "ask",
                  plugins: {
                    github: {
                      enabled: false,
                      marketplaceName: "openai-curated",
                      pluginName: "github",
                      allow_destructive_actions: "auto",
                    },
                  },
                },
              },
            },
          },
        },
      },
      {
        env: {
          ...suiteEnv(),
          OPENCLAW_BUNDLED_PLUGINS_DIR: path.join(process.cwd(), "extensions"),
        },
      },
    );

    expect(res.ok).toBe(true);
  });

  it.each([
    {
      name: "global policy",
      expectedPath: "plugins.entries.codex.config.codexPlugins.allow_destructive_actions",
      codexPlugins: {
        enabled: true,
        allow_destructive_actions: "always",
        plugins: {},
      },
    },
    {
      name: "per-plugin policy",
      expectedPath:
        "plugins.entries.codex.config.codexPlugins.plugins.github.allow_destructive_actions",
      codexPlugins: {
        enabled: true,
        allow_destructive_actions: "ask",
        plugins: {
          github: {
            marketplaceName: "openai-curated",
            pluginName: "github",
            allow_destructive_actions: "always",
          },
        },
      },
    },
  ])("rejects old always destructive policy in the $name", ({ codexPlugins, expectedPath }) => {
    const res = validateConfigObjectWithPlugins(
      {
        agents: { list: [{ id: "openclaw" }] },
        plugins: {
          entries: {
            codex: {
              enabled: true,
              config: { codexPlugins },
            },
          },
        },
      },
      {
        env: {
          ...suiteEnv(),
          OPENCLAW_BUNDLED_PLUGINS_DIR: path.join(process.cwd(), "extensions"),
        },
      },
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expectPathMessageIncludes(res.issues, expectedPath, "invalid config");
    }
  });

  it("does not require native config schemas for enabled bundle plugins", () => {
    const res = validateInSuite({
      agents: { list: [{ id: "openclaw" }] },
      plugins: {
        enabled: true,
        load: { paths: [bundlePluginDir] },
        entries: { "bundle-fixture": { enabled: true } },
      },
    });

    expect(res.ok).toBe(true);
  });

  it("accepts enabled manifestless Claude bundles without a native schema", () => {
    const res = validateInSuite({
      agents: { list: [{ id: "openclaw" }] },
      plugins: {
        enabled: true,
        load: { paths: [manifestlessClaudeBundleDir] },
        entries: { "manifestless-claude-bundle": { enabled: true } },
      },
    });

    expect(res.ok).toBe(true);
  });

  it("surfaces allowed enum values for plugin config diagnostics", () => {
    const res = validateInSuite({
      agents: { list: [{ id: "openclaw" }] },
      plugins: {
        enabled: true,
        load: { paths: [enumPluginDir] },
        entries: { "enum-plugin": { config: { fileFormat: "txt" } } },
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      const issue = res.issues.find(
        (entry) => entry.path === "plugins.entries.enum-plugin.config.fileFormat",
      );
      expect(issue?.message).toContain('allowed: "markdown", "html"');
      expect(issue?.allowedValues).toEqual(["markdown", "html"]);
      expect(issue?.allowedValuesHiddenCount).toBe(0);
    }
  });

  it("accepts known plugin ids and valid channel/heartbeat enums", () => {
    const res = validateInSuite({
      agents: {
        defaults: { heartbeat: { target: "owner", directPolicy: "block" } },
        list: [{ id: "openclaw", heartbeat: { directPolicy: "allow" } }],
      },
      channels: {
        modelByChannel: {
          openai: {
            whatsapp: "openai/gpt-5.4",
          },
        },
      },
      plugins: { enabled: false, entries: { discord: { enabled: true } } },
    });
    expect(res.ok).toBe(true);
  });

  it("accepts plugin heartbeat targets", () => {
    const res = validateInSuite({
      agents: { defaults: { heartbeat: { target: "chat" } }, list: [{ id: "openclaw" }] },
      plugins: { enabled: false, load: { paths: [chatPluginDir] } },
    });
    expect(res.ok).toBe(true);
  });

  it("rejects unknown heartbeat targets", () => {
    const res = validateInSuite({
      agents: {
        defaults: { heartbeat: { target: "not-a-channel" } },
        list: [{ id: "openclaw" }],
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(
        res.issues.filter((issue) => issue.path === "agents.defaults.heartbeat.target"),
      ).toEqual([
        {
          path: "agents.defaults.heartbeat.target",
          message: "unknown heartbeat target: not-a-channel",
        },
      ]);
    }
  });

  it("rejects invalid heartbeat directPolicy values", () => {
    const res = validateInSuite({
      agents: {
        defaults: { heartbeat: { directPolicy: "maybe" } },
        list: [{ id: "openclaw" }],
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(
        res.issues.some((issue) => issue.path === "agents.defaults.heartbeat.directPolicy"),
      ).toBe(true);
    }
  });
});
/* oxlint-disable max-lines -- TODO: split this grandfathered oversized file. */
