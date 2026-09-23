---
summary: "FAQ: install, onboarding, first-run failures, builds, and subscription basics"
read_when:
  - New install, onboarding stuck, or first-run errors
  - Install or onboarding fails on macOS, Linux, Windows, or a Pi
title: "FAQ: quick start and first-run setup"
sidebarTitle: "Quick start and setup"
---

Install, onboarding, and early-failure Q&A. For provider auth, hardware, and
where to run the Gateway see
[FAQ: providers, hardware, and hosting](/help/faq-first-run/providers-and-hosting).

## Quick start and first-run setup

<AccordionGroup>
  <Accordion title="Recommended way to install and set up OpenAgent">
    OpenAgent installs from source only:

    ```bash
    git clone https://github.com/celaya-solutions/CSR-AGENT.git
    cd CSR-AGENT
    pnpm install
    pnpm build
    pnpm ui:build
    pnpm openclaw onboard
    ```

    When onboarding finishes, press **Ctrl+C** to stop the foreground Gateway
    and install the background service:

    ```bash
    pnpm openclaw gateway install
    ```

    Prefer the classic step-by-step wizard and a service install in one
    command? Run `pnpm openclaw onboard --install-daemon` instead. That flag
    selects the classic flow, so you do not see the guided **Quick start** and
    **Custom setup** choice.

    If Control UI assets are missing, onboarding tries to build them itself,
    falling back to `pnpm ui:build`. See [Install](/install) for an optional
    global `openclaw` command.

  </Accordion>

<a id="i-am-stuck" />

  <Accordion title="I am stuck, fastest way to get unstuck">
    Use a local AI agent that can **see your machine**. Most "I'm stuck" cases are
    **local config or environment issues** a remote helper cannot inspect.

    - **Claude Code**: [https://www.anthropic.com/claude-code/](https://www.anthropic.com/claude-code/)
    - **OpenAI Codex**: [https://openai.com/codex/](https://openai.com/codex/)

    Run the agent inside your source checkout so it can read code + docs and
    reason about the exact version you run.

    Ask the agent to plan and supervise the fix step-by-step, then execute only the
    necessary commands - smaller diffs are easier to audit.

    Share these outputs when asking for help:

    | Command | Shows |
    | --- | --- |
    | `openclaw status` | Gateway/agent health + basic config snapshot |
    | `openclaw status --all` | Full read-only diagnosis, pasteable |
    | `openclaw models status` | Provider auth + model availability |
    | `openclaw doctor` | Validates and repairs common config/state issues |
    | `openclaw logs --follow` | Live log tail |
    | `openclaw gateway status --deep` | Deep gateway/config/plugin health check |
    | `openclaw health --verbose` | Detailed health report |

    Quick debug loop: [First 60 seconds if something is broken](/help/faq#first-60-seconds-if-something-is-broken).
    Install docs: [Install](/install), [Updating](/install/updating).

  </Accordion>

  <Accordion title="How do I open the dashboard after onboarding?">
    Onboarding opens your browser to a clean (non-tokenized) dashboard URL right after
    setup and prints the link in the summary. Keep that tab open; if it did not launch,
    copy/paste the printed URL on the same machine.
  </Accordion>

  <Accordion title="How do I authenticate the dashboard on localhost vs remote?">
    **Localhost (same machine):**

    - Open `http://127.0.0.1:18789/`.
    - If it asks for shared-secret auth, paste the configured token or password into Control UI settings.
    - Token source: `gateway.auth.token` (or `OPENCLAW_GATEWAY_TOKEN`).
    - Password source: `gateway.auth.password` (or `OPENCLAW_GATEWAY_PASSWORD`).
    - No shared secret configured yet? Run `openclaw doctor --generate-gateway-token` (or `openclaw doctor --fix --generate-gateway-token`).

    **Not on localhost:**

    - **Tailscale Serve** (recommended): keep bind loopback, run `openclaw gateway --tailscale serve`, open `https://<magicdns>/`. With `gateway.auth.allowTailscale: true`, identity headers satisfy Control UI/WebSocket auth (no pasted shared secret, assumes a trusted gateway host); HTTP APIs still need shared-secret auth unless you deliberately use private-ingress `none` or trusted-proxy HTTP auth.
      Concurrent bad-auth Serve attempts from the same client are serialized before the failed-auth limiter records them, so a second bad retry can already show `retry later`.
    - **Identity-aware reverse proxy**: keep the Gateway behind a trusted proxy, set `gateway.auth.mode: "trusted-proxy"`, open the proxy URL. Same-host loopback proxies need explicit `gateway.auth.trustedProxy.allowLoopback: true`.
    - **SSH tunnel**: `ssh -N -L 18789:127.0.0.1:18789 user@gateway-host`, then open `http://127.0.0.1:18789/`. Shared-secret auth still applies over the tunnel; paste the configured token or password if prompted.

    See [Dashboard](/web/dashboard) and [Web surfaces](/web) for bind modes and auth details.

  </Accordion>

  <Accordion title="Heartbeat keeps skipping. What do the skip reasons mean?">
    | Skip reason | Meaning |
    | --- | --- |
    | `quiet-hours` | Outside the configured active-hours window |
    | `empty-heartbeat-file` | Heartbeat monitor scratch exists but only has blank, comment, header, fence, or empty-checklist scaffolding |
    | `alerts-disabled` | All heartbeat visibility is off (`showOk`, `showAlerts`, and `useIndicator` all disabled) |

    Older heartbeat `tasks:` blocks migrate to independently scheduled cron jobs with `openclaw doctor --fix`.

    Docs: [Heartbeat](/gateway/heartbeat), [Automation](/automation).

  </Accordion>

  <Accordion title="Why are there two exec approval configs for chat approvals?">
    They control different layers:

    - `approvals.exec` - forwards approval prompts to chat destinations.
    - `channels.<channel>.execApprovals` - makes that channel a native approval client for exec approvals.

    The host exec policy is still the real approval gate; chat config only controls where
    prompts appear and how people answer them.

    You rarely need both:

    - If the chat already supports commands and replies, same-chat `/approve` works through the shared path.
    - For supported native clients, set `channels.<channel>.execApprovals.enabled: "auto"` or `true` and configure approvers or the channel's supported owner identity. Discord and Slack require explicit enablement; Telegram treats unset as `"auto"`.
    - When native approval cards/buttons are available, that UI is primary; only mention a manual `/approve` command if the tool result says chat approvals are unavailable.
    - Use `approvals.exec` only when prompts must also reach other chats or explicit ops rooms.
    - Use `channels.<channel>.execApprovals.target: "channel"` or `"both"` only when you want approval prompts posted back into the originating room/topic.
    - Plugin approvals are separate: same-chat `/approve` by default, optional `approvals.plugin` forwarding, and only some native channels keep native handling for those too.

    Short version: forwarding is for routing, native client config is for richer channel-specific UX.
    See [Exec Approvals](/tools/exec-approvals).

  </Accordion>

  <Accordion title="What runtime do I need?">
    Node **24.16+** or **26.1+** is the primary and default runtime (Node 26 recommended); see
    [Node.js](/install/node) for the maintained requirement. `pnpm` is the repo package manager.
    Bun 1.4+ builds with WAL-reset-safe `node:sqlite` can run the CLI, Gateway, and managed node host as an explicit opt-in.
  </Accordion>

  <Accordion title="Does it run on Raspberry Pi?">
    Yes, but check RAM first: Pi 5 and Pi 4 (2 GB+) are the sweet spot; Pi 3B+ (1 GB) works but is slow; Pi Zero 2 W (512 MB) is not recommended.

    | Model | RAM | Fit |
    | --- | --- | --- |
    | Pi 5 | 4/8 GB | Best |
    | Pi 4 | 4 GB | Good |
    | Pi 4 | 2 GB | OK, add swap |
    | Pi 4 | 1 GB | Tight |
    | Pi 3B+ | 1 GB | Slow |
    | Pi Zero 2 W | 512 MB | Not recommended |

    Absolute minimum: 1 GB RAM, 1 core, 500 MB free disk, 64-bit OS. Since the Pi only runs
    the Gateway (models call out to cloud APIs), even a modest Pi handles the load.

    A small Pi/VPS can also host just the Gateway while you pair headless
    **nodes** on other machines for command execution. See [Nodes](/nodes).

  </Accordion>

  <Accordion title="Any tips for Raspberry Pi installs?">
    - Use a **64-bit** OS; do not use 32-bit Raspberry Pi OS.
    - Add swap on 2 GB or smaller boards.
    - Prefer a **USB SSD** over an SD card for performance and longevity.
    - Start without channels/skills, add them one by one.
    - Weird binary failures ("exec format error") are usually a missing ARM64 build for an optional skill tool.

    Also see [Linux](/platforms/linux).

  </Accordion>

  <Accordion title="It is stuck on wake up my friend / onboarding will not hatch. What now?">
    That screen depends on the Gateway being reachable and authenticated. The TUI also sends
    "Wake up, my friend!" automatically on first hatch when a model provider is configured. If
    you skipped model/auth setup, onboarding shows a "Model auth missing" note and opens the
    TUI without sending anything — add a provider by running `openclaw onboard` again.
    That is the one command for changing the model provider or its authentication.
    If you see the wake-up line with **no reply** and tokens stay at 0, the agent never ran.

    1. Restart the Gateway:

    ```bash
    openclaw gateway restart
    ```

    2. Check status + auth:

    ```bash
    openclaw status
    openclaw models status
    openclaw logs --follow
    ```

    3. Still hanging? Run:

    ```bash
    openclaw doctor
    ```

    If the Gateway is remote, confirm the tunnel/Tailscale connection is up and the UI
    points at the right Gateway. See [Remote access](/gateway/remote).

  </Accordion>

  <Accordion title="Can I migrate my setup to a new machine without redoing onboarding?">
    Yes. Copy the **state directory** and **workspace**, then run Doctor once:

    1. Install OpenAgent on the new machine.
    2. Copy `$OPENCLAW_STATE_DIR` (default: `~/.openclaw`) from the old machine.
    3. Copy your workspace (default: `~/.openclaw/workspace`).
    4. Run `openclaw doctor` and restart the Gateway service.

    This preserves config, auth profiles, channel credentials, sessions, and memory - it keeps
    your bot exactly the same, as long as you copy **both** locations. In remote mode, the
    gateway host owns the session store and workspace.

    **Important:** if you only commit/push your workspace to GitHub, you back up
    **memory + bootstrap files**, but not session history or auth. Those live under
    `~/.openclaw/` (for example `~/.openclaw/agents/<agentId>/agent/openclaw-agent.sqlite`).

    Related: [Migrating](/install/migrating), [Where things live on disk](/help/faq#where-things-live-on-disk),
    [Agent workspace](/concepts/agent-workspace), [Doctor](/gateway/doctor),
    [Remote mode](/gateway/remote).

  </Accordion>

  <Accordion title="Where do I see what is new in the latest version?">
    Read `CHANGELOG.md` in your source checkout, or run `git log` there to see the
    commits since your last update.
  </Accordion>

  <Accordion title="How do I try the latest bits?">
    Pull and rebuild your checkout, or let the updater do it:

    ```bash
    openclaw update
    ```

    Docs: [Update](/cli/update), [Updating](/install/updating).

  </Accordion>

  <Accordion title="How long does install and onboarding usually take?">
    Rough guide:

    - **Install from source:** a few minutes for `pnpm install` and the build.
    - **QuickStart onboarding:** a few minutes (loopback gateway, auto token, default workspace).
    - **Advanced/full onboarding:** longer when provider sign-in, channel pairing, daemon install, network downloads, or skills need extra setup.

    The wizard shows this timeline up front. Skip optional steps and return later with
    `openclaw configure`.

    Hanging? See [I am stuck](#i-am-stuck) above.

  </Accordion>

  <Accordion title="Windows install says git not found or openclaw not recognized">
    Two common Windows issues:

    **1) git not found**

    - Install **Git for Windows**, make sure `git` is on PATH.
    - Close and reopen PowerShell, then retry the clone and install.

    **2) openclaw is not recognized after install**

    - Run `pnpm openclaw ...` from inside the checkout, or link a global command
      with `pnpm add --global "openclaw@link:$PWD"`.
    - If the linked command is still missing, run `pnpm setup` so pnpm's global
      bin folder is on PATH, then close and reopen PowerShell.

    Native PowerShell and WSL2 Gateway paths are both supported. Docs: [Windows](/platforms/windows).

  </Accordion>

  <Accordion title="Windows exec output shows garbled Chinese text - what should I do?">
    Usually a console code page mismatch on native Windows shells.

    Symptoms: `system.run`/`exec` output renders Chinese as mojibake; the same command
    looks fine in another terminal profile.

    Workaround in PowerShell:

    ```powershell
    chcp 65001
    [Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
    [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    ```

    Then restart the Gateway and retry:

    ```powershell
    openclaw gateway restart
    ```

  </Accordion>

  <Accordion title="The docs did not answer my question - how do I get a better answer?">
    Your source checkout has the full source and docs locally. Ask your bot (or
    Claude/Codex) **from that folder** so it can read the repo and answer precisely.

    More detail: [Install](/install).

  </Accordion>

  <Accordion title="How do I install OpenAgent on Linux?">
    - Linux quick path + service install: [Linux](/platforms/linux).
    - Full walkthrough: [Getting Started](/start/getting-started).
    - Updates: [Updating](/install/updating).

  </Accordion>

  <Accordion title="How do I install OpenAgent on a VPS?">
    Any Linux VPS works. Install from source on the server, then reach the Gateway
    over SSH/Tailscale. Guide: [Linux server](/vps).
    Remote access: [Gateway remote](/gateway/remote).

  </Accordion>

  <Accordion title="Where are the cloud/VPS install guides?">
    See [Linux server](/vps) and [Docker VM runtime](/install/docker-vm-runtime).

    In the cloud, the **Gateway runs on the server** and you access it from your laptop/phone
    via the Control UI (or Tailscale/SSH). Your state + workspace live on the server, so
    treat the host as the source of truth and back it up.

    Pair headless **nodes** to that cloud Gateway for command execution on your
    laptop while the Gateway stays in the cloud.

    Hub: [Platforms](/platforms). Remote access: [Gateway remote](/gateway/remote).
    Nodes: [Nodes](/nodes), [Nodes CLI](/cli/nodes).

  </Accordion>

  <Accordion title="Can I ask OpenAgent to update itself?">
    Possible, not recommended. The update flow can restart the Gateway (dropping the
    active session), may need a clean git checkout, and can prompt for confirmation.
    Safer to run updates from a shell as the operator.

    ```bash
    openclaw update
    openclaw update status
    openclaw update --no-restart
    ```

    Automating from an agent:

    ```bash
    openclaw update --yes --no-restart
    openclaw gateway restart
    ```

    Docs: [Update](/cli/update), [Updating](/install/updating).

  </Accordion>

  <Accordion title="What does onboarding actually do?">
    `openclaw onboard` is the recommended setup path. On a fresh local install it
    offers two lanes after a one-line pointer to the [security guide](/gateway/security):

    - **Quick start** detects the AI access you already have, waits for you to
      choose a connection, verifies that one choice with a real completion,
      prepares the agent workspace, and then starts the Gateway in the
      foreground and opens the browser dashboard. It uses the default agent
      name `main` and full access, and skips memory import and app
      recommendations. Choose **Skip for now** in the picker to prepare the
      local baseline and exit without starting the Gateway or AI chat.
    - **Custom setup** runs the same guided flow with the telemetry choice,
      agent name, access mode, and optional setup prompts kept as questions.

    Both lanes require an explicit provider choice before any live completion,
    provider installation, model selection, or credential write.

    The classic step-by-step wizard is still available. Run
    `openclaw onboard --classic` for its Workspace, Model/Auth, Gateway,
    Channels, Web search, Skills, Daemon, and Health check steps. The step list
    is in [Onboarding (CLI)](/start/wizard#what-classic-onboarding-configures).

    Quick start is not offered for configured installs, remote Gateway chat
    setup, non-interactive runs, or runs with `--skip-ui` or `--tui`.
    Full breakdown: [Onboarding (CLI)](/start/wizard).

  </Accordion>

  <Accordion title="Do I need a Claude or OpenAI subscription to run this?">
    No. Run OpenAgent with **API keys** (Anthropic/OpenAI/others) or **local-only models**
    so your data stays on your device. Subscriptions (Claude Pro/Max, ChatGPT/Codex) are
    optional ways to authenticate those providers.

    For Anthropic: an **API key** gives standard pay-as-you-go billing; **Claude CLI**
    reuses an existing Claude Code login on the same host. Anthropic currently treats
    Claude CLI's non-interactive `claude -p` path as Agent SDK/programmatic usage that
    still draws from your subscription's plan limits - check current Anthropic billing
    docs before relying on subscription behavior. For long-lived gateway hosts and shared
    automation, an Anthropic API key is the more predictable choice.

    OpenAI Codex OAuth (ChatGPT/Codex subscription) is fully supported for agent models.

    Docs: [Anthropic](/providers/anthropic), [OpenAI](/providers/openai),
    [Local models](/gateway/local-models), [Models](/concepts/models).

  </Accordion>

  <Accordion title="Can I use Claude Max subscription without an API key?">
    Yes. OpenAgent supports Claude CLI reuse for Pro/Max/Team/Enterprise plans. Anthropic
    currently treats the `claude -p` path OpenAgent uses as subscription-plan usage subject
    to your plan's limits, not a separate free allowance - see
    [Anthropic](/providers/anthropic) for the current billing detail and links to
    Anthropic's own support articles. For the most predictable server-side setup, use an
    Anthropic API key instead.
  </Accordion>

  <Accordion title="Do you support Claude subscription auth (Claude Pro or Max)?">
    Yes, via Claude CLI reuse. Anthropic's billing treatment of `claude -p`/Agent SDK usage
    has changed over time; see [Anthropic](/providers/anthropic) for the current state and
    dated links to Anthropic's support articles before relying on specific billing
    behavior.

    Anthropic setup-token auth is also still a supported token path, but OpenAgent prefers
    Claude CLI reuse and `claude -p` when available. For production or multi-user
    workloads, an Anthropic API key remains the safer, more predictable choice. The other
    subscription-style option is [OpenAI](/providers/openai) Codex OAuth.

  </Accordion>

</AccordionGroup>
