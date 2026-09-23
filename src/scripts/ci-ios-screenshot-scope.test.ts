import { describe, expect, it } from "vitest";

const { detectChangedScope, shouldRunIosScreenshots } =
  await import("../../scripts/ci-changed-scope.mjs");

describe("shouldRunIosScreenshots", () => {
  it("conservatively routes screenshot-pipeline owners to release capture", () => {
    for (const changedPath of [
      "scripts/ios-screenshots.sh",
      "scripts/ios-screenshot-evidence.mjs",
      "scripts/ios-screenshot-evidence.d.mts",
      "scripts/lib/ios-fastlane.sh",
      "scripts/ios-write-swift-filelist.mjs",
      "config/swiftformat",
    ]) {
      expect(shouldRunIosScreenshots([changedPath]), changedPath).toBe(true);
      expect(
        shouldRunIosScreenshots(["apps/ios/Tests/NodeAppModelInvokeTests.swift", changedPath]),
        changedPath,
      ).toBe(true);
    }

    for (const changedPath of ["docs/ci.md", "ui/src/pages/activity/activity-page.ts"]) {
      expect(shouldRunIosScreenshots([changedPath]), changedPath).toBe(false);
    }

    expect(shouldRunIosScreenshots([])).toBe(false);
    expect(shouldRunIosScreenshots(null)).toBe(true);
  });

  it.each([])(
    "keeps %s in native build scope without unrelated screenshot capture",
    (changedPath) => {
      expect(detectChangedScope([changedPath]).runIosBuild).toBe(true);
      expect(shouldRunIosScreenshots([changedPath])).toBe(false);
    },
  );

  it("keeps screenshot capture wrappers inside the iOS build lane", () => {
    for (const changedPath of [
      "scripts/ios-screenshots.sh",
      "scripts/ios-screenshot-evidence.mjs",
      "scripts/ios-screenshot-evidence.d.mts",
      "scripts/lib/ios-fastlane.sh",
    ]) {
      expect(detectChangedScope([changedPath]).runIosBuild, changedPath).toBe(true);
    }
  });
});
