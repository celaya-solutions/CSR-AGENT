// Verifies manifest-driven model suppression behavior.
import fs from "node:fs";
import { normalizeModelCatalog } from "@openclaw/model-catalog-core/model-catalog-normalize";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadPluginMetadataSnapshot: vi.fn(),
  resolvePluginMetadataSnapshot: vi.fn(),
}));

vi.mock("./plugin-metadata-snapshot.js", () => ({
  loadPluginMetadataSnapshot: mocks.loadPluginMetadataSnapshot,
  resolvePluginMetadataSnapshot: mocks.resolvePluginMetadataSnapshot,
}));

import { buildManifestBuiltInModelSuppressionResolver } from "./manifest-model-suppression.js";
import { createPluginCache, getPluginCache, withPluginCache } from "./plugin-cache.js";

function createMetadataSnapshot(plugins: Record<string, unknown>[]) {
  return {
    index: { plugins: [] },
    diagnostics: [],
    plugins: plugins.map((plugin) => ({ origin: "bundled", ...plugin })),
  };
}

describe("manifest model suppression", () => {
  beforeEach(() => {
    mocks.loadPluginMetadataSnapshot.mockReset();
    mocks.loadPluginMetadataSnapshot.mockReturnValue(
      createMetadataSnapshot([
        {
          id: "openai",
          providers: ["openai"],
          modelCatalog: {
            aliases: {
              "azure-openai-responses": {
                provider: "openai",
              },
            },
            suppressions: [
              {
                provider: "azure-openai-responses",
                model: "gpt-5.3-codex-spark",
                reason: "Use openai/gpt-5.5.",
              },
              {
                provider: "openrouter",
                model: "foreign-row",
              },
            ],
          },
        },
      ]),
    );
    mocks.resolvePluginMetadataSnapshot.mockImplementation(
      (params?: Parameters<typeof mocks.loadPluginMetadataSnapshot>[0]) =>
        mocks.loadPluginMetadataSnapshot(params),
    );
  });

  it("retains each exact snapshot's compiled rules across operation A/B/A interleaving", () => {
    const config = {};
    const ownerA = createPluginCache();
    const ownerB = createPluginCache();
    const snapshots = ["first rules", "second rules"].map((reason) =>
      createMetadataSnapshot([
        {
          id: "fixture",
          providers: ["fixture"],
          modelCatalog: { suppressions: [{ provider: "fixture", model: "model", reason }] },
        },
      ]),
    );
    mocks.loadPluginMetadataSnapshot.mockImplementation(() =>
      getPluginCache() === ownerA ? snapshots[0] : snapshots[1],
    );
    const build = () => buildManifestBuiltInModelSuppressionResolver({ config, env: process.env });
    const first = withPluginCache(ownerA, build);
    const second = withPluginCache(ownerB, build);
    expect(first({ provider: "fixture", id: "model" })?.errorMessage).toBe(
      "Unknown model: fixture/model. first rules",
    );
    expect(second({ provider: "fixture", id: "model" })?.errorMessage).toBe(
      "Unknown model: fixture/model. second rules",
    );
    expect(withPluginCache(ownerA, build)).toBe(first);
  });

  describe("buildManifestBuiltInModelSuppressionResolver", () => {
    it("reads planned manifest suppressions once per resolver creation", () => {
      const config = { plugins: { entries: { openai: { enabled: true } } } };

      const resolver = buildManifestBuiltInModelSuppressionResolver({
        config,
        env: process.env,
      });

      expect(mocks.loadPluginMetadataSnapshot).toHaveBeenCalledTimes(1);

      resolver({
        provider: "azure-openai-responses",
        id: "gpt-5.3-codex-spark",
      });
      resolver({
        provider: "azure-openai-responses",
        id: "gpt-5.3-codex-spark",
      });

      expect(mocks.loadPluginMetadataSnapshot).toHaveBeenCalledTimes(1);
    });
  });

  it("resolves manifest suppressions for declared provider aliases", () => {
    const resolver = buildManifestBuiltInModelSuppressionResolver({ env: process.env });

    expect(
      resolver({
        provider: "azure-openai-responses",
        id: "GPT-5.3-Codex-Spark",
      }),
    ).toEqual({
      suppress: true,
      errorMessage:
        "Unknown model: azure-openai-responses/gpt-5.3-codex-spark. Use openai/gpt-5.5.",
    });
  });

  it("ignores suppressions for providers the plugin does not own", () => {
    const resolver = buildManifestBuiltInModelSuppressionResolver({ env: process.env });

    expect(
      resolver({
        provider: "openrouter",
        id: "foreign-row",
      }),
    ).toBeUndefined();
  });

  it("preserves ordered same-model rules and current route conditions", () => {
    const config = {
      models: {
        providers: {
          fixture: {
            api: "openai-completions" as const,
            baseUrl: "https://first.example/v1",
            models: [],
          },
        },
      },
    };
    mocks.loadPluginMetadataSnapshot.mockReturnValue(
      createMetadataSnapshot([
        {
          id: "z-fallback",
          providers: ["fixture"],
          modelCatalog: {
            suppressions: [{ provider: "fixture", model: "model", reason: "Fallback." }],
          },
        },
        {
          id: "a-conditional",
          providers: ["fixture"],
          modelCatalog: {
            suppressions: [
              {
                provider: "fixture",
                model: "model",
                reason: "First route.",
                when: {
                  baseUrlHosts: ["FIRST.EXAMPLE.", "shared.example"],
                  providerConfigApiIn: ["OPENAI-COMPLETIONS"],
                },
              },
              {
                provider: "fixture",
                model: "model",
                reason: "Second route.",
                retirement: { replacedBy: "successor" },
                when: { baseUrlHosts: ["second.example", "shared.example"] },
              },
            ],
          },
        },
      ]),
    );
    const resolver = buildManifestBuiltInModelSuppressionResolver({ config });
    const input = { provider: "fixture", id: "model" };

    expect(resolver({ ...input, baseUrl: "https://shared.example/v1" })).toEqual({
      suppress: true,
      errorMessage: "Unknown model: fixture/model. First route.",
    });
    expect(resolver({ ...input, baseUrl: "https://second.example/v1" })).toMatchObject({
      retirement: { replacedBy: "successor" },
    });
    for (const baseUrl of ["https://other.example/v1", "invalid endpoint"]) {
      expect(resolver({ ...input, baseUrl })?.errorMessage).toBe(
        "Unknown model: fixture/model. Fallback.",
      );
    }
    expect(
      resolver({ ...input, baseUrl: "https://shared.example/v1", unconditionalOnly: true })
        ?.errorMessage,
    ).toBe("Unknown model: fixture/model. Fallback.");
    expect(resolver(input)?.errorMessage).toBe("Unknown model: fixture/model. First route.");
    config.models.providers.fixture.baseUrl = "https://second.example/v1";
    expect(resolver(input)).toEqual({
      suppress: true,
      errorMessage: "Unknown model: fixture/model. Fallback.",
    });
  });

  it.each([undefined, "current-model"])(
    "preserves explicit retirement and successor %s only on the selected endpoint",
    (replacedBy) => {
      const modelCatalog = normalizeModelCatalog(
        {
          suppressions: [
            {
              provider: "fixture",
              model: "old-model",
              reason: "This subscription model has retired.",
              retirement: replacedBy ? { replacedBy } : {},
              when: { baseUrlHosts: ["subscription.example"] },
            },
          ],
        },
        { ownedProviders: new Set(["fixture"]) },
      );
      mocks.loadPluginMetadataSnapshot.mockReturnValue(
        createMetadataSnapshot([{ id: "fixture", providers: ["fixture"], modelCatalog }]),
      );
      const resolver = buildManifestBuiltInModelSuppressionResolver({ env: process.env });
      const retired = resolver({
        provider: "fixture",
        id: "old-model",
        baseUrl: "https://subscription.example/v1",
      });
      expect(retired).toMatchObject({
        suppress: true,
        retirement: replacedBy ? { replacedBy } : {},
      });
      expect(retired?.errorMessage).toContain("openclaw doctor --fix");
      expect(resolver({ provider: "fixture", id: "old-model" })).toBeUndefined();
      expect(
        resolver({ provider: "fixture", id: "old-model", baseUrl: "https://api.example/v1" }),
      ).toBeUndefined();
      expect(
        resolver({
          provider: "fixture",
          id: "current-model",
          baseUrl: "https://subscription.example/v1",
        }),
      ).toBeUndefined();
    },
  );

  it("reuses planned manifest suppressions inside a resolver instance", () => {
    const config = { plugins: { entries: { openai: { enabled: true } } } };

    const resolver = buildManifestBuiltInModelSuppressionResolver({
      config,
      env: process.env,
    });

    expect(
      resolver({
        provider: "azure-openai-responses",
        id: "gpt-5.3-codex-spark",
      })?.suppress,
    ).toBe(true);
    expect(
      resolver({
        provider: "azure-openai-responses",
        id: "gpt-4.1",
      }),
    ).toBeUndefined();
    expect(mocks.loadPluginMetadataSnapshot).toHaveBeenCalledTimes(1);
  });

  it("keeps the OpenAI API route available while retiring the ChatGPT route", () => {
    const manifest = JSON.parse(
      fs.readFileSync(
        new URL("../../extensions/openai/openclaw.plugin.json", import.meta.url),
        "utf8",
      ),
    );
    mocks.loadPluginMetadataSnapshot.mockReturnValue(createMetadataSnapshot([manifest]));
    const resolver = buildManifestBuiltInModelSuppressionResolver({ env: process.env });
    const input = { provider: "openai", id: "gpt-5.4" };
    expect(resolver({ ...input, baseUrl: "https://chatgpt.com/backend-api" })).toMatchObject({
      retirement: { replacedBy: "gpt-5.6-terra" },
    });
    for (const baseUrl of [undefined, "https://api.openai.com/v1", "https://proxy.example/v1"]) {
      expect(resolver({ ...input, baseUrl })).toBeUndefined();
    }
  });

  it.each([
    "subscription.example",
    { baseUrlHosts: [] },
    { baseUrlHosts: 42 },
    { baseUrlHosts: ["subscription.example"], providerConfigApiIn: false },
  ])("does not broaden malformed retirement scope %# into a global rule", (when) => {
    const catalog = normalizeModelCatalog(
      { suppressions: [{ provider: "fixture", model: "old", retirement: {}, when }] },
      { ownedProviders: new Set(["fixture"]) },
    );
    expect(catalog?.suppressions).toBeUndefined();
  });

  it("matches conditional suppressions by base URL host", () => {
    mocks.loadPluginMetadataSnapshot.mockReturnValue(
      createMetadataSnapshot([
        {
          id: "qwen",
          providers: ["qwen", "modelstudio"],
          modelCatalog: {
            suppressions: [
              {
                provider: "qwen",
                model: "qwen3.6-plus",
                reason: "Use qwen/qwen3.5-plus.",
                when: {
                  baseUrlHosts: [
                    "coding.dashscope.aliyuncs.com",
                    "coding-intl.dashscope.aliyuncs.com",
                  ],
                  providerConfigApiIn: ["qwen", "modelstudio"],
                },
              },
            ],
          },
        },
      ]),
    );
    const resolver = buildManifestBuiltInModelSuppressionResolver({ env: process.env });

    expect(
      resolver({
        provider: "qwen",
        id: "qwen3.6-plus",
        baseUrl: "https://coding-intl.dashscope.aliyuncs.com/v1",
      })?.suppress,
    ).toBe(true);
    expect(
      resolver({
        provider: "qwen",
        id: "qwen3.6-plus",
        baseUrl: " https://coding-intl.dashscope.aliyuncs.com./v1 ",
      })?.suppress,
    ).toBe(true);
    expect(
      resolver({
        provider: "qwen",
        id: "qwen3.6-plus",
      })?.suppress,
    ).toBe(true);
    expect(
      resolver({
        provider: "qwen",
        id: "qwen3.6-plus",
        baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
      }),
    ).toBeUndefined();
  });

  it("does not apply conditional suppressions to custom providers with a foreign api owner", () => {
    mocks.loadPluginMetadataSnapshot.mockReturnValue(
      createMetadataSnapshot([
        {
          id: "qwen",
          providers: ["modelstudio"],
          modelCatalog: {
            suppressions: [
              {
                provider: "modelstudio",
                model: "qwen3.6-plus",
                when: {
                  baseUrlHosts: ["coding-intl.dashscope.aliyuncs.com"],
                  providerConfigApiIn: ["qwen", "modelstudio"],
                },
              },
            ],
          },
        },
      ]),
    );
    const resolver = buildManifestBuiltInModelSuppressionResolver({
      config: {
        models: {
          providers: {
            modelstudio: {
              api: "openai-completions",
              baseUrl: "https://coding-intl.dashscope.aliyuncs.com/v1",
              models: [],
            },
          },
        },
      },
      env: process.env,
    });

    expect(
      resolver({
        provider: "modelstudio",
        id: "qwen3.6-plus",
      }),
    ).toBeUndefined();
  });

  it("does not apply provider api conditional suppressions when a configured provider omits api", () => {
    mocks.loadPluginMetadataSnapshot.mockReturnValue(
      createMetadataSnapshot([
        {
          id: "qwen",
          providers: ["modelstudio"],
          modelCatalog: {
            suppressions: [
              {
                provider: "modelstudio",
                model: "qwen3.6-plus",
                when: {
                  baseUrlHosts: ["coding-intl.dashscope.aliyuncs.com"],
                  providerConfigApiIn: ["qwen", "modelstudio"],
                },
              },
            ],
          },
        },
      ]),
    );
    const resolver = buildManifestBuiltInModelSuppressionResolver({
      config: {
        models: {
          providers: {
            modelstudio: {
              baseUrl: "https://coding-intl.dashscope.aliyuncs.com/v1",
              models: [],
            },
          },
        },
      },
      env: process.env,
    });

    expect(
      resolver({
        provider: "modelstudio",
        id: "qwen3.6-plus",
      }),
    ).toBeUndefined();
  });
});
