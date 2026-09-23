import { describe, expect, it } from "vitest";
import { widenOfficialExternalChannelSecretSchema } from "./official-external-channel-secret-schema.js";

describe("official external channel secret schema", () => {
  it("does not widen channels without a catalog secret contract", () => {
    const schema = { type: "object", properties: { token: { type: "string" } } };

    expect(widenOfficialExternalChannelSecretSchema({ channelId: "unknown", schema })).toBe(schema);
  });
});
