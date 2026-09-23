// Test routing roots for miscellaneous provider/tool extension suites.
export const miscExtensionTestRoots = [
  "extensions/agent-workforce",
  "extensions/device-pair",
  "extensions/duckduckgo",
  "extensions/llm-task",
];

export function isMiscExtensionRoot(root) {
  return miscExtensionTestRoots.includes(root);
}
