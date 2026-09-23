/** Tests bundled plugin config secret collectors. */
import { describe, expect, it } from "vitest";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import type { OpenClawConfig } from "../config/config.js";
import { findBundledPluginMetadataById } from "../plugins/bundled-plugin-metadata.js";
import { resolvePluginConfigContractsById } from "../plugins/config-contracts.js";
import { collectPluginConfigAssignments } from "./runtime-config-collectors-plugins.js";
import { createResolverContext } from "./runtime-shared.js";

function envRef(id: string) {
  return { source: "env" as const, provider: "default", id };
}

const explicitMainRoster: NonNullable<OpenClawConfig["agents"]> = {
  list: [{ id: "main", default: true }],
};
const isolatedEnv: NodeJS.ProcessEnv = { OPENCLAW_STATE_DIR: process.env.OPENCLAW_TEST_HOME };

describe("collectPluginConfigAssignments bundled plugin manifests", () => {
  it("collects Codex app-server SecretRefs from bundled manifest contracts", () => {
    expect(
      findBundledPluginMetadataById("codex", {
        includeChannelConfigs: false,
        includeSyntheticChannelConfigs: false,
      })?.manifest.configContracts?.secretInputs?.paths,
    ).toEqual([
      { path: "appServer.authToken", expected: "string" },
      { path: "appServer.headers.*", expected: "string" },
    ]);
    const config = {
      agents: explicitMainRoster,
      plugins: {
        entries: {
          codex: {
            enabled: true,
            config: {
              appServer: {
                transport: "websocket",
                url: "wss://codex-app-server.example.internal/ws",
                authToken: "$CODEX_APP_SERVER_TOKEN",
                headers: {
                  Authorization: "Bearer literal-token",
                  "x-codex-client-session-token": envRef("CODEX_CLIENT_SESSION_TOKEN"),
                },
              },
            },
          },
        },
      },
    } as OpenClawConfig;
    expect(
      resolvePluginConfigContractsById({
        config,
        workspaceDir: resolveAgentWorkspaceDir(config, resolveDefaultAgentId(config)),
        env: isolatedEnv,
        fallbackToBundledMetadata: true,
        fallbackToBundledMetadataForResolvedBundled: true,
        pluginIds: ["codex"],
        fallbackBundledPluginIds: ["codex"],
      }).get("codex")?.configContracts.secretInputs?.paths,
    ).toEqual([
      { path: "appServer.authToken", expected: "string" },
      { path: "appServer.headers.*", expected: "string" },
    ]);
    const context = createResolverContext({
      sourceConfig: config,
      env: isolatedEnv,
    });

    collectPluginConfigAssignments({
      config,
      defaults: undefined,
      context,
      loadablePluginOrigins: new Map([["codex", "bundled"]]),
    });

    expect({
      assignments: context.assignments.map((assignment) => assignment.path).toSorted(),
      warnings: context.warnings,
    }).toEqual({
      assignments: [
        "plugins.entries.codex.config.appServer.authToken",
        "plugins.entries.codex.config.appServer.headers.x-codex-client-session-token",
      ],
      warnings: [],
    });

    context.assignments[0]?.apply("resolved-app-server-token");
    context.assignments[1]?.apply("resolved-session-token");
    expect(config.plugins?.entries?.codex?.config).toMatchObject({
      appServer: {
        authToken: "resolved-app-server-token",
        headers: {
          Authorization: "Bearer literal-token",
          "x-codex-client-session-token": "resolved-session-token",
        },
      },
    });
  });
});
