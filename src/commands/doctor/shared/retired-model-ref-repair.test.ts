import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { SessionEntry } from "../../../config/sessions/types.js";
import type { ModelDefinitionConfig } from "../../../config/types.models.js";
import type { OpenClawConfig } from "../../../config/types.openclaw.js";
import { clearPluginMetadataLifecycleCaches } from "../../../plugins/plugin-metadata-lifecycle.js";
import {
  createOpenClawTestState,
  type OpenClawTestState,
} from "../../../test-utils/openclaw-test-state.js";
import {
  createRetiredModelRefRepairResolver,
  repairRetiredConfigModelRefs,
  repairRetiredSessionModelRef,
} from "./retired-model-ref-repair.js";

const model = (id: string): ModelDefinitionConfig => ({
  id,
  name: id,
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1024,
  maxTokens: 256,
});

// A synthetic bundled provider plugin whose manifest retires its subscription-route `auto`
// selector, so the retirement repair runs against manifest facts rather than a shipped plugin.
async function writeRetiringProviderPlugin(bundledDir: string): Promise<void> {
  const pluginDir = path.join(bundledDir, "acme");
  await fs.mkdir(pluginDir, { recursive: true });
  await fs.writeFile(
    path.join(pluginDir, "index.js"),
    "throw new Error('Doctor must not execute the provider runtime');\n",
  );
  await fs.writeFile(
    path.join(pluginDir, "package.json"),
    JSON.stringify({
      name: "@example/acme-provider",
      version: "1.0.0",
      type: "module",
      openclaw: { extensions: ["./index.js"] },
    }),
  );
  await fs.writeFile(
    path.join(pluginDir, "openclaw.plugin.json"),
    JSON.stringify({
      id: "acme",
      enabledByDefault: true,
      providers: ["acme"],
      providerEndpoints: [
        { endpointClass: "custom", baseUrls: ["https://subscription-proxy.acme.test/v1"] },
      ],
      syntheticAuthRefs: ["acme"],
      modelCatalog: {
        providers: {
          acme: {
            baseUrl: "https://api.acme.test/v1",
            api: "openai-responses",
            models: [model("model-2"), model("model-1")],
          },
        },
        suppressions: [
          {
            provider: "acme",
            model: "auto",
            reason: "The subscription auto selector has retired; use a concrete model.",
            retirement: { replacedBy: "model-2" },
            when: { baseUrlHosts: ["subscription-proxy.acme.test"] },
          },
        ],
      },
      configSchema: { type: "object", additionalProperties: false, properties: {} },
    }),
  );
}

let state: OpenClawTestState;
let bundledDir: string;
beforeEach(async () => {
  bundledDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-retiring-provider-"));
  await writeRetiringProviderPlugin(bundledDir);
  state = await createOpenClawTestState({
    label: "retired-model-ref-repair",
    env: {
      OPENCLAW_BUNDLED_PLUGINS_DIR: bundledDir,
      OPENCLAW_TEST_TRUST_BUNDLED_PLUGINS_DIR: "1",
    },
  });
  clearPluginMetadataLifecycleCaches();
  await state.writeAuthProfiles({
    version: 1,
    profiles: {
      "acme:fixture": { type: "token", provider: "acme", token: "synthetic-subscription-token" },
    },
  });
});
afterEach(async () => {
  clearPluginMetadataLifecycleCaches();
  await state.cleanup();
  await fs.rm(bundledDir, { recursive: true, force: true });
});

function configForRoute(baseUrl: string, models: ModelDefinitionConfig[] = []): OpenClawConfig {
  return {
    agents: {
      defaults: {
        workspace: state.workspaceDir,
        model: { primary: "acme/auto", fallbacks: ["acme/model-1"] },
        models: { "acme/auto": { alias: "Grok", params: { temperature: 0.25 } } },
      },
      entries: { main: {} },
    },
    auth: { profiles: { "acme:fixture": { provider: "acme", mode: "token" } } },
    models: { providers: { acme: { baseUrl, api: "openai-responses", auth: "token", models } } },
    plugins: { allow: ["acme"], entries: { acme: { enabled: true } } },
  };
}

it("repairs the subscription selector while preserving fallbacks and model settings", async () => {
  const cfg = configForRoute("https://subscription-proxy.acme.test/v1");
  await state.writeConfig(cfg);
  const resolve = createRetiredModelRefRepairResolver({ cfg, env: state.env });
  const repaired = repairRetiredConfigModelRefs(cfg, resolve);

  expect(repaired.config.agents?.defaults?.model).toEqual({
    primary: "acme/model-2",
    fallbacks: ["acme/model-1"],
  });
  expect(repaired.config.agents?.defaults?.models?.["acme/model-2"]?.params).toEqual({
    temperature: 0.25,
  });
  expect(cfg.agents?.defaults?.model).toEqual({
    primary: "acme/auto",
    fallbacks: ["acme/model-1"],
  });
  expect(
    repairRetiredConfigModelRefs(
      repaired.config,
      createRetiredModelRefRepairResolver({ cfg: repaired.config, env: state.env }),
    ).changes,
  ).toEqual([]);
});

it("repairs a session override without changing its selected profile", async () => {
  const cfg = configForRoute("https://subscription-proxy.acme.test/v1");
  await state.writeConfig(cfg);
  const entry: SessionEntry = {
    sessionId: "acme-upgrade-session",
    updatedAt: 1,
    providerOverride: "acme",
    modelOverride: "auto",
    authProfileOverride: "acme:fixture",
    authProfileOverrideSource: "user",
  };
  const resolve = createRetiredModelRefRepairResolver({ cfg, env: state.env });
  expect(repairRetiredSessionModelRef(entry, "main", resolve, "acme/model-2", [])).toBe(true);
  expect(entry.modelOverride).toBe("model-2");
  expect(entry.authProfileOverride).toBe("acme:fixture");
  expect(entry.authProfileOverrideSource).toBe("user");
});

it("preserves a custom endpoint's explicit auto model", async () => {
  const cfg = configForRoute("https://custom-models.example/v1", [
    {
      id: "auto",
      name: "Custom automatic model",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 1024,
      maxTokens: 256,
    },
  ]);
  await state.writeConfig(cfg);
  const resolve = createRetiredModelRefRepairResolver({ cfg, env: state.env });
  expect(resolve({ modelRef: "acme/auto", agentId: "main" })).toEqual({ kind: "unchanged" });
  expect(repairRetiredConfigModelRefs(cfg, resolve).config).toBe(cfg);
});

it("repairs an unpinned config on its declared subscription route without credentials", async () => {
  const cfg = configForRoute("https://subscription-proxy.acme.test/v1");
  await state.writeConfig(cfg);
  await state.writeAuthProfiles({ version: 1, profiles: {} });
  const warnings: string[] = [];
  const resolve = createRetiredModelRefRepairResolver({ cfg, env: state.env, warnings });
  expect(resolve({ modelRef: "acme/auto", agentId: "main" })).toEqual({
    kind: "replace",
    modelRef: "acme/model-2",
    reason: "retirement",
    retirementScope: "route",
  });
  expect(warnings).toEqual([]);
});

it("retains a missing pinned account instead of substituting the available profile", async () => {
  const cfg = configForRoute("https://subscription-proxy.acme.test/v1");
  await state.writeConfig(cfg);
  const warnings: string[] = [];
  const resolve = createRetiredModelRefRepairResolver({ cfg, env: state.env, warnings });
  expect(
    resolve({
      modelRef: "acme/auto",
      agentId: "main",
      authProfileId: "acme:missing",
      authProfileSource: "user",
    }),
  ).toEqual({ kind: "unchanged" });
  expect(warnings).toEqual([expect.stringContaining("authentication route is unavailable")]);
});

it("keeps a pinned session when its successor is outside the allowed models", async () => {
  const original = configForRoute("https://subscription-proxy.acme.test/v1");
  const cfg: OpenClawConfig = {
    ...original,
    agents: {
      ...original.agents,
      defaults: { ...original.agents?.defaults, modelPolicy: { allow: ["acme/auto"] } },
    },
  };
  await state.writeConfig(cfg);
  const warnings: string[] = [];
  const entry: SessionEntry = {
    sessionId: "restricted-acme-session",
    updatedAt: 1,
    providerOverride: "acme",
    modelOverride: "auto",
    authProfileOverride: "acme:fixture",
    authProfileOverrideSource: "user",
  };
  const resolve = createRetiredModelRefRepairResolver({
    cfg,
    env: state.env,
    warnings,
    checkModelPolicy: true,
  });
  expect(repairRetiredSessionModelRef(entry, "main", resolve, "acme/model-2", warnings)).toBe(
    false,
  );
  expect(entry.modelOverride).toBe("auto");
  expect(entry.authProfileOverride).toBe("acme:fixture");
  expect(warnings).toEqual([expect.stringContaining("not permitted")]);
});
