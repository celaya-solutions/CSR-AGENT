#!/usr/bin/env node
// Fails when upstream OpenClaw web properties or product branding reappear on a
// shipped surface. This fork keeps the `openclaw` CLI, package scope, config and
// env names, so only links, hosts, the display name, and the mascot are checked.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SCOPE = [
  "src",
  "ui/src",
  "ui/public",
  "ui/index.html",
  "packages",
  "extensions",
  "docs",
  "README.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "VISION.md",
];

// Test fixtures, upstream agent instructions, and translation memory are not
// product surfaces; docs/INVENTORY.md is the fork's record of what upstream shipped.
const EXCLUDED = [
  /(^|\/)[^/]*\.(test|e2e|live|spec)\.[cm]?[jt]sx?$/u,
  /(^|\/)[^/]*\.test-(support|helpers?|utils)\.[cm]?[jt]sx?$/u,
  /(^|\/)(test-support|test-helpers|test-utils|__tests__|__fixtures__|__traces__|fixtures)\//u,
  /(^|\/)(AGENTS|CLAUDE)\.md$/u,
  /^docs\/\.i18n\//u,
  /^docs\/INVENTORY\.md$/u,
  /\.(png|jpe?g|gif|webp|ico|icns|woff2?|ttf|otf|mp3|mp4|wav|pdf|zip|wasm|sqlite)$/u,
];

const RULES = [
  // A trailing `.name` is a dotted identifier such as a Symbol key, not a host.
  {
    id: "upstream-host",
    pattern: /\b(?:[a-z0-9-]+\.)*(?:openclaw\.ai|clawhub\.ai)\b(?!\.[A-Za-z])/iu,
  },
  { id: "upstream-discord", pattern: /discord(?:\.gg|(?:app)?\.com\/invite)\/clawd\b/iu },
  {
    id: "upstream-repo",
    pattern: /\b(?:github\.com|raw\.githubusercontent\.com|ghcr\.io)\/openclaw\//iu,
  },
  // The bare display word only; identifiers, paths, and dotted names are allowed.
  {
    id: "upstream-name",
    pattern: /(?<![A-Za-z0-9_./@-])OpenClaw(?![A-Za-z0-9_-]|\/|\.[A-Za-z0-9_])/u,
  },
  { id: "upstream-mascot", pattern: /\u{1F99E}/u },
];

// Attribution the MIT license and NOTICE.md require, and upstream security
// reporting, name OpenClaw as plain text on purpose.
const ALLOWED = [
  { path: "README.md", rule: "upstream-name" },
  { path: "docs/index.md", rule: "upstream-name" },
  { path: "docs/help/faq/what-is-openclaw.md", rule: "upstream-name" },
  { path: "docs/reference/credits.md", rule: "upstream-name" },
  { path: "docs/start/why-openclaw.md", rule: "upstream-name" },
  { path: "SECURITY.md", rule: "upstream-name" },
  { path: "CONTRIBUTING.md", rule: "upstream-name" },
  { path: "VISION.md", rule: "upstream-name" },
];

const COMMENT_PREFIX = /^\s*(?:\/\/|\/\*|\*|#(?!!))/u;

function isCodeFile(file) {
  return /\.(?:[cm]?[jt]sx?|mts|cts|css|sh|py)$/u.test(file);
}

// A match after `//` on a code line is a comment, not a shipped string.
function inTrailingComment(line, index) {
  const marker = line.indexOf("//");
  return marker !== -1 && marker < index && !/https?:$/u.test(line.slice(0, marker));
}

function listFiles() {
  const output = execFileSync("git", ["ls-files", "-z", "--", ...SCOPE], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return output
    .split("\0")
    .filter(Boolean)
    .filter((file) => !EXCLUDED.some((pattern) => pattern.test(file)));
}

const findings = [];
for (const file of listFiles()) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const code = isCodeFile(file);
  const lines = text.split("\n");
  for (const [index, line] of lines.entries()) {
    if (code && COMMENT_PREFIX.test(line)) {
      continue;
    }
    for (const rule of RULES) {
      const match = rule.pattern.exec(line);
      if (!match) {
        continue;
      }
      if (code && inTrailingComment(line, match.index)) {
        continue;
      }
      if (ALLOWED.some((entry) => entry.path === file && entry.rule === rule.id)) {
        continue;
      }
      findings.push(`${file}:${index + 1}: ${rule.id}: ${line.trim().slice(0, 160)}`);
    }
  }
}

if (findings.length > 0) {
  console.error(findings.join("\n"));
  console.error(
    `\n${findings.length} upstream OpenClaw reference(s) found on shipped surfaces. ` +
      "Remove the link or name, or add a justified entry to ALLOWED in scripts/check-upstream-branding.mjs.",
  );
  process.exit(1);
}
console.log("[upstream-branding] no upstream links, hosts, name, or mascot on shipped surfaces");
