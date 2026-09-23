// Bundled channel catalog fail-soft tests cover catalog read failures and fallback behavior.
import { importFreshModule } from "openclaw/plugin-sdk/test-fixtures";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("listBundledChannelCatalogEntries discovery failures", () => {
  it("falls back to bundled official metadata when package metadata is unavailable", async () => {
    vi.doMock("../infra/openclaw-root.js", () => ({
      resolveOpenClawPackageRootSync: () => null,
      resolveOpenClawPackageRoot: async () => null,
    }));
    vi.doMock("../plugins/bundled-dir.js", () => ({
      resolveBundledPluginsDir: () => undefined,
    }));
    // The shipped official external catalogs are empty in this distribution, so seed one
    // synthetic channel row to prove the fallback path still surfaces it.
    vi.doMock("../plugins/official-external-plugin-bundled-catalogs.js", () => ({
      BUNDLED_OFFICIAL_EXTERNAL_PLUGIN_CATALOG_ENTRIES: [
        {
          name: "@example/fallback-chat",
          openclaw: {
            channel: { id: "fallback-chat", label: "Fallback Chat", approvalFlags: ["native"] },
          },
        },
      ],
    }));

    const catalog = await importFreshModule<typeof import("./bundled-channel-catalog-read.js")>(
      import.meta.url,
      "./bundled-channel-catalog-read.js?scope=discovery-fail-soft",
    );

    expect(catalog.listBundledChannelCatalogEntries().map((entry) => entry.id)).toContain(
      "fallback-chat",
    );
    expect(catalog.findBundledChannelCatalogMetadata("fallback-chat")?.approvalFlags).toStrictEqual(
      ["native"],
    );
  });
});
