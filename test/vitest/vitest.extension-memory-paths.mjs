// Test routing roots for memory extension suites.
export const memoryExtensionTestRoots = ["extensions/memory-core"];

export function isMemoryExtensionRoot(root) {
  return memoryExtensionTestRoots.includes(root);
}
