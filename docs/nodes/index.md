---
summary: "Nodes: pairing, capabilities, permissions, and CLI helpers for headless node hosts"
read_when:
  - Pairing a headless node host to a gateway
  - Enabling isolated OpenAgent session hosting on a paired node
  - Adding new node commands or CLI helpers
title: "Nodes"
doc-schema-version: 1
---

A **node** is a machine that connects to the Gateway with `role: "node"` and exposes a command surface (e.g. `system.*`) via `node.invoke`. In OpenAgent, nodes are headless node hosts started with `openagent node run` or installed as a service. Nodes use the Gateway WebSocket on the operator port. Protocol details: [Gateway protocol](/gateway/protocol).

Nodes are **peripherals**, not gateways: they don't run the gateway service, and channel messages (Discord, Telegram) land on the gateway, not on nodes.

Troubleshooting runbook: [/nodes/troubleshooting](/nodes/troubleshooting)

## Node pages

Set up a node:

- [Node pairing and status](/nodes/pairing-and-status) - Approve a node, read its status and host stats, and upgrade a fleet in order.
- [Run a node host](/nodes/node-host) - Foreground, service, SSH-tunnel, and headless hosts, their identity state, and system commands.

Give a node work:

- [Run commands on a node](/nodes/node-exec) - Allowlist commands, point exec at a node, invoke raw RPC, and bind a target.
- [Node-hosted MCP servers and skills](/nodes/mcp-and-skills) - Publish MCP tools, skills, and local model inference from the node machine.
- [Host OpenAgent sessions on a node](/nodes/session-hosting) - Worker session hosting, device placement, capacity, and container isolation.
- [Node session catalogs](/nodes/session-catalogs) - Codex, Claude, OpenCode, and Pi sessions discovered on the Gateway and paired nodes.

Govern and invoke device capabilities:

- [Node command policy](/nodes/command-policy) - Platform default allowlists, dangerous-command opt-ins, and the `gateway.nodes` config.

Node capabilities in depth:

- [Computer use](/nodes/computer-use) - Desktop control on a paired node, and the gates around it.
- [Talk mode](/nodes/talk) - Live voice conversation on a node.
- [Voice wake](/nodes/voicewake) - Wake-word capture on a node.
- [Media understanding](/nodes/media-understanding) - How the agent reads node-captured media.
- [Media playback](/nodes/media-playback) - Playing audio and video through a node.
- [Image and media support](/nodes/images) - Image formats and attachment handling.
- [Audio and voice notes](/nodes/audio) - Audio capture and voice-note handling.
- [Node troubleshooting](/nodes/troubleshooting) - Pairing, foreground, permission, and tool failures.
- [`openagent nodes`](/cli/nodes) - CLI reference for listing, inspecting, and managing nodes.

## Where each section moved

Every anchor this page used to publish still resolves here. Each entry below carries the original anchor and links to its new home.

**[Node pairing and status](/nodes/pairing-and-status)**

- <a id="pairing-%2B-status" /><a id="pairing-+-status" />[Pairing + status](/nodes/pairing-and-status#pairing-+-status)
- <a id="version-skew-and-upgrade-order" />[Version skew and upgrade order](/nodes/pairing-and-status#version-skew-and-upgrade-order)

**[Run a node host](/nodes/node-host)**

- <a id="remote-node-host-(system.run)" /><a id="remote-node-host-system-run" />[Remote node host (system.run)](/nodes/node-host#remote-node-host-system-run)
- <a id="gateway-deployments-that-cannot-host-nodes" />[Gateway deployments that cannot host nodes](/nodes/node-host#gateway-deployments-that-cannot-host-nodes)
- <a id="start-a-node-host-(foreground)" /><a id="start-a-node-host-foreground" />[Start a node host (foreground)](/nodes/node-host#start-a-node-host-foreground)
- <a id="remote-gateway-via-ssh-tunnel-(loopback-bind)" /><a id="remote-gateway-via-ssh-tunnel-loopback-bind" />[Remote gateway via SSH tunnel (loopback bind)](/nodes/node-host#remote-gateway-via-ssh-tunnel-loopback-bind)
- <a id="restrict-the-node-command-surface" />[Restrict the node command surface](/nodes/node-host#restrict-the-node-command-surface)
- <a id="start-a-node-host-(service)" /><a id="start-a-node-host-service" />[Start a node host (service)](/nodes/node-host#start-a-node-host-service)
- <a id="pair-%2B-name" /><a id="pair-+-name" />[Pair + name](/nodes/node-host#pair-+-name)
- <a id="headless-identity-state" />[Headless identity state](/nodes/node-host#headless-identity-state)
- <a id="system-commands-(node-host-%2F-mac-node)" /><a id="system-commands-node-host-/-mac-node" />[System commands (node host / mac node)](/nodes/node-host#system-commands-node-host-/-mac-node)
- <a id="headless-node-host-(cross-platform)" /><a id="headless-node-host-cross-platform" />[Headless node host (cross-platform)](/nodes/node-host#headless-node-host-cross-platform)

**[Node-hosted MCP servers and skills](/nodes/mcp-and-skills)**

- <a id="node-hosted-mcp-servers" />[Node-hosted MCP servers](/nodes/mcp-and-skills#node-hosted-mcp-servers)
- <a id="node-hosted-skills" />[Node-hosted skills](/nodes/mcp-and-skills#node-hosted-skills)
- <a id="local-model-inference" />[Local model inference](/nodes/mcp-and-skills#local-model-inference)

**[Run commands on a node](/nodes/node-exec)**

- <a id="allowlist-the-commands" />[Allowlist the commands](/nodes/node-exec#allowlist-the-commands)
- <a id="point-exec-at-the-node" />[Point exec at the node](/nodes/node-exec#point-exec-at-the-node)
- <a id="invoking-commands" />[Invoking commands](/nodes/node-exec#invoking-commands)
- <a id="exec-node-binding" />[Exec node binding](/nodes/node-exec#exec-node-binding)

**[Node session catalogs](/nodes/session-catalogs)**

- <a id="codex-sessions-and-transcripts" />[Codex sessions and transcripts](/nodes/session-catalogs#codex-sessions-and-transcripts)
- <a id="claude-sessions-and-transcripts" />[Claude sessions and transcripts](/nodes/session-catalogs#claude-sessions-and-transcripts)
- <a id="opencode-and-pi-sessions" />[OpenCode and Pi sessions](/nodes/session-catalogs#opencode-and-pi-sessions)

- <a id="openclaw-sessions-and-transcripts" />[OpenAgent sessions and transcripts](/nodes/session-catalogs#openclaw-sessions-and-transcripts)

**[Host OpenAgent sessions on a node](/nodes/session-hosting)**

- <a id="host-openclaw-sessions" />[Host OpenAgent sessions](/nodes/session-hosting#host-openclaw-sessions)
- <a id="isolate-hosted-worker-sessions-in-containers" />[Isolate hosted worker sessions in containers](/nodes/session-hosting#isolate-hosted-worker-sessions-in-containers)

**[Node command policy](/nodes/command-policy)**

- <a id="command-policy" />[Command policy](/nodes/command-policy#command-policy)
- <a id="config-(openclaw.json)" /><a id="config-openclaw-json" />[Config (`openclaw.json`)](/nodes/command-policy#config-openclaw-json)
- <a id="permissions-map" />[Permissions map](/nodes/command-policy#permissions-map)
