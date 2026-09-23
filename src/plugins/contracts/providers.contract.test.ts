// Provider contract tests cover shared provider plugin behavior across bundled providers.
import { describeProviderContracts } from "../../plugin-sdk/test-helpers/provider-contract.js";
import { describeWebSearchProviderContracts } from "../../plugin-sdk/test-helpers/web-search-provider-contract.js";

for (const providerId of ["anthropic", "openai", "openrouter"] as const) {
  describeProviderContracts(providerId);
}

for (const providerId of ["duckduckgo"] as const) {
  describeWebSearchProviderContracts(providerId);
}
