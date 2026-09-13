// Matrix tests cover device health plugin behavior.
import { describe, expect, it } from "vitest";
import { isOpenClawManagedMatrixDevice, summarizeMatrixDeviceHealth } from "./device-health.js";

describe("matrix device health", () => {
  it("detects Zero to Agent-managed device names", () => {
    expect(isOpenClawManagedMatrixDevice("Zero to Agent Gateway")).toBe(true);
    expect(isOpenClawManagedMatrixDevice("Zero to Agent Debug")).toBe(true);
    expect(isOpenClawManagedMatrixDevice("Element iPhone")).toBe(false);
    expect(isOpenClawManagedMatrixDevice(null)).toBe(false);
  });

  it("summarizes stale Zero to Agent-managed devices separately from the current device", () => {
    const summary = summarizeMatrixDeviceHealth([
      {
        deviceId: "du314Zpw3A",
        displayName: "Zero to Agent Gateway",
        current: true,
      },
      {
        deviceId: "BritdXC6iL",
        displayName: "Zero to Agent Gateway",
        current: false,
      },
      {
        deviceId: "G6NJU9cTgs",
        displayName: "Zero to Agent Debug",
        current: false,
      },
      {
        deviceId: "phone123",
        displayName: "Element iPhone",
        current: false,
      },
    ]);

    expect(summary).toEqual({
      currentDeviceId: "du314Zpw3A",
      currentOpenClawDevices: [
        {
          deviceId: "du314Zpw3A",
          displayName: "Zero to Agent Gateway",
          current: true,
        },
      ],
      staleOpenClawDevices: [
        {
          deviceId: "BritdXC6iL",
          displayName: "Zero to Agent Gateway",
          current: false,
        },
        {
          deviceId: "G6NJU9cTgs",
          displayName: "Zero to Agent Debug",
          current: false,
        },
      ],
    });
  });
});
