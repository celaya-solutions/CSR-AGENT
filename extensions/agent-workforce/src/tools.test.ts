// Agent Workforce tests cover the draft/review gate and the delegate handover.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-workforce-"));
const previousStateDir = process.env.OPENCLAW_STATE_DIR;

beforeAll(() => {
  // The store opens its namespace from the ambient state dir, so point it at a
  // throwaway directory before the first tool call touches it.
  process.env.OPENCLAW_STATE_DIR = stateDir;
});

afterAll(() => {
  if (previousStateDir === undefined) {
    delete process.env.OPENCLAW_STATE_DIR;
  } else {
    process.env.OPENCLAW_STATE_DIR = previousStateDir;
  }
  fs.rmSync(stateDir, { recursive: true, force: true });
});

const { resolveWorkforceConfig } = await import("./roster.js");
const { workforceTools } = await import("./tools.js");
const store = await import("./store.js");

const complete = vi.fn(async () => ({ text: "done", provider: "anthropic", model: "opus" }));
const api = { runtime: { llm: { complete } } } as never;

const config = resolveWorkforceConfig({
  team: [{ id: "scout", title: "Scout", brief: "Find the facts." }],
});
const tools = () => workforceTools(api, config);

beforeEach(() => {
  complete.mockClear();
  store.openStores().drafts.clear();
  store.openStores().decisions.clear();
});

describe("workforce_roster", () => {
  it("lists each teammate with what it is for", () => {
    expect(tools().roster.execute()).toContain("scout (Scout) - Find the facts.");
  });

  it("says how to fix an empty team instead of returning nothing", () => {
    const empty = workforceTools(api, resolveWorkforceConfig({}));
    expect(empty.roster.execute()).toMatch(/No teammates are configured/);
  });
});

describe("workforce_delegate", () => {
  it("runs the teammate as an isolated turn carrying its own brief", async () => {
    const text = await tools().delegate.execute(
      { teammate: "scout", task: "Check the opening hours." },
      undefined,
      { api },
    );
    expect(text).toBe("done");
    const call = complete.mock.calls[0]?.[0] as {
      systemPrompt: string;
      execution: { mode: string };
    };
    expect(call.systemPrompt).toContain("Find the facts.");
    expect(call.systemPrompt).toContain("You have no tools.");
    expect(call.execution.mode).toBe("isolated-agent-runtime");
  });

  it("records the handover in the decision log", async () => {
    await tools().delegate.execute({ teammate: "scout", task: "Check hours." }, undefined, { api });
    expect(store.listDecisions()[0]?.actor).toBe("scout");
  });

  it("refuses an unknown teammate before spending a turn", async () => {
    await expect(
      tools().delegate.execute({ teammate: "ghost", task: "x" }, undefined, { api }),
    ).rejects.toThrow(/No teammate named "ghost"/);
    expect(complete).not.toHaveBeenCalled();
  });

  it("refuses an empty task, since the teammate cannot see this conversation", async () => {
    await expect(
      tools().delegate.execute({ teammate: "scout", task: "  " }, undefined, { api }),
    ).rejects.toThrow(/task is required/);
  });
});

describe("workforce_draft and workforce_review", () => {
  it("holds an outward action and tells the agent not to do it", () => {
    const message = tools().draft.execute({ action: "Email the client", body: "Hi there" });
    expect(message).toMatch(/waiting for a person/);
    expect(store.listDrafts("pending")).toHaveLength(1);
  });

  it("lists pending drafts with their exact body", () => {
    tools().draft.execute({ action: "Email the client", body: "Hi there" });
    expect(tools().review.execute({})).toContain("Hi there");
  });

  it("says plainly when nothing is waiting", () => {
    expect(tools().review.execute({})).toBe("Nothing is waiting for review.");
  });

  it("approves a draft and logs who decided", () => {
    tools().draft.execute({ action: "Email the client", body: "Hi" });
    const id = store.listDrafts("pending")[0]!.id;
    expect(tools().review.execute({ decision: "approve", id, note: "looks good" })).toMatch(
      /approved/,
    );
    expect(store.listDrafts("approved")[0]?.note).toBe("looks good");
    expect(store.listDecisions().at(-1)?.actor).toBe("human");
  });

  it("refuses to decide the same draft twice", () => {
    tools().draft.execute({ action: "Email", body: "Hi" });
    const id = store.listDrafts("pending")[0]!.id;
    tools().review.execute({ decision: "discard", id });
    expect(() => tools().review.execute({ decision: "approve", id })).toThrow(/already discarded/);
  });

  it("needs an id to record a decision", () => {
    expect(() => tools().review.execute({ decision: "approve" })).toThrow(/id is required/);
  });

  it("tells the agent to act itself when review is turned off", () => {
    const open = workforceTools(api, resolveWorkforceConfig({ requireReview: false }));
    expect(open.draft.execute({ action: "Email", body: "Hi" })).toMatch(/Review is turned off/);
  });
});

describe("workforce_log", () => {
  it("reports an empty log rather than an empty string", () => {
    expect(tools().log.execute({})).toBe("The decision log is empty.");
  });

  it("returns the most recent entries up to the limit", () => {
    for (let i = 0; i < 5; i++) {
      tools().draft.execute({ action: `Action ${i}`, body: "x" });
    }
    const lines = tools().log.execute({ limit: 2 }).split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("Action 4");
  });
});
