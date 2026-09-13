// Matrix tests cover device health plugin behavior.
import { describe, expect, it } from "vitest";
import { isOpenClawManagedMatrixDevice, summarizeMatrixDeviceHealth } from "./device-health.js";

describe("matrix device health", () => {
  it("detects OpenAgent-managed device names", () => {
    expect(isOpenClawManagedMatrixDevice("OpenAgent Gateway")).toBe(true);
    expect(isOpenClawManagedMatrixDevice("OpenAgent Debug")).toBe(true);
    expect(isOpenClawManagedMatrixDevice("Element iPhone")).toBe(false);
    expect(isOpenClawManagedMatrixDevice(null)).toBe(false);
  });

  it("summarizes stale OpenAgent-managed devices separately from the current device", () => {
    const summary = summarizeMatrixDeviceHealth([
      {
        deviceId: "du314Zpw3A",
        displayName: "OpenAgent Gateway",
        current: true,
      },
      {
        deviceId: "BritdXC6iL",
        displayName: "OpenAgent Gateway",
        current: false,
      },
      {
        deviceId: "G6NJU9cTgs",
        displayName: "OpenAgent Debug",
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
          displayName: "OpenAgent Gateway",
          current: true,
        },
      ],
      staleOpenClawDevices: [
        {
          deviceId: "BritdXC6iL",
          displayName: "OpenAgent Gateway",
          current: false,
        },
        {
          deviceId: "G6NJU9cTgs",
          displayName: "OpenAgent Debug",
          current: false,
        },
      ],
    });
  });
});
