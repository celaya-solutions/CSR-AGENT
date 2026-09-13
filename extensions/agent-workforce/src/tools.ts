// The five model-facing tools. Each one is deliberately small: the roster is
// config, the teammate turn is one isolated LLM call, and everything that would
// reach the outside world goes through the draft queue first.
import { Type } from "typebox";
import type { OpenClawPluginApi } from "../api.js";
import { requireTeammate, type Teammate, type WorkforceConfig } from "./roster.js";
import {
  createDraft,
  listDecisions,
  listDrafts,
  recordDecision,
  resolveDraft,
  type Draft,
} from "./store.js";

/** Teammates answer as one isolated turn with no tools, so no chain can loop. */
function buildSystemPrompt(teammate: Teammate, requireReview: boolean): string {
  const lines = [
    `You are ${teammate.title}, one member of a small team.`,
    teammate.brief,
    "",
    "You are answering a single handover from a teammate. Reply with your work, not with questions about process.",
    "You have no tools. If the task needs one, say plainly what you would need and stop.",
  ];
  if (requireReview) {
    lines.push(
      "Anything that would leave the team (a message, a commit, a purchase) is only ever a proposal; say what you would send and let a person decide.",
    );
  }
  return lines.join("\n");
}

function describeDraft(draft: Draft): string {
  const when = new Date(draft.createdAt).toISOString();
  return `${draft.id}  [${draft.status}]  ${draft.author}: ${draft.action}  (${when})`;
}

/**
 * Static, model-facing metadata for every tool. It must be accurate without
 * running the plugin, so discovery and setup can read it straight from here.
 */
export const workforceToolDefinitions = {
  roster: {
    name: "workforce_roster",
    label: "Workforce Roster",
    description:
      "List the teammates you can hand work to, with what each one is for. Call this before workforce_delegate if you are unsure who to ask.",
    parameters: Type.Object({}, { additionalProperties: false }),
  },
  delegate: {
    name: "workforce_delegate",
    label: "Delegate To Teammate",
    description:
      "Hand one self-contained task to a named teammate and wait for their answer. Include every fact they need: they cannot see this conversation.",
    parameters: Type.Object(
      {
        teammate: Type.String({ description: "Teammate id from workforce_roster." }),
        task: Type.String({ description: "The complete task, with all context they need." }),
      },
      { additionalProperties: false },
    ),
  },
  draft: {
    name: "workforce_draft",
    label: "Stage For Review",
    description:
      "Stage an action that would affect the outside world so a person can approve it first. Use this instead of sending, publishing, or spending.",
    parameters: Type.Object(
      {
        action: Type.String({ description: "What would happen, in one line." }),
        body: Type.String({ description: "The exact content or command that would go out." }),
        author: Type.Optional(
          Type.String({ description: "Teammate proposing it; defaults to the calling agent." }),
        ),
      },
      { additionalProperties: false },
    ),
  },
  review: {
    name: "workforce_review",
    label: "Review Drafts",
    description:
      "List drafts waiting on a person, or record a person's decision on one. Only call approve or discard when a human actually said so.",
    parameters: Type.Object(
      {
        decision: Type.Optional(
          Type.Union([Type.Literal("approve"), Type.Literal("discard")], {
            description: "Omit to list pending drafts.",
          }),
        ),
        id: Type.Optional(Type.String({ description: "Draft id, required with a decision." })),
        note: Type.Optional(Type.String({ description: "What the person said." })),
      },
      { additionalProperties: false },
    ),
  },
  log: {
    name: "workforce_log",
    label: "Decision Log",
    description:
      "Read the team's recent decisions in plain language: who took what on, what was staged, and what a person approved.",
    parameters: Type.Object(
      { limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 50 })) },
      { additionalProperties: false },
    ),
  },
} as const;

/** Tool keys in the order they are registered. */
export const workforceToolKeys = ["roster", "delegate", "draft", "review", "log"] as const;
export type WorkforceToolKey = (typeof workforceToolKeys)[number];

/** Builds the runnable tools for one activation of the plugin. */
export function workforceTools(api: OpenClawPluginApi, config: WorkforceConfig) {
  return {
    roster: {
      ...workforceToolDefinitions.roster,
      execute: () => {
        if (config.team.length === 0) {
          return "No teammates are configured. Add them under the agent-workforce plugin's `team` setting.";
        }
        return config.team
          .map((member) => `${member.id} (${member.title}) - ${member.brief}`)
          .join("\n");
      },
    },

    delegate: {
      ...workforceToolDefinitions.delegate,
      execute: async (
        params: { teammate: string; task: string },
        _config: unknown,
        context: { api: OpenClawPluginApi; signal?: AbortSignal },
      ) => {
        const teammate = requireTeammate(config, params.teammate);
        const task = params.task.trim();
        if (!task) {
          throw new Error("task is required; a teammate cannot see the calling conversation.");
        }
        const result = await (context.api ?? api).runtime.llm.complete({
          messages: [{ role: "user", content: task }],
          systemPrompt: buildSystemPrompt(teammate, config.requireReview),
          model: teammate.model,
          signal: context.signal,
          purpose: "agent-workforce-delegate",
          execution: {
            mode: "isolated-agent-runtime",
            timeoutMs: config.timeoutMs,
          },
        });
        recordDecision({
          actor: teammate.id,
          summary: `Took a handover: ${task.slice(0, 200)}`,
        });
        return result.text;
      },
    },

    draft: {
      ...workforceToolDefinitions.draft,
      execute: (params: { action: string; body: string; author?: string }) => {
        const author = params.author?.trim() || "agent";
        const draft = createDraft({ author, action: params.action, body: params.body });
        recordDecision({ actor: author, summary: `Staged for review: ${params.action}` });
        if (!config.requireReview) {
          return `Review is turned off, so ${draft.id} is recorded but nothing is holding it back. Do the action yourself.`;
        }
        return `Staged as ${draft.id}. It is waiting for a person; do not perform the action yourself.`;
      },
    },

    review: {
      ...workforceToolDefinitions.review,
      execute: (params: { decision?: "approve" | "discard"; id?: string; note?: string }) => {
        if (!params.decision) {
          const pending = listDrafts("pending");
          if (pending.length === 0) {
            return "Nothing is waiting for review.";
          }
          return pending.map((draft) => `${describeDraft(draft)}\n    ${draft.body}`).join("\n\n");
        }
        const id = params.id?.trim();
        if (!id) {
          throw new Error("id is required when recording a decision.");
        }
        const status = params.decision === "approve" ? "approved" : "discarded";
        const updated = resolveDraft({ id, status, note: params.note });
        if (!updated) {
          throw new Error(`No draft ${id}. Call workforce_review with no arguments to list them.`);
        }
        recordDecision({
          actor: "human",
          summary: `${status} ${id}: ${updated.action}${params.note ? ` (${params.note})` : ""}`,
        });
        return `${id} is ${status}.${status === "approved" ? " You may now carry it out." : ""}`;
      },
    },

    log: {
      ...workforceToolDefinitions.log,
      execute: (params: { limit?: number }) => {
        const entries = listDecisions(params.limit ?? 50);
        if (entries.length === 0) {
          return "The decision log is empty.";
        }
        return entries
          .map(
            (entry) =>
              `${new Date(entry.createdAt).toISOString()}  ${entry.actor}: ${entry.summary}`,
          )
          .join("\n");
      },
    },
  };
}
