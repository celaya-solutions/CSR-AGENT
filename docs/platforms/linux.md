---
summary: "Run the OpenAgent Gateway on Linux: install, systemd service, and OOM diagnostics"
read_when:
  - Running the Gateway on Linux
  - Planning platform coverage or contributions
  - Debugging Linux OOM kills or exit 137 on a VPS or container
title: "Linux"
---

The Gateway is fully supported on Linux. Node is the primary, default, and
recommended runtime; Bun 1.4+ builds with WAL-reset-safe `node:sqlite` can run
OpenAgent as an explicit opt-in. Use `pnpm` rather than Bun for dependency
installation.

## Install and connect

The CLI is the way to run OpenAgent on a Linux desktop, headless server, or VPS:

1. Install Node 26 (recommended), or another supported release: Node 24.16+ or Node 26.1+.
2. [Install OpenAgent from source](/install) and run `pnpm openclaw onboard --install-daemon` from the checkout.
3. On a remote host, tunnel from your laptop: `ssh -N -L 18789:127.0.0.1:18789 <user>@<host>`
4. Open `http://127.0.0.1:18789/` and authenticate with the configured shared
   secret (token by default; password if `gateway.auth.mode` is `"password"`).

Full server guide: [Linux Server](/vps). Optional: [Bun package workflow](/install/bun),
[Docker](/install/docker).

## Gateway service (systemd)

Install with one of:

```bash
openclaw onboard --install-daemon
openclaw gateway install
openclaw configure   # select "Gateway service" when prompted
```

Repair or migrate an existing install:

```bash
openclaw doctor
```

`openclaw gateway install` renders a systemd **user** unit by default. Full
service guidance, including the **system**-level unit variant for shared or
always-on hosts, lives in the [Gateway runbook](/gateway#supervision-and-service-lifecycle).

Write a unit by hand only for a custom setup. Minimal user-unit example
(`~/.config/systemd/user/openclaw-gateway[-<profile>].service`):

```ini
[Unit]
Description=OpenAgent Gateway (profile: <profile>)
After=network-online.target
Wants=network-online.target
StartLimitBurst=10
StartLimitIntervalSec=300

[Service]
ExecStart=/usr/local/bin/openclaw gateway --port 18789
Restart=always
RestartSec=5
RestartPreventExitStatus=78
TimeoutStopSec=330
TimeoutStartSec=30
SuccessExitStatus=0 143
OOMPolicy=continue
KillMode=mixed

[Install]
WantedBy=default.target
```

Hand-written units do not inherit the adaptive heap sizing that `openclaw gateway install` writes for managed Gateway services. Prefer the managed installer, or set an explicit heap limit in the custom supervisor after accounting for native-memory headroom.

`TimeoutStopSec=330` covers the Gateway's five-minute cooperative drain plus teardown reserve. To inspect the current managed unit body, run `systemctl --user cat openclaw-gateway.service` (or `systemctl --user cat openclaw-gateway-<profile>.service` for a named profile).

Enable it:

```bash
systemctl --user enable --now openclaw-gateway[-<profile>].service
```

## Memory pressure and OOM kills

On Linux, the kernel picks an OOM victim when a host, VM, or container cgroup
runs out of memory. The Gateway is a poor victim because it owns long-lived
sessions and channel connections, so OpenAgent biases transient child
processes to be killed first when possible.

For eligible Linux child spawns, OpenAgent wraps the command in a short
`/bin/sh` shim that attempts to raise the child's own `oom_score_adj` to
`1000`, then `exec`s the real command. This is unprivileged: a process may
always raise its own OOM score.

Covered child process surfaces:

- Supervisor-managed command children
- PTY shell children
- MCP stdio server children
- Managed local model and embedding service children
- OpenAgent-launched browser/Chrome processes (via the plugin SDK process runtime)

The wrapper is Linux-only and skipped when `/bin/sh` is unavailable, or when
the child env sets `OPENCLAW_CHILD_OOM_SCORE_ADJ` to `0`, `false`, `no`, or
`off`.
Use this opt-out only for controlled diagnosis: it removes child-first OOM
protection and makes the Gateway more likely to be selected as the victim under
real memory pressure.

Managed local model and embedding services fall back to direct spawn when their
effective environment defines `SHELLOPTS`, `BASHOPTS`, a `BASH_FUNC_*` key, or
a reserved `OC_INTERNAL_OOM_EXEC_{BASH_ENV,ENV,CDPATH,PS4}` carrier. Exact
environment fidelity and shell startup safety take precedence in these cases,
so OpenAgent does not attempt to change `oom_score_adj`; use the verification
below to check the child's effective value.

Verify a child process:

```bash
cat /proc/<child-pid>/oom_score_adj
```

When the write succeeds, the expected value for covered children is `1000`.
If `/proc` is unavailable or unwritable, the child still runs without the OOM
bias. The Gateway process itself keeps its normal score (usually `0`).

The systemd unit's `OOMPolicy=continue` keeps the Gateway service alive when
a transient child is selected by the OOM killer instead of marking the whole
unit failed and restarting all channels; the failed child/session reports its
own error.

This does not replace normal memory tuning. If a VPS or container repeatedly
kills children, raise the memory limit, reduce concurrency, or add stronger
resource controls (systemd `MemoryMax=`, container memory limits).

## Related

- [Install overview](/install)
- [Linux server](/vps)
- [Gateway runbook](/gateway)
- [Gateway configuration](/gateway/configuration)
