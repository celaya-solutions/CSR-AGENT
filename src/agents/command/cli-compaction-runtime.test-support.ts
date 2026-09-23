// Real setup entries share the invocation build instead of transforming plugins inside a test.
const currentModuleUrl = import.meta.url;

export const cliCompactionBackendEntrypoints = [
  {
    provider: "claude-cli",
    pluginId: "anthropic",
    currentModuleUrl,
    sourceWorkerName: "../../../extensions/anthropic/setup-api",
    distWorkerPath: "extensions/anthropic/setup-api.js",
  },
] as const;
