---
summary: "Audit what can spend money, which keys are used, and how to view usage"
read_when:
  - You want to understand which features may call paid APIs
  - You need to audit keys, costs, and usage visibility
  - You're explaining /status or /usage cost reporting
title: "API usage and costs"
---

Map of OpenAgent features that can call paid provider APIs, where each reads its credentials, and where the resulting cost shows up.

## Where costs show up

**`/status`** (per-session snapshot)

- Shows the current session model, context usage, and last-response tokens.
- Adds an **estimated cost** for the last reply when OpenAgent has usage metadata and local pricing for the active model.
- If the live session snapshot is sparse, `/status` recovers token/cache counters and the active model label from the latest transcript usage entry. Existing nonzero live values win over transcript data; a prompt-sized transcript total can still win when the stored total is missing or smaller.

**`/usage`** (per-message footer)

- `/usage full` appends a usage footer to every reply, including **estimated cost** when local pricing is configured and usage metadata is available.
- `/usage tokens` shows tokens only. Subscription-style OAuth/token and CLI runtimes show tokens only unless they supply compatible usage metadata plus an explicit local price.
- `/usage cost` prints a local cost summary; `/usage off` disables the footer.

**Control UI → Usage** (cross-session analysis)

- Shows transcript-derived token and estimated-cost totals for the selected date range, with breakdowns by provider, model, agent, channel, and token type.
- Named sessions use their stored agent owner. Identical session IDs under different agents remain separate, including when historical lineage is grouped.
- Grouped history remains visible after a session reset, even before the new session has its first message. Filtering and JSON exports retain the breakdown of entries with missing model prices.
- Compares shorter calendar windows ending on the selected range end date. Missing dates count as zero-usage calendar days; they are not skipped to create a denser window.
- Labels the daily chart scale directly. A `√` badge means square-root compression is keeping low-usage days visible.
- These totals describe the available local session history, not a provider invoice or lifetime billing ledger. The UI warns when pricing is missing for some entries.

**CLI usage windows** (provider quotas, not per-message cost)

- `openclaw status --usage` and `openclaw channels list` show provider **usage windows** as `X% left`.
- Usage-window providers among the bundled plugins: Anthropic, OpenAI (covers ChatGPT/Codex OAuth/token auth), and OpenRouter. Provider plugins supply these snapshots, so an installed plugin can add one. See [Models CLI](/cli/models) and [Channels CLI](/cli/channels) for the full provider/flag list.
- Usage auth comes from provider-specific hooks when available, otherwise OpenAgent falls back to matching OAuth/API-key credentials from auth profiles, env, or config.

See [Token use and costs](/reference/token-use) for detailed examples.

<Note>
As of 2026-07-05, Anthropic has confirmed that Claude CLI reuse (including `claude -p`) is a sanctioned integration pattern unless it publishes a new policy; recheck Anthropic's current terms before relying on it. Anthropic does not expose a per-message dollar estimate, so `/usage full` cannot show cost for Claude CLI usage.
</Note>

## How keys are discovered

- **Auth profiles**: SQLite stores, with agent-local profiles overriding the shared read-through base. See [Auth credential semantics](/auth-credential-semantics#agent-copy-portability).
- **Environment variables**: for example `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`.
- **Config**: `models.providers.*.apiKey`, `plugins.entries.*.config.webSearch.apiKey`, `memory.search.*`, `talk.providers.*.apiKey`.
- **Skills**: `skills.entries.<name>.apiKey`, which may export the key to the skill process env.

## Features that can spend keys

### Core model responses (chat + tools)

Every reply or tool call runs on the current model provider. This is the primary source of usage and cost, including subscription-style hosted plans that bill outside OpenAgent's local UI: OpenAI Codex and Anthropic's Claude-login path with Extra Usage enabled.

See [Models](/providers/models) for pricing config and [Token use and costs](/reference/token-use) for display.

### Media understanding (audio/image/video)

Inbound media can be summarized or transcribed via a provider API before the reply pipeline runs. Provider support is registered per plugin and changes as plugins are added; see [Media understanding](/nodes/media-understanding) for the current list and config.

### Image and video generation

`image_generate` and `video_generate` route to whichever authenticated provider is available. Both can infer an auth-backed provider default when their `agents.defaults.mediaModels` entry is unset.

See [Image generation](/tools/image-generation) and [Video generation](/tools/video-generation) for the current provider list.

### Memory embeddings and semantic search

Semantic memory search uses embedding APIs when `memory.search.provider` names a remote adapter (for example `openai`). `memory.search.provider = "ollama"` runs against a local/self-hosted server and typically has no hosted billing. `memory.search.provider = "local"` keeps everything on-device with no API usage. An optional `memory.search.fallback` provider can cover local-embedding failures.

See [Memory](/concepts/memory).

### Web search tool

`web_search` can incur usage charges depending on the selected provider. Each provider reads its key from an env var first, then `plugins.entries.<id>.config.webSearch.apiKey`:

| Provider          | Env var(s)                                                                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DuckDuckGo        | key-free; unofficial, HTML-based, no billing                                                                                                                           |
| Ollama Web Search | key-free for a reachable signed-in local host; direct `https://ollama.com` search uses `OLLAMA_API_KEY`; auth-protected hosts reuse normal Ollama provider bearer auth |

Legacy `tools.web.search.*` config paths still load through a compatibility shim but are no longer the recommended surface.

See [Web tools](/tools/web).

### Web fetch tool

`web_fetch` uses direct fetch plus the bundled `web-readability` plugin (no paid API). Disable `plugins.entries.web-readability.enabled` to skip local Readability extraction.

See [Web tools](/tools/web).

### Provider usage snapshots (status/health)

`openclaw status --usage` and `openclaw models status --json` call provider usage endpoints to show quota windows or auth health. Calls are low-volume but still hit provider APIs.

See [Models CLI](/cli/models).

### Compaction safeguard summarization

The compaction safeguard can summarize session history using the current model, which invokes provider APIs when it runs.

See [Session management and compaction](/reference/session-management-compaction).

### Model scan / probe

`openclaw models scan` can probe OpenRouter models and uses `OPENROUTER_API_KEY` when probing is enabled.

See [Models CLI](/cli/models).

### Talk (speech)

Talk mode can invoke a configured speech provider such as OpenAI: `talk.providers.<id>.apiKey` or the provider's normal credentials.

See [Talk mode](/nodes/talk).

### Skills (third-party APIs)

Skills can store `apiKey` in `skills.entries.<name>.apiKey`. If a skill uses that key against an external API, cost follows the skill's provider.

See [Skills](/tools/skills).

## Related

- [Token use and costs](/reference/token-use)
- [Prompt caching](/reference/prompt-caching)
- [Usage tracking](/concepts/usage-tracking)
