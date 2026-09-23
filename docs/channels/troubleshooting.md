---
summary: "Fast channel level troubleshooting with per channel failure signatures and fixes"
read_when:
  - Channel transport says connected but replies fail
  - You need channel specific checks before deep provider docs
title: "Channel troubleshooting"
---

Use this page when a channel connects but behavior is wrong.

## Command ladder

Run these in order first:

```bash
openagent status
openagent gateway status
openagent logs --follow
openagent doctor
openagent channels status --probe
```

Healthy baseline:

- `Runtime: running`
- `Connectivity probe: ok`
- `Capability: read-only`, `write-capable`, or `admin-capable`
- Channel probe shows transport connected and, where supported, `works` or `audit ok`

## After an update

Use this when Telegram, Discord, or another plugin channel disappears
after updating.

```bash
openagent status --all
openagent doctor --fix
openagent gateway restart
openagent status --all
```

Look for `plugin load failed: dependency tree corrupted; run openagent doctor --fix` in `openclaw
status --all`. That means the channel is configured, but plugin setup/load hit a corrupted
dependency tree instead of registering the channel. `openagent doctor --fix` clears stale
plugin-runtime dependency symlinks and stale auth shadows, then `openagent gateway restart` reloads
clean state.

## Telegram

### Telegram failure signatures

| Symptom                              | Fastest check                                     | Fix                                                                                                                    |
| ------------------------------------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `/start` but no usable reply flow    | `openagent pairing list telegram`                 | Approve pairing or change DM policy.                                                                                   |
| Bot online but group stays silent    | Verify mention requirement and bot privacy mode   | Disable privacy mode for group visibility or mention bot.                                                              |
| Send failures with network errors    | Inspect logs for Telegram API call failures       | Fix DNS/IPv6/proxy routing to `api.telegram.org`.                                                                      |
| Startup reports `getMe returned 401` | Check configured token source                     | Re-copy or regenerate the BotFather token and update `botToken`, `tokenFile`, or default-account `TELEGRAM_BOT_TOKEN`. |
| Polling stalls or reconnects slowly  | `openagent logs --follow` for polling diagnostics | Upgrade; persistent stalls usually point to proxy/DNS/IPv6.                                                            |
| `setMyCommands` rejected at startup  | Inspect logs for `BOT_COMMANDS_TOO_MUCH`          | Reduce plugin/skill/custom Telegram commands or disable native menus.                                                  |
| Upgraded and allowlist blocks you    | `openagent security audit` and config allowlists  | Run `openagent doctor --fix` or replace `@username` with numeric sender IDs.                                           |

Full troubleshooting: [Telegram troubleshooting](/channels/telegram#troubleshooting)

## Discord

### Discord failure signatures

| Symptom                                                      | Fastest check                                                                                                                | Fix                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bot online but no guild replies                              | `openagent channels status --probe`                                                                                          | Allow guild/channel and verify message content intent.                                                                                                                                                                                                                |
| Group messages ignored                                       | Check logs for mention gating drops                                                                                          | Mention bot or set guild/channel `requireMention: false`.                                                                                                                                                                                                             |
| Typing/token usage but no Discord message                    | Check whether this is an ambient room event or an opted-in `message_tool` room where the model missed `message(action=send)` | Inspect the gateway verbose log for suppressed final payload metadata, verify `messages.groupChat.unmentionedInbound`, read [Ambient room events](/channels/ambient-room-events), or keep `messages.groupChat.visibleReplies: "automatic"` for normal group requests. |
| DM replies missing                                           | `openagent pairing list discord`                                                                                             | Approve DM pairing or adjust DM policy.                                                                                                                                                                                                                               |
| Bot silent in channels that used to work                     | Check whether the guild entry gained a `channels` map                                                                        | A channel map is an allowlist: unlisted channels are denied. Add a `"*"` wildcard entry. See [Guild channel maps are allowlists](/channels/discord#guild-channel-maps-are-allowlists).                                                                                |
| Agent cannot see room history or attachments from other bots | Check the room's `requireMention` and the account's `allowBots`                                                              | `requireMention: true` drops unmentioned messages before they become room events, so there is no backlog. Bot-authored messages and their attachments need `allowBots` (`"mentions"` is the safer setting). See [Ambient room events](/channels/ambient-room-events). |
| Agent watches an ambient room but never posts                | Check the agent's tool profile for the `message` tool                                                                        | Room events require `message(action=send)`, which the `minimal` and `coding` profiles omit. Grant `tools.alsoAllow: ["message"]` for that agent.                                                                                                                      |

Full troubleshooting: [Discord troubleshooting](/channels/discord/troubleshooting#troubleshooting)

## Gateway up but channel never connects

If the gateway process is healthy but a channel stays stopped after repeated
unclean boots, the [crash-loop breaker](/gateway/restart-recovery#safety-valves-and-observability)
may be suppressing channel auto-start. Use
`openagent gateway call channels.start --params '{"channel":"<id>"}'` to
override immediately, or leave the healthy gateway running. After the full
unclean-boot window drains, the same process rechecks the breaker and resumes
deferred channel auto-start.

## Related

- [Pairing](/channels/pairing)
- [Channel routing](/channels/channel-routing)
- [Gateway troubleshooting](/gateway/troubleshooting)
