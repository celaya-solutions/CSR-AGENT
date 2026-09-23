/** Tests command-scoped secret resolution from active runtime snapshots. */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getRuntimeAuthProfileStoreCredentialsRevision,
  getRuntimeAuthProfileStoreSnapshotsRevision,
} from "../agents/auth-profiles/runtime-snapshots.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { resolveCommandSecretsFromActiveRuntimeSnapshot } from "./runtime-command-secrets.js";
import { createEmptyRuntimeWebToolsMetadata } from "./runtime-fast-path.js";
import { activateSecretsRuntimeSnapshotState } from "./runtime-state.js";
import { activateSecretsRuntimeSnapshot, clearSecretsRuntimeSnapshot } from "./runtime.js";
import { asConfig, setupSecretsRuntimeSnapshotTestHooks } from "./runtime.test-support.ts";

function activateMinimalSecretsRuntimeSnapshot(params: {
  config: OpenClawConfig;
  resolvedConfig?: OpenClawConfig;
  env: Record<string, string | undefined>;
}) {
  const snapshot = {
    sourceConfig: structuredClone(params.config),
    config: structuredClone(params.resolvedConfig ?? params.config),
    authStores: [],
    authStoreCredentialsRevision: getRuntimeAuthProfileStoreCredentialsRevision(),
    authStoreSnapshotsRevision: getRuntimeAuthProfileStoreSnapshotsRevision(),
    warnings: [],
    webTools: createEmptyRuntimeWebToolsMetadata(),
  };
  activateSecretsRuntimeSnapshotState({
    snapshot,
    refreshContext: {
      env: params.env,
      explicitAgentDirs: null,
      includeAuthStoreRefs: false,
      loadablePluginOrigins: new Map(),
    },
    refreshHandler: null,
  });
}

const { prepareSecretsRuntimeSnapshot } = setupSecretsRuntimeSnapshotTestHooks();

describe("runtime command secrets", () => {
  afterEach(() => {
    clearSecretsRuntimeSnapshot();
  });

  it("returns authoritative assignments from an incomplete runtime snapshot", async () => {
    const sourceConfig = asConfig({
      talk: {
        providers: {
          gateway: {
            apiKey: { source: "env", provider: "default", id: "GATEWAY_TALK_KEY" },
          },
          local: {
            apiKey: { source: "env", provider: "default", id: "LOCAL_TALK_KEY" },
          },
        },
      },
    });
    const resolvedConfig = structuredClone(sourceConfig);
    resolvedConfig.talk!.providers!.gateway!.apiKey = "gateway-owned-key";
    activateMinimalSecretsRuntimeSnapshot({
      config: sourceConfig,
      resolvedConfig,
      env: {},
    });

    const resolved = await resolveCommandSecretsFromActiveRuntimeSnapshot({
      commandName: "reply",
      targetIds: new Set(["talk.providers.*.apiKey"]),
    });

    expect(resolved.assignments).toEqual([
      {
        path: "talk.providers.gateway.apiKey",
        pathSegments: ["talk", "providers", "gateway", "apiKey"],
        value: "gateway-owned-key",
      },
    ]);
  });

  it.skipIf(process.platform === "win32")(
    "serves an exec SecretRef materialized during runtime preparation",
    async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-command-secret-exec-"));
      try {
        const resolverPath = path.join(root, "resolver.sh");
        await fs.writeFile(
          resolverPath,
          [
            "#!/bin/sh",
            "cat >/dev/null",
            'printf \'{"protocolVersion":1,"values":{"talk/key":"gateway-exec-key"}}\'',
          ].join("\n"),
          { mode: 0o700 },
        );
        const config = asConfig({
          secrets: {
            providers: {
              command: {
                source: "exec",
                command: resolverPath,
                jsonOnly: true,
              },
            },
          },
          talk: {
            providers: {
              acme: {
                apiKey: { source: "exec", provider: "command", id: "talk/key" },
              },
            },
          },
        });
        const snapshot = await prepareSecretsRuntimeSnapshot({
          config,
          agentDirs: [path.join(root, "agent")],
          loadAuthStore: () => ({ version: 1, profiles: {} }),
        });
        activateSecretsRuntimeSnapshot(snapshot);

        const resolved = await resolveCommandSecretsFromActiveRuntimeSnapshot({
          commandName: "reply",
          targetIds: new Set(["talk.providers.*.apiKey"]),
        });

        expect(resolved.assignments).toMatchObject([
          { path: "talk.providers.acme.apiKey", value: "gateway-exec-key" },
        ]);
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    },
  );
});
