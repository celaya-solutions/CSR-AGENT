---
doc-schema-version: 1
summary: "Uninstall OpenAgent completely (CLI, service, state, workspace)"
read_when:
  - You want to remove OpenAgent from a machine
  - The gateway service is still running after uninstall
title: "Uninstall"
---

Remove the service and selected local data first, then [any remaining CLI install](#remove-the-cli). State deletion can also remove installation files nested inside that directory. Choose:

- **Easy path** if `openclaw` is still installed.
- **Manual service removal** if the CLI is gone but the service is still running.

## Easy path (CLI still installed)

The command attempts independent requested cleanup scopes and returns a nonzero status if any scope fails or is blocked. Service teardown remains the safety gate for state and workspace deletion; if that gate fails, those data scopes are preserved while app cleanup is still attempted. Partial cleanup is reported explicitly and is never followed by an unconditional completion result.

```bash
openagent uninstall
```

The interactive prompt preselects only the Gateway service. For complete local
removal, also select state, workspace, and app in the prompt, or run
`openagent uninstall --all`. State removal preserves configured workspace
directories unless you also select `--workspace`.

Preview what will be removed (safe):

```bash
openagent uninstall --dry-run --all
```

Non-interactive (automation). Use with caution and only after confirming scopes:

```bash
openagent uninstall --all --yes --non-interactive
```

Flags: `--service`, `--state`, `--workspace`, `--app` select individual scopes; `--all` selects all four.

Unlike `openagent uninstall --state`, manual state deletion does not preserve
workspaces. Stop and uninstall the service successfully before deleting files.
Before manual state or prefix deletion, move any configuration you want to keep outside that directory.

1. Stop the gateway service:

```bash
openagent gateway stop
```

2. Uninstall the gateway service (launchd/systemd/schtasks):

```bash
openagent gateway uninstall
```

3. Decide whether to preserve the workspace.

Move every configured workspace you want to keep, including `~/.openclaw/workspace`,
outside the state directory before manual deletion. Workspaces inside that directory
will otherwise be deleted with it; they need no separate deletion.

4. Delete state + config:

```bash
rm -rf "${OPENCLAW_STATE_DIR:-$HOME/.openclaw}"
```

If you set `OPENCLAW_CONFIG_PATH` to a custom location outside the state dir, delete that file too.
Restore preserved workspaces after recreating their parent, or configure their new paths on reinstall.

5. Delete an external workspace only if you want to remove its agent files too:

```bash
rm -rf /path/to/external/workspace
```

6. [Remove the CLI](#remove-the-cli) using the installation owner below.

- If you used profiles (`--profile` / `OPENCLAW_PROFILE`), repeat steps 3-4 for each state dir (defaults are `~/.openclaw-<profile>`).
- In remote mode, the state dir lives on the **gateway host**, so run steps 1-4 there too.

## Manual service removal (CLI not installed)

Use this if the gateway service keeps running but `openclaw` is missing.

### macOS (launchd)

Default label is `ai.openclaw.gateway` (or `ai.openclaw.<profile>` with a profile):

```bash
launchctl bootout gui/$UID/ai.openclaw.gateway
rm -f ~/Library/LaunchAgents/ai.openclaw.gateway.plist
```

If you used a profile, replace the label and plist name with `ai.openclaw.<profile>`.

### Linux (systemd user unit)

Default unit name is `openclaw-gateway.service` (or `openclaw-gateway-<profile>.service`). A pre-rename `clawdbot-gateway.service` unit may still exist on machines upgraded from very old installs; `openagent uninstall` / `openagent gateway uninstall` detects and removes it automatically.

```bash
systemctl --user disable --now openclaw-gateway.service
rm -f ~/.config/systemd/user/openclaw-gateway.service{,.bak}
systemctl --user daemon-reload
```

### Windows (Scheduled Task)

Default task name is `OpenAgent Gateway` (or `OpenAgent Gateway (<profile>)`).
The task launches a windowless `gateway.vbs` script under your state dir, which in turn
runs `gateway.cmd`; remove both.

```powershell
schtasks /Delete /F /TN "OpenAgent Gateway"
Remove-Item -Force "$env:USERPROFILE\.openclaw\gateway.cmd" -ErrorAction SilentlyContinue
Remove-Item -Force "$env:USERPROFILE\.openclaw\gateway.vbs" -ErrorAction SilentlyContinue
```

If you used a profile, delete the matching task name and the `gateway.cmd` /
`gateway.vbs` files under `~\.openclaw-<profile>`.

<a id="normal-install-vs-source-checkout" />
<a id="normal-install-(install.sh-%2F-npm-%2F-pnpm-%2F-bun)" />
<a id="normal-install-install-sh-/-npm-/-pnpm-/-bun" />
<a id="source-checkout-(git-clone)" />
<a id="source-checkout-git-clone" />

## Remove the CLI

Remove the Gateway service **before** deleting the checkout. Inspect the resolved command and its target first; if ownership is unclear, leave it in place.

1. If you linked a global command with `pnpm add --global "openclaw@link:$PWD"`, remove it with `pnpm remove --global openclaw`.
2. Remove the source checkout directory you cloned. Move any state, configuration, and workspaces you want to keep outside it first.

If completion was installed, remove only its `# OpenAgent Completion` block and OpenAgent source line from the [selected shell profile](/cli/completion#install-flow). Remove a legacy `openagent completion` source/eval line only if it contains no other command; preserve surrounding content.

Open a new shell and check `command -v openclaw` (PowerShell: `Get-Command openagent -ErrorAction SilentlyContinue`). If a command still resolves, inspect it: a second install or foreign wrapper may remain.

## Related

- [Install overview](/install)
- [Migration guide](/install/migrating)
- [`openagent uninstall`](/cli/uninstall) — command reference and flags
