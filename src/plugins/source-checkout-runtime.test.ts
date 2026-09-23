/** Verifies source-checkout plugin runtime resolution and dependency diagnostics. */
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadOpenClawPlugins } from "./loader.js";

describe("source checkout bundled plugin runtime", () => {
  it("loads enabled bundled plugins from source checkout", () => {
    const registry = loadOpenClawPlugins({
      cache: false,
      onlyPluginIds: ["llm-task"],
      config: {
        plugins: {
          entries: {
            "llm-task": { enabled: true },
          },
        },
      },
    });

    const llmTask = registry.plugins.find((plugin) => plugin.id === "llm-task");
    expect(llmTask?.status, llmTask?.error).toBe("loaded");
    expect(llmTask?.origin).toBe("bundled");

    const expectedRuntime = `${path.sep}extensions${path.sep}llm-task${path.sep}index.ts`;
    const expectedRoot = `${path.sep}extensions${path.sep}llm-task`;

    expect(llmTask?.source).toContain(expectedRuntime);
    expect(llmTask?.rootDir).toContain(expectedRoot);
  });
});
