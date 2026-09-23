---
summary: "Install OpenAgent from source, run it in Docker or Podman, and keep it updated"
read_when:
  - You need to install OpenAgent
  - You want to run the Gateway in a container or on a server
  - You need to update, migrate, or uninstall
title: "Install"
---

OpenAgent installs from source only. There is no hosted installer script,
published npm package, desktop app download, or prebuilt container image: you
clone the repository, build it, and run your own copy.

## System requirements

- **Node 24.16+ or 26.1+** - Node 26 is recommended (see [Node.js compatibility](/install/node-compatibility)).
- **pnpm** - the repository pins its own version in `package.json`; `corepack enable` selects it.
- **git**
- **macOS, Linux, or Windows** - on Windows, run the Gateway natively or inside WSL2. See [Windows](/platforms/windows).

## Install from source

```bash
git clone https://github.com/celaya-solutions/CSR-AGENT.git
cd CSR-AGENT
corepack enable
pnpm install
pnpm build
pnpm ui:build
```

The repository is a pnpm workspace; plain `npm install` at the root is not
supported. If Corepack is unavailable, install the pnpm version named in
`package.json` yourself, keeping install scripts and optional dependencies
enabled so pnpm can provision its native executable.

Then run onboarding and install the Gateway service:

```bash
pnpm openagent onboard --install-daemon
```

Always run the CLI through `pnpm openagent ...` (or `pnpm dev`) from inside the
checkout. These wrappers handle build freshness and process setup. See
[Setup](/start/setup) for development workflows.

### Optional: a global `openclaw` command

To call `openclaw` from any directory, link the CLI to your checkout:

```bash
pnpm add --global "openclaw@link:$PWD"
```

This links the CLI without changing its package files. If pnpm reports that
its global bin directory is not on `PATH`, run `pnpm setup`, reopen your shell,
and retry. The rest of these docs write commands as `openclaw ...`; inside the
checkout, `pnpm openagent ...` works the same way.

### Containers

<CardGroup cols={2}>
  <Card title="Docker" href="/install/docker" icon="container">
    Build the image from your checkout for containerized or headless deployments.
  </Card>
  <Card title="Podman" href="/install/podman" icon="container">
    Rootless container alternative to Docker.
  </Card>
  <Card title="Bun" href="/install/bun" icon="zap">
    Optional dependency installer and package-script runner.
  </Card>
</CardGroup>

## Verify the install

```bash
openagent --version      # confirm the CLI is available
openagent doctor         # check for config issues
openagent gateway status # verify the Gateway is running
```

If you want managed startup after install:

- macOS: LaunchAgent via `openagent onboard --install-daemon` or `openagent gateway install`
- Linux/WSL2: systemd user service via the same commands
- Native Windows: Scheduled Task first, with a per-user Startup-folder login item fallback if task creation is denied

## Next: run onboarding and connect a channel

<CardGroup cols={2}>
  <Card title="Getting started" href="/start/getting-started" icon="rocket">
    Run onboarding, install the Gateway service, and open the dashboard.
  </Card>
  <Card title="Connect a channel" href="/channels" icon="message-square">
    Message your agent from Discord or Telegram.
  </Card>
</CardGroup>

## Hosting and deployment

Run OpenAgent on a cloud server or VPS by building from source there, or by
building the Docker image from your checkout.

<CardGroup cols={2}>
  <Card title="Docker VM" href="/install/docker-vm-runtime">
    Shared Docker steps.
  </Card>
  <Card title="VPS" href="/vps">
    Run the Gateway on a Linux server.
  </Card>
</CardGroup>

## Back up, update, migrate, or uninstall

<CardGroup cols={3}>
  <Card title="Backups" href="/install/backups" icon="archive">
    Create, verify, and restore state archives.
  </Card>
  <Card title="Updating" href="/install/updating" icon="refresh-cw">
    Keep OpenAgent up to date.
  </Card>
  <Card title="Migrating" href="/install/migrating" icon="arrow-right">
    Move to a new machine.
  </Card>
  <Card title="Uninstall" href="/install/uninstall" icon="trash-2">
    Remove OpenAgent completely.
  </Card>
</CardGroup>

## Troubleshooting: `openclaw` not found

Use `pnpm openagent ...` from inside the checkout, or link a global command as
shown above. If the linked command is still missing, pnpm's global bin
directory is not on your shell's `PATH`. See
[Node.js troubleshooting](/install/node#troubleshooting).

```bash
node -v           # Node installed?
pnpm bin -g       # Where are global binaries?
echo "$PATH"      # Is the global bin dir in PATH?
```
