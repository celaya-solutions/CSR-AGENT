// Upstream official external catalog entries kept as test input. This distribution ships
// empty official external catalogs, so catalog-driven trust, migration, and curation logic
// is exercised against this fixture through a mock of official-external-plugin-bundled-catalogs.
import type { OfficialExternalPluginCatalogEntry } from "../official-external-plugin-catalog.types.js";
import fixture from "./official-external-catalog-fixture.json" with { type: "json" };

export const OFFICIAL_EXTERNAL_CATALOG_FIXTURE_ENTRIES: readonly OfficialExternalPluginCatalogEntry[] =
  fixture.entries as readonly OfficialExternalPluginCatalogEntry[];
