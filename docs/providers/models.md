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

## Supported providers (starter set)

- [Anthropic (API + Claude CLI)](/providers/anthropic)
- [BytePlus (International)](/concepts/model-providers#byteplus-international)
- [OpenAI (API + Codex)](/providers/openai)
- [OpenRouter](/providers/openrouter)

For the full provider catalog and advanced configuration, see
[Provider directory](/providers/index) and [Model providers](/concepts/model-providers).

<a id="additional-bundled-provider-variants" />

## Additional provider variants

- `anthropic-vertex` - install `@openclaw/anthropic-vertex-provider` for implicit Anthropic on Google Vertex support. That support applies when Vertex credentials are available. There is no separate onboarding auth choice.
- `copilot-proxy` - local VS Code Copilot Proxy bridge. Use `openclaw onboard --auth-choice copilot-proxy`.
- `google-gemini-cli` - optional explicit runtime for canonical `google/*` models. It requires a local `gemini` install and a supported Google AI Studio API-key profile. New Gemini CLI or Antigravity OAuth setup is not offered.

## Related

- [Provider directory](/providers/index)
- [Model selection](/concepts/model-providers)
- [Model failover](/concepts/model-failover)
- [Models CLI](/cli/models)
