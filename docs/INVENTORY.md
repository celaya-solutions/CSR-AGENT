```
Document:    ZTA Harness — Upstream Inventory (Phase 1 Discovery)
Version:     v1.0.0
Author:      Celaya Solutions
Contact:     hello@celayasolutions.com
Date:        2026-09-12
SHA256:      [pending]
Chain:       n/a
Tx:          [not anchored]
License:     All Rights Reserved / Celaya Solutions
```

# Upstream Inventory

Phase 1 discovery output. **Nothing has been deleted.** This document records what
is in the upstream tree as of the pinned commit, so Phase 2 decisions and Phase 3
cuts can be made against evidence rather than assumption.

## 0. Pin

| Field         | Value                                         |
| ------------- | --------------------------------------------- |
| Upstream repo | https://github.com/openclaw/openclaw.git      |
| Pinned commit | `2a3b63857db35193c378e9a1481a4eb2b23e39ac`    |
| Commit date   | 2026-09-12 19:21:29 -0700                     |
| Version       | 2026.9.4                                      |
| Tag at HEAD   | none (HEAD is not a release tag)              |
| Nearest tag   | `release-publish/088d0f5b8755-1789111799`     |
| Work branch   | `csr-course`                                  |
| License       | MIT, "Copyright (c) 2026 OpenClaw Foundation" |

## 1. Build and boot (verbatim, as run)

```
pnpm install
pnpm openclaw --version
```

Both succeed. Two environment traps had to be cleared first; **both will hit students**:

1. **pnpm self-install is broken on macOS.** The repo pins
   `pnpm@12.3.4` via `package.json:2307` (`packageManager`). pnpm's own version
   switcher downloaded an incomplete copy: the native-binary install step was
   skipped, leaving a shebang-less shell script at
   `~/Library/pnpm/.tools/pnpm/12.3.4/bin/pnpm`. macOS `execvp` answers `ENOEXEC`
   for that file (the file's own header comment documents this), so every `pnpm`
   invocation died with:
   `ERROR Failed to switch pnpm to v12.3.4 ... spawnSync ... ENOEXEC`.
   Fix: `node ~/Library/pnpm/.tools/pnpm/12.3.4/node_modules/pnpm/install.js`.
2. `node_modules` was absent; the repo does not vendor it.

Node in use: v26.8.1. `package.json:2304` requires `>=24.16.0 <25 || >=26.1.0`.

## 2. Baseline metrics

| Metric                       | Value                                                                 |
| ---------------------------- | --------------------------------------------------------------------- |
| Repo on disk                 | 5.0 GB (4.4 GB of that is `.git`)                                     |
| Tracked files                | 41,862                                                                |
| Tracked content              | ~24 MB text, ~340 MB with binary assets                               |
| Root dependencies            | 66 prod + 62 dev + 1 optional = 129                                   |
| Resolved packages (lockfile) | 1,695                                                                 |
| Workspace packages           | 23 under `packages/` + `ui` + 165 entries under `extensions/`         |
| Bundled plugins              | 165 directories under `extensions/`, 83 with `enabledByDefault: true` |
| Top-level CLI commands       | 60                                                                    |
| Cold build                   | 18.8 s                                                                |
| Warm CLI start               | 0.96 s                                                                |
| Required env vars            | 0 unconditionally (see §7)                                            |

## 3. Directory map

### Top level

| Dir                                                                      | Purpose                                                                                           |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `src/`                                                                   | The application. Gateway, agent loop, CLI, channels core, plugin loader, config. 18,500 files.    |
| `extensions/`                                                            | 165 bundled plugin packages: every channel, every model provider, several core features.          |
| `ui/`                                                                    | Control UI, a Lit single-page app. Built to `dist/control-ui`, served by the Gateway.             |
| `packages/`                                                              | 23 internal libraries (`ai`, `agent-core`, `gateway-protocol`, `plugin-sdk`, `sdk`, …).           |
| `apps/`                                                                  | 8 native app targets: android, ios, macos, macos-mlx-tts, linux (Tauri), mobile, shared, swabble. |
| `docs/`                                                                  | 1,395 files of documentation.                                                                     |
| `test/`, `qa/`                                                           | Test suites and the QA-lab harness.                                                               |
| `scripts/`                                                               | Build, release, CI, PR, and QA tooling. 1,376 files.                                              |
| `dist/`, `dist-runtime/`                                                 | Generated build output, gitignored.                                                               |
| `skills/`, `custodian-skills/`                                           | Shipped skill library.                                                                            |
| `config/`, `deploy/`, `security/`, `patches/`, `examples/`, `git-hooks/` | Supporting config, deployment manifests, security policy, dependency patches.                     |
| `CHANGELOG/`                                                             | 135 per-release changelog files.                                                                  |

### `src/` subsystems (depth 2)

`acp agents audit auto-reply boards bootstrap canvas channels chat claws cli commands
compat config context-engine cron daemon docs fleet flows gateway hooks image-generation
infra interactive link-understanding llm logging mcp media media-generation
media-understanding meeting-bot memory memory-host-sdk model-catalog model-picker
music-generation node-host pairing plugin-sdk plugin-state plugins process projects
provider-runtime proxy-capture realtime-transcription routing scripts secrets security
session-cards sessions shared skills snapshot state status system-agent talk tasks
test-fixtures test-helpers test-utils trajectory transcripts tts tui types utils
video-generation web web-fetch web-search wizard worker`

## 4. Channel adapters

**Registration model:** there is no static channel list. Each channel is a bundled
plugin that self-declares in two files — `extensions/<id>/openclaw.plugin.json`
(`"categories": ["channels"]`) and `extensions/<id>/package.json` (an
`openclaw.channel` block, which is the authoritative descriptor). At runtime
`src/channels/bundled-channel-catalog-read.ts` aggregates them into
`src/channels/registry.ts` / `registry-lookup.ts`.

**27 bundled channel plugins.** (29 manifests carry the `channels` category, but
`memory-core` and `team-reports` have no `openclaw.channel` block and are not channels.)

`a2a buzz clickclack discord feishu googlechat imessage irc line matrix mattermost
msteams nextcloud-talk nostr qa-channel raft reef signal slack sms synology-chat
telegram tlon twitch whatsapp zalo zalouser`

`qa-channel` is a test-only synthetic transport, excluded from packaged installs.

### The four Phase 2 candidates

| Channel      | Path                   | Deps                                                                                                                                        | Student-side auth                                                                                                                                                    | Test files |
| ------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **Telegram** | `extensions/telegram/` | `grammy`, `@grammyjs/runner`, `@grammyjs/transformer-throttler`, `typebox`, `undici`                                                        | **BotFather bot token.** No app review, no OAuth, no business verification, no paid tier. Long-polling default, so no public URL needed.                             | 228        |
| **Discord**  | `extensions/discord/`  | `@discord/embedded-app-sdk`, `@discordjs/voice`, `discord-api-types`, `libopus-wasm`, `mdast-util-from-markdown`, `typebox`, `undici`, `ws` | Developer Portal bot token + invite to a server the student owns. Free, but more steps than Telegram.                                                                | 275        |
| **Slack**    | `extensions/slack/`    | `@slack/bolt`, `@slack/socket-mode`, `@slack/types`, `@slack/web-api`, `undici`, `ws`, `typebox`, `get-east-asian-width`                    | Slack app manifest + OAuth scopes + workspace install rights. Student must be a workspace admin.                                                                     | 159        |
| **WhatsApp** | `extensions/whatsapp/` | `baileys`, `audio-decode`, `typebox`                                                                                                        | QR scan against the student's own number via an unofficial Web client (`baileys`). No Meta business API, but **ban risk on a personal number** and QR sessions drop. | 105        |

Docs live at `docs/channels/<id>.md` (plus a `docs/channels/<id>/` subdirectory for the larger ones).
Config schema per channel at `extensions/<id>/src/config-schema.ts`.

Five further channels are **docs-only** — the docs page exists but the runtime is
fetched from a hosted catalog, not in this tree: `qqbot`, `wechat`, `wecom`,
`yuanbao`, `zaloclawbot`.

## 5. Control-plane clients

| Surface         | Entry point                                                                                                                                                                                                                     | Notes                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **CLI**         | `src/entry.ts` via bin wrapper `openclaw.mjs`; program built in `src/cli/program/build-program.ts:10`, commands registered in `src/cli/program/command-registry.ts` and `core-command-descriptors.ts` / `subcli-descriptors.ts` | 60 top-level commands. Lazy registration for startup speed.                                                                                      |
| **Control UI**  | `ui/index.html` → `ui/src/main.ts`; served by `src/gateway/server-control-ui-root.ts` from the **prebuilt** `dist/control-ui`                                                                                                   | Lit SPA, 39 runtime deps. One install, one version — no Gateway/UI version-compat fallback. Editing `ui/src` does nothing until `pnpm ui:build`. |
| **TUI**         | `src/tui/`, registered by `src/cli/tui-cli.ts`                                                                                                                                                                                  | A Gateway client like the Control UI, not an independent surface. Commands `tui`, `chat`, `terminal`, `resume`.                                  |
| **Native apps** | `apps/android` (Gradle), `apps/ios` (Xcode+fastlane), `apps/macos` + `apps/macos-mlx-tts` (SwiftPM), `apps/linux` (Tauri), `apps/swabble` (Swift), `apps/shared` (OpenClawKit)                                                  | `apps/mobile` is only a `version.json` pin.                                                                                                      |

## 6. Subsystems flagged by Phase 3

### 6.1 Node / device layer (Phase 3.3) — **cannot be cut cleanly**

Gateway side: `src/gateway/node-registry.ts` (1,622 lines) plus ~15 sibling modules
(`node-registry-private.ts`, `node-catalog.ts`, `node-command-policy.ts`,
`node-pairing-*.ts`, `node-invoke-*.ts`).
Device side: `src/node-host/` (`client.ts`, `connection.ts`, `computer-command.ts`,
`desktop-stream-command.ts`, `invoke-system-run-*.ts`, …).
CLI: `nodes`, `node`, `devices`, `connect`, `pairing`.

**`NodeRegistry` is imported directly by core Gateway modules**, including
`server-in-process-dispatch.ts`, `server-request-entry.ts`,
`server-node-session-runtime.ts`, `server-worker-environment-startup.ts` and
`server-worker-placement-startup.ts` — worker placement is built on node registry
types. Phase 3.3's escape hatch applies: keep the abstraction, remove only the
remote/multi-node paths.

`src/fleet/` (Docker "cell" tenancy) is a separate concept and a separate cut.

### 6.2 Plugin system (Phase 3.4) — **loader must stay**

Loader: `src/plugins/` (~450 files). Discovery `discovery.ts` /
`bundled-plugin-scan.ts`; manifest `manifest-registry.ts`; load `loader.ts` and
`loader-runtime-*.ts`; capability registry `registry.ts` + `registry-registrars-*.ts`.

**External install path exists and is separable:** `install.ts`, `install-npm*.ts`,
`git-install.ts`, `install-source-*.ts`, `uninstall*.ts`, `update-installed.ts`,
and the registry client `official-external-plugin-catalog*.ts` (feed
`https://clawhub.ai/v1/feeds/plugins`, fallback `https://registry.npmjs.org/`).

**The loader cannot be removed**, because core features ship as bundled plugins:
all channels, all model providers, plus `memory-core`, `active-memory`,
`memory-lancedb`, `memory-wiki`, `policy`, `vault`, `device-pair`,
`visitor-access`, `crabbox`, `diagnostics-otel`, `diagnostics-prometheus`,
`admin-http-rpc`, `oc-path`, `canvas`, `workboard`, `logbook`, `reef`,
`team-reports`, `session-share`, `webhooks`.

### 6.3 Multi-agent / delegation (Phase 3.5)

`src/agents/subagents/registry/` (lifecycle, sqlite store, sweeper, restart
recovery), `src/agents/subagents/spawn/` (spawn plan, launch authorization, depth
limits), `src/agents/subagents/announce/` and `/completion/` (agent-to-agent
handoff). Model-facing tools: `src/agents/tools/subagents-tool.ts`,
`src/agents/tools/openclaw-delegate-tool.ts`. Gateway wiring:
`src/gateway/session-subagent-reactivation.ts`,
`src/gateway/server-plugin-subagent-runtime.ts`,
`src/gateway/subagent-completion-tool-handoff.ts`.
Workspace isolation: `src/agents/worktrees/git-worktree-operations.ts`,
`src/sessions/session-worktree-lifecycle.ts`, CLI `worktrees`.

### 6.4 Model providers (Phase 3.6)

**55 plugins carry the `models` category**, plus 3 `agent-runtimes`
(`codex`, `copilot`, `acpx`). There is no core provider — Anthropic and OpenAI are
bundled plugins like the rest. Most are thin OpenAI-compatible HTTP wrappers with
no extra npm dependency; the ones carrying real SDK weight are `google`
(`@google/genai`, `google-auth-library`), `amazon-bedrock` (`@aws-sdk/*`,
`@smithy/*`), `amazon-bedrock-mantle` + `anthropic-vertex` (`@anthropic-ai/*`),
`copilot` (`@github/copilot-sdk`), `codex` (`@openai/codex`), and `acpx`
(`@agentclientprotocol/*`).

Phase 2 candidates: **`ollama`** (deps: `typebox` only; local, plus optional cloud
key) and one cloud provider — **`anthropic`** (no npm SDK dep; API key, CLI login,
or setup token) or **`openai`** (deps `ws`, `zod`, `werift`, `libopus-wasm`).

### 6.5 Sandbox backends (Phase 3.7)

Registry: `src/agents/sandbox/backend.ts:89` (`registerSandboxBackend`). Built-in:
`docker` (`backend.ts:247`), `podman` (`:252`), `ssh` (`:257`), implemented in
`docker-backend.ts` / `ssh-backend.ts`. Docker is driven by shelling out to the
`docker`/`podman` binary — **there is no Docker SDK dependency to remove.**
Plugin-registered backends: `extensions/crabbox` (cloud), `extensions/openshell`,
`extensions/mxc` (Windows).

**The agent loop does not hard-depend on any sandbox.** The `exec` tool
(`src/agents/lazy-exec-tool.ts` → `src/agents/bash-tools.ts`) runs on the host by
default; sandboxes are opt-in via config.

### 6.6 Scheduling and automations (Phase 3.9) — **blocked, needs your call**

Core cron lives at `src/cron/`, CLI `cron` with alias `automations`
(`src/cli/program/subcli-descriptors.ts:156-169`), Gateway index
`src/gateway/session-automation-index.ts`, schema
`src/config/schema.help.automation.ts`, model-facing tool
`src/agents/tools/cron-tool.ts`.
Also present: `webhooks` CLI over `src/hooks/gmail-ops.ts`, and five bundled hooks
in `src/hooks/bundled/` (`boot-md`, `bootstrap-extra-files`, `command-logger`,
`compaction-notifier`, `session-memory`).

The 5-week curriculum is not in this repo, so I cannot confirm these are out of
scope. **Not cutting until you confirm.**

## 7. Environment variables

**Nothing is unconditionally required.** The app boots on defaults: state dir
`~/.openclaw`, config `~/.openclaw/openclaw.json`, port derived from a profile hash.

Two vars are conditionally required:

| Var                                                     | Required when                                                  | Source                                                                          |
| ------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `OPENCLAW_GATEWAY_TOKEN` or `OPENCLAW_GATEWAY_PASSWORD` | Gateway binds beyond loopback with no token/password in config | `src/gateway/server-runtime-config.ts:107`                                      |
| `OPENCLAW_GATEWAY_PASSWORD`                             | `gateway.tailscale.funnel` is enabled                          | `src/gateway/server-runtime-config.ts:92`, `src/gateway/server-tailscale.ts:44` |

Provider and channel keys are required only if that provider or channel is selected.

**Scale of the surface:** ~1,271 distinct `OPENCLAW_*` tokens appear in source;
~1,029 excluding obvious test paths. The overwhelming majority are QA/E2E harness
vars (`OPENCLAW_LIVE_*` 187, `OPENCLAW_TEST_*` 136, `OPENCLAW_QA_*` 96), TUI
internals (`OPENCLAW_TUI_*` 49), and per-feature debug toggles. Upstream's own docs
say undocumented `OPENCLAW_*` vars are internal and may vanish
(`docs/help/environment.md:27`). The documented operator contract is far smaller:
paths (§`OPENCLAW_HOME`, `_STATE_DIR`, `_CONFIG_PATH`, `_WORKSPACE_DIR`, `_PROFILE`,
`_INCLUDE_ROOTS`), gateway (`_GATEWAY_URL/_PORT/_TOKEN/_PASSWORD`), logging
(`_LOG_LEVEL`, `_DEBUG_*`, `_DIAGNOSTICS*`), toggles (`_LOAD_SHELL_ENV`,
`_OFFLINE`, `_NO_AUTO_UPDATE`, `_BROWSER_HEADLESS`, `_THEME`), plus ~140 provider
credential vars listed at `docs/help/environment.md:77`.

Config: JSON5 (`src/config/io.load.ts:57`), file `openclaw.json`
(`src/config/paths.ts:31`), dir `~/.openclaw` (`src/config/state-dir.ts:9`).
Env file precedence: process env → `./.env` → `~/.openclaw/.env` → the `env` block
in `openclaw.json`. Schema is Zod: root at `src/config/zod-schema.root-shape.ts`
(528 lines) composing ~20 per-domain `zod-schema.*.ts` modules.

## 8. Outbound network calls not tied to the chosen channel or provider

This is the Phase 3.8 target list, and the Phase 5 network audit will be run
against it.

### Fires automatically (startup and/or timer)

| #   | What                         | Destination                                                                                   | When                                                                                                                      | Existing off switch                                                                                                             |
| --- | ---------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Telemetry / version ping** | `https://telemetry.openclaw.ai/api/latest-version` (`src/infra/telemetry.ts:24`)              | Gateway startup, then every 24 h. Called from `src/infra/update-startup.ts:1128`, `src/gateway/server-maintenance.ts:192` | `update.checkOnStart=false`, `OPENCLAW_NO_AUTO_UPDATE=1`, `DO_NOT_TRACK=1`, Nix mode, or `CI` (`src/infra/telemetry.ts:99-114`) |
| 2   | **Update-drift check**       | `https://registry.npmjs.org/` for package `openclaw`; git installs also `git fetch`           | Gateway startup, then on a computed interval (`src/infra/update-startup.ts:934-1000`)                                     | same as above (`:975-976`)                                                                                                      |
| 3   | **Remote model catalog**     | `https://catalog.openclaw.ai/models/v1/catalog.json` (`src/model-catalog/remote-config.ts:3`) | Gateway startup, then every 6 h (`src/model-catalog/remote-refresh.ts:23,90`)                                             | `models.catalogRefresh.enabled=false`                                                                                           |
| 4   | **macOS Sparkle appcast**    | `https://raw.githubusercontent.com/openclaw/openclaw/main/appcast.xml` (`appcast.xml:8`)      | macOS app launch + Sparkle's periodic check                                                                               | Sparkle prefs only; no env flag                                                                                                 |

**The telemetry payload is not just a version string.** `buildTelemetryPayload`
(`src/infra/telemetry.ts:260-269`) sends version, `platform-arch`, Node version,
surface, and `sessionsLast24h` — a usage count read out of the local state
database. A `User-Agent` of `openclaw/<version> (<platform>; node/<v>; <arch>;
<surface>)` is attached (`:143`).

### Fires only on explicit user action (listed for completeness)

| What                             | Destination                                                                                                     | Trigger                                                                                        |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| ClawHub skill-install ping       | `clawhub.ai/api/cli/telemetry/install` (`src/infra/clawhub-skills.ts:452-475`)                                  | installing a skill                                                                             |
| ClawHub plugin catalog / promos  | `clawhub.ai` (`src/gateway/server-methods/plugins.ts:199`, `src/commands/promos/list.ts:20`)                    | `plugins browse`, `promos list`                                                                |
| GeoIP database download          | `https://download.db-ip.com/free/dbip-city-lite-*.mmdb.gz` (`extensions/geolocation/src/config.ts:15`)          | first geolocation lookup, refreshed every 30 days, only if the `geolocation` plugin is enabled |
| `fd` / `ripgrep` binary download | `github.com/<repo>/releases/download/…`, `api.github.com` (`src/agents/utils/tools-manager.ts:155,289,310,378`) | first use of those tools if the pinned binary is missing. `OPENCLAW_OFFLINE=1` blocks it       |

### Not present

No Sentry, Bugsnag, Rollbar or Honeybadger. No PostHog, Segment, Mixpanel or
Amplitude. No crash reporter. `extensions/diagnostics-otel` and
`diagnostics-prometheus` only reach an operator-configured endpoint and are off by
default.

## 9. Tool surface and the confirmation default

Core tools are catalogued in `src/agents/tool-catalog.ts` (`CORE_TOOL_DEFINITIONS`,
`CORE_TOOL_GROUPS` at `:527`), implemented under `src/agents/tools/`.

Side-effecting tools — these write, send, post, or spend:
`write`, `edit`, `apply_patch`, `exec`, `process`, `code_execution`, `secrets`,
`sessions_send`, `sessions_spawn`, `conversations_send`, `conversations_turn`,
`github_publish`, `message`, `browser`, `screen`, `terminal`, `portal`, `canvas`,
`show_widget`, `gateway`, `plugins`, `nodes`, `computer`, `mobile_ui`,
`create_goal`, `update_goal`, `progress_card`, `skill_workshop`, `cron`,
`image_generate`, `music_generate`, `video_generate`, `tts`.

Read-only: `ls`, `read`, `web_search`, `web_fetch`, `x_search`, `memory_search`,
`memory_get`, `sessions_list`, `sessions_history`, `sessions_search`,
`conversations_list`, `session_status`, `agents_list`, `get_goal`, `view_image`,
`pdf`, `dashboard`.

Approval machinery exists: `src/infra/exec-approvals*.ts`,
`src/gateway/exec-approval-manager.ts`, per-call request flow in
`src/agents/bash-tools.exec-approval-request.ts:162,188`, sandbox policy in
`src/agents/sandbox/tool-policy.ts:181`.

**The shipped default does not use it.** `src/infra/exec-approvals-config.ts:83-84`:

```
export const DEFAULT_SECURITY: ExecSecurity = "full";
export const DEFAULT_ASK: ExecAsk = "off";
```

Host `exec` runs without per-call confirmation out of the box, confirmed by
`docs/tools/permission-modes.md:44-45`. This is a change, not a removal, so it is
recorded here and left for your decision.

## 10. Branding string surface

| String      | Occurrences | Tracked files |
| ----------- | ----------- | ------------- |
| `OpenClaw`  | 110,378     | 14,387        |
| `OPENCLAW_` | 41,129      | —             |
| `.openclaw` | 14,052      | —             |

By top directory (files containing `OpenClaw`): `src` 7,270 · `extensions` 3,004 ·
`apps` 1,317 · `docs` 1,164 · `ui` 421 · `test` 397 · `scripts` 385 ·
`packages` 88 · rest 300.

Canonical definitions, as opposed to references:

| Thing                 | Location                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| Package name          | `package.json:2`                                                                                        |
| CLI binary            | `package.json:22-23` → `openclaw.mjs`                                                                   |
| Config dir            | `src/config/state-dir.ts:9` (`NEW_STATE_DIRNAME`), `src/utils.ts:76`                                    |
| Config filename       | `src/config/paths.ts:31` (`CONFIG_FILENAME`)                                                            |
| UI title              | `ui/index.html:9`, plus copy at `:367,371,374,455`                                                      |
| Default system prompt | `src/agents/system-prompt.ts:840` and `:1185` — "You are a personal assistant running inside OpenClaw." |
| Version output        | `package.json` version, surfaced through `openclaw.mjs` / `node-version.mjs`                            |

**Risk flagged for Phase 4.2.** A blind `grep`-and-replace across 110,378
occurrences is not safe. The count mixes user-visible strings with internal
identifiers, `@openclaw/*` npm package names that must keep resolving, plugin ids
that key the manifest registry, `OPENCLAW_*` env var names, the `~/.openclaw` state
path, and test fixtures. The spec's own guidance — rename user-visible strings, do
not rename internal module paths — needs the two sets separated before any
rename runs. Sizing that split is the first Phase 4.2 task.

## 11. Open questions carried into Phase 2

1. **Curriculum.** Not in this repo, so Phase 3.9 (cron / automations / webhooks /
   bundled hooks) cannot be decided. Blocking for that item only.
2. **Native apps.** `apps/` is 8 targets and 2,591 files. Phase 3.2 says remove
   every client except the approved entry point; that reads as deleting all of
   `apps/`. Confirm, since it also removes the mobile pairing story (`openclaw qr`).
3. **Rename scope.** See §10. Recommend renaming user-visible strings only and
   leaving `openclaw` as the internal package/module/env identifier, which is what
   the spec already says but which the raw counts obscure.
4. **`.git` is 4.4 GB.** A student cloning this fork pulls all of it unless the
   fork is published from a shallow or truncated history. Out of the spec's scope
   but it directly affects the Phase 5 "under 30 minutes" cold-start target.
