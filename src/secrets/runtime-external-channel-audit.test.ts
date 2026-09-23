/** Tests runtime secret auditing for externalized channel plugin surfaces. */
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import type { PluginManifestRecord } from "../plugins/manifest-registry.js";
import { createPluginMetadataSnapshotFixture } from "../plugins/plugin-metadata.test-support.js";
import type { PluginOrigin } from "../plugins/plugin-origin.types.js";
import { getPath } from "./path-utils.js";
import {
  assertSecretOwnerAvailable,
  isTrustedSecretSurfaceUnavailableError,
} from "./runtime-degraded-state.js";
import { activateSecretsRuntimeSnapshot } from "./runtime.js";

const {
  getBootstrapChannelSecretsMock,
  loadBundledPublicArtifactMock,
  loadPluginMetadataSnapshotMock,
} = vi.hoisted(() => ({
  getBootstrapChannelSecretsMock: vi.fn(),
  loadBundledPublicArtifactMock: vi.fn(),
  loadPluginMetadataSnapshotMock: vi.fn(),
}));

vi.mock("../plugins/plugin-metadata-snapshot.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../plugins/plugin-metadata-snapshot.js")>()),
  loadPluginMetadataSnapshot: (params: unknown) =>
    createPluginMetadataSnapshotFixture(loadPluginMetadataSnapshotMock(params)),
  resolvePluginMetadataSnapshot: (params: unknown) => {
    const snapshot = loadPluginMetadataSnapshotMock(params) as { plugins: PluginManifestRecord[] };
    return createPluginMetadataSnapshotFixture({ plugins: snapshot.plugins });
  },
  listPluginOriginsFromMetadataSnapshot: (snapshot: {
    plugins: Array<{ id: string; origin: PluginOrigin }>;
  }) => new Map(snapshot.plugins.map((record) => [record.id, record.origin])),
}));

vi.mock("../plugins/public-surface-loader.js", () => ({
  loadBundledPluginPublicArtifactModuleFromCandidatesSync: loadBundledPublicArtifactMock,
}));

vi.mock("../channels/plugins/bootstrap-registry.js", () => ({
  getBootstrapChannelSecrets: getBootstrapChannelSecretsMock,
}));

import {
  asConfig,
  loadAuthStoreWithProfiles,
  setupSecretsRuntimeSnapshotTestHooks,
} from "./runtime.test-support.ts";

const { prepareSecretsRuntimeSnapshot } = setupSecretsRuntimeSnapshotTestHooks();

const EXTERNALIZED_CHANNEL_IDS = ["discord", "googlechat"] as const;

type ExternalizedChannelId = (typeof EXTERNALIZED_CHANNEL_IDS)[number];

function ref(id: string) {
  return { source: "env", provider: "default", id };
}

function inactiveExecRef(id: string) {
  return { source: "exec", provider: "vault", id };
}

function createExternalChannelRecord(id: ExternalizedChannelId): PluginManifestRecord {
  const rootDir = path.resolve("extensions", id);
  return {
    id,
    channels: [id],
    providers: [],
    cliBackends: [],
    skills: [],
    hooks: [],
    origin: "global",
    rootDir,
    source: path.join(rootDir, "index.js"),
    manifestPath: path.join(rootDir, "openclaw.plugin.json"),
  };
}

function configureExternalChannelRecords(
  channelIds: readonly ExternalizedChannelId[] = EXTERNALIZED_CHANNEL_IDS,
): PluginManifestRecord[] {
  const records = channelIds.map((id) => createExternalChannelRecord(id));
  loadPluginMetadataSnapshotMock.mockReturnValue({ plugins: records });
  return records;
}

function externalChannelOrigins(records: readonly PluginManifestRecord[]) {
  return new Map(records.map((record) => [record.id, record.origin] as const));
}

function mockBundledPublicArtifactMiss() {
  loadBundledPublicArtifactMock.mockImplementation(
    (params: { dirName: string; artifactCandidates: string[] }) => {
      if (
        params.dirName === "googlechat" &&
        params.artifactCandidates[0] === "secret-contract-api.js"
      ) {
        return createGoogleChatSecretContractApi();
      }
      return null;
    },
  );
}

function createGoogleChatSecretContractApi() {
  const secretTargetRegistryEntries = [
    {
      id: "channels.googlechat.accounts.*.serviceAccount",
      targetType: "channels.googlechat.serviceAccount",
      targetTypeAliases: ["channels.googlechat.accounts.*.serviceAccount"],
      configFile: "openclaw.json",
      pathPattern: "channels.googlechat.accounts.*.serviceAccount",
      secretShape: "secret_input",
      expectedResolvedValue: "string-or-object",
      includeInPlan: true,
      includeInConfigure: true,
      includeInAudit: true,
      accountIdPathSegmentIndex: 3,
    },
    {
      id: "channels.googlechat.serviceAccount",
      targetType: "channels.googlechat.serviceAccount",
      configFile: "openclaw.json",
      pathPattern: "channels.googlechat.serviceAccount",
      secretShape: "secret_input",
      expectedResolvedValue: "string-or-object",
      includeInPlan: true,
      includeInConfigure: true,
      includeInAudit: true,
    },
  ];
  const collectRuntimeConfigAssignments = (params: {
    config: { channels?: { googlechat?: Record<string, unknown> } };
    context: {
      assignments: Array<{
        ref: unknown;
        path: string;
        expected: "string-or-object";
        apply: (value: unknown) => void;
      }>;
      warnings: Array<{ code: string; path: string; message: string }>;
    };
  }) => {
    const googlechat = params.config.channels?.googlechat;
    if (!googlechat) {
      return;
    }
    const collect = (target: Record<string, unknown>, pathKey: string, active: boolean) => {
      const refValue = target.serviceAccount;
      if (!refValue) {
        return;
      }
      const pathLocal = `${pathKey}.serviceAccount`;
      if (!active) {
        params.context.warnings.push({
          code: "SECRETS_REF_IGNORED_INACTIVE_SURFACE",
          path: pathLocal,
          message: `${pathLocal}: Google Chat account is disabled.`,
        });
        return;
      }
      params.context.assignments.push({
        ref: refValue,
        path: pathLocal,
        expected: "string-or-object",
        apply: (value) => {
          target.serviceAccount = value;
        },
      });
    };

    collect(googlechat, "channels.googlechat", googlechat.enabled !== false);
    const accounts = googlechat.accounts as Record<string, Record<string, unknown>> | undefined;
    for (const [accountId, account] of Object.entries(accounts ?? {})) {
      collect(account, `channels.googlechat.accounts.${accountId}`, account.enabled !== false);
    }
  };
  return {
    channelSecrets: {
      secretTargetRegistryEntries,
      collectRuntimeConfigAssignments,
    },
    secretTargetRegistryEntries,
    collectRuntimeConfigAssignments,
  };
}

function expectMetadataBackedContractsWereUsed(
  channelIds: readonly ExternalizedChannelId[] = EXTERNALIZED_CHANNEL_IDS,
) {
  expect(getBootstrapChannelSecretsMock).not.toHaveBeenCalled();
  if (channelIds.some((channelId) => channelId !== "googlechat")) {
    expect(loadPluginMetadataSnapshotMock).toHaveBeenCalled();
  }
  for (const channelId of channelIds) {
    expect(loadBundledPublicArtifactMock).toHaveBeenCalledWith({
      dirName: channelId,
      artifactCandidates: ["secret-contract-api.js"],
    });
    expect(loadBundledPublicArtifactMock).not.toHaveBeenCalledWith({
      dirName: channelId,
      artifactCandidates: ["contract-api.js"],
    });
  }
}

function expectResolvedPaths(config: OpenClawConfig, expected: Record<string, unknown>) {
  for (const [pathKey, expectedValue] of Object.entries(expected)) {
    expect(getPath(config, pathKey.split(".")), pathKey).toBe(expectedValue);
  }
}

describe("secrets runtime externalized channel SecretRef audit", () => {
  beforeEach(() => {
    getBootstrapChannelSecretsMock.mockReset();
    getBootstrapChannelSecretsMock.mockReturnValue(undefined);
    loadBundledPublicArtifactMock.mockReset();
    mockBundledPublicArtifactMiss();
    loadPluginMetadataSnapshotMock.mockReset();
  });

  it.each(EXTERNALIZED_CHANNEL_IDS)(
    "resolves active SecretRef targets for %s contract",
    async (channelId) => {
      const records = configureExternalChannelRecords([channelId]);
      const config = asConfig({
        channels: {
          discord: {
            token: ref("DISCORD_TOKEN"),
            pluralkit: {
              enabled: true,
              token: ref("DISCORD_PLURALKIT_TOKEN"),
            },
            voice: {
              enabled: true,
              realtime: {
                providers: {
                  openai: { apiKey: ref("DISCORD_VOICE_REALTIME_API_KEY") },
                },
              },
              tts: {
                providers: {
                  openai: { apiKey: ref("DISCORD_VOICE_TTS_API_KEY") },
                },
              },
            },
            accounts: {
              inherited: {
                enabled: true,
              },
              work: {
                enabled: true,
                token: ref("DISCORD_WORK_TOKEN"),
                pluralkit: {
                  enabled: true,
                  token: ref("DISCORD_WORK_PLURALKIT_TOKEN"),
                },
                voice: {
                  enabled: true,
                  realtime: {
                    providers: {
                      openai: { apiKey: ref("DISCORD_WORK_VOICE_REALTIME_API_KEY") },
                    },
                  },
                  tts: {
                    providers: {
                      openai: { apiKey: ref("DISCORD_WORK_VOICE_TTS_API_KEY") },
                    },
                  },
                },
              },
            },
          },
          googlechat: {
            serviceAccount: ref("GOOGLECHAT_SERVICE_ACCOUNT"),
            accounts: {
              inherited: {
                enabled: true,
              },
              work: {
                enabled: true,
                serviceAccount: ref("GOOGLECHAT_WORK_SERVICE_ACCOUNT"),
              },
            },
          },
        },
      });
      const channels = (config as { channels: Record<string, unknown> }).channels;
      (config as { channels: Record<string, unknown> }).channels = {
        [channelId]: channels[channelId],
      };

      const snapshot = await prepareSecretsRuntimeSnapshot({
        config,
        env: {
          DISCORD_TOKEN: "discord-token",
          DISCORD_PLURALKIT_TOKEN: "discord-pluralkit-token",
          DISCORD_VOICE_REALTIME_API_KEY: "discord-voice-realtime-api-key",
          DISCORD_VOICE_TTS_API_KEY: "discord-voice-tts-api-key",
          DISCORD_WORK_TOKEN: "discord-work-token",
          DISCORD_WORK_PLURALKIT_TOKEN: "discord-work-pluralkit-token",
          DISCORD_WORK_VOICE_REALTIME_API_KEY: "discord-work-voice-realtime-api-key",
          DISCORD_WORK_VOICE_TTS_API_KEY: "discord-work-voice-tts-api-key",
          GOOGLECHAT_SERVICE_ACCOUNT: "googlechat-service-account",
          GOOGLECHAT_WORK_SERVICE_ACCOUNT: "googlechat-work-service-account",
        },
        includeAuthStoreRefs: false,
        loadablePluginOrigins: externalChannelOrigins(records),
      });

      const expectedPaths = {
        "channels.discord.token": "discord-token",
        "channels.discord.pluralkit.token": "discord-pluralkit-token",
        "channels.discord.voice.realtime.providers.openai.apiKey": "discord-voice-realtime-api-key",
        "channels.discord.voice.tts.providers.openai.apiKey": "discord-voice-tts-api-key",
        "channels.discord.accounts.work.token": "discord-work-token",
        "channels.discord.accounts.work.pluralkit.token": "discord-work-pluralkit-token",
        "channels.discord.accounts.work.voice.realtime.providers.openai.apiKey":
          "discord-work-voice-realtime-api-key",
        "channels.discord.accounts.work.voice.tts.providers.openai.apiKey":
          "discord-work-voice-tts-api-key",
        "channels.googlechat.serviceAccount": "googlechat-service-account",
        "channels.googlechat.accounts.work.serviceAccount": "googlechat-work-service-account",
      };
      expectResolvedPaths(
        snapshot.config,
        Object.fromEntries(
          Object.entries(expectedPaths).filter(([pathKey]) =>
            pathKey.startsWith(`channels.${channelId}.`),
          ),
        ),
      );
      expect(snapshot.warnings).toStrictEqual([]);
      expectMetadataBackedContractsWereUsed([channelId]);
    },
  );

  it("skips inactive exec-backed SecretRefs for every externalized channel contract", async () => {
    const records = configureExternalChannelRecords();
    const config = asConfig({
      channels: {
        discord: {
          enabled: false,
          token: inactiveExecRef("DISCORD_DISABLED_TOKEN"),
          pluralkit: {
            enabled: true,
            token: inactiveExecRef("DISCORD_DISABLED_PLURALKIT_TOKEN"),
          },
          voice: {
            enabled: true,
            tts: {
              providers: {
                openai: {
                  apiKey: inactiveExecRef("DISCORD_DISABLED_VOICE_TTS_API_KEY"),
                },
              },
            },
          },
          accounts: {
            disabled: {
              enabled: false,
              token: inactiveExecRef("DISCORD_DISABLED_ACCOUNT_TOKEN"),
              pluralkit: {
                enabled: true,
                token: inactiveExecRef("DISCORD_DISABLED_ACCOUNT_PLURALKIT_TOKEN"),
              },
              voice: {
                enabled: true,
                tts: {
                  providers: {
                    openai: {
                      apiKey: inactiveExecRef("DISCORD_DISABLED_ACCOUNT_VOICE_TTS_API_KEY"),
                    },
                  },
                },
              },
            },
          },
        },
        googlechat: {
          enabled: false,
          serviceAccount: inactiveExecRef("GOOGLECHAT_DISABLED_SERVICE_ACCOUNT"),
          accounts: {
            disabled: {
              enabled: false,
              serviceAccount: inactiveExecRef("GOOGLECHAT_DISABLED_ACCOUNT_SERVICE_ACCOUNT"),
            },
          },
        },
      },
    });

    const snapshot = await prepareSecretsRuntimeSnapshot({
      config,
      env: {},
      agentDirs: ["/tmp/openclaw-agent-main"],
      loadAuthStore: () => loadAuthStoreWithProfiles({}),
      loadablePluginOrigins: externalChannelOrigins(records),
    });

    expect(getPath(snapshot.config, ["channels", "discord", "token"])).toEqual(
      inactiveExecRef("DISCORD_DISABLED_TOKEN"),
    );
    expect(
      getPath(snapshot.config, [
        "channels",
        "googlechat",
        "accounts",
        "disabled",
        "serviceAccount",
      ]),
    ).toEqual(inactiveExecRef("GOOGLECHAT_DISABLED_ACCOUNT_SERVICE_ACCOUNT"));
    expect(snapshot.warnings.map((warning) => warning.path)).toStrictEqual([
      "channels.discord.token",
      "channels.discord.accounts.disabled.token",
      "channels.discord.pluralkit.token",
      "channels.discord.accounts.disabled.pluralkit.token",
      "channels.discord.voice.tts.providers.openai.apiKey",
      "channels.discord.accounts.disabled.voice.tts.providers.openai.apiKey",
      "channels.googlechat.serviceAccount",
      "channels.googlechat.accounts.disabled.serviceAccount",
    ]);
    expectMetadataBackedContractsWereUsed();
  });

  it("publishes an unavailable Discord realtime provider owner as a typed redacted error", async () => {
    const records = configureExternalChannelRecords(["discord"]);
    const snapshot = await prepareSecretsRuntimeSnapshot({
      config: asConfig({
        channels: {
          discord: {
            accounts: {
              work: {
                enabled: true,
                voice: {
                  enabled: true,
                  mode: "agent-proxy",
                  realtime: {
                    provider: "grok-voice",
                    providers: {
                      xai: { apiKey: ref("MISSING_XAI_REALTIME_API_KEY") },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      env: {},
      includeAuthStoreRefs: false,
      allowUnavailableSecretOwners: true,
      loadablePluginOrigins: externalChannelOrigins(records),
    });

    expect(snapshot.degradedOwners).toMatchObject([
      {
        ownerKind: "capability",
        ownerId: "discord:voice:realtime:work:xai",
        reason: "secret reference was not found",
      },
    ]);
    activateSecretsRuntimeSnapshot(snapshot);

    let failure: unknown;
    try {
      assertSecretOwnerAvailable("capability", "discord:voice:realtime:work:xai");
    } catch (error) {
      failure = error;
    }
    expect(isTrustedSecretSurfaceUnavailableError(failure)).toBe(true);
    expect(failure).toMatchObject({
      code: "SECRET_SURFACE_UNAVAILABLE",
      ownerKind: "capability",
      ownerId: "discord:voice:realtime:work:xai",
      paths: ["channels.discord.accounts.work.voice.realtime.providers.xai.apiKey"],
    });
    expect(String(failure)).not.toContain("MISSING_XAI_REALTIME_API_KEY");
    expectMetadataBackedContractsWereUsed(["discord"]);
  });
});
