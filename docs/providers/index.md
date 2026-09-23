---
summary: "Model providers (LLMs) supported by OpenAgent"
read_when:
  - You want to choose a model provider
  - You need a quick overview of supported LLM backends
title: "Provider directory"
---

OpenAgent can use many LLM providers. Pick a provider, authenticate, then set the
default model as `provider/model`.

Looking for chat channel docs (WhatsApp/Telegram/Discord/Slack/Mattermost (plugin)/etc.)? See [Channels](/channels).

## Quick start

1. Authenticate with the provider (usually via `openclaw onboard`).
2. Set the default model:

```json5
{
  agents: { defaults: { model: { primary: "anthropic/claude-opus-4-6" } } },
}
```

## Provider docs

- [Anthropic (API + Claude CLI)](/providers/anthropic)
- [BytePlus (International)](/concepts/model-providers#byteplus-international)
- [llama.cpp (managed or existing server)](/plugins/llama-cpp)
- [Ollama (cloud + local models)](/providers/ollama)
- [Ollama Cloud](/providers/ollama-cloud)
- [OpenAI (API + Codex)](/providers/openai)
- [OpenRouter](/providers/openrouter)

## Shared overview pages

- [Additional provider variants](/providers/models#additional-provider-variants) - Anthropic Vertex, Copilot Proxy, and the optional Gemini CLI runtime
- [Image Generation](/tools/image-generation) - Shared `image_generate` tool, provider selection, and failover
- [Music Generation](/tools/music-generation) - Shared `music_generate` tool, provider selection, and failover
- [Video Generation](/tools/video-generation) - Shared `video_generate` tool, provider selection, and failover

## Transcription providers

- [OpenAI](/providers/openai)

## Community tools


For the full provider catalog (xAI, Groq, Mistral, etc.) and advanced configuration,
see [Model providers](/concepts/model-providers).
