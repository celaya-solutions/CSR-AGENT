export const BOUNDARY_GUARD_FIXTURE_ROOT = "test/fixtures/oxlint-boundary-guards";

export const TYPE_ASSERTION_PRODUCTION_ROOTS = ["src", "extensions", "packages", "ui/src"];

// Shared test-path policy for guards that intentionally exclude fixture, mock, and harness code.
export const TYPE_ASSERTION_TEST_FILE_SUFFIXES = [
  ".test.ts",
  ".test.tsx",
  ".spec.ts",
  ".spec.tsx",
  ".test-utils.ts",
  ".test-utils.tsx",
  ".test-harness.ts",
  ".test-harness.tsx",
  ".e2e-harness.ts",
  ".e2e-harness.tsx",
];

const TYPE_ASSERTION_TEST_PATH_MARKERS = [
  "/test/",
  "/tests/",
  "__tests__",
  "/e2e/",
  "test-helpers",
  "test-support",
  "test-fixtures",
  "test-mocks",
  "test-utils",
  "mock-http",
  "-harness.",
  ".test-utils.",
  "/mocks/",
];

// Burn-down ledger for chained assertions — shrink only; see PR #124060/#124073/#124079/#124082.
export const CHAINED_ASSERTION_EXCLUDED_ROOTS = [
  "extensions/browser/src/browser/bridge-server.ts", // Express app crosses the browser route registrar SDK seam
  "extensions/browser/src/browser/pw-session-actions.ts", // Playwright role overloads cannot express runtime-selected roles
  "extensions/browser/src/browser/pw-session.page-cdp.ts", // Playwright CDP typings require a closed method-name map
  "extensions/browser/src/browser/pw-tools-core.interactions.navigation.ts", // navigation observation uses a narrowed Playwright page capability
  "extensions/browser/src/browser/pw-tools-core.state.ts", // Playwright CDP typings require a closed method-name map
  "extensions/browser/src/browser/server-context.remote-tab-ops.harness.ts", // test support
  "extensions/browser/src/browser/system-chrome-cookies.ts", // SQLite row results cross the browser cookie schema boundary
  "extensions/browser/src/cli/browser-cli-actions-input/register.batch.ts", // batch budgeting intentionally sees permissive actions before route validation
  "extensions/browser/src/server.ts", // Express app crosses the browser route registrar SDK seam
  "extensions/codex/src/app-server/event-projector-tool-transcript.ts", // Codex transcript synthesis extends the public AgentMessage union
  "extensions/codex/src/app-server/run-attempt-resources.ts", // staged attempt resources initialize required lifecycle fields later
  "extensions/codex/src/app-server/run-attempt-runtime.ts", // supervised Codex models bridge the agent-harness model generic
  "extensions/discord/src/approval-native.ts", // approval runtime dynamically implements the public channel adapter seam
  "extensions/discord/src/components.modal.ts", // test-only fallback preserves partially mocked Discord module graphs
  "extensions/discord/src/monitor/gateway-plugin.ts", // Discord gateway lifecycle needs private SDK state
  "extensions/discord/src/monitor/message-handler.hydration.ts", // hydrated Discord messages bridge SDK constructor-private fields
  "extensions/discord/src/monitor/provider.startup-log.ts", // reconnect attempts are private Discord gateway diagnostics
  "extensions/discord/src/monitor/threading.starter.ts", // Discord thread channels narrow a dependency union after runtime checks
  "extensions/llm-task/index.ts", // tool factory bridges plugin-local and public AgentTool package types
  "extensions/telegram/src/approval-native.ts", // approval runtime dynamically implements the public channel adapter seam
  "extensions/telegram/src/client-fetch.ts", // Telegram and DOM fetch signatures use distinct body namespaces
  "extensions/telegram/src/doctor-contract.ts", // legacy doctor migration normalizes retired untyped config shapes
  "extensions/telegram/src/fetch.ts", // Node DNS and Undici fetch overloads bridge DOM-compatible runtime calls
  "extensions/telegram/src/outbound-media.ts", // Telegram API operation selection crosses overloaded method signatures
  "extensions/telegram/src/telegram-ingress-supersede-auth.ts", // Telegraf message input narrows into the ingress message contract
  "packages/ai/src/providers/anthropic.ts", // Anthropic compaction blocks are absent from the SDK content union
  "packages/ai/src/providers/openai-chatgpt-responses.ts", // raw Codex events and runtime WebSockets outpace SDK and DOM types
  "packages/ai/src/transports/openai-completions-transport.ts", // compatible-provider payloads are a superset of the OpenAI SDK request
  "packages/ai/src/transports/openai-responses-params-internal.ts", // response formats bridge legacy caller and current SDK shapes
  "packages/ai/src/transports/openai-responses-websocket.ts", // dual SDK ESM declarations split one client across nominal private fields
  "src/acp/client.ts", // Node and Web ReadableStream types live in separate namespaces.
  "src/acp/server.ts", // Node and Web ReadableStream types live in separate namespaces.
  "src/agents/agent-hooks/compaction-safeguard.ts", // AgentMessage custom roles exceed the Copilot header message contract.
  "src/agents/agent-model-discovery.ts", // Persisted registry rows need a fully resolved model parser owner.
  "src/agents/embedded-agent-helpers/images.ts", // Assistant blocks cross the tool-image sanitizer's narrower block namespace.
  "src/agents/embedded-agent-runner/run/attempt-stream.ts", // Synthetic yield stream metadata is wider than the provider model contract.
  "src/agents/embedded-agent-runner/run/images.ts", // Provider-only video blocks cross the canonical AgentMessage namespace.
  "src/agents/mcp-http-fetch.ts", // Undici Response crosses the DOM FetchLike type namespace.
  "src/agents/model-auth-model.ts", // Null Authorization sentinel crosses the SDK's string-only header type.
  "src/agents/model-provider-auth.ts", // Route-fact cache keys cross a config-only hash API.
  "src/agents/modes/interactive/theme/theme.ts", // Global symbol registry and Proxy receiver bridge duplicate module copies.
  "src/agents/tool-search-transcript.ts", // Synthetic target turns omit provider-owned assistant metadata.
  "src/channels/plugins/config-schema.ts", // Public SDK Zod generics preserve caller schema identity.
  "src/commands/channel-test-registry.ts", // Test support.
  "src/commands/doctor/cron/legacy-repair.ts", // Partially validated legacy rows cross the canonical cron store type.
  "src/commands/doctor/cron/legacy-store-migration.ts", // Legacy loader carries partial rows in the canonical store envelope.
  "src/commands/doctor/cron/warnings.ts", // Doctor inspects partially parsed cron rows.
  "src/config/schema.hints.ts", // Zod pipe internals cross its public type namespace.
  "src/config/sessions/store-entry-shape.ts", // Legacy projection accepts partially validated session records.
  "src/gateway/cli-session-history.claude.ts", // External CLI messages cross the canonical transcript redactor.
  "src/gateway/mcp-app-standalone-host.ts", // Generated standalone browser code bridges the DOM namespace.
  "src/gateway/server-methods/chat-transcript-inject.ts", // Gateway media blocks exceed the canonical message content union.
  "src/gateway/test-http-response.ts", // Test support.
  "src/infra/backup-volatile-stat-cache.ts", // node-tar's cache expects full Stats for a synthetic sentinel.
  "src/infra/diagnostic-trace-propagation.ts", // Global symbol registry crosses module copies.
  "src/infra/net/runtime-fetch.ts", // Undici and DOM fetch types live in separate namespaces.
  "src/infra/state-migrations.meeting-transcripts-files.ts", // Legacy summary validation does not prove element types.
  "src/infra/unhandled-rejections.ts", // Global symbol registry crosses module copies.
  "src/meeting-bot/browser-controller.ts", // Generic health fallbacks cannot construct arbitrary platform subtypes.
  "src/meeting-bot/platform-adapter.ts", // Generic parsers add adapter-owned health and transcript fields.
  "src/meeting-bot/plugin-shell.ts", // Type-only plugin namespace factory has no runtime value.
  "src/plugin-sdk/channel-config-helpers.ts", // Public SDK accessor generics are intentionally decoupled.
  "src/plugin-sdk/qa-runtime.ts", // Public SDK lazy module exposes a narrower runtime surface.
  "src/plugins/hook-isolation.ts", // Optional WebAssembly globals bridge runtime type namespaces.
  "src/plugins/interactive.ts", // Dynamic plugin context keys cross the generic handler seam.
  "src/plugins/loader-runtime-load.ts", // Discovery-only runtime is widened by the registry proxy.
  "src/plugins/registry-runtime.ts", // Bundled owner wrapper crosses the public inbound generic.
  "src/plugins/runtime/index.ts", // Lazy assembly adds required runtime capabilities after construction.
  "src/process/exec-spawn.ts", // Rebuilt Execa options cross its result generic.
  "src/proxy-capture/store.sqlite.ts", // Implementation preserves overloaded shipped constructor contracts.
  "src/trajectory/export.ts", // Legacy migration mutates pre-canonical transcript entries.
  "ui/src/app/native-bridge.ts", // WebView2 hosts augment Window outside the DOM type namespace
  "ui/src/app/native-link-routing.ts", // WebKit hosts augment Window with native message handlers
  "ui/src/app/native-window-drag.ts", // WebKit hosts augment Window with a native drag handler
  "ui/src/pages/chat/chat-state-page.ts", // two-phase page construction assigns required host actions after state creation
];

export function pathMatchesTypeAssertionRoot(repoPath, root) {
  return repoPath === root || repoPath.startsWith(`${root}/`);
}

export function isSkippedTypeAssertionTestPath(repoPath) {
  if (pathMatchesTypeAssertionRoot(repoPath, BOUNDARY_GUARD_FIXTURE_ROOT)) {
    return false;
  }
  const slashPrefixedPath = `/${repoPath}`;
  return (
    TYPE_ASSERTION_TEST_FILE_SUFFIXES.some((suffix) => repoPath.endsWith(suffix)) ||
    TYPE_ASSERTION_TEST_PATH_MARKERS.some((marker) => slashPrefixedPath.includes(marker))
  );
}
