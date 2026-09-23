// The one place this build names its own source repository. Issue reports,
// git-checkout updates, and main-branch installs target it, never upstream.
export const SOURCE_REPOSITORY_SLUG = "celaya-solutions/CSR-AGENT";
export const SOURCE_REPOSITORY_BRANCH = "csr-course";
export const SOURCE_REPOSITORY_GIT_URL = `https://github.com/${SOURCE_REPOSITORY_SLUG}.git`;

const SOURCE_REPOSITORY_ISSUES_PATH = `/${SOURCE_REPOSITORY_SLUG}/issues`.replace(
  /[.*+?^${}()|[\]\\]/gu,
  "\\$&",
);
/** Matches the pathname of a created issue in this build's source repository. */
export const SOURCE_REPOSITORY_ISSUE_PATHNAME = new RegExp(
  `^${SOURCE_REPOSITORY_ISSUES_PATH}/\\d+$`,
  "u",
);
/** Matches the pathname of this build's prefilled new-issue page. */
export const SOURCE_REPOSITORY_NEW_ISSUE_PATHNAME = new RegExp(
  `^${SOURCE_REPOSITORY_ISSUES_PATH}/new$`,
  "u",
);
