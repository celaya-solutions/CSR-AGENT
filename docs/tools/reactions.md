---
summary: "Reaction tool semantics across all supported channels"
read_when:
  - Working on reactions in any channel
  - Understanding how emoji reactions differ across platforms
title: "Reactions"
---

The agent adds and removes emoji reactions with the `message` tool's `react`
action. Behavior varies by channel.

## How it works

```json
{
  "action": "react",
  "messageId": "msg-123",
  "emoji": "thumbsup"
}
```

- `emoji` is required when adding a reaction.
- Set `emoji` to an empty string (`""`) to remove the bot's reaction(s) on
  channels that support it.
- Set `remove: true` to remove one specific emoji (requires non-empty
  `emoji`).
- `emoji-list` is a separate `message` tool action, not a `react` parameter. It
  reports the emoji a channel will accept. What it returns and which
  per-channel action toggle enables it both vary by channel. See the channel
  pages under [Channels](/channels).
- On channels with status reactions, `trackToolCalls: true` on a reaction lets
  the runtime reuse that reacted message for the same turn's status lifecycle.
  Discord keeps the chosen reaction stable during work and signals actual
  failures, rather than cycling through tool-specific emoji.

## Channel behavior

<AccordionGroup>
  <Accordion title="Discord">
    - Empty `emoji` removes all of the bot's reactions on the message.
    - `remove: true` removes just the specified emoji.

  </Accordion>

  <Accordion title="Telegram">
    - Use `emoji-list` to find allowed standard reactions and numeric custom emoji identifiers. On Telegram, `channels.telegram.actions.reactions` gates both `react` and `emoji-list`, and `emoji-list` returns the reactions allowed in the current chat.
    - Empty `emoji` removes the bot's reactions.
    - `remove: true` also removes reactions but still requires a non-empty `emoji` for tool validation.

  </Accordion>

</AccordionGroup>

## Reaction level

Per-channel `reactionLevel` throttles how often the agent sends its own
reactions. Values: `off`, `ack`, `minimal`, or `extensive`.

- [Telegram reaction level](/channels/telegram#feature-reference) - `channels.telegram.reactionLevel` (default `minimal`)

## Related

- [Agent Send](/tools/agent-send) - the `message` tool that includes `react`
- [Channels](/channels) - channel-specific configuration
