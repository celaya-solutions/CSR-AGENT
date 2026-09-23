import type { OpenClawConfig } from "../config/types.openclaw.js";

// This build ships no hosted model catalog: refresh runs only once an operator
// points models.catalogRefresh.url at a catalog they serve.
export function resolveRemoteCatalogUrl(config: OpenClawConfig): string | undefined {
  return config.models?.catalogRefresh?.url?.trim() || undefined;
}

export function isRemoteModelCatalogRefreshEnabled(config: OpenClawConfig): boolean {
  return (
    config.models?.catalogRefresh?.enabled !== false &&
    resolveRemoteCatalogUrl(config) !== undefined
  );
}
