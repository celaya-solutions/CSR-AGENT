---
summary: "Generated inventory of Zero to Agent plugins shipped in core, published externally, or kept source-only"
read_when:
  - You are deciding whether a plugin ships in the core npm package or installs separately
  - You are updating bundled plugin package metadata or release automation
  - You need the canonical internal vs external plugin list
title: "Plugin inventory"
---

<!-- Generated file. Do not edit by hand.
Run `pnpm plugins:inventory:gen` to rebuild it. -->

This page lists every Zero to Agent plugin with its package, install route, and
description. Operators use it to find a plugin and to see whether that plugin
needs a separate install. Maintainers use it to check bundled plugin metadata
and release automation.

## Definitions

- **Core npm package:** built into the `openclaw` npm package and available without a separate plugin install.
- **Official external package:** Zero to Agent-maintained plugin omitted from the core npm package, kept in this official inventory, and installed on demand through ClawHub and/or npm.
- **Source checkout only:** repo-local plugin omitted from published npm artifacts and not advertised as an installable package.

Source checkouts are different from npm installs: after `pnpm install`, bundled
plugins load from `extensions/<id>` so local edits and package-local workspace
dependencies are available.

## Install a plugin

Use the install route in each entry to decide whether install is needed. Plugins
that say `included in Zero to Agent` are already present in the core package.
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

60 plugins

- **[a2a](/plugins/reference/a2a)** (`@openclaw/a2a`) - included in Zero to Agent. A2A v1.0 Agent-to-Agent protocol channel plugin.

- **[active-memory](/plugins/reference/active-memory)** (`openclaw`) - included in Zero to Agent. Runs bounded pre-reply memory retrieval and implements per-agent Remember across conversations for eligible private conversations.

- **[admin-http-rpc](/plugins/reference/admin-http-rpc)** (`@openclaw/admin-http-rpc`) - included in Zero to Agent. Zero to Agent admin HTTP RPC endpoint.

- **[alibaba](/plugins/reference/alibaba)** (`@openclaw/alibaba-provider`) - included in Zero to Agent. Adds video generation provider support.

- **[anthropic](/plugins/reference/anthropic)** (`@openclaw/anthropic-provider`) - included in Zero to Agent. Anthropic models, Claude CLI, and native Claude session catalog.

- **[azure-speech](/plugins/reference/azure-speech)** (`@openclaw/azure-speech`) - included in Zero to Agent. Azure AI Speech text-to-speech (MP3, native Ogg/Opus voice notes, PCM telephony).

- **[beam](/plugins/reference/beam)** (`@openclaw/beam`) - included in Zero to Agent. Read-only coding-session Beam receiver.

- **[bonjour](/plugins/reference/bonjour)** (`@openclaw/bonjour`) - included in Zero to Agent. Advertise the local Zero to Agent gateway over Bonjour/mDNS.

- **[browser](/plugins/reference/browser)** (`@openclaw/browser-plugin`) - included in Zero to Agent. Adds agent-callable tools.

- **[canvas](/plugins/reference/canvas)** (`@openclaw/canvas-plugin`) - included in Zero to Agent. Presents hosted widget documents on paired macOS panels.

- **[clawrouter](/plugins/reference/clawrouter)** (`@openclaw/clawrouter`) - included in Zero to Agent. Adds ClawRouter model provider support to Zero to Agent.

- **[copilot-proxy](/plugins/reference/copilot-proxy)** (`@openclaw/copilot-proxy`) - included in Zero to Agent. Adds Copilot Proxy model provider support to Zero to Agent.

- **[crabbox](/plugins/reference/crabbox)** (`@openclaw/crabbox-provider`) - included in Zero to Agent. Cloud worker provider and lease-backed sandbox backend for the Crabbox CLI.

- **[cua-computer](/plugins/reference/cua-computer)** (`@openclaw/cua-computer`) - included in Zero to Agent. Experimental CUA Driver computer control for macOS, Windows, and Linux node hosts.

- **[deepgram](/plugins/reference/deepgram)** (`@openclaw/deepgram-provider`) - included in Zero to Agent. Deepgram audio transcription with Nova and Flux models, plus realtime speech recognition.

- **[device-pair](/plugins/reference/device-pair)** (`openclaw`) - included in Zero to Agent. Generate setup codes and approve device pairing requests.

- **[document-extract](/plugins/reference/document-extract)** (`@openclaw/document-extract-plugin`) - included in Zero to Agent. Extract text and fallback page images from local document attachments.

- **[elevenlabs](/plugins/reference/elevenlabs)** (`@openclaw/elevenlabs-speech`) - included in Zero to Agent. Adds media understanding provider support. Adds realtime transcription provider support. Adds text-to-speech provider support.

- **[fal](/plugins/reference/fal)** (`@openclaw/fal-provider`) - included in Zero to Agent. Adds fal model provider support to Zero to Agent.

- **[file-transfer](/plugins/reference/file-transfer)** (`@openclaw/file-transfer`) - included in Zero to Agent. Fetch, list, and write files on paired nodes via dedicated node commands. Bypasses bash stdout truncation by using base64 over node.invoke for binaries up to 16 MB.

- **[geolocation](/plugins/reference/geolocation)** (`@openclaw/geolocation-plugin`) - included in Zero to Agent. Resolves client IP addresses to a coarse city using a locally cached IP-geolocation database.

- **[github-copilot](/plugins/reference/github-copilot)** (`@openclaw/github-copilot-provider`) - included in Zero to Agent. Adds GitHub Copilot model provider support to Zero to Agent.

- **[google](/plugins/reference/google)** (`@openclaw/google-plugin`) - included in Zero to Agent. Adds Google, Google Gemini CLI, Google Vertex model provider support to Zero to Agent.

- **[huggingface](/plugins/reference/huggingface)** (`@openclaw/huggingface-provider`) - included in Zero to Agent. Adds Hugging Face model provider support to Zero to Agent.

- **[imap](/plugins/reference/imap)** (`@openclaw/imap`) - included in Zero to Agent. Watch IMAP mailboxes and dispatch authenticated incoming email to isolated agent sessions.

- **[linux-node](/plugins/reference/linux-node)** (`@openclaw/linux-node`) - included in Zero to Agent. Desktop notifications, camera capture, and location for Linux node hosts.

- **[litellm](/plugins/reference/litellm)** (`@openclaw/litellm-provider`) - included in Zero to Agent. Adds LiteLLM model provider support to Zero to Agent.

- **[llm-task](/plugins/reference/llm-task)** (`@openclaw/llm-task`) - included in Zero to Agent. Generic JSON-only LLM tool for structured tasks callable from workflows.

- **[lmstudio](/plugins/reference/lmstudio)** (`@openclaw/lmstudio-provider`) - included in Zero to Agent. Adds LM Studio model provider support to Zero to Agent.

- **[logbook](/plugins/reference/logbook)** (`@openclaw/logbook`) - included in Zero to Agent. Automatic work journal: captures periodic screen snapshots from a paired node and turns them into a reviewable timeline of your day.

- **[memory-core](/plugins/reference/memory-core)** (`@openclaw/memory-core`) - included in Zero to Agent. Adds agent-callable tools.

- **[memory-wiki](/plugins/reference/memory-wiki)** (`@openclaw/memory-wiki`) - included in Zero to Agent. Persistent wiki compiler and Obsidian-friendly knowledge vault for Zero to Agent.

- **[microsoft](/plugins/reference/microsoft)** (`@openclaw/microsoft-speech`) - included in Zero to Agent. Adds text-to-speech provider support.

- **[microsoft-foundry](/plugins/reference/microsoft-foundry)** (`@openclaw/microsoft-foundry`) - included in Zero to Agent. Adds Microsoft Foundry model provider support to Zero to Agent.

- **[migrate-claude](/plugins/reference/migrate-claude)** (`@openclaw/migrate-claude`) - included in Zero to Agent. Imports Claude Code and Claude Desktop instructions, MCP servers, skills, and safe configuration into Zero to Agent.

- **[migrate-hermes](/plugins/reference/migrate-hermes)** (`@openclaw/migrate-hermes`) - included in Zero to Agent. Imports Hermes configuration, memories, skills, and supported credentials into Zero to Agent.

- **[minimax](/plugins/reference/minimax)** (`@openclaw/minimax-provider`) - included in Zero to Agent. Adds MiniMax, MiniMax Portal model provider support to Zero to Agent.

- **[nvidia](/plugins/reference/nvidia)** (`@openclaw/nvidia-provider`) - included in Zero to Agent. Adds NVIDIA model provider support to Zero to Agent.

- **[oc-path](/plugins/reference/oc-path)** (`@openclaw/oc-path`) - included in Zero to Agent. Adds the openclaw path CLI for oc:// workspace file addressing.

- **[ollama](/plugins/reference/ollama)** (`@openclaw/ollama-provider`) - included in Zero to Agent. Adds Ollama, Ollama Cloud model provider support to Zero to Agent.

- **[onepassword](/plugins/reference/onepassword)** (`@openclaw/onepassword`) - included in Zero to Agent. 1Password SecretRef resolver and curated agent broker with approval policy and SQLite audit history.

- **[openai](/plugins/reference/openai)** (`@openclaw/openai-provider`) - included in Zero to Agent. Adds OpenAI model provider support to Zero to Agent.

- **[opencode-go](/plugins/reference/opencode-go)** (`@openclaw/opencode-go-provider`) - included in Zero to Agent. Adds OpenCode Go model provider support to Zero to Agent.

- **[openrouter](/plugins/reference/openrouter)** (`@openclaw/openrouter-provider`) - included in Zero to Agent. Adds OpenRouter model provider support to Zero to Agent.

- **[policy](/plugins/reference/policy)** (`@openclaw/policy`) - included in Zero to Agent. Adds policy-backed doctor checks for workspace conformance.

- **[reef](/plugins/reference/reef)** (`@openclaw/reef`) - included in Zero to Agent. Guarded end-to-end encrypted claw channel.

- **[runway](/plugins/reference/runway)** (`@openclaw/runway-provider`) - included in Zero to Agent. Adds video generation provider support.

- **[senseaudio](/plugins/reference/senseaudio)** (`@openclaw/senseaudio-provider`) - included in Zero to Agent. Adds media understanding provider support.

- **[session-share](/plugins/reference/session-share)** (`@openclaw/session-share`) - included in Zero to Agent. Read-only Zero to Agent sessions on paired gateways.

- **[sglang](/plugins/reference/sglang)** (`@openclaw/sglang-provider`) - included in Zero to Agent. Adds SGLang model provider support to Zero to Agent.

- **[talk-voice](/plugins/reference/talk-voice)** (`openclaw`) - included in Zero to Agent. Manage Talk voice selection (list/set).

- **[telegram](/plugins/reference/telegram)** (`@openclaw/telegram`) - included in Zero to Agent. Zero to Agent Telegram channel plugin.

- **[together](/plugins/reference/together)** (`@openclaw/together-provider`) - included in Zero to Agent. Adds Together model provider support to Zero to Agent.

- **[tts-local-cli](/plugins/reference/tts-local-cli)** (`@openclaw/tts-local-cli`) - included in Zero to Agent. Adds text-to-speech provider support.

- **[vault](/plugins/reference/vault)** (`@openclaw/vault`) - included in Zero to Agent. HashiCorp Vault SecretRef provider integration.

- **[vllm](/plugins/reference/vllm)** (`@openclaw/vllm-provider`) - included in Zero to Agent. Adds vLLM model provider support to Zero to Agent.

- **[web-readability](/plugins/reference/web-readability)** (`@openclaw/web-readability-plugin`) - included in Zero to Agent. Extract readable article content from local HTML web fetch responses.

- **[webhooks](/plugins/reference/webhooks)** (`@openclaw/webhooks`) - included in Zero to Agent. Authenticated inbound webhooks that bind external automation to Zero to Agent TaskFlows.

- **[workboard](/plugins/reference/workboard)** (`@openclaw/workboard`) - included in Zero to Agent. Dashboard workboard for agent-owned issues and sessions.

- **[xai](/plugins/reference/xai)** (`@openclaw/xai-plugin`) - included in Zero to Agent. Adds xAI model provider support to Zero to Agent.

## Official external packages

92 plugins

- **[acpx](/plugins/reference/acpx)** (`@openclaw/acpx`) - npm or ClawHub: `clawhub:@openclaw/acpx`. Zero to Agent ACP runtime backend with plugin-owned session and transport management.

- **[amazon-bedrock](/plugins/reference/amazon-bedrock)** (`@openclaw/amazon-bedrock-provider`) - npm or ClawHub. Zero to Agent Amazon Bedrock provider plugin with model discovery, embeddings, and guardrail support.

- **[amazon-bedrock-mantle](/plugins/reference/amazon-bedrock-mantle)** (`@openclaw/amazon-bedrock-mantle-provider`) - npm or ClawHub. Zero to Agent Amazon Bedrock Mantle provider plugin for OpenAI-compatible model routing.

- **[anthropic-vertex](/plugins/reference/anthropic-vertex)** (`@openclaw/anthropic-vertex-provider`) - npm or ClawHub. Zero to Agent Anthropic Vertex provider plugin for Claude models on Google Vertex AI.

- **[arcee](/plugins/reference/arcee)** (`@openclaw/arcee-provider`) - npm or ClawHub: `clawhub:@openclaw/arcee-provider`. Adds Arcee model provider support to Zero to Agent.

- **[baseten](/plugins/reference/baseten)** (`@openclaw/baseten-provider`) - npm or ClawHub: `clawhub:@openclaw/baseten-provider`. Zero to Agent Baseten provider plugin.

- **[brave](/plugins/reference/brave)** (`@openclaw/brave-plugin`) - npm or ClawHub. Zero to Agent Brave Search provider plugin for web search.

- **[buzz](/plugins/reference/buzz)** (`@openclaw/buzz`) - npm or ClawHub: `clawhub:@openclaw/buzz`. Connect Zero to Agent agents to Buzz rooms.

- **[byteplus](/plugins/reference/byteplus)** (`@openclaw/byteplus-provider`) - npm or ClawHub: `clawhub:@openclaw/byteplus-provider`. Adds BytePlus, BytePlus Plan model provider support to Zero to Agent.

- **[cerebras](/plugins/reference/cerebras)** (`@openclaw/cerebras-provider`) - npm or ClawHub: `clawhub:@openclaw/cerebras-provider`. Adds Cerebras model provider support to Zero to Agent.

- **[chutes](/plugins/reference/chutes)** (`@openclaw/chutes-provider`) - npm or ClawHub: `clawhub:@openclaw/chutes-provider`. Adds Chutes model provider support to Zero to Agent.

- **[clickclack](/plugins/reference/clickclack)** (`@openclaw/clickclack`) - npm or ClawHub: `clawhub:@openclaw/clickclack`. Zero to Agent ClickClack channel plugin.

- **[cloudflare-ai-gateway](/plugins/reference/cloudflare-ai-gateway)** (`@openclaw/cloudflare-ai-gateway-provider`) - npm or ClawHub: `clawhub:@openclaw/cloudflare-ai-gateway-provider`. Adds Cloudflare AI Gateway model provider support to Zero to Agent.

- **[codex](/plugins/reference/codex)** (`@openclaw/codex`) - npm or ClawHub. Codex app-server harness and native session catalog.

- **[cohere](/plugins/reference/cohere)** (`@openclaw/cohere-provider`) - npm or ClawHub: `clawhub:@openclaw/cohere-provider`. Zero to Agent Cohere provider plugin.

- **[comfy](/plugins/reference/comfy)** (`@openclaw/comfy-provider`) - npm or ClawHub: `clawhub:@openclaw/comfy-provider`. Adds ComfyUI model provider support to Zero to Agent.

- **[copilot](/plugins/reference/copilot)** (`@openclaw/copilot`) - npm or ClawHub: `clawhub:@openclaw/copilot`. Registers the GitHub Copilot agent runtime.

- **[deepinfra](/plugins/reference/deepinfra)** (`@openclaw/deepinfra-provider`) - npm or ClawHub: `clawhub:@openclaw/deepinfra-provider`. Adds DeepInfra model provider support to Zero to Agent.

- **[deepseek](/plugins/reference/deepseek)** (`@openclaw/deepseek-provider`) - npm or ClawHub: `clawhub:@openclaw/deepseek-provider`. Adds DeepSeek model provider support to Zero to Agent.

- **[diagnostics-otel](/plugins/reference/diagnostics-otel)** (`@openclaw/diagnostics-otel`) - npm or ClawHub: `clawhub:@openclaw/diagnostics-otel`. Zero to Agent diagnostics OpenTelemetry exporter for metrics, traces, and logs.

- **[diagnostics-prometheus](/plugins/reference/diagnostics-prometheus)** (`@openclaw/diagnostics-prometheus`) - npm or ClawHub: `clawhub:@openclaw/diagnostics-prometheus`. Zero to Agent diagnostics Prometheus exporter for runtime metrics.

- **[diffs](/plugins/reference/diffs)** (`@openclaw/diffs`) - npm or ClawHub: `clawhub:@openclaw/diffs`. Zero to Agent read-only diff viewer plugin and file renderer for agents.

- **[diffs-language-pack](/plugins/reference/diffs-language-pack)** (`@openclaw/diffs-language-pack`) - npm or ClawHub: `clawhub:@openclaw/diffs-language-pack`. Adds syntax highlighting for languages outside the default diffs viewer set.

- **[discord](/plugins/reference/discord)** (`@openclaw/discord`) - npm or ClawHub: `clawhub:@openclaw/discord`. Zero to Agent Discord channel plugin for channels, DMs, commands, and app events.

- **[duckduckgo](/plugins/reference/duckduckgo)** (`@openclaw/duckduckgo-plugin`) - npm or ClawHub: `clawhub:@openclaw/duckduckgo-plugin`. Adds web search provider support.

- **[exa](/plugins/reference/exa)** (`@openclaw/exa-plugin`) - npm or ClawHub: `clawhub:@openclaw/exa-plugin`. Adds web search provider support.

- **[featherless](/plugins/reference/featherless)** (`@openclaw/featherless-provider`) - npm or ClawHub: `clawhub:@openclaw/featherless-provider`. Zero to Agent Featherless AI provider plugin.

- **[feishu](/plugins/reference/feishu)** (`@openclaw/feishu`) - npm or ClawHub. Zero to Agent Feishu/Lark channel plugin for chats and workplace tools (community maintained by @m1heng).

- **[firecrawl](/plugins/reference/firecrawl)** (`@openclaw/firecrawl-plugin`) - npm or ClawHub: `clawhub:@openclaw/firecrawl-plugin`. Adds agent-callable tools. Adds web fetch provider support. Adds web search provider support.

- **[fireworks](/plugins/reference/fireworks)** (`@openclaw/fireworks-provider`) - npm or ClawHub: `clawhub:@openclaw/fireworks-provider`. Adds Fireworks model provider support to Zero to Agent.

- **[fish-audio-speech](/plugins/reference/fish-audio-speech)** (`@openclaw/fish-audio-speech`) - npm or ClawHub: `clawhub:@openclaw/fish-audio-speech`. Fish Audio S2.1 hosted text-to-speech with streaming, voice notes, and telephony output.

- **[gmi](/plugins/reference/gmi)** (`@openclaw/gmi-provider`) - npm or ClawHub: `clawhub:@openclaw/gmi-provider`. Zero to Agent GMI Cloud provider plugin.

- **[google-meet](/plugins/reference/google-meet)** (`@openclaw/google-meet`) - npm or ClawHub. Zero to Agent Google Meet participant plugin for joining calls through Chrome or Twilio transports.

- **[googlechat](/plugins/reference/googlechat)** (`@openclaw/googlechat`) - npm or ClawHub. Zero to Agent Google Chat channel plugin for spaces and direct messages.

- **[gradium](/plugins/reference/gradium)** (`@openclaw/gradium-speech`) - npm or ClawHub: `clawhub:@openclaw/gradium-speech`. Adds text-to-speech provider support.

- **[groq](/plugins/reference/groq)** (`@openclaw/groq-provider`) - npm or ClawHub: `clawhub:@openclaw/groq-provider`. Adds Groq model provider support to Zero to Agent.

- **[imessage](/plugins/reference/imessage)** (`@openclaw/imessage`) - npm or ClawHub: `clawhub:@openclaw/imessage`. Zero to Agent iMessage channel plugin using imsg on a signed-in Mac.

- **[inworld](/plugins/reference/inworld)** (`@openclaw/inworld-speech`) - npm or ClawHub: `clawhub:@openclaw/inworld-speech`. Inworld streaming text-to-speech (MP3, OGG_OPUS, PCM telephony).

- **[irc](/plugins/reference/irc)** (`@openclaw/irc`) - npm or ClawHub: `clawhub:@openclaw/irc`. Zero to Agent IRC channel plugin.

- **[kilocode](/plugins/reference/kilocode)** (`@openclaw/kilocode-provider`) - npm or ClawHub: `clawhub:@openclaw/kilocode-provider`. Adds Kilocode model provider support to Zero to Agent.

- **[kimi](/plugins/reference/kimi)** (`@openclaw/kimi-provider`) - npm or ClawHub: `clawhub:@openclaw/kimi-provider`. Adds Kimi, Kimi Code, Kimi Coding model provider support to Zero to Agent.

- **[line](/plugins/reference/line)** (`@openclaw/line`) - npm or ClawHub. Zero to Agent LINE channel plugin for LINE Bot API chats.

- **[llama-cpp](/plugins/reference/llama-cpp)** (`@openclaw/llama-cpp-provider`) - npm or ClawHub. Managed and external llama.cpp servers for GGUF chat and embeddings.

- **[lobster](/plugins/reference/lobster)** (`@openclaw/lobster`) - npm or ClawHub. Lobster workflow tool plugin for typed pipelines and resumable approvals.

- **[longcat](/plugins/reference/longcat)** (`@openclaw/longcat-provider`) - npm or ClawHub: `clawhub:@openclaw/longcat-provider`. Zero to Agent LongCat provider plugin.

- **[matrix](/plugins/reference/matrix)** (`@openclaw/matrix`) - npm or ClawHub: `clawhub:@openclaw/matrix`. Zero to Agent Matrix channel plugin for rooms and direct messages.

- **[mattermost](/plugins/reference/mattermost)** (`@openclaw/mattermost`) - npm or ClawHub: `clawhub:@openclaw/mattermost`. Zero to Agent Mattermost channel plugin.

- **[memory-lancedb](/plugins/reference/memory-lancedb)** (`@openclaw/memory-lancedb`) - npm or ClawHub. Zero to Agent LanceDB-backed long-term memory plugin with auto-recall, auto-capture, and vector search.

- **[meta](/plugins/reference/meta)** (`@openclaw/meta-provider`) - npm or ClawHub: `clawhub:@openclaw/meta-provider`. Adds Meta model provider support to Zero to Agent.

- **[mistral](/plugins/reference/mistral)** (`@openclaw/mistral-provider`) - npm or ClawHub: `clawhub:@openclaw/mistral-provider`. Adds Mistral model provider support to Zero to Agent.

- **[moonshot](/plugins/reference/moonshot)** (`@openclaw/moonshot-provider`) - npm or ClawHub: `clawhub:@openclaw/moonshot-provider`. Adds Moonshot model provider support to Zero to Agent.

- **[msteams](/plugins/reference/msteams)** (`@openclaw/msteams`) - npm or ClawHub. Zero to Agent Microsoft Teams channel plugin for bot conversations.

- **[mxc](/plugins/reference/mxc)** (`@openclaw/mxc-sandbox`) - npm or ClawHub. OS-level sandboxed tool execution via MXC: runs commands in a Windows ProcessContainer with configured MXC policy files.

- **[nextcloud-talk](/plugins/reference/nextcloud-talk)** (`@openclaw/nextcloud-talk`) - npm or ClawHub. Zero to Agent Nextcloud Talk channel plugin for conversations.

- **[nostr](/plugins/reference/nostr)** (`@openclaw/nostr`) - npm or ClawHub. Zero to Agent Nostr channel plugin for NIP-04 encrypted direct messages.

- **[novita](/plugins/reference/novita)** (`@openclaw/novita-provider`) - npm or ClawHub: `clawhub:@openclaw/novita-provider`. Adds Novita, Novita AI, Novitaai model provider support to Zero to Agent.

- **[opencode](/plugins/reference/opencode)** (`@openclaw/opencode-provider`) - npm or ClawHub: `clawhub:@openclaw/opencode-provider`. Adds OpenCode model provider support to Zero to Agent.

- **[openshell](/plugins/reference/openshell)** (`@openclaw/openshell-sandbox`) - npm or ClawHub: `clawhub:@openclaw/openshell-sandbox`. Zero to Agent sandbox backend for the NVIDIA OpenShell CLI with mirrored local workspaces and SSH command execution.

- **[parallel](/tools/parallel-search)** (`@openclaw/parallel-plugin`) - npm or ClawHub: `clawhub:@openclaw/parallel-plugin`. Adds web search provider support.

- **[perplexity](/plugins/reference/perplexity)** (`@openclaw/perplexity-plugin`) - npm or ClawHub: `clawhub:@openclaw/perplexity-plugin`. Adds web search provider support.

- **[pixverse](/plugins/reference/pixverse)** (`@openclaw/pixverse-provider`) - npm or ClawHub: `clawhub:@openclaw/pixverse-provider`. Zero to Agent PixVerse video generation provider plugin.

- **[qianfan](/plugins/reference/qianfan)** (`@openclaw/qianfan-provider`) - npm or ClawHub: `clawhub:@openclaw/qianfan-provider`. Adds Qianfan model provider support to Zero to Agent.

- **[qqbot](/plugins/reference/qqbot)** (`@tencent-connect/openclaw-qqbot`) - npm. Zero to Agent QQ Bot channel plugin for group and direct-message workflows.

- **[qwen](/plugins/reference/qwen)** (`@openclaw/qwen-provider`) - npm or ClawHub: `clawhub:@openclaw/qwen-provider`. Adds Qwen, Qwen Cloud, Model Studio, DashScope, Qwen Token Plan, Bailian Token Plan model provider support to Zero to Agent.

- **[radius](/plugins/reference/radius)** (`@openclaw/radius-provider`) - npm or ClawHub: `clawhub:@openclaw/radius-provider`. Radius model gateway provider.

- **[raft](/plugins/reference/raft)** (`@openclaw/raft`) - npm or ClawHub. Zero to Agent Raft channel plugin for secure CLI wake bridges.

- **[searxng](/plugins/reference/searxng)** (`@openclaw/searxng-plugin`) - npm or ClawHub: `clawhub:@openclaw/searxng-plugin`. Adds web search provider support.

- **[signal](/plugins/reference/signal)** (`@openclaw/signal`) - npm or ClawHub: `clawhub:@openclaw/signal`. Zero to Agent Signal channel plugin.

- **[slack](/plugins/reference/slack)** (`@openclaw/slack`) - npm or ClawHub. Zero to Agent Slack channel plugin for channels, DMs, commands, and app events.

- **[sms](/plugins/reference/sms)** (`@openclaw/sms`) - npm or ClawHub: `clawhub:@openclaw/sms`. Twilio SMS/MMS channel plugin for Zero to Agent messages.

- **[stepfun](/plugins/reference/stepfun)** (`@openclaw/stepfun-provider`) - npm or ClawHub: `clawhub:@openclaw/stepfun-provider`. Adds StepFun, StepFun Plan model provider support to Zero to Agent.

- **[synology-chat](/plugins/reference/synology-chat)** (`@openclaw/synology-chat`) - npm or ClawHub. Synology Chat channel plugin for Zero to Agent channels and direct messages.

- **[synthetic](/plugins/reference/synthetic)** (`@openclaw/synthetic-provider`) - npm or ClawHub: `clawhub:@openclaw/synthetic-provider`. Adds Synthetic model provider support to Zero to Agent.

- **[tavily](/plugins/reference/tavily)** (`@openclaw/tavily-plugin`) - npm or ClawHub: `clawhub:@openclaw/tavily-plugin`. Adds agent-callable tools. Adds web search provider support.

- **[team-reports](/plugins/reference/team-reports)** (`@openclaw/team-reports`) - npm or ClawHub: `clawhub:@openclaw/team-reports`. Daily, weekly, and monthly team activity reports from GitHub and Discord, with model-written summaries, served in the Control UI.

- **[teams-meetings](/plugins/reference/teams-meetings)** (`@openclaw/teams-meetings`) - npm or ClawHub: `clawhub:@openclaw/teams-meetings`. Join Microsoft Teams meetings as a Chrome browser guest.

- **[tencent](/plugins/reference/tencent)** (`@openclaw/tencent-provider`) - npm or ClawHub: `clawhub:@openclaw/tencent-provider`. Adds Tencent TokenHub, Tencent Tokenplan model provider support to Zero to Agent.

- **[tlon](/plugins/reference/tlon)** (`@openclaw/tlon`) - npm or ClawHub. Zero to Agent Tlon/Urbit channel plugin for chat workflows.

- **[tokenjuice](/plugins/reference/tokenjuice)** (`@openclaw/tokenjuice`) - npm or ClawHub: `clawhub:@openclaw/tokenjuice`. Compacts exec and bash tool results with tokenjuice reducers.

- **[twitch](/plugins/reference/twitch)** (`@openclaw/twitch`) - npm or ClawHub. Zero to Agent Twitch channel plugin for chat and moderation workflows.

- **[venice](/plugins/reference/venice)** (`@openclaw/venice-provider`) - npm or ClawHub: `clawhub:@openclaw/venice-provider`. Adds Venice model provider support to Zero to Agent.

- **[vercel-ai-gateway](/plugins/reference/vercel-ai-gateway)** (`@openclaw/vercel-ai-gateway-provider`) - npm or ClawHub: `clawhub:@openclaw/vercel-ai-gateway-provider`. Adds Vercel AI Gateway model provider support to Zero to Agent.

- **[voice-call](/plugins/reference/voice-call)** (`@openclaw/voice-call`) - npm or ClawHub. Zero to Agent voice-call plugin for Twilio, Telnyx, and Plivo phone calls.

- **[volcengine](/plugins/reference/volcengine)** (`@openclaw/volcengine-provider`) - npm or ClawHub: `clawhub:@openclaw/volcengine-provider`. Adds Volcengine, Volcengine Plan model provider support to Zero to Agent.

- **[voyage](/plugins/reference/voyage)** (`@openclaw/voyage-provider`) - npm or ClawHub: `clawhub:@openclaw/voyage-provider`. Adds embedding provider support, including memory search.

- **[vydra](/plugins/reference/vydra)** (`@openclaw/vydra-provider`) - npm or ClawHub: `clawhub:@openclaw/vydra-provider`. Adds Vydra model provider support to Zero to Agent.

- **[whatsapp](/plugins/reference/whatsapp)** (`@openclaw/whatsapp`) - npm or ClawHub: `clawhub:@openclaw/whatsapp`. Zero to Agent WhatsApp channel plugin for WhatsApp Web chats.

- **[xiaomi](/plugins/reference/xiaomi)** (`@openclaw/xiaomi-provider`) - npm or ClawHub: `clawhub:@openclaw/xiaomi-provider`. Adds Xiaomi, Xiaomi Token Plan model provider support to Zero to Agent.

- **[zai](/plugins/reference/zai)** (`@openclaw/zai-provider`) - npm or ClawHub: `clawhub:@openclaw/zai-provider`. Adds Z.AI model provider support to Zero to Agent.

- **[zalo](/plugins/reference/zalo)** (`@openclaw/zalo`) - npm or ClawHub. Zero to Agent Zalo channel plugin for bot and webhook chats.

- **[zalouser](/plugins/reference/zalouser)** (`@openclaw/zalouser`) - npm or ClawHub. Zero to Agent Zalo Personal Account plugin via native zca-js integration.

- **[zoom-meetings](/plugins/reference/zoom-meetings)** (`@openclaw/zoom-meetings`) - npm or ClawHub: `clawhub:@openclaw/zoom-meetings`. Join Zoom meetings as a Chrome browser guest.

## Source checkout only

3 plugins

- **[qa-channel](/plugins/reference/qa-channel)** (`@openclaw/qa-channel`) - source checkout only. Zero to Agent QA synthetic channel plugin.

- **[qa-lab](/plugins/reference/qa-lab)** (`@openclaw/qa-lab`) - source checkout only. Zero to Agent QA lab plugin with private debugger UI and scenario runner.

- **[visitor-access](/plugins/reference/visitor-access)** (`@openclaw/visitor-access`) - source checkout only. Manage expiring visitor grants through one Cloudflare Access email policy.

## How this page is built

Zero to Agent generates this page from the top-level
`extensions/*/openclaw.plugin.json` manifests and the root npm package
`files` exclusions. Optional `package.json` metadata enriches package and
distribution details. Regenerate the page with:

```bash
pnpm plugins:inventory:gen
```
