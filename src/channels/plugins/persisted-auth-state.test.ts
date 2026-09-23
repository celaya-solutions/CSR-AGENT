// Persisted auth state tests cover channel plugin auth state serialization and recovery.
import { describe, expect, it } from "vitest";
import {
  hasBundledChannelPersistedAuthState,
  listBundledChannelIdsWithPersistedAuthState,
} from "./persisted-auth-state.js";

describe("bundled channel persisted-auth metadata", () => {
  it("lists shipped persisted-auth metadata channels", () => {
    // No channel bundled in this distribution declares persisted-auth metadata.
    expect(listBundledChannelIdsWithPersistedAuthState()).toEqual([]);
  });

  it("does not report auth state for channels without bundled metadata", () => {
    expect(
      hasBundledChannelPersistedAuthState({
        channelId: "discord",
        cfg: {},
        env: {},
      }),
    ).toBe(false);
  });
});
