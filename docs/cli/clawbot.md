---
summary: "CLI reference for `openagent clawbot` (legacy alias namespace)"
read_when:
  - You maintain older scripts using `openagent clawbot ...`
  - You need migration guidance to current commands
title: "Clawbot"
---

# `openagent clawbot`

Legacy alias namespace kept for backward compatibility. It registers the same QR command as the top-level CLI, so `openagent clawbot qr` accepts every [`openagent qr`](/cli/qr) flag. No removal is scheduled; prefer the top-level commands in new scripts.

## Migration

Prefer the modern top-level command:

- `openagent clawbot qr` -> `openagent qr`

## Related

- [CLI reference](/cli)
