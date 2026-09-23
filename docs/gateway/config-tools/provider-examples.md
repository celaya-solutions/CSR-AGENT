---
summary: "Worked custom-provider configurations for Cerebras, llama.cpp, and Synthetic"
read_when:
  - Copying a working config for a specific provider
  - Pointing a custom provider id at a local llama-server
  - Finding the onboarding shortcut for a provider
title: "Configuration — provider examples"
---

Worked `models.providers` configurations. For what each field means, see [Custom providers and base URLs](/gateway/config-tools/custom-providers).

## Provider examples

<AccordionGroup>
  <Accordion title="Cerebras (GLM 4.7 / GPT OSS)">
    Cerebras serves an OpenAI-compatible API, so an explicit `models.providers` entry is enough.

    ```json5
    {
      env: { vars: { CEREBRAS_API_KEY: "sk-..." } },
      agents: {
        defaults: {
          model: {
            primary: "cerebras/zai-glm-4.7",
            fallbacks: ["cerebras/gpt-oss-120b"],
          },
          models: {
            "cerebras/zai-glm-4.7": { alias: "GLM 4.7 (Cerebras)" },
            "cerebras/gpt-oss-120b": { alias: "GPT OSS 120B (Cerebras)" },
          },
        },
      },
      models: {
        mode: "merge",
        providers: {
          cerebras: {
            baseUrl: "https://api.cerebras.ai/v1",
            apiKey: "${CEREBRAS_API_KEY}",
            api: "openai-completions",
            models: [
              { id: "zai-glm-4.7", name: "GLM 4.7 (Cerebras)" },
              { id: "gpt-oss-120b", name: "GPT OSS 120B (Cerebras)" },
            ],
          },
        },
      },
    }
    ```

  </Accordion>
  <Accordion title="Local models (llama.cpp / llama-server)">
    The canonical `llama-cpp` provider applies the llama.cpp schema cleaner in managed and existing-server modes. If you instead point a **custom provider ID** at a remote `llama-server` (or another OpenAI-compatible llama.cpp endpoint), set `compat.toolSchemaProfile: "llamacpp"` on each model whose chat template compiles tool arguments into GBNF. The profile removes `pattern` and `maxLength` values at or above 2000, covering the `cron` tool's `trigger.script` limit of 65536. It is a targeted mitigation, not complete compatibility for every JSON Schema constraint or `minLength`.

    ```json5
    {
      agents: {
        defaults: {
          model: { primary: "my-llamacpp/qwen35" },
        },
      },
      models: {
        mode: "merge",
        providers: {
          "my-llamacpp": {
            baseUrl: "http://127.0.0.1:8080/v1",
            apiKey: "llamacpp-no-key",
            api: "openai-completions",
            models: [
              {
                id: "qwen35",
                name: "Qwen3.5 (llama-server)",
                contextWindow: 8192,
                maxTokens: 2048,
                compat: {
                  supportsTools: true,
                  toolSchemaProfile: "llamacpp",
                },
              },
            ],
          },
        },
      },
    }
    ```

    For a broader manual alternative, set `compat.unsupportedToolSchemaKeywords: ["pattern", "patternProperties", "format", "propertyNames", "uniqueItems", "contains", "minContains", "maxContains", "minLength", "maxLength"]`. Unlike the profile, this removes every listed keyword unconditionally.

  </Accordion>
  <Accordion title="Synthetic (Anthropic-compatible)">
    ```json5
    {
      env: { vars: { SYNTHETIC_API_KEY: "sk-..." } },
      agents: {
        defaults: {
          model: { primary: "synthetic/hf:MiniMaxAI/MiniMax-M3" },
          models: { "synthetic/hf:MiniMaxAI/MiniMax-M3": { alias: "MiniMax M3" } },
        },
      },
      models: {
        mode: "merge",
        providers: {
          synthetic: {
            baseUrl: "https://api.synthetic.new/anthropic",
            apiKey: "${SYNTHETIC_API_KEY}",
            api: "anthropic-messages",
            models: [
              {
                id: "hf:MiniMaxAI/MiniMax-M3",
                name: "MiniMax M3",
                reasoning: true,
                input: ["text", "image"],
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                contextWindow: 262144,
                maxTokens: 65536,
              },
            ],
          },
        },
      },
    }
    ```

    Base URL should omit `/v1` (Anthropic client appends it).

  </Accordion>
</AccordionGroup>
