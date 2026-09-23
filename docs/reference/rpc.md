---
summary: "Patterns for channel plugins that drive external CLIs over JSON-RPC"
read_when:
  - Adding or changing external CLI integrations
  - Debugging an RPC adapter in a channel plugin
title: "RPC adapters"
---

Channel plugins can integrate an external CLI over JSON-RPC instead of a
network API. None of the bundled channels (Discord, Telegram) use this; the
patterns below apply to third-party channel plugins.

## Pattern A: HTTP daemon

- The CLI runs as a daemon with JSON-RPC over HTTP.
- Events arrive on a stream such as SSE; a health endpoint supports probes.
- The plugin owns the daemon lifecycle when it manages the process.

## Pattern B: stdio child process

- The plugin spawns the CLI as a child process.
- JSON-RPC is line-delimited over stdin/stdout (one JSON object per line).
- No TCP port, no daemon required.

## Adapter guidelines

- Gateway owns the process (start/stop tied to provider lifecycle).
- Keep RPC clients resilient: timeouts, restart on exit.
- Prefer stable IDs (for example a chat id) over display strings.

## Related

- [Gateway protocol](/gateway/protocol)
