import { Worker } from "node:worker_threads";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureRemoteModelCatalogStartupSnapshot,
  checkRemoteModelCatalogUpdate,
  getRemoteModelCatalogPricing,
  getRemoteModelCatalogProviderOverlay,
} from "./remote-overlay.js";
import { setRemoteModelCatalogOverlaySourcesForTest } from "./remote-overlay.test-support.js";

const CATALOG_URL = "https://catalog.example.test/models/v1/catalog.json";
const CATALOG_CONFIG = { models: { catalogRefresh: { url: CATALOG_URL } } };

const mocks = {
  builtAt: vi.fn<() => number | undefined>(),
  read: vi.fn(),
};

const bundle = {
  schemaVersion: 1,
  generatedAt: 200,
  minVersion: "2026.7.0",
  sourceCommit: "abc",
  providers: { anthropic: { models: [{ id: "new" }] } },
  pricing: { "openai/gpt-external": { input: 2.5, output: 10 } },
};

beforeEach(() => {
  mocks.builtAt.mockReset().mockReturnValue(100);
  mocks.read.mockReset().mockReturnValue({
    bundle_json: JSON.stringify(bundle),
    source_url: CATALOG_URL,
  });
  setRemoteModelCatalogOverlaySourcesForTest({
    bundledGeneratedAt: mocks.builtAt,
    readStoredCatalog: mocks.read,
  });
});

afterEach(() => {
  setRemoteModelCatalogOverlaySourcesForTest();
});

describe("remote model catalog overlay", () => {
  it("inspects pending generations without replacing the startup snapshot, rows, or prices", () => {
    const sourceUrl = CATALOG_URL;
    const snapshot = captureRemoteModelCatalogStartupSnapshot();
    const overlay = getRemoteModelCatalogProviderOverlay(CATALOG_CONFIG, "anthropic");
    const pricing = getRemoteModelCatalogPricing(CATALOG_CONFIG);
    expect(checkRemoteModelCatalogUpdate(CATALOG_CONFIG, { sourceUrl, generatedAt: 200 })).toBe(
      "unchanged",
    );
    expect(mocks.read).toHaveBeenCalledOnce();

    mocks.read.mockReturnValue({
      source_url: sourceUrl,
      bundle_json: JSON.stringify({
        ...bundle,
        generatedAt: 300,
        providers: { anthropic: { models: [{ id: "downloaded" }] } },
        pricing: { "openai/gpt-external": { input: 5, output: 20 } },
      }),
    });
    expect(checkRemoteModelCatalogUpdate(CATALOG_CONFIG, { sourceUrl, generatedAt: 300 })).toBe(
      "restart-required",
    );
    expect(captureRemoteModelCatalogStartupSnapshot()).toBe(snapshot);
    expect(getRemoteModelCatalogProviderOverlay(CATALOG_CONFIG, "anthropic")).toBe(overlay);
    expect(getRemoteModelCatalogPricing(CATALOG_CONFIG)).toBe(pricing);
  });

  it.each([{ enabled: false }, { url: "https://mirror.example.test/catalog.json" }])(
    "rejects a check superseded by config %j without reading stored data",
    (catalogRefresh) => {
      expect(
        checkRemoteModelCatalogUpdate(
          { models: { catalogRefresh } },
          { sourceUrl: CATALOG_URL, generatedAt: 300 },
        ),
      ).toBe("superseded");
      expect(mocks.read).not.toHaveBeenCalled();
    },
  );

  it.each([
    { sourceUrl: "https://mirror.example.test/catalog.json", generatedAt: 300 },
    { sourceUrl: CATALOG_URL, generatedAt: 400 },
  ])("rejects a stored check superseded by %j", ({ sourceUrl, generatedAt }) => {
    const snapshot = captureRemoteModelCatalogStartupSnapshot();
    mocks.read.mockReturnValue({
      source_url: sourceUrl,
      bundle_json: JSON.stringify({ ...bundle, generatedAt }),
    });
    expect(
      checkRemoteModelCatalogUpdate(CATALOG_CONFIG, {
        sourceUrl: CATALOG_URL,
        generatedAt: 300,
      }),
    ).toBe("superseded");
    expect(captureRemoteModelCatalogStartupSnapshot()).toBe(snapshot);
  });

  it("reports failed inspection without replacing a valid startup snapshot", () => {
    const snapshot = captureRemoteModelCatalogStartupSnapshot();
    mocks.read.mockReturnValue({
      source_url: CATALOG_URL,
      bundle_json: "{",
    });
    expect(() =>
      checkRemoteModelCatalogUpdate(CATALOG_CONFIG, {
        sourceUrl: CATALOG_URL,
        generatedAt: 300,
      }),
    ).toThrow(SyntaxError);
    expect(captureRemoteModelCatalogStartupSnapshot()).toBe(snapshot);
  });

  it("loads a newer compatible bundle once", () => {
    expect(getRemoteModelCatalogProviderOverlay(CATALOG_CONFIG, "anthropic")).toHaveProperty(
      "models",
    );
    expect(getRemoteModelCatalogProviderOverlay(CATALOG_CONFIG, "anthropic")).toHaveProperty(
      "models",
    );
    expect(getRemoteModelCatalogPricing(CATALOG_CONFIG)?.["openai/gpt-external"]).toEqual({
      input: 2.5,
      output: 10,
    });
    expect(mocks.read).toHaveBeenCalledOnce();
  });

  it("keeps startup rows and prices when the configured source changes", () => {
    const overlay = getRemoteModelCatalogProviderOverlay(CATALOG_CONFIG, "anthropic");
    const pricing = getRemoteModelCatalogPricing(CATALOG_CONFIG);
    mocks.read.mockReturnValue({
      bundle_json: JSON.stringify({
        ...bundle,
        generatedAt: 300,
        providers: { anthropic: { models: [{ id: "downloaded" }] } },
        pricing: { "openai/gpt-external": { input: 5, output: 20 } },
      }),
      source_url: "https://mirror.example.test/catalog.json",
    });
    expect(
      getRemoteModelCatalogProviderOverlay(
        { models: { catalogRefresh: { url: "https://mirror.example.test/catalog.json" } } },
        "anthropic",
      ),
    ).toBeUndefined();
    expect(getRemoteModelCatalogProviderOverlay(CATALOG_CONFIG, "anthropic")).toEqual(overlay);
    expect(getRemoteModelCatalogPricing(CATALOG_CONFIG)).toEqual(pricing);
  });

  it("keeps invalid startup metadata absent after a successful download", () => {
    const valid = mocks.read();
    mocks.read.mockReturnValue({ ...valid, bundle_json: "{" });
    expect(getRemoteModelCatalogProviderOverlay(CATALOG_CONFIG, "anthropic")).toBeUndefined();
    mocks.read.mockReturnValue(valid);
    expect(getRemoteModelCatalogProviderOverlay(CATALOG_CONFIG, "anthropic")).toBeUndefined();
    expect(getRemoteModelCatalogPricing(CATALOG_CONFIG)).toBeUndefined();
  });

  it("passes the same startup rows and prices to later workers", async () => {
    const expected = {
      overlay: getRemoteModelCatalogProviderOverlay(CATALOG_CONFIG, "anthropic"),
      pricing: getRemoteModelCatalogPricing(CATALOG_CONFIG),
    };
    mocks.read.mockReturnValue(undefined);
    const worker = new Worker(new URL("./remote-overlay.worker.test-support.ts", import.meta.url), {
      execArgv: ["--import", "tsx"],
    });
    try {
      const actual = await new Promise((resolve, reject) => {
        worker.once("message", resolve);
        worker.once("error", reject);
      });
      expect(actual).toEqual(expected);
    } finally {
      await worker.terminate();
    }
  });

  it("fails closed when disabled, stale, or missing a build stamp", () => {
    expect(
      getRemoteModelCatalogProviderOverlay(
        { models: { catalogRefresh: { enabled: false } } },
        "anthropic",
      ),
    ).toBeUndefined();
    expect(mocks.read).not.toHaveBeenCalled();
    mocks.builtAt.mockReturnValue(200);
    expect(getRemoteModelCatalogProviderOverlay(CATALOG_CONFIG, "anthropic")).toBeUndefined();
    setRemoteModelCatalogOverlaySourcesForTest({
      bundledGeneratedAt: mocks.builtAt,
      readStoredCatalog: mocks.read,
    });
    mocks.builtAt.mockReturnValue(undefined);
    expect(getRemoteModelCatalogProviderOverlay(CATALOG_CONFIG, "anthropic")).toBeUndefined();
  });

  it("does not reuse a cached overlay after disablement or a URL change", () => {
    expect(getRemoteModelCatalogProviderOverlay(CATALOG_CONFIG, "anthropic")).toHaveProperty(
      "models",
    );
    expect(
      getRemoteModelCatalogProviderOverlay(
        { models: { catalogRefresh: { enabled: false } } },
        "anthropic",
      ),
    ).toBeUndefined();
    expect(
      getRemoteModelCatalogProviderOverlay(
        {
          models: { catalogRefresh: { url: "https://mirror.example.test/catalog.json" } },
        },
        "anthropic",
      ),
    ).toBeUndefined();
    expect(mocks.read).toHaveBeenCalledOnce();
  });
});
