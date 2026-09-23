---
summary: "The tts config block, per-provider settings, and override precedence"
title: "Text-to-speech configuration"
read_when:
  - You are writing the tts block in openclaw.json
  - You need the config snippet for one speech provider
  - You need per-agent, per-channel, or per-account voice overrides
---

## Configuration

TTS config lives under `tts` in `~/.openclaw/openclaw.json`. Pick a
preset and adapt the provider block. The `speakerVoice`/`speakerVoiceId`
fields shown below are canonical; each provider's own `voice`/`voiceId`/
`voiceName` field names still work as legacy aliases.

OpenRouter uses the first nonblank value from `speakerVoice`,
`speakerVoiceId`, `voice`, and `voiceId`, in that order, before the provider default.
Talk applies the same order to its provider block; when all four fields are absent
or blank, it keeps the base TTS voice.

<Tabs>
  <Tab title="OpenAI">
```json5
{
  tts: {
    auto: "always",
    provider: "openai",
    summaryModel: "openai/gpt-4.1-mini",
    modelOverrides: { enabled: true },
    providers: {
      openai: {
        apiKey: "${OPENAI_API_KEY}",
        model: "gpt-4o-mini-tts",
        speakerVoice: "alloy",
      },
    },
  },
}
```
  </Tab>
  <Tab title="OpenRouter">
```json5
{
  tts: {
    auto: "always",
    provider: "openrouter",
    providers: {
      openrouter: {
        apiKey: "${OPENROUTER_API_KEY}",
        model: "hexgrad/kokoro-82m",
        speakerVoice: "af_alloy",
        responseFormat: "mp3",
      },
    },
  },
}
```
  </Tab>
</Tabs>

### Per-agent voice overrides

Use `agents.entries.*.tts` when one agent should speak with a different provider,
voice, model, persona, or auto-TTS mode. The agent block deep-merges over
`tts`, so provider credentials can stay in the global provider config:

```json5
{
  tts: {
    auto: "always",
    provider: "openai",
    providers: {
      openai: { apiKey: "${OPENAI_API_KEY}", model: "gpt-4o-mini-tts" },
    },
  },
  agents: {
    entries: {
      reader: {
        default: true,
        tts: {
          providers: {
            openai: { speakerVoice: "nova" },
          },
        },
      },
    },
  },
}
```

To pin a per-agent persona, set `agents.entries.*.tts.persona` alongside provider
config — it overrides the global `tts.persona` for that agent only.

Precedence order for automatic replies, `/tts audio`, `/tts status`, and the
`tts` agent tool. Later layers win: each layer deep-merges over the ones above
it, so the last layer that sets a field decides its value.

1. `tts`
2. active `agents.entries.*.tts`
3. channel override, when the channel supports `channels.<channel>.tts`
4. account override, when the channel passes `channels.<channel>.accounts.<id>.tts`
5. local `/tts` preferences for this host
6. inline `[[tts:...]]` directives when [model overrides](/tools/tts/commands#model-driven-directives) are enabled

Channel and account overrides use the same shape as `tts` and deep-merge over
the earlier layers. Neither bundled channel plugin reads `channels.<channel>.tts`
or account-level `tts`; Discord voice playback takes its own override under
`channels.discord.voice.tts`.
