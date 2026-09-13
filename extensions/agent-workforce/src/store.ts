// Durable state for the workforce: drafts waiting on a human, and the decision
// log. Both live in this plugin's own SQLite-backed plugin-state namespaces, so
// nothing here touches core tables.
import { randomUUID } from "node:crypto";
import { createPluginStateSyncKeyedStore } from "openclaw/plugin-sdk/plugin-state-store-runtime";

const PLUGIN_ID = "agent-workforce";
const MAX_DRAFTS = 500;
const MAX_LOG_ENTRIES = 2_000;

/** An outward action staged for a human to approve before it happens. */
export type Draft = {
  id: string;
  /** Teammate or agent that proposed it. */
  author: string;
  /** What would happen, in the author's words. */
  action: string;
  /** The exact content or command that would go out. */
  body: string;
  status: "pending" | "approved" | "discarded";
  createdAt: number;
  /** Set when a human resolved it. */
  resolvedAt?: number;
  /** Optional human note recorded with the decision. */
  note?: string;
};

/** One plain-language line about a choice the team made. */
export type Decision = {
  id: string;
  /** Who made the call. */
  actor: string;
  /** What was decided, written for a person reading later. */
  summary: string;
  createdAt: number;
};

type Stores = {
  drafts: ReturnType<typeof createPluginStateSyncKeyedStore<Draft>>;
  decisions: ReturnType<typeof createPluginStateSyncKeyedStore<Decision>>;
};

let cached: Stores | undefined;

/** Opens both namespaces once per process; the host owns the underlying file. */
export function openStores(): Stores {
  if (!cached) {
    cached = {
      drafts: createPluginStateSyncKeyedStore<Draft>(PLUGIN_ID, {
        namespace: "drafts",
        maxEntries: MAX_DRAFTS,
        overflowPolicy: "reject-new",
      }),
      decisions: createPluginStateSyncKeyedStore<Decision>(PLUGIN_ID, {
        namespace: "decisions",
        maxEntries: MAX_LOG_ENTRIES,
        overflowPolicy: "evict-oldest",
      }),
    };
  }
  return cached;
}

/** Test seam: drops the cached handles so a fresh state dir is picked up. */
export function resetStoresForTests(): void {
  cached = undefined;
}

function newId(prefix: string): string {
  // Timestamp first so natural key order matches append order.
  return `${prefix}-${Date.now().toString(36).padStart(9, "0")}-${randomUUID().slice(0, 8)}`;
}

export function createDraft(params: { author: string; action: string; body: string }): Draft {
  const draft: Draft = {
    id: newId("draft"),
    author: params.author,
    action: params.action,
    body: params.body,
    status: "pending",
    createdAt: Date.now(),
  };
  openStores().drafts.register(draft.id, draft);
  return draft;
}

export function listDrafts(status?: Draft["status"]): Draft[] {
  return openStores()
    .drafts.entries()
    .map((entry) => entry.value)
    .filter((draft) => (status ? draft.status === status : true))
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** Resolves one draft. Returns undefined when the id is unknown. */
export function resolveDraft(params: {
  id: string;
  status: "approved" | "discarded";
  note?: string;
}): Draft | undefined {
  const store = openStores().drafts;
  const current = store.lookup(params.id);
  if (!current) {
    return undefined;
  }
  if (current.status !== "pending") {
    throw new Error(`Draft ${params.id} was already ${current.status}.`);
  }
  const next: Draft = {
    ...current,
    status: params.status,
    resolvedAt: Date.now(),
    ...(params.note ? { note: params.note } : {}),
  };
  store.register(next.id, next);
  return next;
}

export function recordDecision(params: { actor: string; summary: string }): Decision {
  const decision: Decision = {
    id: newId("log"),
    actor: params.actor,
    summary: params.summary,
    createdAt: Date.now(),
  };
  openStores().decisions.register(decision.id, decision);
  return decision;
}

export function listDecisions(limit = 50): Decision[] {
  const all = openStores()
    .decisions.entries()
    .map((entry) => entry.value)
    .sort((a, b) => a.createdAt - b.createdAt);
  return limit > 0 ? all.slice(-limit) : all;
}
