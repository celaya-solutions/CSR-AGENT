// Terminal Core tests cover links behavior.
import { describe, expect, it } from "vitest";
import { formatDocsLink } from "./links.js";

describe("formatDocsLink", () => {
  it("renders a relative path as its label without any host", () => {
    expect(formatDocsLink("/channels/quietchat", "quietchat")).toBe("quietchat");
  });

  it("renders a relative path as plain text when no label is given", () => {
    expect(formatDocsLink("/channels/quietchat")).toBe("/channels/quietchat");
  });

  it("preserves an absolute http url", () => {
    const out = formatDocsLink("https://example.com/page", "page");
    expect(out).toBe("https://example.com/page");
  });

  it("preserves uppercase absolute HTTPS urls", () => {
    const out = formatDocsLink("HTTPS://example.com/page", "page");
    expect(out).toBe("HTTPS://example.com/page");
  });

  it("does not treat http-prefixed relative paths as absolute urls", () => {
    expect(formatDocsLink("http-status", "HTTP status")).toBe("HTTP status");
  });

  it("returns the label when the path is missing (regression: #67076, #67074)", () => {
    expect(formatDocsLink("   ", "root")).toBe("root");
    expect(formatDocsLink(undefined as unknown as string, "label")).toBe("label");
  });

  it("returns an empty string when neither path nor label is present", () => {
    expect(formatDocsLink(null as unknown as string)).toBe("");
  });

  it("strips terminal controls from plain-text labels", () => {
    expect(formatDocsLink("/channels/x", "docs\u001b[31m")).toBe("docs[31m");
  });

  it("strips terminal controls from non-OSC docs fallback text", () => {
    const out = formatDocsLink("https://example.com/a\u0007b", "docs\u001b[31m", {
      force: false,
    });

    expect(out).toBe("https://example.com/ab");
  });
});
