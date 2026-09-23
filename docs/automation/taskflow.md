---
summary: "Task Flow orchestration layer above background tasks"
read_when:
  - You want to understand how Task Flow relates to background tasks
  - You encounter Task Flow or openagent tasks flow in release notes or docs
  - You want to inspect or manage durable flow state
title: "Task flow"
---

Task Flow is the orchestration layer above [background tasks](/automation/tasks). A flow is a durable record of multi-step work with its own status, JSON state, revision counter, and linked task records. Flows survive gateway restarts; individual tasks remain the unit of detached work.

## When to use Task Flow

| Scenario                                  | Use                                         |
| ----------------------------------------- | ------------------------------------------- |
| Single background job                     | Plain task                                  |
| Multi-step pipeline driven by plugin code | Task Flow (managed)                         |
| Detached ACP or subagent spawn            | Task Flow (mirrored, created automatically) |
| One-shot reminder                         | Automation job                              |

## Sync modes

### Managed mode

A managed flow has a controller: plugin code that creates the flow with a goal and controller id, then drives it explicitly. A flow can track inline work without any child task.

- `createManaged` creates state, not an execution. `runTask` links an existing execution; it does not launch one.
- The controller advances between running, waiting and terminal states, retaining bounded IDs, summaries and cursors in `stateJson`.
- State transitions (`setWaiting`, `resume`, `finish`, `fail`, `requestCancel`) require the latest expected revision. Check every result, including `finish`. `runTask` and `cancel` have separate creation/cancellation results to check.
- Cancellation intent refuses new child links. The flow finalizes as cancelled once its active children have settled.

#### Launching and linking child tasks

Launch ACP/subagent work through its supported runtime **before** calling `runTask`. Linking requires the existing authoritative backing task, its canonical `runId` and child session key, the correct task runtime and the same owner session as the managed flow. A copied session key or invented run ID is not authority.

For Gateway-backed plugin subagents, the public path is `api.runtime.subagent.run({ completionDelivery: "current-requester", ... })` inside a real requester-bound `before_dispatch` hook handling an authenticated inbound request. The host creates the canonical subagent task and mirrored flow. Ordinary plugin runs without this setting deliberately have `not_applicable` completion delivery and cannot supply that mirrored backing. Merely binding `managedFlows.fromToolContext(ctx)` does not grant requester launch authority.

Use the returned identities and current owner-visible task facts, not invented status/timing. A child can finish before linkage; `runTask` does not replay past terminal events. Do not create a running projection of completed work. See the [SDK Tasks contract](/plugins/sdk-runtime) for the launch, synchronous pre-link check, result handling and revision rules.

### Mirrored mode

OpenAgent creates a mirrored one-task flow automatically when a detached ACP or subagent run starts (session-scoped tasks with deliverable completion). The flow record mirrors its single backing task - status, goal, and timing - so detached spawns get a stable flow handle for status and retry surfaces without a controller. Mirrored flows show sync mode `task_mirrored` in the CLI.

## Flow statuses

| Status      | Meaning                                                           |
| ----------- | ----------------------------------------------------------------- |
| `queued`    | Created, not yet progressing                                      |
| `running`   | Flow is actively progressing                                      |
| `waiting`   | Managed flow is parked on wait metadata (timer, external event)   |
| `blocked`   | Waiting on a blocking condition, or ended without a usable result |
| `succeeded` | Completed successfully                                            |
| `failed`    | Completed with an error                                           |
| `cancelled` | Cancel requested and all child tasks settled                      |
| `lost`      | Flow lost its authoritative backing state                         |

`blocked` is the only status whose terminal meaning depends on the record. A
managed flow with no `endedAt` remains resumable. A `blocked` flow with
`endedAt` is finished, including mirrored flows whose backing task completed
with a blocked outcome.

## Durable state and revision tracking

Flow records persist in the shared SQLite state database (`~/.openclaw/state/openclaw.sqlite`, `flow_runs` table) alongside task records, so progress survives gateway restarts. Each write bumps the flow's `revision`; concurrent writers that pass a stale expected revision get a conflict and must re-read. WAL growth is bounded by SQLite autocheckpointing plus periodic passive checkpoints, with truncate checkpoints on shutdown. The shared database replaced the `flows/registry.sqlite` sidecar in `v2026.5.30-beta.1`, stable from `v2026.6.1`. If that sidecar is still present under the state root, `openagent doctor` imports it into the shared database.

Durability covers records, not a JavaScript call stack or automatic scheduling. After restart, the owning controller reloads the flow, checks cancellation and terminal state, reconciles any child outcome, and explicitly resumes from the latest revision. Waiting metadata alone does not register a timer or event listener. Use an automation or controller-owned event handler for wakeups; never blindly replay side effects after a revision conflict.

Gateway maintenance retains finished flows for 7 days, then prunes them. This
includes `blocked` flows with `endedAt`; resumable managed `blocked` flows are
retained regardless of age.

## Cancel behavior

`openagent tasks flow cancel` sets a sticky cancel intent on the flow, cancels its active child tasks, and refuses new managed child tasks. Once no child task remains active, the flow finalizes as `cancelled` - immediately, or via the maintenance sweep if children take longer to settle. The intent is persisted, so a cancelled flow stays cancelled even if the gateway restarts before all child tasks have terminated.

## CLI commands

```bash
# List active and recent flows
openagent tasks flow list [--status <status>] [--json]

# Show details for a specific flow
openagent tasks flow show <lookup> [--json]

# Cancel a running flow and its active tasks
openagent tasks flow cancel <lookup>
```

| Command                            | Description                                                             |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `openagent tasks flow list`        | Tracked flows with sync mode, status, revision, controller, task counts |
| `openagent tasks flow show <id>`   | Inspect one flow by flow id or owner key, including linked tasks        |
| `openagent tasks flow cancel <id>` | Cancel a running flow and its active tasks                              |

Flows are also covered by `openagent tasks audit` (stale or broken flow findings) and `openagent tasks maintenance` (finalizes stuck cancels, prunes terminal flows after 7 days).

## Reliable scheduled workflow pattern

For recurring workflows such as market intelligence briefings, treat the schedule, orchestration, and reliability checks as separate layers:

1. Use [Automations](/automation/cron-jobs) for timing.
2. Use a persistent automation session when the workflow should build on prior context.
3. Use Task Flow to track the multi-step run across child tasks, waits, retries, and gateway restarts.

Example automation job (`openagent automations`; `openagent cron` remains an alias):

```bash
openagent automations add \
  --name "Market intelligence brief" \
  --cron "0 7 * * 1-5" \
  --tz "America/New_York" \
  --session session:market-intel \
  --message "Run the market-intel workflow. Verify source freshness before summarizing." \
  --announce \
  --channel discord \
  --to "channel:123456789012345678"
```

Use `--session session:<id>` instead of `isolated` when the recurring workflow needs deliberate history, previous run summaries, or standing context. Use `isolated` when each run should start fresh and all required state is explicit in the workflow.

Inside the workflow, put reliability checks before the LLM summary step:
run a preflight check, collect the data, summarize it, and ask for approval
before the delivery step executes.

Recommended preflight checks:

- Browser availability and profile choice, for example `openclaw` for managed state or `user` when a signed-in Chrome session is required. See [Browser](/tools/browser).
- API credentials and quota for each source.
- Network reachability for required endpoints.
- Required tools enabled for the agent, such as `browser` and `llm-task`.
- Failure destination configured for the automation so preflight failures are visible. See [Automations](/automation/cron-jobs#delivery-and-output).

Recommended data provenance fields for every collected item:

```json
{
  "sourceUrl": "https://example.com/report",
  "retrievedAt": "2026-04-24T12:00:00Z",
  "asOf": "2026-04-24",
  "title": "Example report",
  "content": "..."
}
```

Have the workflow reject or mark stale items before summarization. The LLM step should receive only structured JSON and should be asked to preserve `sourceUrl`, `retrievedAt`, and `asOf` in its output. Use [LLM Task](/tools/llm-task) when you need a schema-validated model step inside the workflow.

For reusable team or community workflows, package the CLI and any setup notes as a skill or plugin and share it as a Git repository or package. Keep workflow-specific guardrails in that package unless the plugin API is missing a needed generic capability.

## How flows relate to tasks

Flows coordinate tasks, not replace them. A single flow may drive multiple background tasks over its lifetime. Use `openagent tasks` to inspect individual task records and `openagent tasks flow` to inspect the orchestrating flow.

## Related

- [Background Tasks](/automation/tasks) - the detached work ledger that flows coordinate
- [CLI: tasks](/cli/tasks) - CLI command reference for `openagent tasks flow`
- [Automation Overview](/automation) - all automation mechanisms at a glance
- [Automations](/automation/cron-jobs) - scheduled jobs that may feed into flows
- [Goal](/tools/goal) - durable per-session objectives and the `/goal` controls
