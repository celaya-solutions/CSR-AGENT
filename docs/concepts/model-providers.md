---
summary: "Index of the model provider reference: quick rules, Control UI and keys, bundled provider plugins, and custom providers"
read_when:
  - You need a provider-by-provider model setup reference
  - You want example configs or CLI onboarding commands for model providers
title: "Model providers"
sidebarTitle: "Model providers"
---

Reference for **LLM/model providers** (not chat channels like Discord/Telegram). For model selection rules, see [Models](/concepts/models).

This page is an index. The provider reference is documented on four pages, one
per reader job. Open the page that matches your task.

| Page                                                                              | Read it when                                                                                                        |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| [Quick rules](/concepts/model-providers/quick-rules)                              | You need model refs, CLI helpers, or the rules that decide your primary model and OpenAI runtime.                   |
| [Control UI and API keys](/concepts/model-providers/control-ui-and-keys)          | You are configuring providers from Settings -> Models, or setting up multiple API keys and rotation.                |
| [Official provider plugins](/concepts/model-providers/official-provider-plugins)  | You are setting up a bundled provider, or need its id, auth env, example model, and quirks.                         |
| [Custom providers and local runtimes](/concepts/model-providers/custom-providers) | You are configuring a provider through `models.providers`, a custom base URL, a proxy, or a local inference server. |

## Where each section moved

Every section heading from the previous single-page version keeps its anchor
here, so an existing link such as `/concepts/model-providers#ollama` still resolves.
Each entry points at the page that now holds the content.

- <a id="quick-rules" />[Quick rules](/concepts/model-providers/quick-rules#quick-rules)
- <a id="model-refs-and-cli-helpers" />[Model refs and CLI helpers](/concepts/model-providers/quick-rules#model-refs-and-cli-helpers)
- <a id="adding-provider-auth-does-not-change-your-primary-model" />[Adding provider auth does not change your primary model](/concepts/model-providers/quick-rules#adding-provider-auth-does-not-change-your-primary-model)
- <a id="openai-provider-runtime-split" />[OpenAI provider/runtime split](/concepts/model-providers/quick-rules#openai-provider-runtime-split)
- <a id="cli-runtimes" />[CLI runtimes](/concepts/model-providers/quick-rules#cli-runtimes)
- <a id="configure-providers-in-the-control-ui" />[Configure providers in the Control UI](/concepts/model-providers/control-ui-and-keys#configure-providers-in-the-control-ui)
- <a id="plugin-owned-provider-behavior" />[Plugin-owned provider behavior](/concepts/model-providers/control-ui-and-keys#plugin-owned-provider-behavior)
- <a id="api-key-rotation" />[API key rotation](/concepts/model-providers/control-ui-and-keys#api-key-rotation)
- <a id="key-sources-and-priority" />[Key sources and priority](/concepts/model-providers/control-ui-and-keys#key-sources-and-priority)
- <a id="when-rotation-kicks-in" />[When rotation kicks in](/concepts/model-providers/control-ui-and-keys#when-rotation-kicks-in)
- <a id="official-provider-plugins" />[Official provider plugins](/concepts/model-providers/official-provider-plugins#official-provider-plugins)
- <a id="openai" />[OpenAI](/concepts/model-providers/official-provider-plugins#openai)
- <a id="anthropic" />[Anthropic](/concepts/model-providers/official-provider-plugins#anthropic)
- <a id="openai-chatgpt%2Fcodex-oauth" /><a id="openai-chatgpt/codex-oauth" />[OpenAI ChatGPT/Codex OAuth](/concepts/model-providers/official-provider-plugins#openai-chatgpt/codex-oauth)
- <a id="other-bundled-provider-plugins" />[Other bundled provider plugins](/concepts/model-providers/official-provider-plugins#other-bundled-provider-plugins)
- <a id="quirks-worth-knowing" />[Quirks worth knowing](/concepts/model-providers/official-provider-plugins#quirks-worth-knowing)
- <a id="openrouter" />[OpenRouter](/concepts/model-providers/official-provider-plugins#openrouter)
- <a id="providers-via-models.providers-(custom%2Fbase-url)" /><a id="providers-via-models-providers-custom/base-url" />[Providers via `models.providers` (custom/base URL)](/concepts/model-providers/custom-providers#providers-via-models-providers-custom/base-url)
- <a id="llama.cpp" /><a id="llama-cpp" />[llama.cpp](/concepts/model-providers/custom-providers#llama-cpp)
- <a id="ollama" />[Ollama](/concepts/model-providers/custom-providers#ollama)
- <a id="local-proxies-(lm-studio%2C-vllm%2C-litellm%2C-etc.)" /><a id="local-proxies-lm-studio-vllm-litellm-etc" />[Local proxies (LM Studio, vLLM, LiteLLM, etc.)](/concepts/model-providers/custom-providers#local-proxies-lm-studio-vllm-litellm-etc)
- <a id="default-optional-fields" />[Default optional fields](/concepts/model-providers/custom-providers#default-optional-fields)
- <a id="proxy-route-shaping-rules" />[Proxy-route shaping rules](/concepts/model-providers/custom-providers#proxy-route-shaping-rules)

## CLI examples

```bash
openagent onboard --auth-choice openai-api-key
openagent models set openai/gpt-5.5
openagent models list
```

See also: [Configuration](/gateway/configuration) for full configuration examples.

## Related

- [Configuration reference](/gateway/config-agents#agent-defaults) - model config keys
- [Model failover](/concepts/model-failover) - fallback chains and retry behavior
- [Models](/concepts/models) - model configuration and aliases
- [Providers](/providers) - per-provider setup guides
- [Agent harness plugins](/plugins/sdk-agent-harness) - SDK surface for plugins that replace the embedded agent executor
- [`openagent models`](/cli/models) - list, select, and authenticate providers from the CLI
