---
summary: "Platform support overview (Gateway + companion apps)"
read_when:
  - Looking for OS support or install paths
  - Deciding where to run the Gateway
title: "Platforms"
---

OpenAgent core is written in TypeScript. **Node is the primary, default, and
recommended runtime**. Bun 1.4+ builds with WAL-reset-safe `node:sqlite` can run
the CLI, Gateway, and managed node host as an explicit opt-in; see
[Bun](/install/bun).

Companion apps exist for Linux, Windows Hub, macOS (menu bar app), and mobile
nodes (iOS/Android). On Windows, choose Windows Hub for the desktop app, native
PowerShell install for terminal-first use, or WSL2 for the most
Linux-compatible Gateway runtime.

## Choose your OS

- Android: Android
- ChromeOS: ChromeOS (Crostini)
- iOS: iOS
- Linux: [Linux](/platforms/linux)
- macOS: macOS
- Omarchy: Omarchy
- Windows: [Windows](/platforms/windows)

## VPS and hosting

- VPS hub: [VPS hosting](/vps)
- Azure (Linux VM): Azure
- Daytona (cloud sandbox): Daytona
- EasyRunner (Podman + Caddy): EasyRunner
- exe.dev (VM + HTTPS proxy): exe.dev
- Fly.io: Fly.io
- GCP (Compute Engine): GCP
- Hetzner (Docker): Hetzner

## Common links

- Install guide: [Getting Started](/start/getting-started)
- Windows Hub: [Windows](/platforms/windows)
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
- [Windows Hub](/platforms/windows)
