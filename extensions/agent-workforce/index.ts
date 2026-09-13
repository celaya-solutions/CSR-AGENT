// Agent Workforce plugin entrypoint: a named team, delegation, review drafts,
// and a decision log. Core still owns agents, models, sessions, approvals, and
// cron; this plugin only composes them into one legible team surface.
import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
import { Type } from "typebox";
import type { AnyAgentTool } from "./api.js";
import { resolveWorkforceConfig } from "./src/roster.js";
import { workforceToolDefinitions, workforceToolKeys, workforceTools } from "./src/tools.js";

export default defineToolPlugin({
  id: "agent-workforce",
  name: "Agent Workforce",
  description:
    "A named team of teammates one agent can hand work to, with drafts held for human review and a plain-language decision log.",
  configSchema: Type.Object(
    {
      team: Type.Optional(
        Type.Array(
          Type.Object(
            {
              id: Type.String(),
              title: Type.Optional(Type.String()),
              brief: Type.String(),
              model: Type.Optional(Type.String()),
            },
            { additionalProperties: false },
          ),
        ),
      ),
      requireReview: Type.Optional(Type.Boolean()),
      timeoutMs: Type.Optional(Type.Integer({ minimum: 1 })),
    },
    { additionalProperties: false },
  ),
  tools: (tool) =>
    // Metadata stays static so discovery never runs plugin code; only the
    // executable half is built per activation, from the operator's roster.
    workforceToolKeys.map((key) =>
      tool({
        ...workforceToolDefinitions[key],
        optional: true,
        factory: ({ api }) =>
          workforceTools(api, resolveWorkforceConfig(api.pluginConfig))[
            key
          ] as unknown as AnyAgentTool,
      }),
    ),
});
