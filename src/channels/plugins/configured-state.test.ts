// Configured state tests cover channel plugin configured-state detection and summaries.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  hasBundledChannelPackageState,
  listBundledChannelIdsForPackageState,
} from "./package-state-probes.js";

const nodeRequire = createRequire(import.meta.url);

describe("bundled channel configured-state metadata", () => {
  it("lists the shipped metadata-first configured-state channels", () => {
    expect(listBundledChannelIdsForPackageState("configuredState")).toEqual([
      "discord",
      "telegram",
    ]);
  });

  it("resolves Discord and Telegram env probes without full plugin loads", () => {
    expect(
      hasBundledChannelPackageState({
        metadataKey: "configuredState",
        channelId: "discord",
        cfg: {},
        env: { DISCORD_BOT_TOKEN: "token" },
      }),
    ).toBe(true);
    expect(
      hasBundledChannelPackageState({
        metadataKey: "configuredState",
        channelId: "telegram",
        cfg: {},
        env: { TELEGRAM_BOT_TOKEN: "token" },
      }),
    ).toBe(true);
  });

  it.each([
    { channelId: "discord", env: {} },
    { channelId: "discord", env: { DISCORD_BOT_TOKEN: "" } },
    { channelId: "telegram", env: {} },
    { channelId: "telegram", env: { TELEGRAM_BOT_TOKEN: "" } },
  ])("rejects missing $channelId environment credentials", ({ channelId, env }) => {
    expect(
      hasBundledChannelPackageState({ metadataKey: "configuredState", channelId, cfg: {}, env }),
    ).toBe(false);
  });

  it("uses declarative env metadata without a TypeScript source require hook", () => {
    const previousTsHook = nodeRequire.extensions[".ts"];
    delete nodeRequire.extensions[".ts"];
    try {
      expect(
        hasBundledChannelPackageState({
          metadataKey: "configuredState",
          channelId: "discord",
          cfg: {},
          env: { DISCORD_BOT_TOKEN: "token" },
        }),
      ).toBe(true);
    } finally {
      if (previousTsHook) {
        nodeRequire.extensions[".ts"] = previousTsHook;
      }
    }
  });
});
