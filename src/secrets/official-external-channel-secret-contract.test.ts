import { describe, expect, it, vi } from "vitest";

// The shipped official external catalog is empty; a synthetic catalog contract
// keeps the host fallback collector covered without a real external channel.
vi.mock("../plugins/official-external-plugin-catalog.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../plugins/official-external-plugin-catalog.js")>()),
  getOfficialExternalChannelSecretContract: (channelId: string) =>
    channelId === "acme"
      ? {
          channelId: "acme",
          fields: [
            { field: "clientSecret", activationField: "appId", activationEnv: "ACME_APP_ID" },
          ],
        }
      : undefined,
}));
import { loadOfficialExternalChannelSecretContractApi } from "./official-external-channel-secret-contract.js";
import { createResolverContext } from "./runtime-shared.js";

describe("official external channel secret contracts", () => {
  it("collects active root and account SecretRefs from the catalog contract", () => {
    const config = {
      channels: {
        acme: {
          appId: "root-app",
          clientSecret: { source: "env" as const, provider: "default", id: "ACME_ROOT_SECRET" },
          accounts: {
            named: {
              appId: "named-app",
              clientSecret: {
                source: "env" as const,
                provider: "default",
                id: "ACME_NAMED_SECRET",
              },
            },
          },
        },
      },
    };
    const context = createResolverContext({ sourceConfig: config, env: {} });
    const api = loadOfficialExternalChannelSecretContractApi("acme");

    api?.collectRuntimeConfigAssignments({ config, defaults: undefined, context });

    expect(context.assignments.map((assignment) => assignment.path)).toEqual([
      "channels.acme.clientSecret",
      "channels.acme.accounts.named.clientSecret",
    ]);
    context.assignments[0]?.apply("resolved-root-secret");
    context.assignments[1]?.apply("resolved-named-secret");
    expect(config.channels.acme.clientSecret).toBe("resolved-root-secret");
    expect(config.channels.acme.accounts.named.clientSecret).toBe("resolved-named-secret");
  });

  it("uses the activation env only for the default account and skips inactive credentials", () => {
    const config = {
      channels: {
        acme: {
          clientSecret: { source: "env" as const, provider: "default", id: "ACME_ROOT_SECRET" },
          accounts: {
            disabled: {
              enabled: false,
              appId: "disabled-app",
              clientSecret: {
                source: "env" as const,
                provider: "default",
                id: "ACME_DISABLED_SECRET",
              },
            },
            missingAppId: {
              clientSecret: {
                source: "env" as const,
                provider: "default",
                id: "ACME_MISSING_APP_SECRET",
              },
            },
          },
        },
      },
    };
    const context = createResolverContext({
      sourceConfig: config,
      env: { ACME_APP_ID: "env-app" },
    });
    const api = loadOfficialExternalChannelSecretContractApi("acme");

    api?.collectRuntimeConfigAssignments({ config, defaults: undefined, context });

    expect(context.assignments.map((assignment) => assignment.path)).toEqual([
      "channels.acme.clientSecret",
    ]);
    expect(config.channels.acme).toHaveProperty("appId", "env-app");
    expect(context.warnings.map((warning) => warning.path)).toEqual([
      "channels.acme.accounts.disabled.clientSecret",
      "channels.acme.accounts.missingAppId.clientSecret",
    ]);
  });
});
