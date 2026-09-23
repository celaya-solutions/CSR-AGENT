import { describe, expect, it } from "vitest";
import { materializePreparedRuntimeModel } from "./materialize-model.js";

describe("Arcee OpenRouter profile materialization", () => {
  it("still rejects another model after credential selection", async () => {
    await expect(
      materializePreparedRuntimeModel({
        provider: "arcee",
        modelId: "trinity-large-thinking",
        config: {},
        forceResolve: true,
        plan: {
          providerForAuth: "openrouter",
          authProfileProviderForAuth: "openrouter",
          selectedAuthMode: "api-key",
          forwardedAuthProfileId: "openrouter:default",
        },
        resolveModel: async () => ({
          model: {
            provider: "arcee",
            id: "arcee-ai/trinity-large-preview",
            api: "openai-completions",
            baseUrl: "https://openrouter.ai/api/v1",
          },
        }),
      }),
    ).rejects.toThrow("Unable to rematerialize");
  });
});
