---
summary: "Windows support: native CLI and Gateway, WSL2 gateway setup, and troubleshooting"
read_when:
  - Installing OpenAgent on Windows
  - Choosing between native Windows and WSL2
title: "Windows"
---

OpenAgent runs on Windows from a source checkout. Run the CLI and Gateway
natively from PowerShell, or use WSL2 for the most Linux-compatible Gateway
runtime. There is no Windows companion app.

## Native Windows CLI and Gateway

Install Node, git, and pnpm, then [install OpenAgent from source](/install)
from PowerShell:

```powershell
git clone https://github.com/celaya-solutions/CSR-AGENT.git
cd CSR-AGENT
corepack enable
pnpm install
pnpm build
pnpm ui:build
pnpm add --global "openclaw@link:$PWD"
```

Verify:

```powershell
openclaw --version
openclaw doctor
openclaw gateway status --json
```

Managed startup uses Windows Scheduled Tasks when available. The task keeps
the readable `gateway.cmd` script in the OpenAgent state dir but launches it
through a generated `gateway.vbs` WScript wrapper, so the background Gateway
does not open a visible console window. If task creation is denied, OpenAgent
falls back to a per-user Startup-folder login item.

The hidden launcher owns the supervised Gateway process tree. Ending the task
with `schtasks /end /tn "OpenAgent Gateway"`, `Stop-ScheduledTask`, or Task
Scheduler's **End** action terminates the Gateway and its descendants. After
updating an older installation, run `openclaw gateway install --force` to
regenerate the launcher if the update did not refresh it.

Gateway status and Doctor read the Scheduled Task's numeric current state, independently of the Windows display language or console code page. A previous task exit result does not prove whether it is running now. Queued or unknown tasks do not count as safely stopped for Doctor maintenance. Stop a queued task through its service owner; if inspection is inaccessible, restore Task Scheduler inspection permissions before retrying.

During update preflight, the Scheduled Task runtime probe uses the update's `--timeout` budget for each attempt and retries once on timeout; if it still times out, the refusal reports the probe budget and keeps code unchanged.

Gateway startup creates private SQLite staging directories through Windows APIs,
without compiling C# or launching PowerShell for their permissions. The owner,
SYSTEM, and Administrators retain full access; other inherited access is removed
at creation. Update restart helpers also avoid runtime C# compilation and
`Invoke-Expression`. If antivirus software still interrupts a start, include its
detection name and the output of `openclaw gateway status --json` in your report.

Install the Gateway service:

```powershell
openclaw gateway install
openclaw gateway status --json
```

For CLI-only use without a managed Gateway service:

```powershell
openclaw onboard --non-interactive --accept-risk --skip-health
openclaw gateway run
```

## WSL2 Gateway

WSL2 remains the most Linux-compatible Gateway runtime on Windows. Install
inside your own distro:

```powershell
wsl --install
# Or pick a distro explicitly:
wsl --list --online
wsl --install -d Ubuntu-24.04
```

Enable systemd inside WSL:

```bash
sudo tee /etc/wsl.conf >/dev/null <<'EOF'
[boot]
systemd=true
EOF
```

Restart WSL from PowerShell:

```powershell
wsl --shutdown
```

Then install OpenAgent inside WSL [from source](/install), the same way as on
Linux, and check the Gateway:

```bash
openclaw gateway status
```

## Gateway auto-start before Windows login

For headless WSL setups, make sure the full boot chain runs even when no one
logs into Windows.

Inside WSL:

```bash
sudo apt-get install -y dbus-x11
sudo loginctl enable-linger "$(whoami)"
openclaw gateway install
```

In PowerShell as Administrator:

```powershell
schtasks /create /tn "WSL Boot" /tr "wsl.exe -d Ubuntu --exec dbus-launch true" /sc onstart /ru "$env:USERNAME"
```

Replace `Ubuntu` with your distro name from:

```powershell
wsl --list --verbose
```

<Note>
Two changes from older recipes:

- **`dbus-launch true` instead of `/bin/true`**: on WSL >= 2.6.1.0 a
  regression ([microsoft/WSL #13416](https://github.com/microsoft/WSL/issues/13416))
  idle-terminates the distro 15-20 seconds after the last client exits, even
  with linger enabled. `dbus-launch true` keeps a child-of-init process alive
  as a workaround (community discussion, [microsoft/WSL #9245](https://github.com/microsoft/WSL/discussions/9245)).
- **`/ru "$env:USERNAME"` instead of `/ru SYSTEM`**: per-user WSL distros (the
  default setup) are not visible to the SYSTEM account, so the task appears
  to run but the distro never starts. Running as your own account avoids
  this; Windows prompts for your password when the task is created.

</Note>

After reboot, verify from WSL:

```bash
systemctl --user is-enabled openclaw-gateway.service
systemctl --user status openclaw-gateway.service --no-pager
```

## Expose WSL services over LAN

WSL has its own virtual network. If another machine must reach a service
inside WSL, forward a Windows port to the current WSL IP. The WSL IP can
change after restarts, so refresh the forwarding rule when needed.

Example in PowerShell as Administrator:

```powershell
$Distro = "Ubuntu-24.04"
$ListenPort = 2222
$TargetPort = 22

$WslIp = (wsl -d $Distro -- hostname -I).Trim().Split(" ")[0]
if (-not $WslIp) { throw "WSL IP not found." }

netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=$ListenPort `
  connectaddress=$WslIp connectport=$TargetPort

New-NetFirewallRule -DisplayName "WSL SSH $ListenPort" -Direction Inbound `
  -Protocol TCP -LocalPort $ListenPort -Action Allow
```

Notes:

- SSH from another machine targets the Windows host IP, e.g. `ssh user@windows-host -p 2222`.
- Remote nodes must point at a reachable Gateway URL, not `127.0.0.1`.
- Use `listenaddress=0.0.0.0` for LAN access, `127.0.0.1` for local-only access.

## Troubleshooting

### The Scheduled Task stops before the Gateway is ready

Run `openclaw gateway status --json`, then inspect the local [Gateway log](/gateway/logging).
Entries from `gateway/task-supervisor` record the child exit code, signal, and
the last 8,192 characters of stderr, including failures before Gateway logging
starts. Child stdout is discarded. A failed child or supervisor exits nonzero;
an intentional clean stop still exits zero. A successful task result alone does
not prove the Gateway is healthy.

Task Scheduler's [`RestartOnFailure` policy](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-tsch/2ff4aa5a-7bc4-449f-bbb1-27475645867f)
retries failed start conditions or action launches. Do not rely on it to restart
a Gateway that launches successfully and then exits with an error, such as an
occupied port. Fix the logged cause, then run `openclaw gateway start`.

### Web chat cannot reach a remote Gateway

Remote web chat needs HTTPS or localhost. For self-signed certificates, trust
the certificate in Windows, or use an SSH tunnel to a localhost URL.

### Git or GitHub connectivity fails

Some networks block or throttle HTTPS to GitHub. If `git clone` or
`gh auth login` fails, try another network, a VPN, or an HTTP/HTTPS proxy.

For token-based `gh` auth in the current session:

```powershell
$env:GH_TOKEN="<your-token>"
gh auth status
gh auth setup-git
```

Never commit tokens or paste them into issues or pull requests.

## Related

- [Install overview](/install)
- [Node.js setup](/install/node)
- [Control UI](/web/control-ui)
- [Gateway configuration](/gateway/configuration)
