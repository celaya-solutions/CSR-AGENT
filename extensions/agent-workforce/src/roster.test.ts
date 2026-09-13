// Agent Workforce tests cover roster normalization and teammate lookup.
import { describe, expect, it } from "vitest";
import { requireTeammate, resolveWorkforceConfig } from "./roster.js";

const scout = { id: "scout", brief: "Find the facts." };

describe("resolveWorkforceConfig", () => {
  it("defaults an empty config to a reviewing team of nobody", () => {
    const config = resolveWorkforceConfig(undefined);
    expect(config.team).toEqual([]);
    expect(config.requireReview).toBe(true);
    expect(config.timeoutMs).toBe(120_000);
  });

  it("fills the title from the id and keeps an explicit model", () => {
    const config = resolveWorkforceConfig({
      team: [{ ...scout, model: "anthropic/claude-opus-5" }],
    });
    expect(config.team[0]).toEqual({
      id: "scout",
      title: "scout",
      brief: "Find the facts.",
      model: "anthropic/claude-opus-5",
    });
  });

  it("rejects a teammate with no brief, because the brief is its whole prompt", () => {
    expect(() => resolveWorkforceConfig({ team: [{ id: "scout" }] })).toThrow(/brief is required/);
  });

  it("rejects an id the model could not address reliably", () => {
    expect(() => resolveWorkforceConfig({ team: [{ id: "Scout Two", brief: "x" }] })).toThrow(
      /team\[0\]\.id/,
    );
  });

  it("rejects duplicate ids so delegation cannot be ambiguous", () => {
    expect(() => resolveWorkforceConfig({ team: [scout, scout] })).toThrow(/two members named/);
  });

  it("keeps review on unless it is explicitly turned off", () => {
    expect(resolveWorkforceConfig({ requireReview: false }).requireReview).toBe(false);
    expect(resolveWorkforceConfig({ requireReview: "no" }).requireReview).toBe(false);
    expect(resolveWorkforceConfig({}).requireReview).toBe(true);
  });
});

describe("requireTeammate", () => {
  it("names the real options when the model invents a teammate", () => {
    const config = resolveWorkforceConfig({ team: [scout, { id: "critic", brief: "Poke holes." }] });
    expect(() => requireTeammate(config, "nobody")).toThrow(/The team is: scout, critic/);
  });

  it("finds a configured teammate", () => {
    const config = resolveWorkforceConfig({ team: [scout] });
    expect(requireTeammate(config, "scout").brief).toBe("Find the facts.");
  });
});
