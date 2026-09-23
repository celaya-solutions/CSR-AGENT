/** Tests runtime isolation for manifest-owned plugin secrets. */
import fs from "node:fs/promises";
import path from "node:path";
import { assertPluginCapabilitySecretAvailable } from "openclaw/plugin-sdk/secret-input-runtime";
import { afterEach, describe, expect, it } from "vitest";
import { useAutoCleanupTempDirTracker } from "../../test/helpers/temp-dir.js";
import {
  activateSecretsRuntimeSnapshotState,
  clearSecretsRuntimeSnapshotState,
} from "./runtime-state.js";
import { asConfig, setupSecretsRuntimeSnapshotTestHooks } from "./runtime.test-support.js";

// A synthetic config-origin plugin declares a capability-owned SecretInput; no
// kept bundled plugin ships one, but the owner contract is public SDK surface.
const TOOL_PLUGIN_ID = "acme-tools";
const TOOL_PLUGIN_ORIGINS = new Map([[TOOL_PLUGIN_ID, "config" as const]]);
const TOOL_MANIFEST_REGISTRY = {
  plugins: [
    {
      id: TOOL_PLUGIN_ID,
      origin: "config",
      configContracts: {
        secretInputs: {
          paths: [{ path: "service.apiKey", expected: "string", ownerKind: "capability" }],
        },
      },
    },
  ],
} as unknown as NonNullable<
  Parameters<typeof prepareSecretsRuntimeSnapshot>[0]["manifestRegistry"]
>;
const TOOL_KEY_PATH = `plugins.entries.${TOOL_PLUGIN_ID}.config.service.apiKey`;
const TOOL_KEY_REF = {
  source: "exec",
  provider: "tool-vault",
  id: "tool/api-key",
} as const;
const { prepareSecretsRuntimeSnapshot } = setupSecretsRuntimeSnapshotTestHooks();
const tempDirs = useAutoCleanupTempDirTracker(afterEach);

afterEach(() => {
  clearSecretsRuntimeSnapshotState();
});

function toolSecretConfig(commandPath: string) {
  return asConfig({
    agents: { list: [{ id: "main", default: true }] },
    plugins: {
      entries: {
        [TOOL_PLUGIN_ID]: {
          enabled: true,
          config: { service: { apiKey: TOOL_KEY_REF } },
        },
      },
    },
    secrets: {
      providers: {
        "tool-vault": {
          source: "exec",
          command: commandPath,
          passEnv: ["PATH"],
          timeoutMs: 20_000,
          noOutputTimeoutMs: 20_000,
        },
      },
    },
  });
}

async function writeToolExecProvider(commandPath: string, available: boolean): Promise<void> {
  const script = available
    ? [
        "#!/bin/sh",
        "cat >/dev/null",
        `printf '%s' '${JSON.stringify({
          protocolVersion: 1,
          values: { [TOOL_KEY_REF.id]: "resolved-tool-key" },
        })}'`,
      ].join("\n")
    : "#!/bin/sh\nexit 1\n";
  await fs.writeFile(commandPath, script, { encoding: "utf8", mode: 0o700 });
}

function expectToolCold(snapshot: Awaited<ReturnType<typeof prepareSecretsRuntimeSnapshot>>): void {
  expect(snapshot.config.plugins?.entries?.[TOOL_PLUGIN_ID]?.config).toMatchObject({
    service: { apiKey: TOOL_KEY_REF },
  });
  expect(snapshot.degradedOwners).toMatchObject([
    {
      ownerKind: "capability",
      ownerId: TOOL_KEY_PATH,
      degradationState: "cold",
    },
  ]);
}

function expectToolUnavailable(): void {
  expect(() => assertPluginCapabilitySecretAvailable(TOOL_KEY_PATH)).toThrow(
    expect.objectContaining({
      name: "SecretSurfaceUnavailableError",
      ownerKind: "capability",
      ownerId: TOOL_KEY_PATH,
    }),
  );
}

describe("plugin secret owners", () => {
  it("isolates capability-owned plugin tools when their exec provider fails at cold start", async () => {
    if (process.platform === "win32") {
      return;
    }
    const root = tempDirs.make("openclaw-tool-secret-cold-");
    const commandPath = path.join(root, "provider.sh");
    await writeToolExecProvider(commandPath, false);

    const snapshot = await prepareSecretsRuntimeSnapshot({
      config: toolSecretConfig(commandPath),
      env: { PATH: process.env.PATH ?? "" },
      includeAuthStoreRefs: false,
      allowUnavailableSecretOwners: true,
      loadablePluginOrigins: TOOL_PLUGIN_ORIGINS,
      manifestRegistry: TOOL_MANIFEST_REGISTRY,
    });

    expectToolCold(snapshot);
    activateSecretsRuntimeSnapshotState({
      snapshot,
      refreshContext: null,
      refreshHandler: null,
    });
    expectToolUnavailable();
  });

  it("does not retain a stale capability key when its exec provider fails on reload", async () => {
    if (process.platform === "win32") {
      return;
    }
    const root = tempDirs.make("openclaw-tool-secret-reload-");
    const commandPath = path.join(root, "provider.sh");
    const config = toolSecretConfig(commandPath);
    const env = { PATH: process.env.PATH ?? "" };
    await writeToolExecProvider(commandPath, true);
    const active = await prepareSecretsRuntimeSnapshot({
      config,
      env,
      includeAuthStoreRefs: false,
      loadablePluginOrigins: TOOL_PLUGIN_ORIGINS,
      manifestRegistry: TOOL_MANIFEST_REGISTRY,
    });
    activateSecretsRuntimeSnapshotState({
      snapshot: active,
      refreshContext: null,
      refreshHandler: null,
    });
    expect(active.config.plugins?.entries?.[TOOL_PLUGIN_ID]?.config).toMatchObject({
      service: { apiKey: "resolved-tool-key" },
    });

    await writeToolExecProvider(commandPath, false);
    const candidate = await prepareSecretsRuntimeSnapshot({
      config,
      env,
      includeAuthStoreRefs: false,
      allowUnavailableSecretOwners: true,
      loadablePluginOrigins: TOOL_PLUGIN_ORIGINS,
      manifestRegistry: TOOL_MANIFEST_REGISTRY,
    });

    expectToolCold(candidate);
    activateSecretsRuntimeSnapshotState({
      snapshot: candidate,
      refreshContext: null,
      refreshHandler: null,
    });
    expectToolUnavailable();
  });
});
