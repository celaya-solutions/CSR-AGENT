// Channel id tests cover identifier normalization and validation helpers.
import { describe, expect, it } from "vitest";
import { findChatChannelLabel, normalizeChatChannelId } from "./ids.js";

describe("channel ids", () => {
  it("normalizes built-in ids + trims whitespace", () => {
    expect(normalizeChatChannelId(" Discord ")).toBe("discord");
    expect(normalizeChatChannelId("telegram")).toBe("telegram");
    expect(normalizeChatChannelId("web")).toBeNull();
    expect(normalizeChatChannelId("nope")).toBeNull();
  });

  it.each([
    ["telegram", "Telegram"],
    ["discord", "Discord"],
    [" TELEGRAM ", "Telegram"],
  ])("finds the exact generated label for %s", (channel, label) => {
    expect(findChatChannelLabel(channel)).toBe(label);
  });

  it("does not fall back to runtime metadata for unknown channels", () => {
    expect(findChatChannelLabel("external-chat")).toBeUndefined();
    expect(findChatChannelLabel(" ")).toBeUndefined();
  });
});
