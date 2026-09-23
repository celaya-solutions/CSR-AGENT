---
summary: "Model providers (LLMs) supported by OpenAgent"
read_when:
  - You want to choose a model provider
  - You want quick setup examples for LLM auth + model selection
title: "Model provider quickstart"
---

Pick a provider, authenticate, then set the default model as `provider/model`.

## Quick start (two steps)

1. Authenticate with the provider (usually via `openclaw onboard`).
2. Set the default model:

```json5
{
  agents: { defaults: { model: { primary: "anthropic/claude-opus-4-6" } } },
}
```

## Supported providers

- [Anthropic (API + Claude CLI)](/providers/anthropic)
- [llama.cpp (managed or existing server)](/plugins/llama-cpp)
- [Ollama (cloud + local models)](/providers/ollama)
- [OpenAI (API + Codex)](/providers/openai)
- [OpenRouter](/providers/openrouter)

For advanced configuration, see [Provider directory](/providers/index) and
[Model providers](/concepts/model-providers).

<a id="additional-bundled-provider-variants" />
<a id="additional-provider-variants" />

## Related

- [Provider directory](/providers/index)
- [Model selection](/concepts/model-providers)
- [Model failover](/concepts/model-failover)
- [Models CLI](/cli/models)
