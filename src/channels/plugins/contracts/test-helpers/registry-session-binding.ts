/**
 * Session binding contract registry fixtures.
 *
 * Builds bundled channel binding contract entries and hermetic plugin-state stores.
 */
import { expect } from "vitest";
import type { OpenClawConfig } from "../../../../config/config.js";
import {
  getSessionBindingService,
  type SessionBindingRecord,
} from "../../../../infra/outbound/session-binding-service.js";
import type { SessionBindingCapabilities } from "../../../../infra/outbound/session-binding.types.js";
import { setActivePluginRegistry } from "../../../../plugins/runtime.js";
import { loadBundledPluginFacade } from "../../../../test-utils/bundled-plugin-public-surface.js";
import { createTestRegistry } from "../../../../test-utils/channel-plugins.js";
import { getChannelPlugin } from "../../registry.js";
import type { ChannelPlugin } from "../../types.public.js";
import {
  sessionBindingContractChannelIds,
  type SessionBindingContractChannelId,
} from "./manifest.js";
import { importBundledChannelContractArtifact } from "./runtime-artifacts.js";

type SessionBindingContractEntry = {
  id: string;
  expectedCapabilities: SessionBindingCapabilities;
  getCapabilities: () => SessionBindingCapabilities | Promise<SessionBindingCapabilities>;
  bindAndResolve: () => Promise<SessionBindingRecord>;
  unbindAndVerify: (binding: SessionBindingRecord) => Promise<void>;
  cleanup: () => Promise<void> | void;
  preload?: () => Promise<void> | void;
  beforeEach?: () => Promise<void> | void;
};
const contractApiPromises = new Map<string, Promise<Record<string, unknown>>>();

async function createContractChannelConversationBindingManager(params: {
  channelId: Parameters<typeof getChannelPlugin>[0];
  cfg: OpenClawConfig;
  accountId?: string | null;
}): Promise<{ stop: () => void | Promise<void> } | null> {
  const createManager = getChannelPlugin(params.channelId)?.conversationBindings?.createManager;
  return createManager
    ? await createManager({ cfg: params.cfg, accountId: params.accountId })
    : null;
}

async function getContractApi<T extends Record<string, unknown>>(
  pluginId: string,
  artifact = "session-binding-contract-api",
): Promise<T> {
  const cacheKey = `${pluginId}:${artifact}`;
  const existing = contractApiPromises.get(cacheKey);
  if (existing) {
    return (await existing) as T;
  }
  const next = importBundledChannelContractArtifact<T>(pluginId, artifact);
  contractApiPromises.set(cacheKey, next);
  return await next;
}

function expectResolvedSessionBinding(params: {
  channel: string;
  accountId: string;
  conversationId: string;
  targetSessionKey: string;
}) {
  expect(
    getSessionBindingService().resolveByConversation({
      channel: params.channel,
      accountId: params.accountId,
      conversationId: params.conversationId,
    }),
  )?.toMatchObject({
    targetSessionKey: params.targetSessionKey,
  });
}

async function unbindAndExpectClearedSessionBinding(binding: SessionBindingRecord) {
  const service = getSessionBindingService();
  const removed = await service.unbind({
    bindingId: binding.bindingId,
    reason: "contract-test",
  });
  expect(removed.map((entry) => entry.bindingId)).toContain(binding.bindingId);
  expect(service.resolveByConversation(binding.conversation)).toBeNull();
}

function expectClearedSessionBinding(params: {
  channel: string;
  accountId: string;
  conversationId: string;
}) {
  expect(
    getSessionBindingService().resolveByConversation({
      channel: params.channel,
      accountId: params.accountId,
      conversationId: params.conversationId,
    }),
  ).toBeNull();
}

const baseSessionBindingCfg = {
  session: { mainKey: "main", scope: "per-sender" },
} satisfies OpenClawConfig;

type ChannelConversationBindingManagerFactory = NonNullable<
  NonNullable<ChannelPlugin["conversationBindings"]>["createManager"]
>;
type ChannelConversationBindingManager = Awaited<
  ReturnType<ChannelConversationBindingManagerFactory>
>;
let discordSessionBindingManager: ChannelConversationBindingManager | null = null;
let telegramSessionBindingManager: ChannelConversationBindingManager | null = null;

type DiscordContractApi = {
  discordPlugin: ChannelPlugin;
};

type TelegramContractApi = {
  telegramPlugin: ChannelPlugin;
};

async function getDiscordContractApi() {
  return await getContractApi<DiscordContractApi>("discord", "channel-plugin-api");
}

async function getTelegramContractApi() {
  return await loadBundledPluginFacade<TelegramContractApi>({
    pluginId: "telegram",
    artifactBasename: "channel-plugin-api.js",
  });
}

async function stopDiscordSessionBindingManager() {
  await discordSessionBindingManager?.stop();
  discordSessionBindingManager = null;
}

async function stopTelegramSessionBindingManager() {
  await telegramSessionBindingManager?.stop();
  telegramSessionBindingManager = null;
}

async function prepareDiscordSessionBindingContract() {
  await stopDiscordSessionBindingManager();
  const { discordPlugin } = await getDiscordContractApi();
  setActivePluginRegistry(
    createTestRegistry([
      {
        pluginId: "discord",
        plugin: discordPlugin,
        source: "test",
      },
    ]),
  );
}

async function prepareTelegramSessionBindingContract() {
  await stopTelegramSessionBindingManager();
  const { telegramPlugin } = await getTelegramContractApi();
  setActivePluginRegistry(
    createTestRegistry([
      {
        pluginId: "telegram",
        plugin: telegramPlugin,
        source: "test",
      },
    ]),
  );
}

type SessionBindingContractFixture = {
  id: SessionBindingContractChannelId;
  accountId: string;
  conversationId: string;
  targetSessionKey: string;
  targetKind: SessionBindingRecord["targetKind"];
  label: string;
  placements: SessionBindingCapabilities["placements"];
  preload: () => Promise<unknown>;
  beforeEach: () => Promise<void>;
  ensureManager: () => Promise<void>;
  stopManager?: () => Promise<void>;
};

function createSessionBindingContractEntry(
  fixture: SessionBindingContractFixture,
): Omit<SessionBindingContractEntry, "id"> {
  const conversation = {
    channel: fixture.id,
    accountId: fixture.accountId,
    conversationId: fixture.conversationId,
  };

  return {
    preload: async () => {
      await fixture.preload();
    },
    beforeEach: fixture.beforeEach,
    expectedCapabilities: {
      adapterAvailable: true,
      bindSupported: true,
      unbindSupported: true,
      placements: fixture.placements,
    },
    getCapabilities: async () => {
      await fixture.ensureManager();
      return getSessionBindingService().getCapabilities({
        channel: fixture.id,
        accountId: fixture.accountId,
      });
    },
    bindAndResolve: async () => {
      await fixture.ensureManager();
      const binding = await getSessionBindingService().bind({
        targetSessionKey: fixture.targetSessionKey,
        targetKind: fixture.targetKind,
        conversation,
        placement: "current",
        metadata: { agentId: fixture.id, label: fixture.label },
      });
      expectResolvedSessionBinding({
        ...conversation,
        targetSessionKey: fixture.targetSessionKey,
      });
      return binding;
    },
    unbindAndVerify: unbindAndExpectClearedSessionBinding,
    cleanup: async () => {
      await fixture.stopManager?.();
      expectClearedSessionBinding(conversation);
    },
  };
}

const sessionBindingContractEntries = {
  discord: createSessionBindingContractEntry({
    id: "discord",
    accountId: "default",
    conversationId: "channel:123456789012345678",
    targetSessionKey: "agent:discord:child:thread-1",
    targetKind: "subagent",
    label: "discord-child",
    placements: ["current", "child"],
    preload: getDiscordContractApi,
    beforeEach: prepareDiscordSessionBindingContract,
    ensureManager: async () => {
      discordSessionBindingManager ??= await createContractChannelConversationBindingManager({
        channelId: "discord",
        cfg: baseSessionBindingCfg,
        accountId: "default",
      });
      if (!discordSessionBindingManager) {
        throw new Error("Discord session binding manager is unavailable");
      }
    },
    stopManager: stopDiscordSessionBindingManager,
  }),
  telegram: createSessionBindingContractEntry({
    id: "telegram",
    accountId: "default",
    conversationId: "-100200300:topic:77",
    targetSessionKey: "agent:telegram:child:thread-1",
    targetKind: "subagent",
    label: "telegram-topic",
    placements: ["current", "child"],
    preload: getTelegramContractApi,
    beforeEach: prepareTelegramSessionBindingContract,
    ensureManager: async () => {
      telegramSessionBindingManager ??= await createContractChannelConversationBindingManager({
        channelId: "telegram",
        cfg: baseSessionBindingCfg,
        accountId: "default",
      });
      if (!telegramSessionBindingManager) {
        throw new Error("Telegram session binding manager is unavailable");
      }
    },
    stopManager: stopTelegramSessionBindingManager,
  }),
} satisfies Record<SessionBindingContractChannelId, Omit<SessionBindingContractEntry, "id">>;

let sessionBindingContractRegistryCache: SessionBindingContractEntry[] | undefined;

export function getSessionBindingContractRegistry(): SessionBindingContractEntry[] {
  sessionBindingContractRegistryCache ??= sessionBindingContractChannelIds.map((id) =>
    Object.assign({ id }, sessionBindingContractEntries[id]),
  );
  return sessionBindingContractRegistryCache;
}
