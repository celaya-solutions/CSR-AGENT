---
title: Agent Workforce
description: A named team your agent can hand work to, with drafts held for human review and a plain-language decision log.
---

Agent Workforce turns one agent into a small team. You name the teammates in
config, and the agent can hand a task to any of them, stage anything that would
reach the outside world for a person to approve, and leave a readable trail of
what it decided.

It is a thin plugin on purpose. OpenClaw core already owns agents, models,
sessions, approvals, and scheduling. This plugin adds only the parts that were
missing: a roster the model can read, a review queue, and a decision log.

## Turn it on

```json
{
  "plugins": {
    "entries": {
      "agent-workforce": {
        "enabled": true,
        "config": {
          "team": [
            {
              "id": "scout",
              "title": "Scout",
              "brief": "You find facts and sources. Answer with what you found and where it came from. Never guess."
            },
            {
              "id": "critic",
              "title": "Critic",
              "brief": "You poke holes in a plan. List the weakest assumptions first and say what would disprove each one."
            },
            {
              "id": "writer",
              "title": "Writer",
              "brief": "You turn notes into short, plain prose. Sixth-grade reading level. No filler."
            }
          ]
        }
      }
    }
  }
}
```

Each teammate needs an `id` (what the model calls it) and a `brief` (its
standing instructions, used as its system prompt). `title` is a label, and
`model` is an optional `provider/model` override; leave it out and the teammate
runs on your agent's default model.

## The five tools

| Tool | What it does |
| --- | --- |
| `workforce_roster` | Lists the team and what each member is for. |
| `workforce_delegate` | Hands one task to a named teammate and waits for the answer. |
| `workforce_draft` | Stages an outward action instead of doing it. |
| `workforce_review` | Lists pending drafts, or records a person's approve/discard. |
| `workforce_log` | Reads the decision log in plain language. |

## How delegation works

`workforce_delegate` runs the teammate as **one isolated turn with no tools**.
That has three consequences worth understanding:

- The teammate cannot see your conversation. Everything it needs must be in the
  `task` you send.
- The teammate cannot delegate onward, so two teammates can never hand work back
  and forth forever. There is no depth limit to configure because the shape
  makes a loop impossible.
- The teammate cannot touch files, run commands, or send messages. It thinks and
  answers. If a task needs a tool, the calling agent does that part.

For work that genuinely needs a full agent with tools, use core's subagents
instead; see [agents](../agents.md).

## Review before anything leaves

With `requireReview` on (the default), anything that would reach the outside
world goes through `workforce_draft` first. The draft is stored, the agent is
told not to act, and a person decides:

```
workforce_review()                                    # list what is waiting
workforce_review(decision="approve", id="draft-...")  # after a human says yes
```

The agent should only record `approve` or `discard` when a person actually said
so. This is a teaching gate, not a security boundary: for real enforcement use
core's tool-call approvals, which the model cannot talk its way around.

Set `requireReview: false` and drafts are still recorded, but nothing is held
back.

## The decision log

Every handover and every staged draft appends one plain sentence to the log, and
so does every human decision. `workforce_log` reads it back:

```
2026-09-13T18:04:11.902Z  scout: Took a handover: Check the opening hours...
2026-09-13T18:04:29.118Z  agent: Staged for review: Email the client
2026-09-13T18:06:02.447Z  human: approved draft-... : Email the client (looks good)
```

This is deliberately separate from the audit log. Audit records what happened,
for security. The decision log records *why*, for a person reading along.

## Running the team on a schedule

This plugin does not schedule anything. Use core cron, which already owns
scheduled agent runs, and point a job at an agent that has these tools:

```
openclaw cron add --schedule "0 9 * * 1" --prompt "Ask scout for anything new about our top three competitors, then draft a summary email for review."
```

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `team` | `[]` | The teammates. Each needs `id` and `brief`. |
| `requireReview` | `true` | Hold drafts until a person approves them. |
| `timeoutMs` | `120000` | How long one teammate turn may run. |

## Where state lives

Drafts and the decision log live in this plugin's own SQLite-backed
plugin-state namespaces. Nothing is written to core tables, and removing the
plugin removes its state with it.
