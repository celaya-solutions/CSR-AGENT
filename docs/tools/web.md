---
summary: "web_search and web_fetch -- search the web or fetch page content"
title: "Web search"
sidebarTitle: "Web Search"
read_when:
  - You want to enable or configure web_search
  - You need to choose a search provider
  - You want to understand provider selection
---

`web_search` searches the web with your configured provider and returns
normalized results, cached by query for 15 minutes (configurable). OpenAgent
also bundles `web_fetch` for lightweight URL fetching, which always runs
locally.

<Info>
  `web_search` is a lightweight HTTP tool, not browser automation. For
  JS-heavy sites or logins, use the [Web Browser](/tools/browser). For
  fetching a specific URL, use [Web Fetch](/tools/web-fetch).
</Info>

## Quick start

<Steps>
  <Step title="Choose a provider">
    Pick a provider and complete any required setup. All bundled providers are
    key-free. See the provider pages below for details.
  </Step>
  <Step title="Configure">
    ```bash
    openagent configure --section web
    ```
    This stores the provider choice.

    You can also configure search by talking to
    [OpenAgent](/cli/openclaw): say `configure web search` in `openagent setup`
    or in the Control UI's **Settings → Ask OpenAgent** chat.

  </Step>
  <Step title="Use it">
    ```javascript
    await web_search({ query: "OpenAgent plugin SDK" });
    ```

  </Step>
</Steps>

## Choosing a provider

<CardGroup cols={2}>
  <Card title="Codex Hosted Search" icon="search" href="/plugins/codex-harness">
    AI-synthesized grounded answers through your Codex app-server account.
  </Card>
  <Card title="DuckDuckGo" icon="bird" href="/tools/duckduckgo-search">
    Key-free provider. No API key needed. Unofficial HTML-based integration.
  </Card>
  <Card title="Ollama Web Search" icon="globe" href="/tools/ollama-search">
    Search via a signed-in local Ollama host or the hosted Ollama API.
  </Card>
</CardGroup>

### Provider comparison

| Provider                                      | Result style                 | Filters                              | API key                                                                                 |
| --------------------------------------------- | ---------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------- |
| [Codex Hosted Search](/plugins/codex-harness) | AI-synthesized + source URLs | Domains, context size, user location | None; uses Codex/OpenAI sign-in                                                         |
| [DuckDuckGo](/tools/duckduckgo-search)        | Structured snippets          | --                                   | None (key-free)                                                                         |
| [Ollama Web Search](/tools/ollama-search)     | Structured snippets          | --                                   | None for signed-in local hosts; `OLLAMA_API_KEY` for direct `https://ollama.com` search |

## Result shape

`web_search` normalizes every bundled and external plugin provider at the core
tool boundary. Callers receive exactly one of these closed shapes:

```typescript
type WebSearchOutput =
  | {
      kind: "error";
      provider: string;
      error: "provider_error";
      message: string;
      docs?: string;
    }
  | {
      kind: "results";
      provider: string;
      query: string;
      count: number;
      tookMs?: number;
      results: Array<{
        title: string;
        url: string;
        snippet?: string;
        published?: string;
        siteName?: string;
      }>;
      externalContent: {
        untrusted: true;
        source: "web_search";
        wrapped: true;
        provider: string;
      };
      cached?: true;
    }
  | {
      kind: "answer";
      provider: string;
      query: string;
      tookMs?: number;
      content: string;
      citations?: Array<{ url: string; title?: string }>;
      externalContent: {
        untrusted: true;
        source: "web_search";
        wrapped: true;
        provider: string;
      };
      cached?: true;
    }
  | {
      kind: "raw";
      provider: string;
      data: unknown;
    };
```

Structured providers use `kind: "results"`; synthesized providers use
`kind: "answer"`. External plugin providers whose payloads match neither shape
pass through verbatim as `kind: "raw"` for compatibility. Provider-specific
fields such as raw scores, excerpts, related searches, inline-citation
offsets, model ids, or session metadata are not passed through on normalized
branches. Use a provider's dedicated tool when its richer response is part of
your workflow.

`externalContent.wrapped: true` is a trust marker the boundary itself makes
true: provider prose (`title`, `snippet`, `siteName`, `content`, citation
titles, error `message`) is stripped of any pre-existing envelope lines and
re-wrapped exactly once at the core boundary, so no provider metadata can spoof
the marker. `query` is always the requested query, citation and result URLs
must parse as http(s), `published` must be ISO-date shaped, URLs are emitted canonicalized, and a
payload carrying an `error` key is always reported as `kind: "error"` with the
raw provider code preserved inside the wrapped message. Raw passthrough
payloads keep whatever markers the provider set.

<a id="auto-detection" />

## Provider selection

Provider lists in docs and setup flows are alphabetical. The bundled providers
(**Codex Hosted Search**, **DuckDuckGo**, and **Ollama Web Search**) are all
key-free, and key-free providers never win auto-detection. Select one
explicitly with `tools.web.search.provider` or through
`openagent configure --section web`. OpenAgent does not send managed
`web_search` queries to a key-free provider just because no other provider is
configured.

Auto-detection only considers providers that need a credential
(`requiresCredential !== false`), such as ones added by an installed plugin. If
an auto-detected provider fails, OpenAgent tries the next eligible provider. An
explicitly selected provider does not use automatic fallback.

OpenAI Responses models are an exception: while `tools.web.search.provider`
is unset, they use OpenAI's native web search instead of a managed provider
(see below).

<Note>
  Provider key fields support SecretRef objects. Plugin-scoped SecretRefs under
  `plugins.entries.<plugin>.config.webSearch.apiKey` are resolved only for the
  selected provider, so non-selected SecretRefs stay inactive.
</Note>

## Native OpenAI web search

Direct OpenAI Responses models (`api: "openai-responses"`, provider `openai`,
no base URL or an official OpenAI API base URL) use OpenAI's hosted
`web_search` tool automatically when OpenAgent web search is enabled and no
managed provider is pinned. This is provider-owned behavior in the bundled
OpenAI plugin and does not apply to OpenAI-compatible proxy base URLs or Azure
routes. Set `tools.web.search.provider` to another provider such as `duckduckgo` to
keep the managed `web_search` tool for OpenAI models, or set
`tools.web.search.enabled: false` to disable both managed search and native
OpenAI search.

## Native Codex web search

The Codex app-server runtime uses Codex's hosted `web_search` tool automatically
when web search is enabled and no managed provider is selected. Native hosted
search and OpenAgent's managed `web_search` dynamic tool are mutually exclusive,
so managed search cannot bypass native domain restrictions. OpenAgent uses the
managed tool when hosted search is unavailable, explicitly disabled, or
replaced by a selected managed provider. OpenAgent keeps Codex's standalone
`web.run` extension disabled (`features.standalone_web_search: false`)
because production app-server traffic rejects its user-defined `web`
namespace.

- Configure native search under `tools.web.search.openaiCodex`
- Set `tools.web.search.provider: "codex"` to provision Codex Hosted Search as
  the managed `web_search` provider for any parent model. Each call runs a
  bounded ephemeral Codex app-server turn and fails if Codex does not emit a
  hosted `webSearch` item.
- `mode: "cached"` is the default preference, but Codex resolves it to live
  external access for unrestricted app-server turns; set `"live"` to request
  live access explicitly
- Set `tools.web.search.provider` to a managed provider such as `duckduckgo` to use
  OpenAgent's managed `web_search` instead
- Set `tools.web.search.openaiCodex.enabled: false` to opt out of Codex-hosted
  search; other managed providers remain available
- Restricting the Codex native tool surface also keeps managed `web_search`
  available
- When `allowedDomains` is set, it restricts both hosted `web_search` and
  managed `web_fetch` on turns where native hosted search is active. Turns
  using a managed search provider are unchanged. Automatic managed search
  fallback also fails closed if hosted search is unavailable.
- Tool-disabled LLM-only runs disable both native and managed search
- `tools.web.search.enabled: false` disables both managed and native search

Persistent effective Codex search-policy changes start a fresh bound thread so
an already loaded app-server thread cannot keep stale hosted-search access.
Transient per-turn restrictions use a temporary restricted thread and preserve
the existing binding for later resume.

Direct OpenAI ChatGPT Responses traffic can also use OpenAI's hosted
`web_search` tool. That separate path remains opt-in through
`tools.web.search.openaiCodex.enabled: true` and only applies to eligible
`openai/*` models using `api: "openai-chatgpt-responses"`.

```json5
{
  tools: {
    web: {
      search: {
        enabled: true,
        // Optional: use Codex Hosted Search from non-Codex parent models too.
        provider: "codex",
        openaiCodex: {
          enabled: true,
          mode: "cached",
          allowedDomains: ["example.com"],
          contextSize: "high",
          userLocation: {
            country: "US",
            city: "New York",
            timezone: "America/New_York",
          },
        },
      },
    },
  },
}
```

For runtimes and providers that do not support native Codex search, Codex can
use the managed `web_search` fallback through OpenAgent's dynamic tool namespace.
Use an explicit managed provider when you need OpenAgent's provider-specific
network controls instead of Codex-hosted search.

Selecting `provider: "codex"` enables the bundled `codex` plugin and uses the
same `tools.web.search.openaiCodex` restrictions shown above. Authenticate the
Codex app-server first with `openagent models auth login --provider openai`.
The parent agent can use any model or runtime; only the bounded search worker
runs through Codex.

## Network safety

Managed HTTP `web_search` provider calls use OpenAgent's guarded fetch path,
scoped to the current provider's own hostname. For that hostname only,
OpenAgent allows Surge, Clash, and sing-box fake-IP DNS answers in
`198.18.0.0/15` and `fc00::/7`. Other private, loopback, link-local, and
metadata destinations remain blocked. Codex Hosted Search is the exception:
its bounded worker delegates network access to Codex app-server's hosted
`web_search` tool.

This automatic allowance does not apply to arbitrary `web_fetch` URLs. For
`web_fetch`, enable `tools.web.fetch.ssrfPolicy.allowRfc2544BenchmarkRange` and
`tools.web.fetch.ssrfPolicy.allowIpv6UniqueLocalRange` explicitly only when your
trusted proxy owns those synthetic ranges.

## Config

```json5
{
  tools: {
    web: {
      search: {
        enabled: true, // default: true
        provider: "duckduckgo", // or "ollama", "codex"; see below when omitted
        maxResults: 5,
        timeoutSeconds: 30,
        cacheTtlMinutes: 15,
      },
    },
  },
}
```

`tools.web.search.cacheTtlMinutes` controls OpenAgent's local search-result
caches. Set it to `0` to bypass reads and writes, even for previously cached
queries. A shorter positive TTL limits reuse by entry age; a longer TTL does
not extend an entry's original expiry. Provider-side caching is separate.

<a id="storing-api-keys" />

Provider-specific config (base URLs, modes) lives under
`plugins.entries.<plugin>.config.webSearch.*`. See the provider pages for
examples.

`tools.web.search.provider` is validated against the web-search provider ids
declared by bundled and installed plugin manifests. A typo such as `"duckduckgoo"`
fails config validation instead of silently falling back to auto-detection. If a
configured provider only has stale plugin evidence, such as a leftover
`plugins.entries.<plugin>` block after uninstalling a third-party plugin,
OpenAgent keeps startup resilient and reports a warning so you can reinstall the
plugin or run `openagent doctor --fix` to clean up the stale config.

`web_fetch` fallback provider selection is separate:

- choose it with `tools.web.fetch.provider`
- or omit that field and let OpenAgent auto-detect the first ready web-fetch
  provider from configured credentials
- non-sandboxed `web_fetch` can use installed plugin providers that declare
  `contracts.webFetchProviders`; sandboxed fetches allow bundled providers and
  verified official plugin installs, but exclude third-party external plugins
- no bundled plugin contributes a `webFetchProviders` fallback today, so
  `web_fetch` uses its built-in local fetch unless you install one

## Tool parameters

Every provider accepts:

| Parameter | Description                          |
| --------- | ------------------------------------ |
| `query`   | Search query (required)              |
| `count`   | Results to return (1-10, default: 5) |

Other parameters depend on the selected provider. DuckDuckGo also accepts
`region` and `safeSearch`; see [DuckDuckGo](/tools/duckduckgo-search).

## Examples

```javascript
// Basic search
await web_search({ query: "OpenAgent plugin SDK" });

// Fewer results
await web_search({ query: "AI developments", count: 3 });
```

## Tool profiles

If you use tool profiles or allowlists, add `web_search` or `group:web`:

```json5
{
  tools: {
    allow: ["web_search"],
    // or: allow: ["group:web"]  (includes web_search and web_fetch)
  },
}
```

## Related

- [Web Fetch](/tools/web-fetch) -- fetch a URL and extract readable content
- [Web Browser](/tools/browser) -- full browser automation for JS-heavy sites
- [Ollama Web Search](/tools/ollama-search) -- key-free web search through your Ollama host
