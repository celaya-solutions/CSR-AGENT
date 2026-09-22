// Test routing roots for media generation, media understanding, and voice plugins.
export const mediaExtensionTestRoots = ["extensions/image-generation-core"];

export function isMediaExtensionRoot(root) {
  return mediaExtensionTestRoots.includes(root);
}
