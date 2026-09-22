import { parentPort } from "node:worker_threads";
import {
  getRemoteModelCatalogPricing,
  getRemoteModelCatalogProviderOverlay,
} from "./remote-overlay.js";

// Must match CATALOG_CONFIG in remote-overlay.test.ts.
const config = {
  models: { catalogRefresh: { url: "https://catalog.example.test/models/v1/catalog.json" } },
};

parentPort!.postMessage(
  {
    overlay: getRemoteModelCatalogProviderOverlay(config, "anthropic"),
    pricing: getRemoteModelCatalogPricing(config),
  },
  [],
);
