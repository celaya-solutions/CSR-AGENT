---
summary: "The architecture case for OpenAgent: a trusted gateway, untrusted execution, deterministic policy, and versioned state, compared source-by-source with single-process harnesses"
read_when:
  - You are evaluating agent harnesses for team or enterprise use
  - You need to explain to a security team how OpenAgent differs from single-process harnesses
  - You want the citable version of the trusted-gateway / untrusted-execution argument
  - You want to know whether OpenAgent's enterprise depth makes it heavyweight for personal use
title: "Why OpenAgent"
---

OpenAgent is an extensible, proactive, open-source AI agent that works everywhere you work. It exists because software is inverting: for decades you went to the computer, opened the app, clicked through its screens, and did the work yourself. An agent acts on your behalf instead, on your machine, in your messages, against your accounts.

That inversion is why agents feel like the beginning of something rather than another product cycle, and why they deserve more scrutiny than anything you have installed before: an assistant that acts for you holds credentials, reads mail, and runs commands on real computers. The architecture decides what it _can_ do long before any policy decides what it _may_.

OpenAgent is a course edition by Celaya Solutions, derived from OpenClaw. It keeps OpenClaw's architecture and MIT license, trims the bundled plugins to a teaching set, and installs from source.

For an evaluation, governance is not decoration. It answers who controls the roadmap, who signs what you deploy, and what happens when any one vendor's incentives change.

Agent platforms commonly offer [channels](/channels), [tools](/tools), [memory](/concepts/memory), [skills](/tools/skills), [scheduling](/automation). A feature table does not establish the security model. The main distinctions are **where the trust boundary lies** and **whether policy is enforced in code or requested in the system prompt**.

A single trust envelope can put the agent loop, channel connections, credentials, and shell under one OS user. Wrapping that entire application in a VM isolates it from the host, but does not separate those components from each other.

The recurring comparison is [Hermes Agent](https://github.com/NousResearch/hermes-agent/tree/6defe7eb6c462bb784d1f27f5afe7ca4b627fc70), whose [security policy](https://github.com/NousResearch/hermes-agent/blob/6defe7eb6c462bb784d1f27f5afe7ca4b627fc70/SECURITY.md) states:

> The only security boundary against an adversarial LLM is the operating system.

OpenAgent can separate a trusted [Gateway](/gateway) from untrusted, movable execution. Policy is enforced in code, and state is versioned and migrated, so a deployment is replaceable. This page compares configured architectures, not default security certifications: sandboxing is off by default in OpenAgent. The source review was refreshed on August 27, 2026 against upstream OpenClaw `7b624e9de25` and [Hermes Agent `6defe7eb6c`](https://github.com/NousResearch/hermes-agent/tree/6defe7eb6c462bb784d1f27f5afe7ca4b627fc70). These are development snapshots; check your installed version and configuration before relying on a capability.

A good harness spans the whole range: the same product runs as a personal assistant on one laptop and as a hardened team deployment, with configuration as the only difference. There is no enterprise edition. If you run OpenAgent for yourself, the defaults are tuned for you and none of this requires action. The properties below are phrased as an enterprise evaluation because that is the harshest audience, but every one of them protects a single operator the same way: credentials the agent never sees, deletion that sticks, upgrades that refuse to break state.

## What an enterprise harness has to prove

Seven testable properties:

1. **Separated trust boundary.** Execution moves into a sandbox, a node, or a throwaway cloud machine without standing Gateway credentials; scoped worker credentials have a separate lifecycle.
2. **Policy is code.** Denial is structural, not a request the model is asked to honor; approval paths fail closed.
3. **Authenticated access, bounded roles.** Inbound access is default-deny and authenticated; people hold bounded roles; the vendor states which boundaries are security and which are convenience.
4. **Secrets have owners.** Isolatable credential failures degrade their owners; ingress-auth and invalid-configuration failures stop startup.
5. **Versioned state, guarded upgrades.** State is schema-versioned with owned migrations; upgrades are guarded and delivered through release channels.
6. **Recorded provenance.** Memory, audit, and delivery use recorded facts, explicit retention policies, and documented deletion limits.
7. **Independent stewardship.** The license has no separate enterprise edition; releases are signed by an accountable identity; the security record is public.

<a id="where-each-section-moved" />

## How OpenAgent answers

The short answers, with details and limits on the linked pages:

- <a id="the-trust-boundary" />**Isolation limits what compromised execution can reach.** Configured sandboxes, nodes, and cloud workers separate execution from Gateway authority; exposure still depends on tools, mounts, network policy, and scoped credentials. ([Trust boundary](/start/why-openclaw/the-trust-boundary))
- <a id="policy-as-code" />**Configured policy is enforced in code.** Tool availability and exec denial do not depend only on model compliance; commands requiring approval must satisfy the applicable binding rules. ([Policy as code](/start/why-openclaw/policy-as-code))
- <a id="identity-and-roles" />**Access follows the configured admission policy.** Pairing-mode channels challenge unknown senders, and broader device scopes require approval; role ceilings and a deny-all default role require configuration. ([Identity and roles](/start/why-openclaw/identity-and-roles))
- <a id="secrets" />**Protected credentials can stay out of model context.** Protected secret values use handles and supported egress substitution; agent-readable entries, host access, and permitted-service responses have separate exposure risks. ([Secrets](/start/why-openclaw/secrets))
- <a id="versioned-state%2C-guarded-upgrades" /><a id="versioned-state-guarded-upgrades" />**Version checks guard upgrades.** Schemas are versioned, updaters check compatibility, and releases are immutable and signed. Version checks do not guarantee that every upgrade succeeds. ([Versioned state](/start/why-openclaw/versioned-state-guarded-upgrades))
- <a id="provenance" />**Forgetting has explicit boundaries.** Attributable memories can be purged, and forgotten-session records prevent reingestion through participating paths; original transcripts, untracked writes, and external copies remain separate. ([Provenance](/start/why-openclaw/provenance))
- **MIT licensed, no paid tier.** A course edition built from source, with no hosted service in the middle. ([Governance](#governance))

<a id="openclaw-and-hermes-agent" />

[What we do not claim](#what-we-do-not-claim) states the limits, starting with sandboxing being off by default.

## The vendor's harness, as a plugin

Agent harnesses are becoming model-specific: labs train and evaluate their models inside their own loops. OpenAgent treats those harnesses as first-class runtimes rather than API endpoints ([agent runtimes](/concepts/agent-runtimes)). The [Codex plugin](/plugins/codex-harness) drives Codex's own app-server loop — native thread resume, compaction, approvals, mid-turn steering, OpenAgent tools bridged into Codex turns, [computer use](/plugins/codex-computer-use) — the Copilot plugin runs the GitHub Copilot SDK's session loop, and the Anthropic plugin drives the installed Claude Code executable through its structured stdio protocol, while OpenAgent keeps ownership of channels, sessions, policy, and state. The choice stays with the operator, subject to supported routes, authentication, and request settings. [Runtime selection](/concepts/agent-runtimes#runtime-selection) can use a declared fallback to OpenAgent's built-in loop; inspect the completed runtime when exact harness ownership matters. Gateways that integrate these vendors at the API layer keep their own executor in charge; the vendor harness is at most an optional backend.

This embedding pattern comes from the vendors. OpenAI built the Codex app-server so partners could "embed the same harness in their own products" ([Unlocking the Codex harness](https://openai.com/index/unlocking-the-codex-harness/)) and [described its open-source harness and platform integrations](https://developers.openai.com/blog/codex-as-a-platform) in August 2026; Anthropic ships the [Claude Agent SDK](https://anthropic.com/engineering/building-agents-with-the-claude-agent-sdk) as the same harness that powers Claude Code. The relevant comparison is which native lifecycle and tool contracts an integration preserves, not whether it merely names the vendor's model.

Like other OpenAgent features, harnesses ship as plugins against a core that stays deliberately small. Channels, model providers, memory, voice, the Codex harness — all plugins behind documented [capability registration points](/plugins/architecture), with the boundary enforced by CI import guards, not convention. You can remove what you do not want (strip channels, disable memory, run a minimal surface, pin the allowed set with `plugins.allow`), and third parties can add what we did not build through the same [SDK contracts](/plugins/sdk-channel-plugins) — including whole message channels, which is how community plugins cover networks the core never touches. The ordinary plugin loader validates [manifests](/plugins/manifest) before importing plugin runtime code. Trusted bundled helpers can load separately after path validation.

The public plugin SDK publishes about 150 entrypoints, held under shrink-only surface budgets so growth is a conscious decision. Hermes also has a broad [Python plugin API](https://github.com/NousResearch/hermes-agent/blob/6defe7eb6c462bb784d1f27f5afe7ca4b627fc70/hermes_cli/plugins.py), including tools, platforms, context engines, memory, secret sources, and media providers, plus a [desktop plugin SDK](https://github.com/NousResearch/hermes-agent/blob/6defe7eb6c462bb784d1f27f5afe7ca4b627fc70/website/docs/developer-guide/desktop-plugin-sdk.md). Its seven consent capability IDs describe permission gates, not the size of that API.

OpenAgent has no default skill or plugin registry; an operator can configure one with `OPENCLAW_CLAWHUB_URL`. Hermes distributes skills through tap repositories and maintains an MCP catalog.

## Open standards

OpenAgent adopts the protocols the ecosystem is converging on. It is an [MCP client](/tools/mcp) (Streamable HTTP, SSE, and stdio transports, with OAuth) and an [MCP server](/cli/mcp), and plugins can [ship their own MCP servers and apps](/plugins/manifest/surfaces#mcp-server-reference). Editors connect over the [Agent Client Protocol](/cli/acp), which OpenAgent also uses to [host external harnesses](/tools/acp-agents). Agents render live [A2UI widgets](/web/dashboards) on session dashboards.

Skills follow the [AgentSkills spec](/tools/skills), plugin installs auto-detect [Agent Plugins, Codex, Claude, and Cursor bundle layouts](/plugins/bundles), and the Gateway can serve an [OpenAI-compatible API](/gateway/openai-http-api) (`/v1/chat/completions` with a documented function-tool subset, [`/v1/responses`](/gateway/openresponses-http-api), `/v1/models`, `/v1/embeddings`; disabled by default, `/v1/responses` separately enabled) so OpenAI clients can target the Gateway directly. Observability exports over OpenTelemetry and Prometheus; gateways advertise via Bonjour and DNS-SD; channels include native Matrix, IRC, and Nostr protocol implementations; and releases ship with npm provenance and verifiable artifact attestations.

## Working together

Most agent-assisted work today happens between one person and one terminal; others see the finished commits. A shared OpenAgent gateway makes the work itself observable. [Sessions](/concepts/session) carry an immutable creator, an assignable owner, and the people who actually prompted; the [Control UI](/web/control-ui) shows [who is viewing and typing](/concepts/presence) in real time (drafts stay ephemeral and never reach the model or the transcript), and the sidebar filters by owner or by "involving me" ([multi-user](/concepts/multi-user)). A conversation that starts in a channel can continue as a session the whole team can open, steer, and take over.

OpenAgent supplies exact `Co-authored-by` trailers for eligible shared-session participants with verified GitHub identity and **Git co-author credit** enabled, ordered by recorded contribution aggregates. Credit is on by default for verified accounts and can be disabled in Profile. The Gateway publication broker enforces that credit in its generated commits and pull requests; ordinary Git relies on the agent following the session's system prompt. When an external HTTPS session URL is available, broker-created pull requests end with a link to the team session ([user model](/concepts/user-model)), so a reviewer with access can read the conversation that produced the diff. [Cloud workers](/gateway/cloud-workers) put execution on disposable machines while the transcript stays in one shared place. [Portals](/gateway/portals) proxy an agent's development server into the operator's browser through the Gateway, and Cloud Worker Desktop streams a live VNC view of the worker — an authenticated loopback-only RFB server, reached through a single-use broker ticket over the worker's own outbound connection, never public ingress, with view-only filtering and single-controller arbitration. Hermes also provides visual observation: its desktop app [forwards remote development servers over SSH](https://github.com/NousResearch/hermes-agent/blob/6defe7eb6c462bb784d1f27f5afe7ca4b627fc70/apps/desktop/electron/preview-reach.ts), and its [Camofox integration can expose a browser VNC viewer](https://github.com/NousResearch/hermes-agent/blob/6defe7eb6c462bb784d1f27f5afe7ca4b627fc70/tools/browser_camofox.py#L154). Those are different transports and scopes from OpenAgent's Gateway-brokered worker desktop. The roles, attribution, and audit surfaces in [Identity and roles](/start/why-openclaw/identity-and-roles) and [Provenance](/start/why-openclaw/provenance) support shared sessions. To set this up for your own team, follow [Team setup](/start/teams).

## Governance

OpenAgent is MIT-licensed, with no enterprise edition under a different license. It is maintained by Celaya Solutions as a course edition of OpenClaw and is not endorsed by the OpenClaw Foundation. Providers are plugins, and no lab's model is privileged in the code. OpenAgent sells nothing through the product: no paid tier, no hosted service, no token. It sends no telemetry unless you configure an endpoint; see [Usage telemetry and update checks](/gateway/telemetry). Traffic to your configured model providers and channels goes to them.

OpenAgent keeps upstream's written [trust model](/gateway/security) and [incident response plan](/security/incident-response).

## What we do not claim

- Sandboxing and exec approvals are off by default. Default OpenAgent is a trusted single-operator assistant. Hardening is deliberate configuration, and `openclaw security audit` will tell you when you have drifted from it.
- One gateway is one trust domain. Roles and session ownership are collaboration guardrails. Tenancy means one gateway cell per tenant, and fleet is still experimental.
- Native plugins run in-process and are not sandboxed. Mitigations are allow-lists, an install-policy hook, pinned versions, dependency locking, and CI-enforced SDK boundaries. Both OpenAgent and Hermes require trust in installed native plugins.
- Egress allowlisting covers cooperating traffic only. The [secret egress proxy](/gateway/secrets) gained an opt-in traffic allowlist for Gateway-hosted exec (August 2026) on top of its bypass-surviving sentinels, sandboxed execution defaults to kernel-enforced `network: "none"` or runs under the OpenShell backend's default-deny policy allowlists, but raw sockets from unsandboxed host exec answer to an operator-supplied [proxy](/security/network-proxy) or host policy, not to OpenAgent. Allowlist proxies elsewhere have had published bypasses; the sentinel design assumes bypass instead of trying to prevent it.
- Promoted memories have no time-based retention bound. Provenance and [`openclaw memory forget`](/cli/memory) cover tracked artifacts; admission exclusions apply to dreaming ingestion and session backfill, not direct writes, hooks, or raw transcript indexing. Review [deletion limits](/concepts/memory-provenance#what-deletion-does-not-cover) separately. Turn taint covers network-sourced tool output; text arriving through non-network tools does not taint the turn.
- `gateway.roles` is present in the reviewed August 2026 source snapshot. Check your installed version before depending on it.

## The hardened setup

Each enterprise configuration item links to its reference:

- Sandbox on: `agents.defaults.sandbox.mode: "all"` with the `openshell` or [`docker`](/gateway/sandboxing) backend; `workspaceAccess: "ro"` unless the agent owns the workspace.
- Select [`guarded` or `workspace`](/gateway/permission-modes) per session; `full` requires `operator.admin`. Sessions without a mode, including managed worktree sessions, use configured tool/exec policy.
- Front the gateway with [Tailscale](/gateway/tailscale) or an [identity-aware proxy](/gateway/trusted-proxy-auth); define [`gateway.roles`](/gateway/operator-scopes) with a deny-all default; leave DM policy on [pairing](/channels/pairing).
- Everything behind [SecretRefs](/gateway/secrets); run `openclaw secrets audit --check` against your config in CI.
- Enable [message auditing](/gateway/audit); export OpenTelemetry to your SIEM with operator-owned retention and monitoring for dropped data.
- Schedule [`openclaw security audit --deep`](/gateway/security/audit-checks) and alarm on its check IDs.

Then operate it as replaceable infrastructure: pin a channel, let [doctor](/cli/doctor) own migrations, restore [backups](/cli/backup) by verification, and redeploy instead of repairing deployments in place.

Corrections to any claim on this page, about OpenAgent or about others, are welcome as issues or pull requests.
