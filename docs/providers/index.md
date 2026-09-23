---
summary: "Model providers (LLMs) supported by OpenAgent"
read_when:
  - You want to choose a model provider
  - You need a quick overview of supported LLM backends
title: "Provider directory"
---

OpenAgent ships with a small set of model provider plugins. Pick a provider,
authenticate, then set the default model as `provider/model`. Any other
OpenAI- or Anthropic-compatible endpoint can be added as a
[custom provider](/gateway/config-tools/custom-providers).

Looking for chat channel docs (Discord, Telegram)? See [Channels](/channels).

## Quick start

1. Authenticate with the provider (usually via `openagent onboard`).
2. Set the default model:

```json5
{
  agents: { defaults: { model: { primary: "anthropic/claude-opus-4-6" } } },
}
```

## Provider docs

- [Anthropic (API + Claude CLI)](/providers/anthropic)
- [llama.cpp (managed or existing server)](/plugins/llama-cpp)
- [Ollama (cloud + local models)](/providers/ollama)
- [Ollama Cloud](/providers/ollama-cloud)
- [OpenAI (API + Codex)](/providers/openai)
- [OpenRouter](/providers/openrouter)

## Shared overview pages

- [Image Generation](/tools/image-generation) - Shared `image_generate` tool, provider selection, and failover
- [Music Generation](/tools/music-generation) - Shared `music_generate` tool, provider selection, and failover
- [Video Generation](/tools/video-generation) - Shared `video_generate` tool, provider selection, and failover

## Transcription providers

- [OpenAI](/providers/openai)

For advanced configuration, see [Model providers](/concepts/model-providers).
