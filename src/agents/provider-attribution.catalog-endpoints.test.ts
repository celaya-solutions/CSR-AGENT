// Verifies endpoint classification when the official external provider catalog is empty.
import { describe, expect, it, vi } from "vitest";

// Simulates a built dist tree: externalized provider metadata comes from the
// catalog, while one installed manifest proves first-match precedence.
vi.mock("../plugins/plugin-metadata-snapshot-required.js", async (importOriginal) => {
  const { buildPluginMetadataProviderFacts } =
    await import("../plugins/plugin-metadata-provider-facts.js");
  return {
    ...(await importOriginal<typeof import("../plugins/plugin-metadata-snapshot-required.js")>()),
    getCurrentPluginMetadataSnapshotRequiredRuntime: () => ({
      owners: buildPluginMetadataProviderFacts([
        {
          id: "installed-conflict-fixture",
          providerEndpoints: [
            { endpointClass: "openai-public", hosts: ["coding.dashscope.aliyuncs.com"] },
          ],
        } as never,
      ]),
    }),
  };
});

import { resolveProviderEndpoint } from "./provider-attribution.js";

describe("catalog-backed provider endpoint classification", () => {
  it("prefers installed plugin manifest endpoints over catalog metadata", () => {
    expect(resolveProviderEndpoint("https://coding.dashscope.aliyuncs.com/v1").endpointClass).toBe(
      "openai-public",
    );
  });

  it("keeps unknown hosts classified as custom", () => {
    expect(resolveProviderEndpoint("https://proxy.example.com/v1").endpointClass).toBe("custom");
    expect(resolveProviderEndpoint("https://opencode.ai/api").endpointClass).toBe("custom");
  });

  it("keeps removed and unsupported catalog endpoints custom", () => {
    expect(resolveProviderEndpoint("https://portal.qwen.ai/v1").endpointClass).toBe("custom");

    // deepinfra-native and gmi-native are mirrored faithfully from their manifests
    // but are not core ProviderEndpointClass members, so they must stay inert.
    expect(resolveProviderEndpoint("https://api.deepinfra.com/v1/openai").endpointClass).toBe(
      "custom",
    );
    expect(resolveProviderEndpoint("https://api.gmi-serving.com/v1").endpointClass).toBe("custom");
  });
});
