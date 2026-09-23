/**
 * Installs bundled plugin registration contract cases used across provider tests.
 */
import type { PluginRegistrationContractParams } from "./plugin-registration-contract.js";

export const pluginRegistrationContractCases = {
  anthropic: {
    pluginId: "anthropic",
    providerIds: ["anthropic"],
    mediaUnderstandingProviderIds: ["anthropic"],
    cliBackendIds: ["claude-cli"],
  },
  duckduckgo: {
    pluginId: "duckduckgo",
    webSearchProviderIds: ["duckduckgo"],
  },
  ollama: {
    pluginId: "ollama",
    providerIds: ["ollama", "ollama-cloud"],
    webSearchProviderIds: ["ollama"],
  },
  openai: {
    pluginId: "openai",
    providerIds: ["openai"],
    speechProviderIds: ["openai"],
    realtimeTranscriptionProviderIds: ["openai"],
    realtimeVoiceProviderIds: ["openai"],
    mediaUnderstandingProviderIds: ["openai"],
    imageGenerationProviderIds: ["openai"],
    videoGenerationProviderIds: ["openai"],
  },
  openrouter: {
    pluginId: "openrouter",
    providerIds: ["openrouter"],
    mediaUnderstandingProviderIds: ["openrouter"],
    imageGenerationProviderIds: ["openrouter"],
    musicGenerationProviderIds: ["openrouter"],
    videoGenerationProviderIds: ["openrouter"],
  },
} satisfies Record<string, PluginRegistrationContractParams>;
