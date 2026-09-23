---
summary: "Channel configuration: access control, pairing, and per-channel keys for Discord and Telegram"
read_when:
  - Configuring a channel plugin (auth, access control, multi-account)
  - Troubleshooting per-channel config keys
  - Auditing DM policy, group policy, or mention gating
title: "Configuration — channels"
---

Per-channel configuration keys under `channels.*`: DM and group access, multi-account setups, mention gating, and per-channel keys for Discord and Telegram.

For agents, tools, gateway runtime, and other top-level keys, see [Configuration reference](/gateway/configuration-reference).

## Channels

Each channel starts automatically when its config section exists (unless `enabled: false`). Discord and Telegram both ship in this repository, and a source checkout loads them from `extensions/`. See [Channels](/channels).

## What each page covers

- [Configuration — shared channel policies](/gateway/config-channels/shared-policies) — DM and group access policies, `channels.modelByChannel`, `channels.defaults`, heartbeat visibility, and the shared multi-account pattern.
- [Configuration — Discord](/gateway/config-channels/community-chat) — `channels.discord` keys.
- [Configuration — Telegram](/gateway/config-channels/personal-messaging) — `channels.telegram` keys.
- [Configuration — group mention gating and history](/gateway/config-channels/mention-gating-and-history) — mention gating, visible reply modes, and DM history limits.
- [Configuration — chat commands](/gateway/config-channels/commands) — the `commands.*` block: command surfaces, bash and config gating, and owner allowlists.

## Where each section moved

Every heading this page used to publish keeps its anchor here, so an existing
link such as `/gateway/config-channels#telegram` still resolves. Each entry
points at the page that now holds the content.

- <a id="dm-and-group-access" />[DM and group access](/gateway/config-channels/shared-policies#dm-and-group-access)
- <a id="channel-model-overrides" />[Channel model overrides](/gateway/config-channels/shared-policies#channel-model-overrides)
- <a id="channel-defaults-and-heartbeat" />[Channel defaults and heartbeat](/gateway/config-channels/shared-policies#channel-defaults-and-heartbeat)
- <a id="multi-account-(all-channels)" /><a id="multi-account-all-channels" />[Multi-account (all channels)](/gateway/config-channels/shared-policies#multi-account-all-channels)
- <a id="telegram" />[Telegram](/gateway/config-channels/personal-messaging#telegram)
- <a id="discord" />[Discord](/gateway/config-channels/community-chat#discord)
- <a id="group-chat-mention-gating" />[Group chat mention gating](/gateway/config-channels/mention-gating-and-history#group-chat-mention-gating)
- <a id="dm-history-limits" />[DM history limits](/gateway/config-channels/mention-gating-and-history#dm-history-limits)
- <a id="commands-(chat-command-handling)" /><a id="commands-chat-command-handling" />[Commands (chat command handling)](/gateway/config-channels/commands#commands-chat-command-handling)
- <a id="command-details" />[Command details](/gateway/config-channels/commands#command-details)

---

## Related

- [Configuration reference](/gateway/configuration-reference) — top-level keys
- [Configuration — agents](/gateway/config-agents)
- [Channels overview](/channels)
