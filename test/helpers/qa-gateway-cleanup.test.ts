import { describe, expect, it, vi } from "vitest";
import { createDeferred } from "./promise.js";
import { runQaGatewayFixture, stopQaGatewayFixture } from "./qa-gateway-cleanup.js";

function errorTree(error: unknown): unknown[] {
  return error instanceof AggregateError ? [error, ...error.errors.flatMap(errorTree)] : [error];
}

describe("QA gateway fixture error composition", () => {
  it("returns the body value after completing all cleanup phases", async () => {
    const value = { fixture: "result" };
    const cleaned: string[] = [];
    await expect(
      runQaGatewayFixture(
        async () => {
          cleaned.push("body");
          return value;
        },
        () => {
          cleaned.push("gateway");
        },
        () => {
          cleaned.push("provider");
        },
      ),
    ).resolves.toBe(value);
    expect(cleaned).toEqual(["body", "gateway", "provider"]);
  });

  it.each(["body", "cleanup"])(
    "retains the original %s-only error and finishes cleanup",
    async (phase) => {
      const failure = new Error(`${phase} failed`);
      const lastCleanup = vi.fn();
      await expect(
        runQaGatewayFixture(
          async () => {
            if (phase === "body") {
              throw failure;
            }
          },
          () => {
            if (phase === "cleanup") {
              throw failure;
            }
          },
          lastCleanup,
        ),
      ).rejects.toBe(failure);
      expect(lastCleanup).toHaveBeenCalledOnce();
    },
  );

  it("settles ordered releases and browser cleanup before stopping every remaining owner", async () => {
    const bodyError = new Error("body failed");
    const releaseError = new Error("patch release failed");
    const contextError = new Error("context close failed");
    const browserError = new Error("browser close failed");
    const gatewayError = new Error("gateway finalization failed");
    const events: string[] = [];
    const contextClosing = createDeferred();
    const releaseContext = createDeferred();
    const result = runQaGatewayFixture(
      async () => {
        throw bodyError;
      },
      () => {
        events.push("release");
        throw releaseError;
      },
      async () => {
        events.push("context-closing");
        contextClosing.resolve();
        await releaseContext.promise;
        events.push("context-settled");
        throw contextError;
      },
      () => {
        events.push("browser");
        throw browserError;
      },
      () => {
        events.push("node");
      },
      () =>
        stopQaGatewayFixture({
          stop: async () => {
            events.push("gateway");
            return { errors: [gatewayError] };
          },
        }),
      () => {
        events.push("provider");
      },
    ).catch((error: unknown) => error);
    await contextClosing.promise;
    const beforeSettlement = [...events];
    releaseContext.resolve();
    const failure = await result;
    expect(beforeSettlement).toEqual(["release", "context-closing"]);
    expect(events).toEqual([
      "release",
      "context-closing",
      "context-settled",
      "browser",
      "node",
      "gateway",
      "provider",
    ]);
    expect(errorTree(failure)).toEqual(
      expect.arrayContaining([bodyError, releaseError, contextError, browserError, gatewayError]),
    );
  });
});
