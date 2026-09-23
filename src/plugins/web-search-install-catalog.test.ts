import { describe, expect, it, vi } from "vitest";

// The shipped official external catalogs are empty in this distribution, so the
// install-catalog projection is exercised against synthetic catalog entries.
function webSearchPlugin(params: {
  id: string;
  providers: Array<Record<string, unknown>>;
}): Record<string, unknown> {
  return {
    name: `@example/${params.id}-plugin`,
    source: "official",
    kind: "plugin",
    openclaw: {
      plugin: { id: params.id, label: params.id },
      contracts: {
        webSearchProviders: params.providers.map((provider) => provider.id),
      },
      webSearchProviders: params.providers.map((provider) => ({
        hint: `${String(provider.label)} hint`,
        placeholder: "key-...",
        signupUrl: "https://search.example.test/signup",
        ...provider,
      })),
      install: {
        clawhubSpec: `clawhub:@example/${params.id}-plugin`,
        npmSpec: `@example/${params.id}-plugin`,
        defaultChoice: "npm",
      },
    },
  };
}

vi.mock("./official-external-plugin-bundled-catalogs.js", () => ({
  BUNDLED_OFFICIAL_EXTERNAL_PLUGIN_CATALOG_ENTRIES: [
    webSearchPlugin({
      id: "keyless",
      providers: [
        {
          id: "keyless",
          label: "Keyless Search",
          envVars: ["KEYLESS_API_KEY"],
          credentialPath: "plugins.entries.keyless.config.webSearch.apiKey",
          autoDetectOrder: 75,
        },
        {
          id: "keyless-free",
          label: "Keyless Search (Free)",
          requiresCredential: false,
          envVars: [],
          credentialPath: "",
        },
      ],
    }),
    webSearchPlugin({
      id: "keyed",
      providers: [
        {
          id: "keyed",
          label: "Keyed Search",
          envVars: ["KEYED_API_KEY"],
          credentialPath: "plugins.entries.keyed.config.webSearch.apiKey",
          autoDetectOrder: 65,
        },
      ],
    }),
  ],
}));

const {
  resolveWebSearchInstallCatalogEntry,
  resolveWebSearchInstallCatalogEntries,
  resolveWebSearchInstallCatalogEntriesForEnv,
} = await import("./web-search-install-catalog.js");

describe("web-search install catalog", () => {
  it("keeps a keyless provider installable but opt-in", () => {
    const entry = resolveWebSearchInstallCatalogEntry({
      providerId: "keyless-free",
      pluginId: "keyless",
    });

    expect(entry).toMatchObject({
      pluginId: "keyless",
      install: {
        clawhubSpec: "clawhub:@example/keyless-plugin",
        npmSpec: "@example/keyless-plugin",
      },
      provider: {
        id: "keyless-free",
        requiresCredential: false,
        envVars: [],
        credentialPath: "",
      },
    });
    expect(entry?.provider.autoDetectOrder).toBeUndefined();
    expect(
      resolveWebSearchInstallCatalogEntries().some(
        (candidate) => candidate.provider.id === "keyless",
      ),
    ).toBe(true);
  });

  it("resolves credential-backed plugins for env-only auto-detection", () => {
    expect(
      resolveWebSearchInstallCatalogEntriesForEnv({
        KEYED_API_KEY: "keyed-key",
        KEYLESS_API_KEY: "keyless-key",
        UNRELATED_API_KEY: "other",
      }).map((entry) => entry.pluginId),
    ).toEqual(["keyed", "keyless"]);
    expect(resolveWebSearchInstallCatalogEntriesForEnv({})).toEqual([]);
  });
});
