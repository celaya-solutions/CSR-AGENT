// Plugin SDK runtime API guardrail tests cover runtime API export safety and boundaries.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { contractPluginPath, getBundledPluginRoots } from "./test-helpers/bundled-plugin-roots.js";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function runtimeApiPluginFile(pluginId: string): string {
  return contractPluginPath({ rootDir: ROOT_DIR, pluginId, relativePath: "runtime-api.ts" });
}

const UNGUARDED_RUNTIME_API_PLUGIN_IDS = ["acpx", "browser", "memory-core", "ollama"] as const;

const RUNTIME_API_EXPORT_GUARDS: Record<string, readonly string[]> = {
  [contractPluginPath({ rootDir: ROOT_DIR, pluginId: "discord", relativePath: "runtime-api.ts" })]:
    [
      'export { handleDiscordAction } from "./src/actions/runtime.js";',
      'export { isDiscordModerationAction, readDiscordModerationCommand, requiredGuildPermissionForModerationAction, type DiscordModerationAction, type DiscordModerationCommand } from "./src/actions/runtime.moderation-shared.js";',
      'export { readDiscordChannelCreateParams, readDiscordChannelEditParams, readDiscordChannelMoveParams, readDiscordParentIdParam } from "./src/actions/runtime.shared.js";',
      'export { discordMessageActions } from "./src/channel-actions.js";',
      'export { auditDiscordChannelPermissions, collectDiscordAuditChannelIds } from "./src/audit.js";',
      'export { listDiscordDirectoryGroupsLive, listDiscordDirectoryPeersLive } from "./src/directory-live.js";',
      'export { fetchDiscordApplicationId, fetchDiscordApplicationSummary, parseApplicationIdFromToken, probeDiscord, resolveDiscordPrivilegedIntentsFromFlags, type DiscordApplicationSummary, type DiscordPrivilegedIntentsSummary, type DiscordPrivilegedIntentStatus, type DiscordProbe } from "./src/probe.js";',
      'export { resolveDiscordChannelAllowlist, type DiscordChannelResolution } from "./src/resolve-channels.js";',
      'export { resolveDiscordUserAllowlist, type DiscordUserResolution } from "./src/resolve-users.js";',
      'export { setDiscordRuntime } from "./src/runtime.js";',
      'export type { DiscordAllowList, DiscordChannelConfigResolved, DiscordGuildEntryResolved } from "./src/monitor/allow-list.js";',
      'export { allowListMatches, isDiscordGroupAllowedByPolicy, normalizeDiscordAllowList, normalizeDiscordSlug, resolveDiscordChannelConfig, resolveDiscordChannelConfigWithFallback, resolveDiscordCommandAuthorized, resolveDiscordGuildEntry, resolveDiscordShouldRequireMention, resolveGroupDmAllow, shouldEmitDiscordReactionNotification } from "./src/monitor/allow-list.js";',
      'export type { DiscordMessageEvent, DiscordMessageHandler } from "./src/monitor/listeners.js";',
      'export { registerDiscordListener } from "./src/monitor/listeners.js";',
      'export { createDiscordMessageHandler } from "./src/monitor/message-handler.js";',
      'export { createDiscordNativeCommand } from "./src/monitor/native-command.js";',
      'export type { MonitorDiscordOpts } from "./src/monitor/provider.js";',
      'export { monitorDiscordProvider } from "./src/monitor/provider.js";',
      'export { resolveDiscordReplyTarget, sanitizeDiscordThreadName } from "./src/monitor/threading.js";',
      'export { createDiscordGatewayPlugin, resolveDiscordGatewayIntents, waitForDiscordGatewayPluginRegistration } from "./src/monitor/gateway-plugin.js";',
      'export { clearGateways, getGateway, registerGateway, unregisterGateway } from "./src/monitor/gateway-registry.js";',
      'export { clearPresences, getPresence, presenceCacheSize, setPresence } from "./src/monitor/presence-cache.js";',
      'export { DISCORD_ATTACHMENT_IDLE_TIMEOUT_MS, DISCORD_ATTACHMENT_TOTAL_TIMEOUT_MS, DISCORD_DEFAULT_INBOUND_WORKER_TIMEOUT_MS, DISCORD_DEFAULT_LISTENER_TIMEOUT_MS, isAbortError, normalizeDiscordInboundWorkerTimeoutMs, normalizeDiscordListenerTimeoutMs, runDiscordTaskWithTimeout } from "./src/monitor/timeouts.js";',
      'export { resolveDiscordOutboundSessionRoute, type ResolveDiscordOutboundSessionRouteParams } from "./src/outbound-session-route.js";',
      'export { addRoleDiscord, banMemberDiscord, createChannelDiscord, createScheduledEventDiscord, createThreadDiscord, deleteChannelDiscord, deleteMessageDiscord, DiscordSendError, editChannelDiscord, editMessageDiscord, fetchChannelInfoDiscord, fetchChannelPermissionsDiscord, fetchMemberGuildPermissionsDiscord, fetchMemberInfoDiscord, fetchMessageDiscord, fetchReactionsDiscord, fetchRoleInfoDiscord, fetchVoiceStatusDiscord, hasAllGuildPermissionsDiscord, hasAnyGuildPermissionDiscord, kickMemberDiscord, listGuildChannelsDiscord, listGuildEmojisDiscord, listPinsDiscord, listScheduledEventsDiscord, listThreadsDiscord, moveChannelDiscord, pinMessageDiscord, reactMessageDiscord, readMessagesDiscord, removeChannelPermissionDiscord, removeOwnReactionsDiscord, removeReactionDiscord, removeRoleDiscord, resolveEventCoverImage, searchMessagesDiscord, sendMessageDiscord, sendPollDiscord, sendStickerDiscord, sendTypingDiscord, sendVoiceMessageDiscord, sendWebhookMessageDiscord, setChannelPermissionDiscord, timeoutMemberDiscord, unpinMessageDiscord, uploadEmojiDiscord, uploadStickerDiscord, type DiscordChannelCreate, type DiscordChannelEdit, type DiscordChannelMove, type DiscordChannelPermissionSet, type DiscordEmojiUpload, type DiscordMessageEdit, type DiscordMessageQuery, type DiscordModerationTarget, type DiscordPermissionsSummary, type DiscordReactionRuntimeContext, type DiscordReactionSummary, type DiscordReactionUser, type DiscordReactOpts, type DiscordRoleChange, type DiscordRuntimeAccountContext, type DiscordSearchQuery, type DiscordSendResult, type DiscordStickerUpload, type DiscordThreadCreate, type DiscordThreadList, type DiscordTimeoutTarget } from "./src/send.js";',
      'export { editDiscordComponentMessage, registerBuiltDiscordComponentMessage, sendDiscordComponentMessage } from "./src/send.components.js";',
      'export { autoBindSpawnedDiscordSubagent, createNoopThreadBindingManager, createThreadBindingManager, formatThreadBindingDurationLabel, getThreadBindingManager, listThreadBindingsBySessionKey, listThreadBindingsForAccount, reconcileAcpThreadBindingsOnStartup, resolveDiscordThreadBindingIdleTimeoutMs, resolveDiscordThreadBindingMaxAgeMs, resolveThreadBindingIdleTimeoutMs, resolveThreadBindingInactivityExpiresAt, resolveThreadBindingIntroText, resolveThreadBindingMaxAgeExpiresAt, resolveThreadBindingMaxAgeMs, resolveThreadBindingPersona, resolveThreadBindingPersonaFromRecord, resolveThreadBindingsEnabled, resolveThreadBindingThreadName, setThreadBindingIdleTimeoutBySessionKey, setThreadBindingMaxAgeBySessionKey, unbindThreadBindingsBySessionKey, type AcpThreadBindingReconciliationResult, type ThreadBindingManager, type ThreadBindingRecord, type ThreadBindingTargetKind } from "./src/monitor/thread-bindings.js";',
    ],
  [contractPluginPath({ rootDir: ROOT_DIR, pluginId: "telegram", relativePath: "runtime-api.ts" })]:
    [
      'export type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";',
      'export type { ChannelMessageActionAdapter } from "openclaw/plugin-sdk/channel-contract";',
      'export type { TelegramApiOverride } from "./src/send.js";',
      'export type { OpenClawPluginService, OpenClawPluginServiceContext, PluginLogger } from "openclaw/plugin-sdk/plugin-entry";',
      'export type { PluginRuntime } from "openclaw/plugin-sdk/runtime-store";',
      'export type { AcpRuntime, AcpRuntimeCapabilities, AcpRuntimeDoctorReport, AcpRuntimeEnsureInput, AcpRuntimeEvent, AcpRuntimeHandle, AcpRuntimeStatus, AcpRuntimeTurnInput, AcpRuntimeErrorCode, AcpSessionUpdateTag } from "openclaw/plugin-sdk/acp-runtime";',
      'export { AcpRuntimeError } from "openclaw/plugin-sdk/acp-runtime";',
      'export { emptyPluginConfigSchema, formatPairingApproveHint, getChatChannelMeta } from "openclaw/plugin-sdk/channel-plugin-common";',
      'export { clearAccountEntryFields } from "openclaw/plugin-sdk/channel-core";',
      'export { buildChannelConfigSchema, TelegramConfigSchema } from "./config-api.js";',
      'export { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk/account-id";',
      'export { PAIRING_APPROVED_MESSAGE, buildTokenChannelStatusSummary, projectCredentialSnapshotFields, resolveConfiguredFromCredentialStatuses } from "openclaw/plugin-sdk/channel-status";',
      'export { jsonResult, readNumberParam, readReactionParams, readStringArrayParam, readStringOrNumberParam, readStringParam, resolvePollMaxSelections } from "openclaw/plugin-sdk/channel-actions";',
      'export type { TelegramProbe } from "./src/probe.js";',
      'export { auditTelegramGroupMembership, collectTelegramUnmentionedGroupIds } from "./src/audit.js";',
      'export { resolveTelegramRuntimeGroupPolicy } from "./src/group-access.js";',
      'export { buildTelegramExecApprovalPendingPayload, shouldSuppressTelegramExecApprovalForwardingFallback } from "./src/exec-approval-forwarding.js";',
      'export { telegramMessageActions } from "./src/channel-actions.js";',
      'export { monitorTelegramProvider } from "./src/monitor.js";',
      'export { probeTelegram } from "./src/probe.js";',
      'export { resolveTelegramFetch, resolveTelegramTransport, shouldRetryTelegramTransportFallback } from "./src/fetch.js";',
      'export { makeProxyFetch } from "./src/proxy.js";',
      'export { createForumTopicTelegram, deleteMessageTelegram, editForumTopicTelegram, editMessageReplyMarkupTelegram, editMessageTelegram, pinMessageTelegram, reactMessageTelegram, renameForumTopicTelegram, sendMessageTelegram, sendPollTelegram, sendStickerTelegram, sendTypingTelegram, unpinMessageTelegram } from "./src/send.js";',
      'export { createTelegramThreadBindingManager, getTelegramThreadBindingManager, setTelegramThreadBindingIdleTimeoutBySessionKey, setTelegramThreadBindingMaxAgeBySessionKey } from "./src/thread-bindings.js";',
      'export { resolveTelegramToken } from "./src/token.js";',
      'export { setTelegramRuntime } from "./src/runtime.js";',
      'export type { ChannelPlugin } from "openclaw/plugin-sdk/channel-core";',
      'export type { OpenClawConfig } from "openclaw/plugin-sdk/config-contracts";',
      'export type TelegramAccountConfig = NonNullable< NonNullable<RuntimeOpenClawConfig["channels"]>["telegram"] >;',
      'export type TelegramActionConfig = NonNullable<TelegramAccountConfig["actions"]>;',
      'export type TelegramNetworkConfig = NonNullable<TelegramAccountConfig["network"]>;',
      'export { parseTelegramTopicConversation } from "./src/topic-conversation.js";',
      'export { resolveTelegramPollVisibility } from "./src/poll-visibility.js";',
    ],
} as const;

function collectRuntimeApiFiles(): string[] {
  return [...getBundledPluginRoots().entries()]
    .filter(([, rootDir]) => existsSync(resolve(rootDir, "runtime-api.ts")))
    .map(([pluginId]) =>
      contractPluginPath({
        rootDir: ROOT_DIR,
        pluginId,
        relativePath: "runtime-api.ts",
      }),
    );
}

function readExportStatements(path: string): string[] {
  const sourceText = readFileSync(resolve(ROOT_DIR, "..", path), "utf8");
  const sourceFile = ts.createSourceFile(path, sourceText, ts.ScriptTarget.Latest, true);

  return sourceFile.statements.flatMap((statement) => {
    if (!ts.isExportDeclaration(statement)) {
      const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
      if (!modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
        return [];
      }
      return [statement.getText(sourceFile).replaceAll(/\s+/g, " ").trim()];
    }

    const moduleSpecifier = statement.moduleSpecifier;
    if (!moduleSpecifier || !ts.isStringLiteral(moduleSpecifier)) {
      return [statement.getText(sourceFile).replaceAll(/\s+/g, " ").trim()];
    }

    if (!statement.exportClause) {
      const prefix = statement.isTypeOnly ? "export type *" : "export *";
      return [`${prefix} from ${moduleSpecifier.getText(sourceFile)};`];
    }

    if (!ts.isNamedExports(statement.exportClause)) {
      return [statement.getText(sourceFile).replaceAll(/\s+/g, " ").trim()];
    }

    const specifiers = statement.exportClause.elements.map((element) => {
      const imported = element.propertyName?.text;
      const exported = element.name.text;
      const alias = imported ? `${imported} as ${exported}` : exported;
      return element.isTypeOnly ? `type ${alias}` : alias;
    });
    const exportPrefix = statement.isTypeOnly ? "export type" : "export";
    return [
      `${exportPrefix} { ${specifiers.join(", ")} } from ${moduleSpecifier.getText(sourceFile)};`,
    ];
  });
}

describe("runtime api guardrails", () => {
  it("keeps runtime api surfaces classified and guarded exports pinned", () => {
    const runtimeApiFiles = collectRuntimeApiFiles();
    const expectedRuntimeApiFiles = [
      ...Object.keys(RUNTIME_API_EXPORT_GUARDS),
      ...UNGUARDED_RUNTIME_API_PLUGIN_IDS.map(runtimeApiPluginFile),
    ].toSorted();
    expect(runtimeApiFiles.toSorted()).toEqual(expectedRuntimeApiFiles);

    for (const file of Object.keys(RUNTIME_API_EXPORT_GUARDS).toSorted()) {
      expect(readExportStatements(file), `${file} runtime api exports changed`).toEqual(
        RUNTIME_API_EXPORT_GUARDS[file],
      );
    }
  });

  it("keeps bundled runtime api barrels off their own branded sdk facades", () => {
    for (const [pluginId, rootDir] of getBundledPluginRoots().entries()) {
      const path = resolve(rootDir, "runtime-api.ts");
      if (!existsSync(path)) {
        continue;
      }
      const source = readFileSync(path, "utf8");
      expect(
        source,
        `${pluginId} runtime api should use generic sdk subpaths or local exports`,
      ).not.toContain(`"openclaw/plugin-sdk/${pluginId}"`);
      expect(
        source,
        `${pluginId} runtime api should use generic sdk subpaths or local exports`,
      ).not.toContain(`'openclaw/plugin-sdk/${pluginId}'`);
    }
  });

  it("keeps QA runner discovery off runtime api barrels", () => {
    for (const [pluginId, rootDir] of getBundledPluginRoots().entries()) {
      const runtimeApiPath = resolve(rootDir, "runtime-api.ts");
      if (existsSync(runtimeApiPath)) {
        expect(
          readFileSync(runtimeApiPath, "utf8"),
          `${pluginId} runtime api must not own QA discovery`,
        ).not.toContain("qaRunnerCliRegistrations");
      }
    }
  });

  it("keeps the composed hook-runner registry internal", () => {
    const pluginRuntime = readFileSync(resolve(ROOT_DIR, "plugin-sdk/plugin-runtime.ts"), "utf8");
    const hookRunnerGlobal = readFileSync(
      resolve(ROOT_DIR, "plugins/hook-runner-global.ts"),
      "utf8",
    );
    const hookRegistryTypes = readFileSync(
      resolve(ROOT_DIR, "plugins/hook-registry.types.ts"),
      "utf8",
    );

    expect(pluginRuntime).toContain(
      'export { getGlobalHookRunner } from "../plugins/hook-runner-global.js";',
    );
    expect(hookRunnerGlobal).not.toContain("getGlobalHookRunnerRegistry");
    expect(hookRegistryTypes).not.toContain("trustedToolPolicies");
  });
});
