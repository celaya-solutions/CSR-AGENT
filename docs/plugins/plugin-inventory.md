---
summary: "Generated inventory of OpenAgent plugins shipped in core, published externally, or kept source-only"
read_when:
  - You are deciding whether a plugin ships in the core npm package or installs separately
  - You are updating bundled plugin package metadata or release automation
  - You need the canonical internal vs external plugin list
title: "Plugin inventory"
---

<!-- Generated file. Do not edit by hand.
Run `pnpm plugins:inventory:gen` to rebuild it. -->

This page lists every OpenAgent plugin with its package, install route, and
description. Operators use it to find a plugin and to see whether that plugin
needs a separate install. Maintainers use it to check bundled plugin metadata
and release automation.

## Definitions

- **Core npm package:** built into the `openclaw` npm package and available without a separate plugin install.
- **Official external package:** OpenClaw-maintained plugin omitted from the core npm package, kept in this official inventory, and installed on demand through ClawHub and/or npm.
- **Source checkout only:** repo-local plugin omitted from published npm artifacts and not advertised as an installable package.

Source checkouts are different from npm installs: after `pnpm install`, bundled
plugins load from `extensions/<id>` so local edits and package-local workspace
dependencies are available.

## Install a plugin

Use the install route in each entry to decide whether install is needed. Plugins
that say `included in OpenAgent` are already present in the core package.
Official external packages need one install. Installation applies to the running
local Gateway without restarting it; start the Gateway if it was stopped.

For example, Discord is an official external package:

```bash
openclaw plugins install @openclaw/discord
openclaw plugins inspect discord --runtime --json
```

Ordinary bare package specs install from npm. Use `clawhub:@openclaw/discord`
or `npm:@openclaw/discord` when you need an explicit source. After install,
follow the plugin's setup doc, such as [Discord](/channels/discord), to add
credentials and channel config. See
[Manage plugins](/plugins/manage-plugins) for update, uninstall, and publishing
commands.

Each entry lists the package, distribution route, and description.

## Core npm package

17 plugins

- **[acpx](/plugins/reference/acpx)** (`@openclaw/acpx`) - included in OpenAgent. OpenAgent ACP runtime backend with plugin-owned session and transport management.

- **[agent-workforce](/plugins/reference/agent-workforce)** (`@openclaw/agent-workforce`) - included in OpenAgent. A named team of teammates one agent can hand work to, with drafts held for human review and a plain-language decision log.

- **[anthropic](/plugins/reference/anthropic)** (`@openclaw/anthropic-provider`) - included in OpenAgent. Anthropic models, Claude CLI, and native Claude session catalog.

- **[browser](/plugins/reference/browser)** (`@openclaw/browser-plugin`) - included in OpenAgent. Adds agent-callable tools.

- **[codex](/plugins/reference/codex)** (`@openclaw/codex`) - included in OpenAgent. Codex app-server harness and native session catalog.

- **[device-pair](/plugins/reference/device-pair)** (`openclaw`) - included in OpenAgent. Generate setup codes and approve device pairing requests.

- **[discord](/plugins/reference/discord)** (`@openclaw/discord`) - included in OpenAgent. OpenAgent Discord channel plugin for channels, DMs, commands, and app events.

- **[document-extract](/plugins/reference/document-extract)** (`@openclaw/document-extract-plugin`) - included in OpenAgent. Extract text and fallback page images from local document attachments.

- **[duckduckgo](/plugins/reference/duckduckgo)** (`@openclaw/duckduckgo-plugin`) - included in OpenAgent. Adds web search provider support.

- **[llama-cpp](/plugins/reference/llama-cpp)** (`@openclaw/llama-cpp-provider`) - included in OpenAgent. Managed and external llama.cpp servers for GGUF chat and embeddings.

- **[llm-task](/plugins/reference/llm-task)** (`@openclaw/llm-task`) - included in OpenAgent. Generic JSON-only LLM tool for structured tasks callable from workflows.

- **[memory-core](/plugins/reference/memory-core)** (`@openclaw/memory-core`) - included in OpenAgent. Adds agent-callable tools.

- **[ollama](/plugins/reference/ollama)** (`@openclaw/ollama-provider`) - included in OpenAgent. Adds Ollama, Ollama Cloud model provider support to OpenAgent.

- **[openai](/plugins/reference/openai)** (`@openclaw/openai-provider`) - included in OpenAgent. Adds OpenAI model provider support to OpenAgent.

- **[openrouter](/plugins/reference/openrouter)** (`@openclaw/openrouter-provider`) - included in OpenAgent. Adds OpenRouter model provider support to OpenAgent.

- **[telegram](/plugins/reference/telegram)** (`@openclaw/telegram`) - included in OpenAgent. OpenAgent Telegram channel plugin.

- **[web-readability](/plugins/reference/web-readability)** (`@openclaw/web-readability-plugin`) - included in OpenAgent. Extract readable article content from local HTML web fetch responses.

## Official external packages

0 plugins

_None._

## Source checkout only

0 plugins

_None._

## How this page is built

OpenAgent generates this page from the top-level
`extensions/*/openclaw.plugin.json` manifests and the root npm package
`files` exclusions. Optional `package.json` metadata enriches package and
distribution details. Regenerate the page with:

```bash
pnpm plugins:inventory:gen
```
