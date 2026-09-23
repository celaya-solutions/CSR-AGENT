---
summary: "Updating an OpenAgent source checkout safely, plus rollback strategy"
read_when:
  - Updating OpenAgent
  - Something breaks after an update
title: "Updating"
---

Keep OpenAgent up to date.

For Docker and Podman image rebuilds, see
[Upgrading container images](/install/docker#upgrading-container-images). The
gateway runs startup-safe upgrade work before readiness and exits if mounted
state needs manual repair.

Before a significant update, [create a verified backup](#before-updating-create-a-verified-backup).
Automatic config copies and migration recovery originals are not a full-state
backup.

## Recommended: `openagent update`

OpenAgent installs from source, so an update moves your git checkout to newer
commits and rebuilds it. `openagent update` detects the git checkout, fetches
from the branch's upstream remote (usually `origin`), rebuilds, validates the
candidate while the old Gateway serves, then activates and verifies the update.

```bash
openagent update
openagent update --dry-run   # preview without applying
```

An already-current target still runs plugin maintenance and restarts a running
managed Gateway only when plugins change and `--no-restart` is not set;
unchanged runs finish as `skipped` / `already-current`.

Plugin maintenance does not fail an otherwise successful core update. If a plugin
cannot be updated, OpenAgent continues with the remaining plugins, keeps the previous
installation where possible, and prints a short next action. Individual plugin
outcomes remain available in `--json` output. Failures to build or install core,
repair required configuration or state, or start the updated Gateway remain
update failures.

Doctor lint, config and plugin planning, and a canary boot on copied state
finish before the service stops. The stopped interval contains the swap,
required migrations, plugin convergence, and service start. The final report
records downtime through convergence and final verification, plus verification
results. See [Validation and activation](/cli/update#validation-and-activation)
for the checks.

The canary uses a temporary loopback Gateway port and suppresses background
listeners, including the MCP Apps sandbox, browser control, and channel services.
This lets validation run while the serving Gateway keeps its configured ports.
The activated Gateway retains your normal listener settings.

On source installs, Doctor and plugin updates keep bundled plugins built with
the host checkout.

`openagent update` has no `--verbose` flag. For diagnostics use `--dry-run` to
preview planned actions, `--json` for structured results, or
`openagent update status --json` to inspect state.

### Manual source update

To update the checkout by hand, stop the Gateway from a shell outside it, then
pull, rebuild, and run Doctor:

```bash
openagent gateway stop
git pull
pnpm install
pnpm build
pnpm ui:build
openagent doctor --fix
openagent gateway start
```

Run each command only after the previous one succeeds.

### From chat

Ask the agent to update OpenAgent, or send `/update` from Discord or another
connected chat. Natural-language requests use the existing `gateway` tool's
`update.run` action. The minimal, coding, and messaging profiles expose that update
action without granting configuration reads or other Gateway controls. Explicit tool
restrictions still apply.

`/update` is the model-independent fallback: it works without a functioning model
or access to the `gateway` tool. The tool, slash command, and Control UI all use
the same Gateway update handler and current authorization checks.

The candidate validates while the old Gateway serves, and an already-current
update restarts it only when plugins change. Update runs can send these notices
in that chat as the Gateway observes the recorded milestones:

1. An acknowledgement when the update is accepted.
2. `⏳ Restarting the gateway now (v<from> → v<to>)…` when activation is recorded before the Gateway stops.
3. `🔁 Back on v<to>, verifying…` when the new Gateway starts verification.
4. The final report, including successful updates.

External update and restart notices go only to destinations listed in
`commands.ownerAllowFrom`. Selecting a non-owner chat in the Control UI does not
authorize notices to that contact. If no owner destination resolves, OpenAgent
logs the skipped notice and keeps the update outcome in the run record and
Control UI; it does not redirect the notice to another chat or wake the rejected
session with diagnostics.

Update lifecycle notices also honor the destination account's `actions.sendMessage`
policy. An explicit account setting overrides the channel default; when neither
sets the flag, notices are allowed. Disabled sends are recorded as skipped notices
without preventing the update or its Control UI report.

Managed systemd or launchd updates can stop the Gateway before an intermediate
notice is delivered. The complete four-message sequence is not guaranteed for
those installations; the durable run report remains available after reconnect.

Runs with an internal origin session, including Control UI and webchat, receive
these notices directly in that session's transcript. Passing only `sessionKey`
is enough; the caller does not need to supply `deliveryContext`.
Before stopping the managed service, the updater waits for the serving Gateway
to finish its restart notice attempt. That wait is capped at 10 seconds so a
stalled notice cannot block activation.

The report includes the outcome, recorded phase durations, failed steps,
verification facts, and the next action when needed. A run sends each notice
at most once; an update that stops before restart sends only the notices for
phases it reached. If the update cannot start, the bot records and explains why
and provides the manual command when available.
The agent relays the returned recovery instructions to the operator. Manual
update commands run in a terminal outside the Gateway service; the agent must
not execute them in the shell of the Gateway hosting its session. A missing
owner permission requires owner setup, and an externally supervised installation
uses its deployment owner's update workflow.

Chat, CLI, Control UI, and automatic updates share a durable run ID. Use
`openagent update status` to read the active or latest report, including after a
restart; `--json` exposes the `activeRun` and `lastRun` records. See
[Run history and reports](/cli/update#run-history-and-reports) for Gateway history
queries.

The sender must be in [`commands.ownerAllowFrom`](/tools/slash-commands#configuration).
Being allowed to chat does not grant owner permissions. If your account is not
an owner, the reply explains how the Gateway operator can connect it. Channel
setup and [pairing](/channels/pairing) distinguish owner access from chat access;
existing allowed users are not automatically promoted.
External-chat updates through `/update` or the tool require `commands.restart`
(enabled by default), including managed installations. The slash command also
follows command-access restrictions; tool calls follow tool policy. Chat updates use the hosting installation's
checkout.
Agents must never run a manual update or stop the Gateway service
from a chat shell; use `/update` or the update action so restart and notification
stay coordinated.

## Stale update history

Untouched, identityless legacy admissions older than 24 hours can
[expire automatically](/cli/update/status-and-history#run-history-and-reports)
during Gateway startup or a status check. The row is retained as `failed` with
reason `legacy-driver-expired` and retry advice; no explicit repair is needed
for that shape.

If update status stays in progress while the Gateway is healthy, check that no
update is still running. On the updated installation, run:

```bash
openagent update repair
openagent update status
```

For an inactive legacy row older than 30 minutes, repair verifies that the
running Gateway matches the installed version and build, then clears the stale
run without maintenance or a service restart. A new explicit `openagent update`
can also supersede a single stale identityless row. Recent rows and recorded
live drivers are protected. Identityless rows outside the legacy-expiry shape
require explicit recovery; the Control UI's configuration-write suspension clears
after reconciliation.

Repair started within the owning update can continue with a matching inherited
run ID and live process identity; the run records that continuation. Repair
still refuses an unrelated live or stalled updater. The error identifies its
run, phase, driver PID, host, start and last-activity ages, and observed liveness.
Wait for that update to finish, or stop the named driver on its host and rerun
repair after it exits. See [Update repair](/cli/update/repair-and-recovery#update-repair)
for maintenance and recovery behavior.

## Retire update recovery data

Once you have verified the update and your conversations, preview retained
migration originals:

```bash
openagent update cleanup --dry-run
```

Use the same profile and state/config overrides as the update, and check the
state directory printed in the report. The metadata-only preview can run while
the Gateway is active. To apply, stop that Gateway yourself, wait for other
SQLite maintenance to finish, and stop database readers such as session-listing
watchers. Keep them stopped until `openagent update cleanup` exits; read-only
connections can change WAL/SHM sidecars and invalidate verification. Cleanup never
stops or restarts the Gateway. Confirmation defaults to **No**; automation must
explicitly pass `--yes`, including when using `--json`.

Cleanup permanently gives up rollback to eligible originals, including repaired
branches and old provider metadata. Current SQLite history, operator backups,
and protected or unknown artifacts remain. It is not a substitute for a
[pre-update backup](#before-updating-create-a-verified-backup). See
[Update cleanup](/cli/update#update-cleanup) for eligibility, JSON output, and
resuming interrupted deletion.
Private package, command-shim, and Git runtime backups remain owned by the update
transaction and are outside this migration cleanup. An interrupted entry in update
history does not block cleanup of otherwise eligible migration archives.

## After updating

Successful managed `openagent update` runs already restart and verify the Gateway.
Use these steps after a manual installation or when checking a reported problem.

<Steps>

### Run doctor

```bash
openagent doctor
```

Migrates config, audits DM policies, and checks gateway health. Doctor also compares active plugins with the OpenAgent build the managed service will load after restart. Resolve any plugin restart-readiness warning before continuing. Details: [Doctor](/gateway/doctor)

### Restart the gateway

```bash
openagent gateway restart
```

### Verify

```bash
openagent health
```

</Steps>

<a id="rollback" />
<a id="roll-back-a-source-checkout" />
<a id="downgrading-across-the-session-sqlite-migration" />
<a id="restore-state-only-when-necessary" />
<a id="verify-the-rollback" />

## Detailed topics

<CardGroup cols={3}>
  <Card title="Other update methods" href="/install/updating/update-methods" icon="shuffle">
    Source-checkout servers and their reference update script.
  </Card>
  <Card title="Automatic updates" href="/install/updating/automatic-updates" icon="clock">
    The auto-updater, per-channel behavior, and update campaigns.
  </Card>
  <Card title="Rollback and recovery" href="/install/updating/rollback-and-recovery" icon="rotate-left">
    Downgrades, automatic rollback, pre-update backups, and triage.
  </Card>
</CardGroup>

- <a id="source-checkout-servers-(reference-script)" /><a id="source-checkout-servers-reference-script" />[Source-checkout servers (reference script)](/install/updating/update-methods#source-checkout-servers-reference-script)
- <a id="auto-updater" />[Auto-updater](/install/updating/automatic-updates#auto-updater)
  - <a id="update-campaigns" />[Update campaigns](/install/updating/automatic-updates#update-campaigns)
- <a id="downgrade" />[Downgrade](/install/updating/rollback-and-recovery#downgrade)
  - <a id="automatic-checkpoint-recovery" />[Full-state recovery requires a backup](/install/updating/rollback-and-recovery#automatic-checkpoint-recovery)
  - <a id="automatic-schema-neutral-rollback" />[Automatic schema-neutral rollback](/install/updating/rollback-and-recovery#automatic-schema-neutral-rollback)
  - <a id="before-updating%3A-create-a-verified-backup" /><a id="before-updating-create-a-verified-backup" />[Before updating: create a verified backup](/install/updating/rollback-and-recovery#before-updating-create-a-verified-backup)
- <a id="if-you-are-stuck" />[If you are stuck](/install/updating/rollback-and-recovery#if-you-are-stuck)
  - <a id="unattended-repair-on-your-own-inference" />[Unattended repair on your own inference](/install/updating/rollback-and-recovery#unattended-repair-on-your-own-inference)

## Related

- [Install overview](/install): all installation methods.
- [Doctor](/gateway/doctor): health checks after updates.
- [Migrating](/install/migrating): major version migration guides.
