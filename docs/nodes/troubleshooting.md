---
summary: "Troubleshoot node pairing, permissions, and tool failures"
read_when:
  - Node is connected but exec or computer tools fail
  - You need the node pairing versus approvals mental model
title: "Node troubleshooting"
---

Use this page when a node is visible in status but node tools fail.

## Node goes offline after SSH logout (Linux)

On Linux, `openclaw node install` creates a **user-level** systemd service. The
`systemd --user` instance is torn down when your last login session ends, so the
node service stops the moment you log out — even though it looked healthy
(`enabled` + `running`) while you were connected.

Check lingering:

```bash
loginctl show-user "$USER" -p Linger
```

If it reads `Linger=no`, enable it (may require sudo):

```bash
sudo loginctl enable-linger "$USER"
```

Then restart the node service and verify it survives logout:

```bash
openclaw node restart
# log out, then from another machine:
openclaw nodes status
```

`openclaw node install` prints a warning with this recovery command when it
detects lingering is disabled. Don't mix a user-level service with a
system-level one for the same node. The duplicate-scope guard that prevents
two managers from running the same unit name is enforced for gateway units
(two supervisors on the same port SIGTERM each other in a restart loop); for
node services the installer does not raise this guard, so a leftover unit in
the other scope can leave the node in an ambiguous state. Fully remove one
before switching.

## Command ladder

```bash
openclaw status
openclaw gateway status
openclaw logs --follow
openclaw doctor
openclaw channels status --probe
```

Then run node-specific checks:

```bash
openclaw nodes pending
openclaw nodes status
openclaw nodes describe --node <idOrNameOrIp>
openclaw approvals get --node <idOrNameOrIp>
```

Healthy signals:

- Node is connected and paired for role `node`.
- `nodes describe` includes the capability you're calling.
- Exec approvals show the expected mode/allowlist.

If startup preparation disables container session hosting that you enabled, check the node host's
local stderr for `node host worker hosting disabled: ...` and follow the reported
engine or context recovery guidance. After fixing the cause,
restart the node host. Explicitly disabled hosting produces no such diagnostic.

## Common node error codes

| Code                                   | Meaning                                                                                                                                                                                 |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `*_PERMISSION_REQUIRED`                | OS permission missing/denied.                                                                                                                                                           |
| `SYSTEM_RUN_DENIED: approval required` | Exec request needs explicit approval.                                                                                                                                                   |
| `SYSTEM_RUN_DENIED: allowlist miss`    | Command blocked by allowlist mode. On Windows node hosts, shell-wrapper forms like `cmd.exe /c ...` are treated as allowlist misses in allowlist mode unless approved via the ask flow. |

## Fast recovery loop

```bash
openclaw nodes status
openclaw nodes describe --node <idOrNameOrIp>
openclaw approvals get --node <idOrNameOrIp>
openclaw logs --follow
```

If still stuck:

- Re-approve device pairing.
- Restart or rerun a node paused for manual pairing, then approve its pending surface request with `openclaw nodes pending` / `openclaw nodes approve <nodeRequestId>`.
- Re-grant OS permissions.
- Recreate/adjust the exec approval policy.

For computer control, also verify that the node-local Computer Control toggle is enabled, its pairing update is approved, a vision-capable agent exposes the `computer` tool, and `screen.snapshot` succeeds with Screen Recording permission. A `gateway.nodes.commands.deny` entry always overrides a platform default or `gateway.nodes.commands.allow`.

## Related

- [Nodes overview](/nodes)
- [Computer use](/nodes/computer-use)
- [Exec approvals](/tools/exec-approvals)
- [Gateway pairing](/gateway/pairing)
- [Gateway troubleshooting](/gateway/troubleshooting)
- [Channel troubleshooting](/channels/troubleshooting)
