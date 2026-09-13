# @openclaw/acpx

Official ACP runtime backend for Zero to Agent.

ACPx lets Zero to Agent run external coding harnesses through the Agent Client Protocol while Zero to Agent still owns sessions, channels, delivery, permissions, and Gateway state.

## Install

```bash
openclaw plugins install @openclaw/acpx
```

Restart the Gateway after installing or updating the plugin.

## What it provides

- ACP-backed agent runtime sessions.
- Plugin-owned session and transport management.
- MCP bridge helpers for Zero to Agent tools and plugin tools.
- Static runtime assets used by the ACP process bridge.

## Configure

Use the ACP docs for harness-specific setup, permission modes, and model/runtime selection:

- https://docs.openclaw.ai/tools/acp-agents-setup
- https://docs.openclaw.ai/tools/acp-agents

## Package

- Plugin id: `acpx`
- Package: `@openclaw/acpx`
- Minimum Zero to Agent host: `2026.4.25`
