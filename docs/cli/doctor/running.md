---
summary: "Doctor postures, example invocations, and the full option table"
title: "Run doctor"
read_when:
  - You want to run `openagent doctor` and pick the right posture
  - You need the meaning of a doctor flag or a flag combination rule
---

This page covers how to invoke `openagent doctor`: the supported postures, ready-to-run
examples, and every option the command accepts.

## Postures

Doctor supports these postures:

| Posture                   | Command                                    | Behavior                                                                              |
| ------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------- |
| Guided checks             | `openagent doctor`                         | Interactive health flow; can copy legacy config and apply automatic state migrations. |
| Advisory JSON             | `openagent doctor --json`                  | Read-only findings; exits successfully after producing a report.                      |
| Repair                    | `openagent doctor --fix`                   | Applies supported repairs, using prompts unless non-interactive repair is safe.       |
| Lint                      | `openagent doctor --lint [--json]`         | Read-only findings with threshold-based exit codes for CI gates.                      |
| Shared SQLite maintenance | `openagent doctor --state-sqlite compact`  | Explicitly checkpoints, compacts, and verifies the canonical shared state DB.         |
| Session SQLite tools      | `openagent doctor --session-sqlite <mode>` | Inspects or maintains SQLite sessions and explicitly imports legacy history.          |

Use `openagent doctor --json` when an operator or script wants the advisory Doctor report as JSON. It exits successfully after producing a report; inspect `ok` and `findings` for health state. Use explicit `openagent doctor --lint --json` when CI should exit nonzero for findings at the selected severity threshold. Prefer `--fix` when a human operator wants Doctor to edit config or state.

For read-only diagnosis, use `--lint` or bare `--json`. Ordinary `doctor`, including `doctor --non-interactive`, can copy legacy config and migrate state even without `--fix`. `--non-interactive` suppresses prompts, not writes.

When ordinary `doctor` asks **Apply recommended config repairs now?**, it checks
that the selected root config file still matches the source of that proposal.
If its contents or selected path changed before the write, Doctor preserves the newer file,
leaves the pending config fixes unwritten, and exits with an error. Rerun
`openagent doctor` to review an updated proposal.

If saving succeeds but later processing fails, Doctor stops with an error, names
the file that was written, and reports whether the write was rolled back. When it was not rolled
back or recovery could not be confirmed, inspect that file and the active config
before rerunning Doctor.

If the shared state database uses a newer schema, Doctor refuses before offering
an interactive update because update admission also needs that database. Run
Doctor from the OpenAgent install that wrote the state, or another compatible
build. A readable shared database still permits an interactive source update
when agent databases use newer schemas; if the update does not take over,
Doctor checks all database schemas again before diagnostics or repair. See
[Database schemas](/reference/database-schemas).

After an exec-approval format upgrade, Doctor reports older generated approvals
that are no longer active because they were not tied to a working directory.
`openagent doctor --fix` removes those inactive generated entries and leaves
manual allowlist rules unchanged. Rerun affected workflows and choose
**Always allow here** to renew trust for the intended directory. The normal
`openagent update` finalization runs this safe repair automatically.

Explicit repair stops the matching managed Gateway and checks Gateway, state,
and agent-database ownership before taking read-only schema snapshots. It
excludes other processes during repair, verifies readiness,
and restarts the same service once. It preserves the service definition and does
not activate a service confirmed offline before maintenance. On Linux, it also
restores a previously running service if systemd unloads the stopped unit during
repair; a changed service definition or manager still blocks restart. A loaded, enabled
macOS job between respawns is not offline: Doctor stops it before repair and
resumes it afterward. Run repair from a shell outside the Gateway process tree. For externally supervised or unmatched installations, stop
and start the Gateway through its owning supervisor.

During [automatic triage](/cli/triage#automatic-failure-handoff), repair can run
against an offline target when schema and maintenance locks permit it. If repair
needs to stop the managed Gateway, Doctor refuses inside its automatic fixing
subtree because that stop would cancel recovery. Use read-only diagnosis or safe
offline artifact repair followed by an atomic `openagent gateway restart`, or ask
an independent operator to run Doctor from a shell outside triage.

Read-only database snapshots and initial integrity scans have a 30-second
execution limit per database. A timeout names the database and asks you to stop
its Gateway service and other OpenAgent processes before retrying. If all writers
are stopped, inspect storage performance and the reported database; a timeout
does not prove corruption.

`openagent doctor --fix --non-interactive` applies the supported migrations that
block Gateway startup without prompting, including shared-state audit schema,
legacy workspace setup, legacy session stores, and exec approvals. Malformed or
conflicting input is retained and requires the manual action in the diagnostic.
The updater uses this repair path before accepting the installed target.

Update-time Doctor omits project-clone inspection, SQLite database-size advice,
active tool-schema warnings, and workspace backup and memory suggestions. These
diagnostics do not migrate state or establish restart readiness. Doctor names
the omitted checks in its output; run `openagent doctor` after the update to
inspect them. Update-time Doctor still runs required repairs and final session,
database, workspace-state, and exec-approval readiness checks. A successful
update does not mean the omitted diagnostics passed.

This maintenance window also applies when repair ultimately finds no changes.
Runs without `--fix`, `--repair`, or `--yes` do not enter maintenance.
Custom state directories remain runtime-only and do not adopt a native service.

`--force` alone does not select repair mode: `openagent doctor --force` remains
guided and still requires interactive consent before an eligible service rewrite.
With `--fix`, `--repair`, or `--yes`, it allows aggressive config/state repairs
but preserves the installed service definition. Force does not bypass service
ownership, write-access, or interactive-only confirmation requirements.

<Warning>
  `doctor --fix` follows explicitly configured workspace and store paths, including
  paths outside `OPENCLAW_STATE_DIR`. Setting `OPENCLAW_STATE_DIR` and
  `OPENCLAW_CONFIG_PATH` to a copy does not redirect those paths. Before rehearsing
  repairs on copied state, copy the external workspaces and stores too, then rewrite
  their paths in the copied config to point to the copies. Otherwise, Doctor can
  modify the originals.
</Warning>

When an updater supplies an explicit Gateway activation policy, Doctor leaves
stop and restart ownership with that updater. The native manager must confirm
the service is already offline before repair. If `openagent update --no-restart`
reaches Doctor while that service is running, repair fails without stopping or
restarting it; stop the service through its owner, then retry the update.

If service inspection is unavailable or an unmatched service can still run,
Doctor refuses maintenance before changing config or state. Inspect it with
`openagent gateway status --deep`, restore service-manager access, and stop the
service through its owner. Once the native manager confirms it is offline,
Doctor can repair its selected state without changing or starting that service.

If migration or config repair cannot finish, Doctor leaves the stopped service
stopped and reports an incomplete repair with exit code 1. When state requires
manual recovery, the diagnosis names its path and the next action:

- **Unsupported canonical workspace version:** use an OpenAgent build that supports
  that version. Preserve the shared database unchanged.
- **Unreadable or conflicting exec policy:** stop the Gateway and node hosts,
  then reconcile the named legacy file or interrupted claim with a verified copy
  of the intended policy. Preserve the existing SQLite policy.

Doctor does not quarantine unsupported workspace state, discard future-version
rows, or infer execution policy. Repeating the same repair invocation cannot
resolve these conditions. After manual recovery, verify readiness before starting
the service through its owner.

## Examples

```bash
openagent doctor
openagent doctor --lint
openagent doctor --json
openagent doctor --lint --json
openagent doctor --lint --severity-min warning
openagent doctor --lint --all
openagent doctor --lint --allow-exec
openagent doctor --deep
openagent doctor --fix
openagent doctor --fix --non-interactive
openagent doctor --generate-gateway-token
openagent doctor --post-upgrade
openagent doctor --post-upgrade --json
openagent doctor --state-sqlite compact
openagent doctor --state-sqlite compact --json
openagent doctor --session-sqlite inspect --session-sqlite-all-agents
openagent doctor --session-sqlite dry-run --session-sqlite-agent main --json
openagent doctor --session-sqlite import --session-sqlite-all-agents
openagent doctor --session-sqlite validate --session-sqlite-all-agents --json
openagent doctor --session-sqlite compact --session-sqlite-all-agents
openagent doctor --session-sqlite recover --github-issue
openagent doctor --session-sqlite restore --session-sqlite-all-agents
```

For channel-specific permissions, use the channel probes instead of `doctor`:

```bash
openagent channels capabilities --channel discord --target channel:<channel-id>
openagent channels status --probe
```

`channels capabilities` reports the bot's effective permissions for a specific channel target. `channels status --probe` audits all configured channels and voice auto-join targets.

## Options

| Option                          | Effect                                                                                                                                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--no-workspace-suggestions`    | Disable workspace memory/search suggestions.                                                                                                                                                                |
| `--yes`                         | Accept defaults and enter repair maintenance without prompting.                                                                                                                                             |
| `--repair` / `--fix`            | Apply recommended repairs while coordinating maintenance with the matching managed Gateway (`--fix` is an alias). Preserve the installed service definition; use explicit `gateway` commands to replace it. |
| `--force`                       | Allow aggressive repair choices. Alone, remains guided; with `--fix`, `--repair`, or `--yes`, preserves the installed service definition.                                                                   |
| `--non-interactive`             | Run without prompts; safe automatic migrations still apply. Combine with `--fix`, `--repair`, or `--yes` to enter repair maintenance.                                                                       |
| `--generate-gateway-token`      | Generate and configure a gateway token.                                                                                                                                                                     |
| `--allow-exec`                  | Allow doctor to execute configured `exec` SecretRefs while verifying secrets.                                                                                                                               |
| `--deep`                        | Scan system services for extra gateway installs; report recent Gateway supervisor restart handoffs.                                                                                                         |
| `--lint`                        | Run the [structured health checks](/cli/doctor/health-contract) in read-only mode and emit diagnostic findings.                                                                                             |
| `--post-upgrade`                | Run post-upgrade plugin compatibility probes; findings go to stdout; exit code 1 if any error-level finding is present.                                                                                     |
| `--state-sqlite <mode>`         | Run explicit shared state SQLite maintenance. The only mode is `compact`.                                                                                                                                   |
| `--session-sqlite <mode>`       | Run targeted session SQLite maintenance or legacy import: `inspect`, `dry-run`, `import`, `validate`, `compact`, `recover`, or `restore`.                                                                   |
| `--session-sqlite-store <path>` | With `--session-sqlite`: select a SQLite database or legacy `sessions.json` source, subject to the mode's [selection rules](/cli/doctor/sqlite-maintenance#session-sqlite-migration).                       |
| `--session-sqlite-agent <id>`   | With `--session-sqlite`: select one configured agent.                                                                                                                                                       |
| `--session-sqlite-all-agents`   | With `--session-sqlite`: select configured and discovered agent stores.                                                                                                                                     |
| `--github-issue`                | With `--session-sqlite recover`: prepare a sanitized openclaw/openclaw issue report; doctor creates it with `gh` after `--yes` or interactive confirmation.                                                 |
| `--json`                        | Emit read-only JSON. Bare `--json` is advisory; combine with `--lint` for threshold-based exit codes. With another machine mode, emit that mode's existing JSON report.                                     |
| `--severity-min <level>`        | With `--lint`: drop findings below `info`, `warning`, or `error`.                                                                                                                                           |
| `--all`                         | With `--lint`: run all registered checks, including opt-in checks excluded from the default set.                                                                                                            |
| `--skip <id>`                   | With `--lint`: skip a check id. Repeatable.                                                                                                                                                                 |
| `--only <id>`                   | With `--lint`: run only the given check id(s). Repeatable.                                                                                                                                                  |

`--severity-min`, `--all`, `--only`, and `--skip` are only accepted together with `--lint`. Bare `--json` uses the default read-only lint check selection but keeps Doctor's advisory exit behavior. Both read-only postures reject `--repair`, `--fix`, `--force`, `--yes`, and `--generate-gateway-token`. Explicit `--lint` also rejects `--session-sqlite` modes and their selectors, including `--github-issue`. Other machine modes can still use `--json` for their own output.
