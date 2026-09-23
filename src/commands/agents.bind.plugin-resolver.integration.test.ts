// Agent bind plugin resolver integration tests cover account binding resolution through plugin registry surfaces.
import { afterEach, describe, expect, it } from "vitest";
import { setActivePluginRegistry } from "../plugins/runtime.js";
import {
  createBindingResolverTestPlugin,
  createTestRegistry,
} from "../test-utils/channel-plugins.js";
import { parseBindingSpecs } from "./agents.bindings.js";

const discordBindingPlugin = createBindingResolverTestPlugin({
  id: "discord",
  resolveBindingAccountId: ({ accountId, agentId }) => {
    const explicit = accountId?.trim();
    if (explicit) {
      return explicit;
    }
    const agent = agentId?.trim();
    return agent || "default";
  },
});

describe("agents bind plugin resolver integration", () => {
  it("uses the channel plugin binding resolver when accountId is omitted", () => {
    setActivePluginRegistry(
      createTestRegistry([{ pluginId: "discord", plugin: discordBindingPlugin, source: "test" }]),
    );

    const parsed = parseBindingSpecs({ agentId: "main", specs: ["discord"], config: {} });

    expect(parsed.errors).toStrictEqual([]);
    expect(parsed.bindings).toEqual([
      { type: "route", agentId: "main", match: { channel: "discord", accountId: "main" } },
    ]);
  });

  it("rejects a binding spec with extra colon segments instead of silently truncating", () => {
    setActivePluginRegistry(
      createTestRegistry([{ pluginId: "discord", plugin: discordBindingPlugin, source: "test" }]),
    );

    const parsed = parseBindingSpecs({
      agentId: "main",
      specs: ["discord:work:extra"],
      config: {},
    });

    expect(parsed.bindings).toEqual([]);
    expect(parsed.errors).toEqual([
      'Invalid binding "discord:work:extra". Account id cannot contain ":". Use <channel>:<account>, for example telegram:default.',
    ]);
  });

  it("still accepts a single channel:account binding", () => {
    setActivePluginRegistry(
      createTestRegistry([{ pluginId: "discord", plugin: discordBindingPlugin, source: "test" }]),
    );

    const parsed = parseBindingSpecs({ agentId: "main", specs: ["discord:work"], config: {} });

    expect(parsed.errors).toStrictEqual([]);
    expect(parsed.bindings).toEqual([
      { type: "route", agentId: "main", match: { channel: "discord", accountId: "work" } },
    ]);
  });

  afterEach(() => {
    setActivePluginRegistry(createTestRegistry());
  });
});
