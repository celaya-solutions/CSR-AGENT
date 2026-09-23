/** Verifies the inbound context marker label helper. */
import { describe, expect, it } from "vitest";
import { INBOUND_CONTEXT_MARKER, markInboundContextLabel } from "./inbound-context-marker.js";

describe("inbound context marker", () => {
  it("appends the marker as a space-separated suffix", () => {
    expect(markInboundContextLabel("Sender:")).toBe(`Sender: ${INBOUND_CONTEXT_MARKER}`);
  });
});
