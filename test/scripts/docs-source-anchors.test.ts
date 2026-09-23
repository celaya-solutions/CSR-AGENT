import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDocsDocument } from "../../scripts/lib/docs-markdown.mjs";

const docsRoot = path.resolve(import.meta.dirname, "../../docs");

function readDocument(file: string) {
  return parseDocsDocument(fs.readFileSync(path.join(docsRoot, file), "utf8"));
}

describe("authored docs section links", () => {
  it("keeps the Podman and Tailscale jump target unique and collision-free", () => {
    const document = readDocument("install/podman.md");
    expect(document.links).toContain("#podman-and-tailscale");
    expect(document.ids.filter((id: string) => id === "podman-and-tailscale")).toHaveLength(1);
    expect(document.collisions).toEqual([]);
  });
});
