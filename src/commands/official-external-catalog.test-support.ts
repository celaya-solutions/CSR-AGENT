// OpenAgent ships the official external plugin catalogs empty, so catalog-driven
// behavior (repair hints, trusted official installs, drift advisories) never fires
// against the real feed. Tests that cover that retained behavior inject the upstream
// catalog snapshot instead of the shipped one:
//
//   vi.mock("../plugins/official-external-plugin-bundled-catalogs.js", async () =>
//     (await import("../commands/official-external-catalog.test-support.js"))
//       .officialExternalCatalogModuleFixture(),
//   );
import type { OfficialExternalPluginCatalogEntry } from "../plugins/official-external-plugin-catalog.types.js";
import fixture from "./fixtures/official-external-catalog.json" with { type: "json" };

export const OFFICIAL_EXTERNAL_CATALOG_FIXTURE_ENTRIES: readonly OfficialExternalPluginCatalogEntry[] =
  fixture.entries as OfficialExternalPluginCatalogEntry[];

/** Module shape of `plugins/official-external-plugin-bundled-catalogs.ts` backed by the fixture. */
export function officialExternalCatalogModuleFixture(): {
  BUNDLED_OFFICIAL_EXTERNAL_PLUGIN_CATALOG_ENTRIES: readonly OfficialExternalPluginCatalogEntry[];
} {
  return {
    BUNDLED_OFFICIAL_EXTERNAL_PLUGIN_CATALOG_ENTRIES: OFFICIAL_EXTERNAL_CATALOG_FIXTURE_ENTRIES,
  };
}
