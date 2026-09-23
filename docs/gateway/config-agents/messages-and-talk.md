---
summary: "messages.* delivery, prefixes, ack reactions, queueing, TTS, and talk.* defaults"
read_when:
  - Tuning reply prefixes, ack reactions, or the message queue
  - Configuring text-to-speech output
  - Setting Talk mode defaults
title: "Configuration — messages and talk"
---

`messages.*` delivery behaviour, text-to-speech, and the `talk.*` defaults for Talk mode.

## Messages

```json5
{
  messages: {
    responsePrefix: "🦞", // or "auto"
    ackReaction: "👀",
    ackReactionScope: "group-mentions", // group-mentions | group-all | direct | all | off | none
    queue: {
      mode: "steer", // steer (default) | followup | collect | interrupt
      cap: 20,
      drop: "summarize", // old | new | summarize (default)
      byChannel: {
        telegram: "followup",
        discord: "collect",
      },
    },
    inbound: {
      debounceMs: 2000, // 0 disables
      byChannel: {
        telegram: 5000,
        discord: 1500,
      },
    },
  },
}
```

### Response prefix

Per-channel/account overrides: `channels.<channel>.responsePrefix`, `channels.<channel>.accounts.<id>.responsePrefix`.

Resolution (most specific wins): account → channel → global. `""` disables and stops cascade. `"auto"` derives `[{identity.name}]`.

**Template variables:**

| Variable          | Description            | Example                     |
| ----------------- | ---------------------- | --------------------------- |
| `{model}`         | Short model name       | `claude-opus-4-6`           |
| `{modelFull}`     | Full model identifier  | `anthropic/claude-opus-4-6` |
| `{provider}`      | Provider name          | `anthropic`                 |
| `{thinkingLevel}` | Current thinking level | `high`, `low`, `off`        |
| `{identity.name}` | Agent identity name    | (same as `"auto"`)          |

Variables are case-insensitive. `{think}` is an alias for `{thinkingLevel}`.

### Ack reaction

- Defaults to active agent's `identity.emoji`, otherwise `"👀"`. Set `""` to disable.
- Per-channel overrides are supported by Discord and Telegram: `channels.<channel>.ackReaction`, `channels.<channel>.accounts.<id>.ackReaction`. For other channels that support acknowledgment reactions, use `messages.ackReaction` instead.
- Resolution order: account → channel → `messages.ackReaction` → identity fallback.
- Scope: `group-mentions` (default), `group-all`, `direct`, `all`, or `off`/`none` (disables ack reactions entirely).
- `group-mentions` acks group messages that mention the agent, including in groups with `requireMention: false`. Use `group-all` to ack every group message.
- `messages.statusReactions.enabled`: enables lifecycle status reactions on Discord and Telegram.
  On Discord, unset keeps status reactions enabled when ack reactions are active.
  On Telegram, set it explicitly to `true` to enable lifecycle status reactions.

### Queue

- `mode`: queue strategy for inbound messages that arrive while a session run is active. Default: `"steer"`.
  - `steer`: inject the new prompt into the active run.
  - `followup`: run the new prompt after the active run finishes.
  - `collect`: batch compatible messages and run them together later.
  - `interrupt`: abort the active run before starting the newest prompt.
- The queue uses a built-in 500ms debounce for steer, followup, and collect batching.
- `cap`: maximum queued messages before the drop policy applies. Default: `20`.
- `drop`: strategy when the cap is exceeded. `"summarize"` (default) drops oldest entries but keeps compact summaries; `"old"` drops oldest without summaries; `"new"` rejects the newest item.
- `byChannel`: per-channel `mode` overrides keyed by provider id.
- `debounceMsByChannel`: per-channel debounce overrides in milliseconds, keyed by provider id.

Use `messages.inbound.debounceMs` for the global pre-queue debounce window.

### Inbound debounce

Batches rapid text-only messages from the same sender into a single agent turn. Media/attachments flush immediately. Control commands bypass debouncing. Default `debounceMs`: `2000`.

### Other message keys

- `messages.visibleReplies`: controls visible source replies across direct, group, and channel conversations (`"message_tool"` requires `message(action=send)` for visible output; `"automatic"` posts normal replies as before).
- `messages.usageTemplate` / `messages.responseUsage`: custom `/usage` footer template and default per-reply usage mode (`off | tokens | full`, plus legacy `on` alias for `tokens`).
- `messages.groupChat.mentionPatterns` / `historyLimit`: group-message mention triggers and history window sizing.

### TTS (text-to-speech)

```json5
{
  tts: {
    auto: "off", // off (default) | always | inbound | tagged
    mode: "final", // final | all
    provider: "openai",
    summaryModel: "openai/gpt-5.4-mini",
    modelOverrides: { enabled: true },
    maxTextLength: 4000,
    timeoutMs: 30000,
    providers: {
      openai: {
        apiKey: "example-openai-api-key",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini-tts",
        speakerVoice: "coral",
      },
    },
  },
}
```

The global preferences path is machine state (default
`~/.openclaw/settings/tts.json`; override with `OPENCLAW_TTS_PREFS`). Advanced
multi-agent setups can set `agents.entries.<id>.tts.prefsPath` for distinct
per-agent preference stores.

- `auto` controls the default auto-TTS mode: `off`, `always`, `inbound`, or `tagged`. `/tts on|off` can override local prefs, and `/tts status` shows the effective state.
- `summaryModel` overrides `agents.defaults.model.primary` for auto-summary.
- `modelOverrides` is enabled by default (`enabled !== false`); `modelOverrides.allowProvider` is opt-in.
- API keys fall back to `OPENAI_API_KEY`.
- Bundled speech providers are plugin-owned (`openai`, `openrouter`). If `plugins.allow` is set, include each TTS provider plugin you want to use.
- `providers.openai.baseUrl` overrides the OpenAI TTS endpoint. Resolution order is config, then `OPENAI_TTS_BASE_URL`, then `https://api.openai.com/v1`.
- When `providers.openai.baseUrl` points to a non-OpenAI endpoint, OpenAgent treats it as an OpenAI-compatible TTS server and relaxes model/voice validation.

---

## Talk

Defaults for Talk mode in the browser Control UI.

```json5
{
  talk: {
    agentId: "ops",
    provider: "openai",
    providers: {
      openai: {
        speakerVoice: "coral",
      },
    },
    consultThinkingLevel: "low",
    consultFastMode: true,
    speechLocale: "ru-RU",
    silenceTimeoutMs: 1500,
    interruptOnSpeech: true,
    realtime: {
      provider: "openai",
      providers: {
        openai: {
          model: "gpt-realtime-2.1",
          speakerVoice: "cedar",
        },
      },
      instructions: "Speak warmly and keep answers brief.",
      mode: "realtime", // realtime | stt-tts | transcription
      transport: "webrtc", // webrtc | provider-websocket | gateway-relay | managed-room
      vadThreshold: 0.5,
      silenceDurationMs: 500,
      prefixPaddingMs: 300,
      reasoningEffort: "medium",
      brain: "agent-consult", // agent-consult | direct-tools | none
    },
  },
}
```

- `talk.provider` must match a key in `talk.providers` when multiple Talk providers are configured.
- `talk.agentId` owns Talk sessions created without an explicit agent-scoped session key. Session-scoped Talk calls continue to use the agent encoded in that key. Doctor may create a minimal `talk` block containing only this owner for an existing multi-agent config.
- Legacy flat Talk keys (`talk.voiceId`, `talk.voiceAliases`, `talk.modelId`, `talk.outputFormat`, `talk.apiKey`) are compatibility-only. Run `openclaw doctor --fix` to rewrite persisted config into `talk.providers.<provider>`.
- `providers.*.apiKey` accepts plaintext strings or SecretRef objects.
- `providers.*.voiceAliases` lets Talk directives use friendly names.
- `consultThinkingLevel` controls the thinking level for the full OpenAgent agent run behind Control UI Talk realtime `openclaw_agent_consult` calls. Leave unset to preserve normal session/model behavior.
- `consultFastMode` sets a one-shot fast-mode override for Control UI Talk realtime consults without changing the session's normal fast-mode setting.
- `speechLocale` sets the BCP 47 locale id used by native Talk speech recognition clients. Leave unset to use the device default.
- `silenceTimeoutMs` controls how long Talk mode waits after user silence before it sends the transcript. Unset keeps the client's default pause window.
- `realtime.instructions` appends provider-facing system instructions to OpenAgent's built-in realtime prompt, so voice style can be configured without losing default `openclaw_agent_consult` guidance.
- `realtime.vadThreshold` sets the provider voice-activity threshold from `0` (most sensitive) to `1` (least sensitive). Unset keeps the provider default.
- `realtime.silenceDurationMs` sets the positive whole-number silence window before the provider commits a realtime user turn. Unset keeps the provider default.
- `realtime.prefixPaddingMs` sets the non-negative whole-number amount of audio retained before detected speech begins. Unset keeps the provider default.
- `realtime.reasoningEffort` sets the provider-specific reasoning level for realtime sessions. Unset keeps the provider default.
- `realtime.consultRouting`: `"provider-direct"` (default) preserves direct provider replies when the realtime provider produces a final user transcript without `openclaw_agent_consult`. `"force-agent-consult"` routes the finalized request through OpenAgent instead.
