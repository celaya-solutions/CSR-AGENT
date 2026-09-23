# @openclaw/acpx

Official ACP runtime backend for OpenAgent.

ACPx lets OpenAgent run external coding harnesses through the Agent Client Protocol while OpenAgent still owns sessions, channels, delivery, permissions, and Gateway state.

## Install

```bash
openagent plugins install @openclaw/acpx
```

Restart the Gateway after installing or updating the plugin.

## What it provides

- ACP-backed agent runtime sessions.
- Plugin-owned session and transport management.
- MCP bridge helpers for OpenAgent tools and plugin tools.
- Static runtime assets used by the ACP process bridge.

## Configure

The ACP agent guides in this repository's `docs/tools/` folder
(`acp-agents-setup.md` and `acp-agents.md`) cover harness-specific setup,
permission modes, and model/runtime selection.

## Package

- Plugin id: `acpx`
- Package: `@openclaw/acpx`
- Minimum OpenAgent host: `2026.4.25`
