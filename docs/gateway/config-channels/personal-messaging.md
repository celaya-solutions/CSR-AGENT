---
summary: "Per-channel config keys for Telegram"
read_when:
  - Configuring Telegram
  - Troubleshooting bot tokens, pairing, or media limits on Telegram
title: "Configuration — Telegram"
---

`channels.telegram` keys.

## Telegram

```json5
{
  channels: {
    telegram: {
      enabled: true,
      botToken: "your-bot-token",
      dmPolicy: "pairing",
      allowFrom: ["tg:123456789"],
      groups: {
        "*": { requireMention: true },
        "-1001234567890": {
          allowFrom: ["@admin"],
          systemPrompt: "Keep answers brief.",
          topics: {
            "99": {
              requireMention: false,
              skills: ["search"],
              systemPrompt: "Stay on topic.",
            },
          },
        },
      },
      customCommands: [
        { command: "backup", description: "Git backup" },
        { command: "generate", description: "Create an image" },
      ],
      historyLimit: 50,
      replyToMode: "first", // off | first | all | batched
      linkPreview: true,
      streaming: { mode: "partial" }, // off | partial | block | progress (default: partial)
      actions: { reactions: true, sendMessage: true },
      reactionNotifications: "own", // off | own | all
      mediaMaxMb: 100,
      network: {
        autoSelectFamily: true,
        dnsResultOrder: "ipv4first",
      },
      apiRoot: "https://api.telegram.org",
      trustedLocalFileRoots: ["/srv/telegram-bot-api-data"],
      proxy: "socks5://localhost:9050",
      webhookUrl: "https://example.com/telegram-webhook",
      webhookSecret: "secret",
      webhookPath: "/telegram-webhook",
    },
  },
}
```

- Bot token: `channels.telegram.botToken` or `channels.telegram.tokenFile` (regular file only; symlinks rejected), with `TELEGRAM_BOT_TOKEN` as fallback for the default account.
- `channels.telegram.joinIntro` defaults to `true`. When the bot joins an allowed group or supergroup, it posts one introduction using the group title, description, and available pinned message. The Telegram Bot API cannot read pre-join group history. Set this option to `false` to disable introductions, or use `channels.telegram.accounts.<accountId>.joinIntro` for an account-specific override. Introductions happen once per room; see [group join introductions](/channels#group-join-introductions). Introductions never run in private chats.
- `apiRoot` is the Telegram Bot API root only. Use `https://api.telegram.org` or your self-hosted/proxy root, not `https://api.telegram.org/bot<TOKEN>`; `openagent doctor --fix` removes an accidental trailing `/bot<TOKEN>` suffix.
- For a self-hosted Bot API server in `--local` mode, `trustedLocalFileRoots` lists host paths OpenAgent may read. Mount the server data volume on the OpenAgent host and configure either its data root or per-token directory; container paths under `/var/lib/telegram-bot-api` are mapped into those roots. Other absolute paths remain rejected.
- Optional `channels.telegram.defaultAccount` overrides default account selection when it matches a configured account id.
- In multi-account setups (2+ account ids), set an explicit default (`channels.telegram.defaultAccount` or `channels.telegram.accounts.default`) to avoid fallback routing; `openagent doctor` warns when this is missing or invalid.
- `configWrites: false` blocks Telegram-initiated config writes (supergroup ID migrations, `/config set|unset`).
- `actions.reactions` controls both message reactions and `emoji-list`, which lists the standard and custom reactions allowed in the current chat.
- Top-level `bindings[]` entries with `type: "acp"` configure persistent ACP bindings for forum topics (use canonical `chatId:topic:topicId` in `match.peer.id`). Field semantics are shared in [ACP Agents](/tools/acp-agents#persistent-channel-bindings).
- Telegram stream previews use `sendMessage` + `editMessageText` (works in direct and group chats).
- `network.dnsResultOrder` defaults to `"ipv4first"` to avoid common IPv6 fetch failures.
- Retry policy: see [Retry policy](/concepts/retry).
