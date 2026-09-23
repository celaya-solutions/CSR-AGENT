import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = path.resolve("scripts/check-upstream-branding.mjs");
const roots: string[] = [];

function createRepo(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "openclaw-upstream-branding-"));
  roots.push(root);
  for (const [file, contents] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), contents);
  }
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  return root;
}

function runGuard(root: string) {
  return spawnSync(process.execPath, [SCRIPT], { cwd: root, encoding: "utf8" });
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe("check-upstream-branding", () => {
  it("fails on upstream links and names in shipped strings only", () => {
    const root = createRepo({
      "src/help.ts": 'export const hint = "Docs: https://docs.openclaw.ai/start";\n',
      "src/comment.ts": "// See https://github.com/openclaw/openclaw/issues/1\nexport {};\n",
      "src/symbol.ts": 'export const key = Symbol.for("openclaw.ai.runtime");\n',
      "src/help.test.ts": 'expect(x).toBe("https://clawhub.ai");\n',
      "docs/page.md": "Built by OpenClaw 🦞\n",
    });

    const result = runGuard(root);

    expect(result.status).toBe(1);
    const findings = result.stderr.split("\n").filter((line) => /:\d+: upstream-/u.test(line));
    expect(findings.map((line) => line.replace(/: .*$/u, "").replace(/:\d+$/u, ""))).toEqual([
      "docs/page.md",
      "docs/page.md",
      "src/help.ts",
    ]);
  });

  it("passes when shipped surfaces carry no upstream references", () => {
    const root = createRepo({
      "src/help.ts": 'export const hint = "Run openclaw doctor for setup help.";\n',
      "docs/page.md": "OpenAgent keeps the `openclaw` command and `~/.openclaw` state.\n",
    });

    const result = runGuard(root);

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
});
