// Covers repair hints for official external plugin installs.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveConfiguredChannelPresencePolicy: vi.fn(),
}));

vi.mock("./channel-plugin-ids.js", () => ({
  resolveConfiguredChannelPresencePolicy: (params: unknown) =>
    mocks.resolveConfiguredChannelPresencePolicy(params),
}));

// The shipped official external catalogs are empty in this distribution, so the
// repair hints are resolved against synthetic official external channel entries.
function externalChannel(id: string, label: string): Record<string, unknown> {
  return {
    name: `@example/${id}`,
    source: "official",
    kind: "channel",
    openclaw: {
      channel: { id, label },
      install: { npmSpec: `@example/${id}`, defaultChoice: "npm" },
    },
  };
}

vi.mock("./official-external-plugin-bundled-catalogs.js", () => ({
  BUNDLED_OFFICIAL_EXTERNAL_PLUGIN_CATALOG_ENTRIES: [
    externalChannel("examplechat", "ExampleChat"),
    externalChannel("otherchat", "OtherChat"),
  ],
}));

const {
  resolveExternalPluginRuntimeDependencyRepairHint,
  resolveMissingOfficialExternalChannelPluginRepairHint,
  resolveMissingOfficialExternalChannelPluginRepairHints,
} = await import("./official-external-plugin-repair-hints.js");

describe("resolveMissingOfficialExternalChannelPluginRepairHint", () => {
  beforeEach(() => {
    mocks.resolveConfiguredChannelPresencePolicy.mockReset();
  });

  it("returns an install hint when a configured official external channel has no owner", () => {
    mocks.resolveConfiguredChannelPresencePolicy.mockReturnValue([
      {
        channelId: "examplechat",
        sources: ["explicit-config"],
        effective: false,
        pluginIds: [],
        blockedReasons: ["no-channel-owner"],
      },
    ]);

    expect(
      resolveMissingOfficialExternalChannelPluginRepairHint({
        config: { channels: { examplechat: { appId: "app-id" } } },
        channelId: "examplechat",
      }),
    ).toEqual({
      pluginId: "examplechat",
      channelId: "examplechat",
      label: "ExampleChat",
      installSpec: "@example/examplechat",
      installCommand: "openagent plugins install @example/examplechat",
      doctorFixCommand: "openagent doctor --fix",
      repairHint:
        "Install the official external plugin with: openagent plugins install @example/examplechat, or run: openagent doctor --fix.",
    });
  });

  it("resolves multiple channel hints with one presence-policy pass", () => {
    mocks.resolveConfiguredChannelPresencePolicy.mockReturnValue([
      {
        channelId: "examplechat",
        sources: ["explicit-config"],
        effective: false,
        pluginIds: [],
        blockedReasons: ["no-channel-owner"],
      },
      {
        channelId: "otherchat",
        sources: ["explicit-config"],
        effective: false,
        pluginIds: [],
        blockedReasons: ["no-channel-owner"],
      },
    ]);

    expect(
      resolveMissingOfficialExternalChannelPluginRepairHints({
        config: { channels: { examplechat: {}, otherchat: {} } },
        channelIds: ["examplechat", "otherchat"],
      }).map((hint) => hint.channelId),
    ).toEqual(["examplechat", "otherchat"]);
    expect(mocks.resolveConfiguredChannelPresencePolicy).toHaveBeenCalledTimes(1);
  });

  it("skips presence policy when no channel ids need repair hints", () => {
    expect(
      resolveMissingOfficialExternalChannelPluginRepairHints({
        config: {},
        channelIds: [],
      }),
    ).toEqual([]);
    expect(mocks.resolveConfiguredChannelPresencePolicy).not.toHaveBeenCalled();
  });

  it("prefers the npm install hint for an externalized channel", () => {
    mocks.resolveConfiguredChannelPresencePolicy.mockReturnValue([
      {
        channelId: "otherchat",
        sources: ["explicit-config"],
        effective: false,
        pluginIds: [],
        blockedReasons: ["no-channel-owner"],
      },
    ]);

    expect(
      resolveMissingOfficialExternalChannelPluginRepairHint({
        config: { channels: { otherchat: { enabled: true } } },
        channelId: "otherchat",
      }),
    ).toMatchObject({
      pluginId: "otherchat",
      channelId: "otherchat",
      label: "OtherChat",
      installSpec: "@example/otherchat",
      installCommand: "openagent plugins install @example/otherchat",
    });
  });

  it("does not return install hints for policy-blocked official external channel owners", () => {
    mocks.resolveConfiguredChannelPresencePolicy.mockReturnValue([
      {
        channelId: "otherchat",
        sources: ["explicit-config"],
        effective: false,
        pluginIds: [],
        blockedReasons: ["not-in-allowlist"],
      },
    ]);

    expect(
      resolveMissingOfficialExternalChannelPluginRepairHint({
        config: { channels: { otherchat: { enabled: true } } },
        channelId: "otherchat",
      }),
    ).toBeNull();
  });

  it("does not return install hints for active official external channel owners", () => {
    mocks.resolveConfiguredChannelPresencePolicy.mockReturnValue([
      {
        channelId: "otherchat",
        sources: ["explicit-config"],
        effective: true,
        pluginIds: ["otherchat"],
        blockedReasons: [],
      },
    ]);

    expect(
      resolveMissingOfficialExternalChannelPluginRepairHint({
        config: { channels: { otherchat: { enabled: true } } },
        channelId: "otherchat",
      }),
    ).toBeNull();
  });
});

describe("resolveExternalPluginRuntimeDependencyRepairHint", () => {
  it.each([
    {
      name: "names the official install command for the package that owns the id",
      candidate: { pluginId: "examplechat", packageName: "@example/examplechat" },
      expected: "openagent plugins install @example/examplechat",
    },
    {
      name: "withholds the official install command from a foreign package reusing the id",
      candidate: {
        pluginId: "discord",
        packageName: "@example/discord-fork",
        packageBuild: { bundledDist: false },
      },
      expected: "reinstall or update the plugin package",
    },
  ])("$name", ({ candidate, expected }) => {
    const hint = resolveExternalPluginRuntimeDependencyRepairHint(candidate);
    expect(hint).toContain("runtime dependencies are missing");
    expect(hint).toContain(expected);
  });

  it("stays silent for plugins shipped inside the root package", () => {
    expect(
      resolveExternalPluginRuntimeDependencyRepairHint({
        pluginId: "telegram",
        packageName: "@openclaw/telegram",
      }),
    ).toBeUndefined();
  });
});
