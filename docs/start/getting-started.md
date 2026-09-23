---
summary: "Get OpenAgent installed and run your first chat in minutes."
read_when:
  - First time setup from zero
  - You want the fastest path to a working chat
title: "Getting started"
---

Install OpenAgent, run onboarding, and chat with your AI assistant in about 5
minutes. By the end you will have a running Gateway, configured auth, and a
working chat session.

## What you need

- **Node.js 24.16+ or 26.1+** (Node 26 is the recommended runtime)
- **An existing Claude Code or Codex CLI login, or a provider API key** — onboarding can reuse it

<Tip>
Check your Node version with `node --version`. You also need `git` and `pnpm`
(`corepack enable` selects the version the repository pins).
**Windows users:** run the Gateway natively or inside WSL2. See [Windows](/platforms/windows).
Need to install Node? See [Node setup](/install/node).
</Tip>

## Quick setup

<Steps>
  <Step title="Install OpenAgent">
    OpenAgent installs from source:

    ```bash
    git clone https://github.com/celaya-solutions/CSR-AGENT.git
    cd CSR-AGENT
    corepack enable
    pnpm install
    pnpm build
    pnpm ui:build
    ```

    <Note>
    Docker, Podman, and an optional global `openclaw` command: [Install](/install).
    The steps below write commands as `openclaw ...`; from inside the checkout,
    run them as `pnpm openclaw ...`.
    </Note>

  </Step>
  <Step title="Complete onboarding">
    Run `pnpm openclaw onboard` to start the guided onboarding wizard. Choose
    **Quick start** to reuse detected AI access and open the dashboard, or
    **Custom setup** for the full guided flow. Provider sign-in and optional
    setup can take longer. Return later with `openclaw configure` for
    additional settings. `openclaw onboard --classic` opens the classic
    step-by-step wizard instead.

    See [Onboarding (CLI)](/start/wizard) for the full reference.

  </Step>
  <Step title="Install the Gateway service">
    Quick start keeps the Gateway in the foreground of this terminal. The next
    steps need it running in the background. Press **Ctrl+C** to stop the
    foreground Gateway, then install the service:

    ```bash
    openclaw gateway install
    ```

    This installs a LaunchAgent on macOS, a systemd user unit on Linux and
    WSL2, or a Scheduled Task on native Windows (with a per-user
    Startup-folder login item as the fallback if task creation is denied).
    Your config stays saved across the stop and the install.

  </Step>
  <Step title="Verify the Gateway is running">
    ```bash
    openclaw gateway status
    ```

    You should see the Gateway listening on port 18789.

  </Step>
  <Step title="Open the dashboard">
    ```bash
    openclaw dashboard
    ```

    This opens the Control UI in your browser. If it loads, everything is working.

  </Step>
  <Step title="Send your first message">
    Type a message in the Control UI chat and you should get an AI reply.

    Want to chat from your phone instead? The fastest channel to set up is
    [Telegram](/channels/telegram) (just a bot token). See [Channels](/channels)
    for all options.

  </Step>
</Steps>

<Accordion title="Advanced: mount a custom Control UI build">
  If you maintain a localized or customized dashboard build, point
  `gateway.controlUi.root` to a directory that contains your built static
  assets and `index.html`.

```bash
mkdir -p "$HOME/.openclaw/control-ui-custom"
# Copy your built static files into that directory.
```

Then set:

```json
{
  "gateway": {
    "controlUi": {
      "enabled": true,
      "root": "${HOME}/.openclaw/control-ui-custom"
    }
  }
}
```

Restart the gateway and reopen the dashboard:

```bash
openclaw gateway restart
openclaw dashboard
```

</Accordion>

## If setup does not work

One command turns the current state of your install into a diagnosis you can act on:

```bash
openclaw triage
```

It runs read-only health checks, writes a sanitized prompt describing what it found, and then offers to hand that prompt to a coding agent it detects on your machine — Claude Code, Codex CLI, or the built-in OpenAgent agent — so the agent starts with the diagnosis already loaded. Pick "just print the commands" if you would rather run the handoff yourself.

Nothing leaves your machine until you choose an agent, and secrets, tokens, raw chat payloads, and raw logs are excluded from the prompt.

To read the findings yourself instead, run [`openclaw doctor`](/cli/doctor). For symptom-first routes, see [Troubleshooting](/help/troubleshooting).

## What to do next

<Columns>
  <Card title="Connect a channel" href="/channels" icon="message-square">
    Discord and Telegram.
  </Card>
  <Card title="Pairing and safety" href="/channels/pairing" icon="shield">
    Control who can message your agent.
  </Card>
  <Card title="Configure the Gateway" href="/gateway/configuration" icon="settings">
    Models, tools, sandbox, and advanced settings.
  </Card>
  <Card title="Browse tools" href="/tools" icon="wrench">
    Browser, exec, web search, skills, and plugins.
  </Card>
</Columns>

<Accordion title="Advanced: environment variables">
  If you run OpenAgent as a service account or want custom paths:

- `OPENCLAW_HOME` — home directory for internal path resolution
- `OPENCLAW_STATE_DIR` — override the state directory
- `OPENCLAW_CONFIG_PATH` — override the config file path

Full reference: [Environment variables](/help/environment).
</Accordion>

## Related

- [Install overview](/install)
- [Channels overview](/channels)
- [Setup](/start/setup)
- [Personal assistant setup](/start/openclaw) - end-to-end guide to a dedicated number that behaves like an always-on assistant
- [Triage](/cli/triage)
- [Troubleshooting](/help/troubleshooting)
