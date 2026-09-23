---
summary: "OpenAgent capabilities across channels, routing, media, and UX."
read_when:
  - You want a full list of what OpenAgent supports
title: "Features"
---

## Highlights

<Columns>
  <Card title="Channels" icon="message-square" href="/channels">
    Discord, Telegram, and WebChat with a single Gateway.
  </Card>
  <Card title="Plugins" icon="plug" href="/tools/plugin">
    Bundled plugins add channels, model providers, web search, and agent tools.
  </Card>
  <Card title="Routing" icon="route" href="/concepts/multi-agent">
    Multi-agent routing with isolated sessions.
  </Card>
  <Card title="Media" icon="image" href="/nodes/images">
    Images, audio, video, documents, and image/video generation.
  </Card>
  <Card title="Interfaces" icon="monitor" href="/web">
    Browser Control UI, WebChat, and the terminal UI.
  </Card>
  <Card title="Nodes" icon="server" href="/nodes">
    Headless node hosts with pairing and remote command execution.
  </Card>
</Columns>

## Full list

**Channels:**

- Discord, Telegram, and WebChat, all in this repository; Discord and Telegram
  load from `extensions/` in a source checkout
- Group chat support with mention-based activation
- DM safety with allowlists and pairing

**Agent:**

- Embedded agent runtime with tool streaming
- Multi-agent routing with isolated sessions per workspace or sender
- Sessions: direct chats collapse into shared `main`; groups are isolated by default
- Streaming and chunking for long responses
- ACP agents through `acpx`, the Codex app-server harness, and a delegation team
  through `agent-workforce`

**Auth and providers:**

- Bundled [model providers](/providers): Anthropic, OpenAI, OpenRouter, Ollama,
  and llama.cpp
- Subscription auth via OAuth (e.g. OpenAI Codex)
- Any OpenAI-compatible or Anthropic-compatible endpoint through
  `models.providers`

**Media:**

- Images, audio, video, and documents in and out
- [Inline audio and video playback](/nodes/media-playback) in the Control UI
- Shared image generation and video generation capability surfaces
- Voice note transcription
- Text-to-speech through OpenAI or OpenRouter

**Interfaces:**

- WebChat and browser Control UI
- Terminal UI (`openagent tui`)

**Tools and automation:**

- Browser automation, exec, sandboxing
- Web search (Codex Hosted Search, DuckDuckGo, Ollama Web Search) and web fetch
- Document extraction and structured LLM tasks
- Cron jobs and heartbeat scheduling
- Skills and plugins

## Related

<CardGroup cols={2}>
  <Card title="Experimental features" href="/concepts/experimental-features" icon="flask">
    Opt-in features that have not yet shipped to the default surface.
  </Card>
  <Card title="Agent runtime" href="/concepts/agent" icon="robot">
    Agent runtime model and how runs are dispatched.
  </Card>
  <Card title="Channels" href="/channels" icon="message-square">
    Connect Discord and Telegram from one Gateway.
  </Card>
  <Card title="Plugins" href="/tools/plugin" icon="plug">
    Bundled and external plugins that extend OpenAgent.
  </Card>
</CardGroup>
