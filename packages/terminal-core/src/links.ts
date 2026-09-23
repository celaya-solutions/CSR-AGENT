import { formatTerminalLink } from "./terminal-link.js";

const ABSOLUTE_HTTP_URL_RE = /^https?:\/\//i;

function stripControls(value: string): string {
  return value.replace(/\p{Cc}/gu, "");
}

/**
 * Formats a docs reference for terminal output.
 *
 * There is no hosted docs site: a relative docs path (for example a channel's
 * `meta.docsPath`) renders as plain text, preferring `label` over the path.
 * Only a caller-supplied absolute http(s) URL becomes a terminal hyperlink.
 * A missing path renders the label, or an empty string when there is none.
 */
export function formatDocsLink(
  path: string | undefined | null,
  label?: string,
  opts?: { fallback?: string; force?: boolean },
): string {
  const trimmed = typeof path === "string" ? path.trim() : "";
  if (ABSOLUTE_HTTP_URL_RE.test(trimmed)) {
    return formatTerminalLink(label ?? trimmed, trimmed, {
      fallback: opts?.fallback ?? trimmed,
      force: opts?.force,
    });
  }
  return stripControls(label ?? trimmed);
}
