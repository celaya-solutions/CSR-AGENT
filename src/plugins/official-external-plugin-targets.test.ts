import { describe, expect, it, vi } from "vitest";

// The shipped official external catalogs are empty in this distribution, so the
// env-detection rules are exercised against synthetic catalog entries.
vi.mock("./official-external-plugin-bundled-catalogs.js", () => ({
  BUNDLED_OFFICIAL_EXTERNAL_PLUGIN_CATALOG_ENTRIES: [
    {
      name: "@example/any-of-channel",
      openclaw: {
        channel: {
          id: "any-of-channel",
          configuredState: { env: { anyOf: ["ANY_OF_BOT_TOKEN", "ANY_OF_ALT_TOKEN"] } },
        },
      },
    },
    {
      name: "@example/env-vars-channel",
      openclaw: { channel: { id: "env-vars-channel", envVars: ["ENV_VARS_APP_ID"] } },
    },
    {
      name: "@example/all-of-channel",
      openclaw: {
        channel: {
          id: "all-of-channel",
          configuredState: { env: { allOf: ["ALL_OF_BOT_TOKEN", "ALL_OF_URL"] } },
        },
      },
    },
  ],
}));

const { hasOfficialExternalChannelTarget } = await import("./official-external-plugin-targets.js");

describe("official external channel targets", () => {
  it("detects any-of channel environment metadata", () => {
    expect(
      hasOfficialExternalChannelTarget({
        config: {},
        env: { ANY_OF_ALT_TOKEN: "token" },
      }),
    ).toBe(true);
  });

  it("detects channel envVars credentials", () => {
    expect(
      hasOfficialExternalChannelTarget({
        config: {},
        env: { ENV_VARS_APP_ID: "app-id" },
      }),
    ).toBe(true);
  });

  it("treats any all-of variable as a potential repair target", () => {
    expect(
      hasOfficialExternalChannelTarget({
        config: {},
        env: { ALL_OF_BOT_TOKEN: "token" },
      }),
    ).toBe(true);
    expect(
      hasOfficialExternalChannelTarget({
        config: {},
        env: { ALL_OF_BOT_TOKEN: "  " },
      }),
    ).toBe(false);
  });

  it("detects enabled channel config and ignores disabled config", () => {
    expect(
      hasOfficialExternalChannelTarget({
        config: { channels: { "all-of-channel": {} } } as never,
        env: {},
      }),
    ).toBe(true);
    expect(
      hasOfficialExternalChannelTarget({
        config: { channels: { "all-of-channel": { enabled: false } } } as never,
        env: {},
      }),
    ).toBe(false);
  });
});
