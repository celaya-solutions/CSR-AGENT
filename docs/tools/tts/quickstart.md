---
summary: "Turn on text-to-speech, pick a provider, and send a first audio reply"
title: "Text-to-speech quickstart"
read_when:
  - You are enabling text-to-speech for the first time
  - You need the list of supported speech providers and their auth env vars
  - You want to confirm TTS works from chat
---

## Quick start

<Steps>
  <Step title="Pick a provider">
    OpenAI and OpenRouter are the bundled speech providers. See the
    [provider matrix](#supported-providers).
  </Step>
  <Step title="Set the API key">
    Export the env var for your provider (`OPENAI_API_KEY` or
    `OPENROUTER_API_KEY`).
  </Step>
  <Step title="Enable in config">
    Set `tts.auto: "always"` and `tts.provider`:

    ```json5
    {
      tts: {
        auto: "always",
        provider: "openai",
      },
    }
    ```

  </Step>
  <Step title="Try it in chat">
    `/tts status` shows the current state. `/tts audio Hello from OpenAgent`
    sends a one-off audio reply.
  </Step>
</Steps>

<Note>
Auto-TTS is **off** by default. When `tts.provider` is unset,
OpenAgent picks the first configured provider in registry auto-select order.
The built-in `tts` agent tool is explicit-intent only: ordinary chat stays
text unless the user asks for audio, uses `/tts`, or enables Auto-TTS/directive
speech.
</Note>

## Supported providers

| Provider       | Auth                                                                  | Notes                                                        |
| -------------- | --------------------------------------------------------------------- | ------------------------------------------------------------ |
| **OpenAI**     | `OPENAI_API_KEY`                                                      | Also used for auto-summary; supports persona `instructions`. |
| **OpenRouter** | `OPENROUTER_API_KEY` (can reuse `models.providers.openrouter.apiKey`) | Default model `hexgrad/kokoro-82m`.                          |

If multiple providers are configured, the selected one is used first and the
others are fallback options. Auto-summary uses `summaryModel` (or
`agents.defaults.model.primary`), so that provider must also be authenticated
if you keep summaries enabled.
