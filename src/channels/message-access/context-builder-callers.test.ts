import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CALLERS = [
  ["extensions/discord/src/monitor/message-handler.context.ts", "channelIngress,"],
  ["extensions/telegram/src/bot-message-context.session.ts", "channelIngress,"],
  ["src/channels/direct-dm.ts", "channelIngress: params.channelIngress"],
  ["src/channels/feedback-reflection.ts", 'channelIngress: "unsupported"'],
] as const;

const CONTEXT_BINDING_PRODUCERS = [
  "extensions/discord/src/monitor/message-handler.preflight.ts",
  "extensions/telegram/src/bot-handlers.inbound-authorization.ts",
] as const;

const HOST_BUILDERS = [
  [
    "extensions/discord/src/monitor/message-handler.context.ts",
    "ctx.buildContext ?? buildChannelInboundEventContext",
  ],
  [
    "extensions/telegram/src/bot-message-context.session.ts",
    "sessionRuntime.buildChannelInboundEventContext",
  ],
  [
    "src/channels/direct-dm.ts",
    "const injectedBuilder = params.channelRuntime?.inbound?.buildContext",
  ],
  ["src/channels/feedback-reflection.ts", "buildHostChannelInboundEventContext"],
] as const;

const LATE_GLOBAL_BUILDERS = [
  [
    "extensions/discord/src/monitor/message-handler.context.ts",
    "getDiscordRuntime().channel.inbound.buildContext",
  ],
  [
    "extensions/telegram/src/bot-deps.ts",
    "getTelegramRuntime().channel.inbound\n      .buildContext",
  ],
] as const;

const SCOPED_BUILDER_HANDOFFS = [
  [
    "discord",
    "extensions/discord/src/monitor/provider.ts",
    "buildContext: pluginChannelRuntime?.inbound.buildContext",
  ],
  [
    "telegram-webhook",
    "extensions/telegram/src/monitor.ts",
    "buildContext: pluginChannelRuntime?.inbound.buildContext",
  ],
  ["telegram-webhook", "extensions/telegram/src/webhook.ts", "buildContext: opts.buildContext"],
  [
    "telegram-polling",
    "extensions/telegram/src/polling-session.ts",
    "buildContext: this.opts.buildContext",
  ],
  ["telegram", "extensions/telegram/src/bot-core.ts", "buildContext: opts.buildContext"],
  [
    "telegram",
    "extensions/telegram/src/bot-message.ts",
    "buildContext ?? telegramDeps.buildChannelInboundEventContext",
  ],
] as const;

function source(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("channel context builder caller inventory", () => {
  it("keeps all production sinks wired to exact ingress or named unsupported paths", () => {
    for (const [relativePath, marker] of CALLERS) {
      expect(source(relativePath), relativePath).toContain(marker);
    }
  });

  it("binds all supported producers to finalized host context identity", () => {
    for (const relativePath of CONTEXT_BINDING_PRODUCERS) {
      expect(source(relativePath), relativePath).toContain("contextBinding");
    }
  });

  it("routes every production sink through its selected context builder", () => {
    for (const [relativePath, marker] of HOST_BUILDERS) {
      expect(source(relativePath), relativePath).toContain(marker);
    }
  });

  it("does not rediscover host context builders through process-global runtime stores", () => {
    for (const [relativePath, marker] of LATE_GLOBAL_BUILDERS) {
      expect(source(relativePath), relativePath).not.toContain(marker);
    }
  });

  it("hands scoped context builders from each migrated startup path to its sink", () => {
    for (const [chain, relativePath, marker] of SCOPED_BUILDER_HANDOFFS) {
      expect(source(relativePath), `${chain}: ${relativePath}`).toContain(marker);
    }
  });
});
