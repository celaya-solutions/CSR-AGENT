---
summary: "Platform support overview for the Gateway"
read_when:
  - Looking for OS support or install paths
  - Deciding where to run the Gateway
title: "Platforms"
---

OpenAgent core is written in TypeScript. **Node is the primary, default, and
recommended runtime**. Bun 1.4+ builds with WAL-reset-safe `node:sqlite` can run
the CLI, Gateway, and managed node host as an explicit opt-in; see
[Bun](/install/bun).

OpenAgent has no companion desktop or mobile apps. The Gateway, CLI, TUI, and
browser Control UI run on macOS, Linux, and Windows. On Windows, run the
Gateway natively from PowerShell or inside WSL2 for the most Linux-compatible
runtime.

## Choose your OS

- Linux: [Linux](/platforms/linux)
- macOS: [Install](/install) (from source)
- Windows: [Windows](/platforms/windows)

## VPS and hosting

- [Linux server](/vps)
- [Docker VM runtime](/install/docker-vm-runtime)

## Common links

- Install guide: [Getting Started](/start/getting-started)
- Gateway runbook: [Gateway](/gateway)
- Gateway configuration: [Configuration](/gateway/configuration)
- Service status: `openclaw gateway status`

## Gateway service install (CLI)

Use one of these (all supported):

- Wizard (recommended): `openclaw onboard --install-daemon`
- Direct: `openclaw gateway install`
- Configure flow: `openclaw configure` → select **Gateway service**
- Repair/migrate: `openclaw doctor` (offers to install or fix the service)

The service target depends on OS:

- macOS: LaunchAgent (`ai.openclaw.gateway`, or `ai.openclaw.<profile>` for a named profile)
- Linux/WSL2: systemd user service (`openclaw-gateway[-<profile>].service`)
- Native Windows: Scheduled Task (`OpenAgent Gateway` or `OpenAgent Gateway (<profile>)`), with a per-user Startup-folder login item fallback if task creation is denied

## Related

- [Install overview](/install)
- [Windows](/platforms/windows)
