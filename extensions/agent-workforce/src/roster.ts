// The roster is the team as the operator wrote it in plugin config. It owns
// nothing at runtime: core still owns agents, models, and sessions. This file
// only turns loose config into the teammate records the tools read.

/** One named teammate the delegating agent may hand work to. */
export type Teammate = {
  /** Stable name the model uses in workforce_delegate. */
  id: string;
  /** Human label shown in the roster listing; defaults to the id. */
  title: string;
  /** The teammate's standing instructions, used as its system prompt. */
  brief: string;
  /** Optional provider/model override; otherwise the agent default is used. */
  model?: string;
};

/** Plugin config after the manifest schema has accepted it. */
export type WorkforceConfig = {
  team: Teammate[];
  requireReview: boolean;
  timeoutMs: number;
};

const DEFAULTS = {
  requireReview: true,
  timeoutMs: 120_000,
} as const;

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function trimmed(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

/** Reads one teammate, rejecting shapes that would fail confusingly later. */
function readTeammate(raw: unknown, index: number): Teammate {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`team[${index}] must be an object with an id and a brief.`);
  }
  const entry = raw as Record<string, unknown>;
  const id = trimmed(entry.id);
  if (!id || !ID_PATTERN.test(id)) {
    throw new Error(
      `team[${index}].id must be lowercase letters, digits, dash or underscore (got ${String(entry.id)}).`,
    );
  }
  const brief = trimmed(entry.brief);
  if (!brief) {
    throw new Error(`team[${index}].brief is required; it becomes ${id}'s standing instructions.`);
  }
  return {
    id,
    title: trimmed(entry.title) ?? id,
    brief,
    ...(trimmed(entry.model) ? { model: trimmed(entry.model) } : {}),
  };
}

/** Normalizes plugin config into the roster the tools work from. */
export function resolveWorkforceConfig(raw: unknown): WorkforceConfig {
  const cfg = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const rawTeam = Array.isArray(cfg.team) ? cfg.team : [];
  const team = rawTeam.map(readTeammate);
  const seen = new Set<string>();
  for (const member of team) {
    if (seen.has(member.id)) {
      throw new Error(`team has two members named "${member.id}"; ids must be unique.`);
    }
    seen.add(member.id);
  }
  return {
    team,
    requireReview: cfg.requireReview === undefined ? DEFAULTS.requireReview : cfg.requireReview === true,
    timeoutMs: positiveInteger(cfg.timeoutMs, DEFAULTS.timeoutMs),
  };
}

/** Finds a teammate by id, with an error that lists the real options. */
export function requireTeammate(config: WorkforceConfig, id: unknown): Teammate {
  const wanted = trimmed(id);
  const found = config.team.find((member) => member.id === wanted);
  if (found) {
    return found;
  }
  const names = config.team.map((member) => member.id).join(", ") || "none configured";
  throw new Error(`No teammate named "${String(id)}". The team is: ${names}.`);
}
