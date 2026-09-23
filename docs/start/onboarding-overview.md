---
summary: "Overview of OpenAgent onboarding options and flows"
read_when:
  - Choosing an onboarding path
  - Setting up a new environment
title: "Onboarding overview"
sidebarTitle: "Onboarding Overview"
---

OpenAgent onboards from the terminal with `openagent onboard`. Onboarding
establishes inference first: it detects existing AI access, requires a live
completion, and only then starts OpenAgent to configure the remaining setup.
The terminal flow also offers the full classic wizard for detailed setup. It
runs on macOS, Linux, and Windows (native or WSL2), against a local or remote
Gateway, and supports `--non-interactive` for scripts.

## What onboarding configures

The guided inference phase establishes only:

1. **Model provider and auth** — detected access or a verified provider sign-in,
   API key, or token
2. **Verified inference** — a real completion on the default agent's effective
   model

After that completion passes, OpenAgent can configure the workspace, Gateway,
Gateway service, channels, agents, plugins, and other optional features.

The classic CLI wizard can additionally configure:

1. **Channels** (optional) — built-in and bundled chat channels such as
   Discord and Telegram
2. **Advanced Gateway controls** — remote mode, network settings, and daemon choices

## CLI onboarding

Run in any terminal:

```bash
openagent onboard
```

On a fresh install the guided flow offers **Quick start** and **Custom setup**,
detects the AI access you already have, verifies your one chosen connection with
a real completion, and only then configures the rest of the setup. Both lanes,
the provider picker, **Skip for now**, and the foreground Gateway are described
step by step in [Onboarding (CLI)](/start/wizard#guided-default).

After inference passes, OpenAgent can hand channel setup to a masked terminal
wizard. It does not open guided or classic provider setup. Exit OpenAgent and
run `openagent onboard` to change the model provider or its authentication.

Use `openagent onboard --classic` for detailed model/auth, channel, skill,
remote Gateway, or import setup. Adding `--install-daemon` also selects the
classic flow and installs the background service in one step. Use `openclaw
setup` for conversational non-inference setup and repair. `openclaw
onboard --modern` is a compatibility alias that uses the same live-inference
gate.

Full reference: [Onboarding (CLI)](/start/wizard)
CLI command docs: [`openagent onboard`](/cli/onboard)

## Custom or unlisted providers

If your provider is not listed, run `openagent onboard` in a terminal on the
Gateway host, choose **Custom Provider** (under **More…** when shown), and enter:

- Endpoint compatibility: OpenAI-compatible (`/chat/completions`), OpenAI Responses-compatible (`/responses`), Anthropic-compatible (`/messages`), or unknown (probes all three and auto-detects)
- Base URL and API key (API key is optional if the endpoint does not require one)
- Model ID and optional model alias

Multiple custom endpoints can coexist — each gets its own endpoint ID. Guided
setup verifies a real model reply before saving the provider and activating its
model. A failed or cancelled check preserves the previous configuration. The
classic wizard also retains its custom-provider setup.

## Related

- [Getting started](/start/getting-started)
- [CLI setup reference](/start/wizard-cli-reference)
