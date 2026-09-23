---
summary: "Per-provider setup for the bundled provider plugins, the bundled provider table, and provider quirks."
read_when:
  - You are setting up a bundled provider such as OpenAI, Anthropic, or OpenRouter
  - You need the bundled provider id, auth env, and example model
  - You hit a provider-specific quirk
title: "Official provider plugins"
---

## Official provider plugins

Official provider plugins publish their own model catalog rows. These providers require **no** `models.providers` model entries; enable the provider plugin, set auth, and pick a model. Use `models.providers` only for explicit custom providers or narrow request settings such as timeouts.

### OpenAI

- Provider: `openai`
- Auth: `OPENAI_API_KEY`
- Optional rotation: `OPENAI_API_KEYS`, `OPENAI_API_KEY_1`, `OPENAI_API_KEY_2`, plus `OPENCLAW_LIVE_OPENAI_KEY` (single override)
- Fresh setup default: `openai/gpt-6-astra`.
- Example models: `openai/gpt-6-astra`, `openai/gpt-5.6-sol`, `openai/gpt-5.6-terra`, `openai/gpt-5.6-luna`, `openai/gpt-5.5`; the bare direct-API `openai/gpt-5.6` alias remains supported.
- Verify account/model availability with `openagent models list --provider openai` if a specific install or API key behaves differently.
- CLI: `openagent onboard --auth-choice openai-api-key`
- Direct OpenAI API-key Responses requests default to `"sse"`.
- Override per model via `agents.defaults.models["openai/<model>"].params.transport` (`"sse"`, `"websocket"`, `"websocket-cached"`, or `"auto"`). Cached WebSockets reuse the session connection and send only new input with `previous_response_id` when history still matches.
- Set an explicit OpenAI API service tier with `params.serviceTier` or `params.service_tier`; Fast mode (formerly Priority processing) uses `service_tier=priority`.
- On native public OpenAI and ChatGPT/Codex Responses requests, precedence is payload/transport `service_tier`, then a valid explicit model param, then the fast-mode default.
- `/fast` and valid `params.fastMode` / `params.fast_mode` values are shared agent-runtime controls; on direct embedded `openai/*` Responses requests they supply `service_tier=priority` only when no higher-precedence tier exists.
- Hidden OpenAgent attribution headers (`originator`, `version`, `User-Agent`) apply only on native OpenAI traffic to `api.openai.com`, not generic OpenAI-compatible proxies
- Native OpenAI routes also keep Responses `store`, prompt-cache hints, and OpenAI reasoning-compat payload shaping; proxy routes do not
- `openai/gpt-5.3-codex-spark` is available only through ChatGPT/Codex OAuth; direct OpenAI API-key and Azure API-key routes reject it

```json5
{
  agents: { defaults: { model: { primary: "openai/gpt-6-astra" } } },
}
```

If the API organization does not expose GPT-5.6, set
`openai/gpt-5.5` explicitly. Normal onboarding and reauthentication preserve an
existing explicit primary model; `models auth login --set-default` and
`models set` are the intentional replacement paths.

### Anthropic

- Provider: `anthropic`
- Auth: `ANTHROPIC_API_KEY`
- Optional rotation: `ANTHROPIC_API_KEYS`, `ANTHROPIC_API_KEY_1`, `ANTHROPIC_API_KEY_2`, plus `OPENCLAW_LIVE_ANTHROPIC_KEY` (single override)
- Example model: `anthropic/claude-opus-5`
- CLI: `openagent onboard --auth-choice apiKey`
- Direct public Anthropic requests support the shared `/fast` toggle and `params.fastMode`, including API-key and OAuth-authenticated traffic sent to `api.anthropic.com`; OpenAgent maps that to Anthropic `service_tier` (`auto` vs `standard_only`)
- Preferred Claude CLI config keeps the model ref canonical and selects the CLI
  backend separately: `anthropic/claude-opus-5` with
  model-scoped `agentRuntime.id: "claude-cli"`. Legacy
  `claude-cli/claude-opus-4-7` refs still work for compatibility.

<Note>
Claude CLI reuse (`claude -p`) is a sanctioned OpenAgent integration path. Anthropic setup-token auth remains supported, but OpenAgent prefers Claude CLI reuse when available.
</Note>

```json5
{
  agents: { defaults: { model: { primary: "anthropic/claude-opus-5" } } },
}
```

### OpenAI ChatGPT/Codex OAuth

- Provider: `openai`
- Auth: OAuth (ChatGPT)
- Fresh native Codex app-server harness ref: `openai/gpt-6-astra`
- Native Codex app-server harness docs: [Codex harness](/plugins/codex-harness)
- Astra (`openai/gpt-6-astra`) defaults to `medium` reasoning effort when the account supports it. The [OpenAI provider default](/providers/openai/models#gpt-6-astra) is shared by model controls and both runtimes; explicit thinking settings take precedence.
- Legacy model refs: `codex/gpt-*`, `openai-codex/gpt-*`
- Plugin boundary: `openai/*` loads the OpenAI plugin; explicit runtime policy or the provider-owned effective route decides whether the native Codex app-server plugin is selected.
- CLI: `openagent onboard --auth-choice openai` or `openagent models auth login --provider openai`
- OpenAgent's embedded ChatGPT Responses transport defaults to `auto` (WebSocket-first, SSE fallback).
- `agents.defaults.models["openai/<model>"].params.transport` and `params.serviceTier` are authored embedded-provider request settings. They keep implicit runtime selection on OpenAgent; native Codex owns its app-server transport and service tier.
- Valid model-scoped `params.fastMode` / `params.fast_mode` values and valid cutoff keys are portable typed agent-runtime controls. They do not count as authored provider request params and do not select a runtime. Pin `agentRuntime.id: "openclaw"` or `agentRuntime.id: "codex"` when a recipe depends on one runtime.
- Hidden OpenAgent attribution headers (`originator`, `version`, `User-Agent`) are only attached on native Codex traffic to `chatgpt.com/backend-api`, not generic OpenAI-compatible proxies
- The shared `/fast` toggle, configured defaults, and valid model-scoped Fast params resolve through one runtime-control policy. See [Thinking levels](/tools/thinking#fast-mode-%2Ffast) for precedence.
- OpenAI API Fast mode is premium-priced and model-specific. GPT-5.6 Sol currently costs 2× Standard token pricing, and long-context multipliers stack. ChatGPT/Codex-credit Fast mode is separate: GPT-5.6 and GPT-5.5 currently consume 2.5× Standard credits, while API-key Codex runs use API token pricing. See [Fast mode](https://openai.com/api-priority-processing/), [API pricing](https://developers.openai.com/api/docs/pricing), and [Codex speed](https://learn.chatgpt.com/docs/agent-configuration/speed).
- The native Codex catalog can expose exact `openai/gpt-5.6-sol`, `openai/gpt-5.6-terra`, and `openai/gpt-5.6-luna` refs according to account access. It does not apply the direct API's bare `gpt-5.6` alias client-side.
- `openai/gpt-5.5` uses the Codex catalog native `contextWindow = 400000` and default runtime `contextTokens = 272000`; override the runtime cap with `models.providers.openai.models[].contextTokens`
- Sign in with `openai` auth and use `openai/gpt-6-astra` for a fresh subscription-backed setup. Select `openai/gpt-5.5` explicitly if that Codex workspace does not expose Astra.
- Use provider/model `agentRuntime.id: "openclaw"` to keep an otherwise eligible route on the built-in runtime. With runtime unset or `auto`, only an exact official HTTPS Responses/ChatGPT-compatible route with no authored provider request override may select Codex implicitly.
- Legacy Codex GPT refs are legacy state, not a live provider route. Use canonical `openai/*` refs for new agent config, and run `openagent doctor --fix` to migrate `codex/*` and `openai-codex/*` refs while preserving their native Codex semantics with model-scoped `agentRuntime.id: "codex"`. Existing explicit canonical `openai/gpt-5.5` selections are not upgraded.

```json5
{
  plugins: { entries: { codex: { enabled: true } } },
  agents: {
    defaults: {
      model: { primary: "openai/gpt-6-astra" },
    },
  },
}
```

```json5
{
  models: {
    providers: {
      openai: {
        models: [{ id: "gpt-5.5", contextTokens: 160000 }],
      },
    },
  },
}
```

### Other bundled provider plugins

| Provider                                | Id             | Auth env                                 | Example model            |
| --------------------------------------- | -------------- | ---------------------------------------- | ------------------------ |
| [Ollama Cloud](/providers/ollama-cloud) | `ollama-cloud` | `OLLAMA_API_KEY`                         | `ollama-cloud/kimi-k2.6` |
| OpenRouter                              | `openrouter`   | OpenRouter OAuth or `OPENROUTER_API_KEY` | `openrouter/auto`        |

#### Quirks worth knowing

<AccordionGroup>
  <Accordion title="OpenRouter">
    Applies its app-attribution headers and Anthropic `cache_control` markers only on verified `openrouter.ai` routes. As a proxy-style OpenAI-compatible path, it skips native-OpenAI-only shaping (`serviceTier`, Responses `store`, prompt-cache hints, OpenAI reasoning-compat). Gemini-backed refs keep proxy-Gemini thought-signature sanitation only.
  </Accordion>
</AccordionGroup>
