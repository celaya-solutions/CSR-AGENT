---
summary: "Providers configured through models.providers: custom endpoints, base URLs, and local inference servers."
read_when:
  - You are configuring a provider through models.providers
  - You are pointing OpenAgent at a custom base URL or proxy
  - You are running llama.cpp, Ollama, or another local OpenAI-compatible server
title: "Custom providers and local runtimes"
---

## Providers via `models.providers` (custom/base URL)

Use `models.providers` (or `models.json`) to add **custom** providers or OpenAI/Anthropic-compatible proxies.

The bundled provider plugins already publish a default catalog. Use explicit `models.providers.<id>` entries only when you want to override the default base URL, headers, or model list.

Bundled and catalog-known routes take their `compat` capabilities from the owning provider plugin. A config `compat` block is for a custom provider/model or a different `api`/`baseUrl` route whose endpoint contract you have verified; see the [custom-provider capability guide](/gateway/config-tools#custom-provider-capability-declarations). Doctor removes legacy values that merely repeat the catalog and leaves divergent values visible for operator review.

Gateway model capability checks also read explicit `models.providers.<id>.models[]` metadata. If a custom or proxy model accepts images, set `input: ["text", "image"]` on that model so WebChat and node-origin attachment paths pass images as native model inputs instead of text-only media refs.

`agents.defaults.models["provider/model"]` controls aliases and per-model metadata for agents. It neither restricts overrides nor registers a new runtime model by itself. For custom provider models, also add `models.providers.<provider>.models[]` with at least the matching `id`; use `agents.defaults.modelPolicy.allow` separately when you want an override restriction.

### llama.cpp

The bundled `llama-cpp` plugin (in `extensions/llama-cpp`) provides one local text provider with two setup choices:

- **Managed local server** installs and supervises a verified llama-server and local GGUF files.
- **Existing llama-server** connects to a server that you operate and discovers its models.

Both use `llama-cpp/<model>` references. See [llama.cpp](/plugins/llama-cpp) for setup,
discovery, authentication, and managed local embeddings.

### Ollama

Ollama ships as a bundled provider plugin and uses Ollama's native API:

- Provider: `ollama`
- Auth: None required (local server)
- Example model: `ollama/llama3.3`
- Installation: [https://ollama.com/download](https://ollama.com/download)

```bash
# Install Ollama, then pull a model:
ollama pull llama3.3
```

```json5
{
  agents: {
    defaults: { model: { primary: "ollama/llama3.3" } },
  },
}
```

Ollama is detected locally at `http://127.0.0.1:11434` when you opt in with `OLLAMA_API_KEY`, and the bundled provider plugin adds Ollama directly to `openclaw onboard` and the model picker. See [/providers/ollama](/providers/ollama) for onboarding, cloud/local mode, and custom configuration.

### Local proxies (LM Studio, vLLM, LiteLLM, etc.)

Example (OpenAI-compatible):

```json5
{
  agents: {
    defaults: {
      model: { primary: "lmstudio/my-local-model" },
      models: { "lmstudio/my-local-model": { alias: "Local" } },
    },
  },
  models: {
    providers: {
      lmstudio: {
        baseUrl: "http://localhost:1234/v1",
        apiKey: "${LM_API_TOKEN}",
        api: "openai-completions",
        timeoutSeconds: 300,
        models: [
          {
            id: "my-local-model",
            name: "Local Model",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 200000,
            maxTokens: 8192,
          },
        ],
      },
    },
  },
}
```

<AccordionGroup>
  <Accordion title="Default optional fields">
    For custom providers, `reasoning`, `input`, `cost`, `contextWindow`, and `maxTokens` are optional. When omitted, OpenAgent defaults to:

    - `reasoning: false`
    - `input: ["text"]`
    - `cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }`
    - `maxTokens`: no fixed default. For OpenAI-compatible Completions, an unknown output limit omits both `max_tokens` and `max_completion_tokens`, letting the provider apply its default.

    Anthropic requests preserve an explicit request output limit when the model's `maxTokens` is unknown. Anthropic manual thinking must fit within that request limit when no model output capacity is available.

    An omitted `contextWindow` remains unset so authored native-window metadata is unambiguous. When neither discovery nor per-model context metadata is available, context-budget callers use the standard `200000`-token fallback.

    Recommended: set explicit values that match your proxy/model limits.

    Model-selection metadata keeps capabilities tied to the API and endpoint that supplied them. A configured route change discards metadata from the previous route, while an explicit `thinkingLevelMap` is applied to the configured model.

  </Accordion>
  <Accordion title="Proxy-route shaping rules">
    - For `api: "openai-completions"` on non-native endpoints (any non-empty `baseUrl` whose host is not `api.openai.com`), OpenAgent forces `compat.supportsDeveloperRole: false` to avoid provider 400 errors for unsupported `developer` roles.
    - Proxy-style OpenAI-compatible routes also skip native OpenAI-only request shaping: no `service_tier`, no Responses `store`, no Completions `store`, no prompt-cache hints, no OpenAI reasoning-compat payload shaping, and no hidden OpenAgent attribution headers.
    - For OpenAI-compatible Completions proxies that need vendor-specific fields, set `agents.defaults.models["provider/model"].params.extra_body` (or `extraBody`) to merge extra JSON into the outbound request body.
    - For vLLM-style chat-template controls, set `agents.defaults.models["provider/model"].params.chat_template_kwargs`.
    - For slow local models or remote LAN/tailnet hosts, set `models.providers.<id>.timeoutSeconds`. This extends provider model HTTP request handling, including connect, headers, body streaming, and the total guarded-fetch abort, without increasing the whole agent runtime timeout. If `agents.defaults.timeoutSeconds` or a run-specific timeout is lower, raise that ceiling too; provider timeouts cannot extend the whole run.
    - Model provider HTTP calls allow Surge, Clash, and sing-box fake-IP DNS answers in `198.18.0.0/15` and `fc00::/7` only for the configured provider `baseUrl` hostname. Custom/local provider endpoints also trust that exact configured `scheme://host:port` origin for guarded model requests, including loopback, LAN, and tailnet hosts. This is not a new config option; the `baseUrl` you configure extends the request policy only for that origin. Fake-IP hostname allowance and exact-origin trust are independent mechanisms. Other private, loopback, link-local, metadata, local-use NAT64 (`64:ff9b:1::/48`) destinations, and different ports still require an explicit `models.providers.<id>.request.allowPrivateNetwork: true` opt-in. Set `models.providers.<id>.request.allowPrivateNetwork: false` to opt out of the exact-origin trust.
    - If `baseUrl` is empty/omitted, OpenAgent keeps the default OpenAI behavior (which resolves to `api.openai.com`).
    - For safety, an explicit `compat.supportsDeveloperRole: true` is still overridden on non-native `openai-completions` endpoints.
    - For `api: "anthropic-messages"` on non-direct endpoints (any provider other than canonical `anthropic`, or a custom `models.providers.anthropic.baseUrl` whose host is not a public `api.anthropic.com` endpoint), OpenAgent suppresses implicit Anthropic beta headers such as `claude-code-20250219`, `interleaved-thinking-2025-05-14`, and OAuth markers, so custom Anthropic-compatible proxies do not reject unsupported beta flags. Set `models.providers.<id>.headers["anthropic-beta"]` explicitly if your proxy needs specific beta features.

  </Accordion>
</AccordionGroup>
