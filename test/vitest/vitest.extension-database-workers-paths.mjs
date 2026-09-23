export const databaseWorkerExtensionTestRoots = ["extensions/logbook", "extensions/team-reports"];

export const databaseWorkerExtensionTestFiles = [];

export function isDatabaseWorkerExtensionRoot(root) {
  return databaseWorkerExtensionTestRoots.includes(root);
}
