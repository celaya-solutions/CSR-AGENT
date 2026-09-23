import path from "node:path";
import { expectDefined } from "@openclaw/normalization-core";
import { expect, it } from "vitest";
import { runCiGitStep, type FetchResult } from "./ci-git-owner.test-support.js";

const candidate = "a".repeat(40);
const harness = "b".repeat(40);
const base = "c".repeat(40);
const moved = "d".repeat(40);
const merge = "e".repeat(40);
const linuxIt = it.skipIf(process.platform !== "linux");
// Raw owner lifecycle checks use the shared POSIX census on Linux and macOS.
const posixIt = it.skipIf(process.platform === "win32");

const resetProfiles = [
  {
    job: "android",
    step: "Checkout",
    target: `+${candidate}:refs/remotes/origin/ci-target`,
    remote: "fixture/checkout",
  },
  {
    job: "check-docs",
    step: "Checkout ClawHub docs source",
    target: "+refs/heads/main:refs/remotes/origin/checkout",
    remote: "openclaw/clawhub",
  },
];
const resetCases: { label: string; fetchResults: FetchResult[]; code: number; attempts: number }[] =
  [
    { label: "leader exit", fetchResults: [0], code: 0, attempts: 1 },
    { label: "timeout recovery", fetchResults: ["hang", 0], code: 0, attempts: 2 },
    { label: "timeouts exhausted", fetchResults: Array(5).fill("hang"), code: 1, attempts: 5 },
    { label: "unverified cleanup", fetchResults: ["cleanup-failure"], code: 125, attempts: 1 },
  ];
linuxIt.each(resetProfiles.flatMap((profile) => resetCases.map((entry) => ({ profile, entry }))))(
  "$profile.job drains descendants before reset/reuse ($entry.label)",
  async ({ profile: { job, step, target, remote }, entry: { fetchResults, code, attempts } }) => {
    const report = await runCiGitStep({ job, step, fetchResults });
    expect(report.code).toBe(code);
    expect(report.readyAttempts).toHaveLength(attempts);
    expect(report.fetches).toHaveLength(attempts);
    expect(report.boundaries.filter(({ name }) => name === "delete")).toHaveLength(attempts);
    expect(report.checkouts).toHaveLength(code === 0 ? 1 : 0);
    for (const fetch of report.fetches) {
      expect(fetch.args).toEqual(
        expect.arrayContaining([target, "--depth=1", "--no-tags", "--no-recurse-submodules"]),
      );
      expect(fetch.cwd).toBe(
        job === "android" ? report.workspace : path.join(report.workspace, "clawhub-source"),
      );
    }
    expect(
      report.commands
        .filter(({ args }) => args[0] === "remote")
        .every(({ args }) => args.at(-1) === `https://github.com/${remote}.git`),
    ).toBe(true);
  },
  55_000,
);

linuxIt.each([
  { label: "timeout recovery", fetchResults: ["hang", 0], code: 0, attempts: 2 },
  { label: "timeouts exhausted", fetchResults: ["hang", "hang", "hang"], code: 124, attempts: 3 },
  { label: "ordinary Git failure", fetchResults: [23], code: 23, attempts: 1 },
] satisfies { label: string; fetchResults: FetchResult[]; code: number; attempts: number }[])(
  "skills preserves exact-SHA retries without a fallback ($label)",
  async ({ fetchResults, code, attempts }) => {
    const report = await runCiGitStep({ job: "skills-python", fetchResults });
    expect(report.code).toBe(code);
    expect(report.fetches).toHaveLength(attempts);
    expect(
      report.fetches.every(
        ({ args }) =>
          args.includes(`+${candidate}:refs/remotes/origin/checkout`) && args.includes("--depth=1"),
      ),
    ).toBe(true);
    expect(report.checkouts).toHaveLength(code === 0 ? 1 : 0);
    expect(report.boundaries.some(({ name }) => name === "delete")).toBe(false);
  },
  55_000,
);

linuxIt.each([
  { phase: "fetch", fetchResults: [23, 0], checkoutResults: [], firstCheckout: false },
  { phase: "checkout", fetchResults: [0, 0], checkoutResults: [23, 0], firstCheckout: true },
])(
  "Android resets only after safely joined $phase failure",
  async ({ fetchResults, checkoutResults, firstCheckout }) => {
    const report = await runCiGitStep({ job: "android", fetchResults, checkoutResults });
    expect(report.code).toBe(0);
    expect(report.readyAttempts).toEqual([1, 2]);
    expect(report.fetches.map(({ args }) => args.at(-1))).toEqual([
      `+${candidate}:refs/remotes/origin/ci-target`,
      `+${candidate}:refs/remotes/origin/ci-target`,
    ]);
    expect(
      report.boundaries
        .filter(({ name }) => name === "delete" || name === "checkout" || name.startsWith("fetch:"))
        .map(({ name }) => name),
    ).toEqual([
      "delete",
      "fetch:1",
      ...(firstCheckout ? ["checkout"] : []),
      "delete",
      "fetch:2",
      "checkout",
    ]);
  },
  55_000,
);

const manualProfiles = [
  { job: "preflight", step: "Checkout", depth: 1 },
  { job: "security-fast", step: "Checkout manual target", depth: 2 },
];
linuxIt.each(
  manualProfiles.flatMap((profile) => [
    { ...profile, label: "missing branch", fetchResults: [128, 0] as FetchResult[], code: 0 },
    {
      ...profile,
      label: "timeout is not missing",
      fetchResults: ["hang", "hang", "hang"] as FetchResult[],
      code: 124,
    },
    {
      ...profile,
      label: "cleanup is not missing",
      fetchResults: ["cleanup-failure"] as FetchResult[],
      code: 125,
    },
  ]),
)(
  "$job only falls back after a safely joined unavailable target ($label)",
  async ({ job, step, depth, fetchResults, code }) => {
    const report = await runCiGitStep({
      job,
      step,
      fetchResults,
      env: { GITHUB_EVENT_NAME: "workflow_dispatch", CHECKOUT_REF: "refs/heads/missing" },
    });
    expect(report.code).toBe(code);
    const targetFetches = report.fetches.filter(({ args }) =>
      args.some((arg) => arg.endsWith(":refs/remotes/origin/checkout")),
    );
    expect(targetFetches.map(({ args }) => args.at(-1))).toEqual(
      code === 0
        ? [
            "+refs/heads/missing:refs/remotes/origin/checkout",
            `+${candidate}:refs/remotes/origin/checkout`,
          ]
        : fetchResults.map(() => "+refs/heads/missing:refs/remotes/origin/checkout"),
    );
    expect(targetFetches.every(({ args }) => args.includes(`--depth=${depth}`))).toBe(true);
    expect(report.fetches).toHaveLength(
      targetFetches.length + (job === "preflight" && code === 0 ? 1 : 0),
    );
    expect(report.checkouts).toHaveLength(code === 0 ? 1 : 0);
  },
  55_000,
);

linuxIt(
  "preflight pins a moved exact SHA and retries only its parent metadata",
  async () => {
    const report = await runCiGitStep({
      job: "preflight",
      fetchResults: [0, 0, 23, 0],
      env: { GITHUB_EVENT_NAME: "workflow_dispatch" },
      poisonPython: true,
    });
    expect(report.code).toBe(0);
    expect(report.fetches.map(({ args }) => args.at(-1))).toEqual([
      "+refs/heads/main:refs/remotes/origin/checkout",
      `+${candidate}:refs/remotes/origin/checkout`,
      candidate,
      candidate,
    ]);
    for (const fetch of report.fetches.slice(2)) {
      expect(fetch.args).toEqual(expect.arrayContaining(["--depth=2", "--filter=blob:none"]));
    }
    expect(report.checkouts.map(({ args }) => args)).toEqual([
      ["checkout", "--detach", "refs/remotes/origin/checkout"],
    ]);
  },
  55_000,
);

linuxIt(
  "manual security never refetches an unavailable equal fallback",
  async () => {
    const report = await runCiGitStep({
      job: "security-fast",
      step: "Checkout manual target",
      env: { GITHUB_EVENT_NAME: "workflow_dispatch" },
      fetchResults: [128],
    });
    expect(report.code).toBe(128);
    expect(report.fetches.map(({ args }) => args.at(-1))).toEqual([
      `+${candidate}:refs/remotes/origin/checkout`,
    ]);
    expect(report.checkouts).toEqual([]);
  },
  55_000,
);

linuxIt(
  "preflight rejects a fallback that cannot satisfy the requested exact SHA",
  async () => {
    const report = await runCiGitStep({
      job: "preflight",
      env: { GITHUB_EVENT_NAME: "workflow_dispatch", CHECKOUT_REF: moved },
      fetchResults: [128, 0],
    });
    expect(report.code).toBe(1);
    expect(report.fetches.map(({ args }) => args.at(-1))).toEqual([
      `+${moved}:refs/remotes/origin/checkout`,
      `+${candidate}:refs/remotes/origin/checkout`,
    ]);
    expect(report.checkouts).toEqual([]);
  },
  55_000,
);

const preflightCases: {
  label: string;
  env: Record<string, string>;
  fetchResults: FetchResult[];
  code: number;
}[] = [
  {
    label: "push never substitutes another ref",
    env: { GITHUB_EVENT_NAME: "push", CHECKOUT_REF: "refs/heads/missing" },
    fetchResults: [128],
    code: 128,
  },
  {
    label: "unavailable fallback does not recurse",
    env: { GITHUB_EVENT_NAME: "workflow_dispatch" },
    fetchResults: [128],
    code: 128,
  },
  {
    label: "parent metadata failure prevents checkout",
    env: {},
    fetchResults: [0, 23, 23, 23],
    code: 1,
  },
];
linuxIt.each(preflightCases)(
  "preflight fails closed: $label",
  async ({ env, fetchResults, code }) => {
    const report = await runCiGitStep({ job: "preflight", env, fetchResults });
    expect(report.code).toBe(code);
    expect(report.fetches).toHaveLength(fetchResults.length);
    expect(report.checkouts).toEqual([]);
  },
  55_000,
);

const historyProfiles: {
  job: string;
  step: string;
  env: Record<string, string>;
  target: string;
}[] = [
  {
    job: "preflight",
    step: "Resolve exact diff base",
    env: { GITHUB_EVENT_NAME: "workflow_dispatch", RELEASE_GATE: "true" },
    target: "+refs/pull/17/merge:refs/remotes/origin/release-gate-merge",
  },
  {
    job: "checks-fast-core",
    step: "Prepare release-gate ratchet merge tree",
    env: {},
    target: "+refs/pull/17/merge:refs/remotes/origin/ci-ratchet-merge",
  },
];

linuxIt.each(
  historyProfiles.flatMap((profile) => [
    { ...profile, label: "successful leader exit", fetchResults: [0] as FetchResult[], code: 0 },
    {
      ...profile,
      label: "unverified cleanup",
      fetchResults: ["cleanup-failure"] as FetchResult[],
      code: 125,
    },
  ]),
)(
  "$job/$step joins supplemental history before consumption ($label, $target)",
  async ({ job, step, env, target, fetchResults, code }) => {
    const report = await runCiGitStep({
      job,
      step,
      env,
      fetchResults,
      prepare: true,
      poisonPython: true,
    });
    expect(report.code).toBe(code);
    expect(report.fetches).toHaveLength(1);
    expect(report.fetches[0]?.args).toEqual(expect.arrayContaining([target, "--depth=2"]));
    if (step === "Resolve exact diff base") {
      expect(report.githubOutput).toBe(code === 0 ? `sha=${base}\nhead_sha=${merge}\n` : "");
    }
    if (step === "Prepare release-gate ratchet merge tree") {
      expect(report.githubEnv).toBe(code === 0 ? `RATCHET_BASE_REF=${base}\n` : "");
      expect(report.checkouts.map(({ args }) => args.at(-1))).toEqual(code === 0 ? [merge] : []);
    }
  },
  55_000,
);

linuxIt(
  "ratchet retries a stale merge parent before checkout and base publication",
  async () => {
    const report = await runCiGitStep({
      job: "checks-fast-core",
      step: "Prepare release-gate ratchet merge tree",
      fetchResults: [0, 0],
      mergeSnapshots: [
        { sha: "f".repeat(40), head: moved },
        { sha: merge, head: candidate },
      ],
      prepare: true,
    });
    expect(report.code).toBe(0);
    expect(report.fetches.map(({ args }) => args.at(-1))).toEqual([
      "+refs/pull/17/merge:refs/remotes/origin/ci-ratchet-merge",
      "+refs/pull/17/merge:refs/remotes/origin/ci-ratchet-merge",
    ]);
    expect(
      report.boundaries
        .filter(
          ({ name }) => name.startsWith("fetch:") || name === "show-parents" || name === "checkout",
        )
        .map(({ name }) => name),
    ).toEqual(["fetch:1", "show-parents", "fetch:2", "show-parents", "checkout"]);
    expect(report.checkouts.map(({ args }) => args.at(-1))).toEqual([merge]);
    expect(report.githubEnv).toBe(`RATCHET_BASE_REF=${base}\n`);
  },
  55_000,
);

posixIt(
  "fetches the CI harness without a second full-repository snapshot",
  async () => {
    const report = await runCiGitStep({ job: "checks-fast-core", fetchResults: [0, 0] });
    expect(report.code).toBe(0);
    const harnessDirectory = path.join(report.workspace, ".ci-harness");
    const harnessCommands = report.commands.filter(
      ({ tool, cwd }) => tool === "git" && cwd === harnessDirectory,
    );
    // The harness supplies only .github/actions: narrowing must be in place before the
    // fetch runs, so it never downloads the blobs the sparse checkout discards.
    expect(harnessCommands.map(({ args }) => args[0])).toEqual([
      "init",
      "remote",
      "sparse-checkout",
      "fetch",
      "checkout",
    ]);
    const harnessFetch = expectDefined(
      harnessCommands.find(({ args }) => args[0] === "fetch"),
      "harness fetch",
    );
    expect(harnessFetch.args).toEqual(expect.arrayContaining(["--filter=blob:none"]));
    expect(harnessFetch.args.at(-1)).toBe(`+${harness}:refs/remotes/origin/ci-harness`);
    // The selected checkout still needs real file contents, so it must stay unfiltered.
    const workspaceFetch = expectDefined(
      report.fetches.find(({ cwd }) => cwd === report.workspace),
      "workspace fetch",
    );
    expect(workspaceFetch.args).not.toContain("--filter=blob:none");
  },
  55_000,
);

const newer = "d".repeat(40);
const sourceObject = "refs/remotes/origin/main:.openclaw-sync/source.json";
const fetch = ["fetch", "origin", "main:refs/remotes/origin/main"];
const show = ["show", sourceObject];
const rebase = ["rebase", "-X", "theirs", "origin/main"];
const push = ["push", "origin", "HEAD:main"];
const abort = ["rebase", "--abort"];
const diff = [
  "diff",
  "--quiet",
  "--",
  "docs",
  ".openclaw-sync",
  "package.json",
  "package-lock.json",
];
const dependencyReads = [
  ["show", "refs/remotes/origin/main:package.json"],
  ["show", "refs/remotes/origin/main:package-lock.json"],
];
const commit = [
  ["config", "user.name", "openclaw-docs-sync[bot]"],
  ["config", "user.email", "openclaw-docs-sync[bot]@users.noreply.github.com"],
  ["add", "docs", ".openclaw-sync", "package.json", "package-lock.json"],
  ["commit", "-m", `chore(sync): mirror docs from fixture/checkout@${candidate}`],
];

function runDocs(step: string, options: Partial<Parameters<typeof runCiGitStep>[0]> = {}) {
  return runCiGitStep({
    workflow: { file: ".github/workflows/docs-sync-publish.yml", job: "sync-publish-repo", step },
    fetchResults: [],
    objects: { [sourceObject]: { text: JSON.stringify({ sha: candidate }) } },
    poisonPython: true,
    ...options,
  });
}

function gitArgs(report: Awaited<ReturnType<typeof runDocs>>) {
  return report.commands.filter(({ tool }) => tool === "git").map(({ args }) => args);
}

function backoffs(report: Awaited<ReturnType<typeof runDocs>>) {
  return [...report.output.matchAll(/fixture backoff: (\d+)/gu)].map((match) => Number(match[1]));
}

posixIt.each(["directory", "file", "symlink"] as const)(
  "docs clone drains an ordinary failure before deleting/retrying (%s)",
  async (publishPath) => {
    const report = await runDocs("Clone publish repo", { cloneResults: [23, 0], publishPath });
    expect(report.code, report.output).toBe(0);
    expect(report.readyAttempts).toEqual([1, 2]);
    expect(gitArgs(report)).toEqual(
      [1, 2].map(() => [
        "clone",
        "https://x-access-token:fixture-docs-token@github.com/openclaw/docs.git",
        path.join(report.workspace, "publish"),
      ]),
    );
    expect(report.boundaries.map(({ name }) => name)).toEqual([
      "delete",
      "clone:1",
      "delete",
      "clone:2",
      "exit",
    ]);
    expect(backoffs(report)).toEqual([2]);
    expect(report.output).toContain("Clone attempt 1 failed; retrying.");
    expect(report.output).not.toContain("fixture-docs-token");
  },
  55_000,
);

posixIt(
  "docs clone cleanup uncertainty is terminal before another deletion or clone",
  async () => {
    const report = await runDocs("Clone publish repo", { cloneResults: ["cleanup-failure"] });
    expect(report.code, report.output).toBe(125);
    expect(report.clones).toHaveLength(1);
    expect(report.boundaries.map(({ name }) => name)).toEqual(["delete", "clone:1", "exit"]);
    expect(backoffs(report)).toEqual([]);
    expect(report.output).toContain("Git ownership/setup failed");
    expect(report.output).not.toContain("fixture-docs-token");
  },
  55_000,
);

posixIt.each([23, 125, "hang"] satisfies FetchResult[])(
  "docs advisory fetch drains before config/add/commit and still continues (%s)",
  async (failure) => {
    const report = await runDocs("Commit publish repo sync", { fetchResults: [failure, 0] });
    expect(report.code, report.output).toBe(0);
    expect(gitArgs(report)).toEqual([
      diff,
      fetch,
      ...commit,
      fetch,
      show,
      rebase,
      ...dependencyReads,
      push,
    ]);
    expect(backoffs(report)).toEqual([]);
    expect(
      report.commands.every(
        ({ tool, args, cwd }) =>
          cwd ===
          (tool === "node" && args[0] === "--input-type=module"
            ? report.workspace
            : path.join(report.workspace, "publish")),
      ),
    ).toBe(true);
    expect(report.commands.filter(({ tool }) => tool === "node")).toHaveLength(2);
    expect(report.boundaries.map(({ name }) => name)).toEqual([
      "diff",
      "fetch:1",
      "config",
      "config",
      "add",
      "commit",
      "fetch:2",
      `show:${sourceObject}`,
      "rebase:1",
      ...dependencyReads.map((args) => `show:${args[1]}`),
      "consumer:node",
      "consumer:npm",
      "consumer:node",
      "push:1",
      "exit",
    ]);
  },
  55_000,
);

posixIt.each([
  { operation: "rebase", failure: 23, lockChange: false },
  { operation: "push", failure: 23, lockChange: true },
  { operation: "rebase", failure: 125, lockChange: false },
  { operation: "push", failure: 143, lockChange: false },
])(
  "docs publication drains failed $operation ($failure) before abort/next fetch and then succeeds",
  async ({ operation, failure, lockChange }) => {
    const report = await runDocs("Commit publish repo sync", {
      env: lockChange ? { FIXTURE_DOCS_LOCK_AFTER_REBASE: "1" } : {},
      rebaseResults: operation === "rebase" ? [failure, 0] : [],
      pushResults: operation === "push" ? [failure, 0] : [],
    });
    expect(report.code, report.output).toBe(0);
    expect(gitArgs(report)).toEqual([
      diff,
      fetch,
      show,
      ...commit,
      fetch,
      show,
      rebase,
      ...(operation === "push" ? [...dependencyReads, push] : []),
      abort,
      fetch,
      show,
      rebase,
      ...dependencyReads,
      push,
    ]);
    expect(backoffs(report)).toEqual([2]);
    expect(report.output).toContain("Publish sync attempt 1 failed; retrying.");
    expect(report.pushes).toHaveLength(operation === "push" ? 2 : 1);
    expect(report.commands.filter(({ tool }) => tool === "npm")).toHaveLength(lockChange ? 2 : 1);
    if (operation === "push" && !lockChange) {
      expect(report.output).toContain("Reused 1 unchanged successful page check(s).");
    }
  },
  55_000,
);

posixIt(
  "docs publication rejects invalid content introduced by the final rebase",
  async () => {
    const report = await runDocs("Commit publish repo sync", {
      env: { FIXTURE_DOCS_MDX_AFTER_REBASE: "# Rebased page\n\n{unfinished\n" },
    });
    expect(report.code, report.output).toBe(125);
    expect(report.output).toContain("Docs MDX check failed");
    expect(report.pushes).toEqual([]);
    expect(report.rebases.map(({ args }) => args)).toEqual([rebase]);
  },
  55_000,
);

posixIt.each(["advisory fetch", "fetch", "rebase", "manifest", "lock", "push"] as const)(
  "docs publication cleanup uncertainty at %s prevents abort/retry/next Git",
  async (operation) => {
    const report = await runDocs("Commit publish repo sync", {
      fetchResults:
        operation === "advisory fetch"
          ? ["cleanup-failure"]
          : operation === "fetch"
            ? [0, "cleanup-failure"]
            : [],
      rebaseResults: operation === "rebase" ? ["cleanup-failure"] : [],
      pushResults: operation === "push" ? ["cleanup-failure"] : [],
      commandResults:
        operation === "manifest" || operation === "lock"
          ? {
              [dependencyReads[operation === "manifest" ? 0 : 1]!.join(" ")]: {
                code: "cleanup-failure",
              },
            }
          : {},
    });
    expect(report.code, report.output).toBe(125);
    expect(gitArgs(report)).toEqual([
      diff,
      fetch,
      ...(operation === "advisory fetch"
        ? []
        : [
            show,
            ...commit,
            fetch,
            ...(operation === "fetch"
              ? []
              : [
                  show,
                  rebase,
                  ...dependencyReads.slice(
                    0,
                    operation === "rebase" ? 0 : operation === "manifest" ? 1 : 2,
                  ),
                  ...(operation === "push" ? [push] : []),
                ]),
          ]),
    ]);
    expect(report.rebases.some(({ args }) => args.includes("--abort"))).toBe(false);
    expect(backoffs(report)).toEqual([]);
    expect(report.output).toContain("Git ownership/setup failed");
    expect(report.output).not.toContain("retrying");
  },
  55_000,
);

posixIt.each(["Clone publish repo", "Commit publish repo sync"])(
  "docs %s preserves five attempts and every backoff including the terminal one",
  async (step) => {
    const cloning = step === "Clone publish repo";
    const report = await runDocs(step, {
      cloneResults: cloning ? Array<FetchResult>(5).fill(23) : [],
      fetchResults: cloning ? [] : [0, ...Array<FetchResult>(5).fill(23)],
    });
    expect(report.code, report.output).toBe(1);
    expect(backoffs(report)).toEqual([2, 4, 6, 8, 10]);
    expect(report.clones).toHaveLength(cloning ? 5 : 0);
    expect(report.fetches).toHaveLength(cloning ? 0 : 6);
    expect(report.rebases.map(({ args }) => args)).toEqual(
      cloning ? [] : Array.from({ length: 5 }, () => [...abort]),
    );
    expect(report.pushes).toEqual([]);
    expect(
      report.output
        .trim()
        .endsWith(
          cloning
            ? "Failed to clone publish repo after retries."
            : "Failed to push publish-repo sync after retries.",
        ),
    ).toBe(true);
  },
  55_000,
);

posixIt.each([
  { label: "no changes", diffResult: 0, stale: false },
  { label: "stale source", diffResult: 1, stale: true },
])(
  "docs publication exits successfully without committing for $label",
  async ({ diffResult, stale }) => {
    const report = await runDocs("Commit publish repo sync", {
      diffResult,
      objects: { [sourceObject]: { text: JSON.stringify({ sha: newer }) } },
      mergeBase: { ancestor: true, revision: candidate },
    });
    expect(report.code, report.output).toBe(0);
    expect(gitArgs(report)).toEqual(
      stale ? [diff, fetch, show, ["merge-base", "--is-ancestor", candidate, newer]] : [diff],
    );
    expect(report.output).toContain(
      stale
        ? `Skipping stale publish sync for ${candidate}; origin/main already mirrors ${newer}.`
        : "No publish-repo changes.",
    );
    if (stale) {
      expect(report.commands.at(-1)?.cwd).toBe(report.workspace);
    }
  },
  55_000,
);

posixIt.each([
  { label: "missing metadata", text: "", code: 128, ancestor: false },
  { label: "malformed JSON", text: "{", code: 0, ancestor: false },
  { label: "non-JSON constant", text: `{"sha":"${newer}","value":NaN}`, code: 0, ancestor: true },
  { label: "JSON with BOM", text: `\uFEFF{"sha":"${newer}"}`, code: 0, ancestor: true },
  { label: "empty source", text: '{"sha":""}', code: 0, ancestor: false },
  { label: "unrelated source", text: JSON.stringify({ sha: newer }), code: 0, ancestor: false },
])(
  "docs publication retains the changed path for $label",
  async ({ text, code, ancestor, label }) => {
    const report = await runDocs("Commit publish repo sync", {
      objects: { [sourceObject]: { text, code } },
      mergeBase: { ancestor, revision: candidate },
    });
    expect(report.code, report.output).toBe(0);
    const staleCheck =
      label === "unrelated source" ? [["merge-base", "--is-ancestor", candidate, newer]] : [];
    expect(gitArgs(report)).toEqual([
      diff,
      fetch,
      show,
      ...staleCheck,
      ...commit,
      fetch,
      show,
      ...staleCheck,
      rebase,
      ...dependencyReads,
      push,
    ]);
  },
  55_000,
);

posixIt.each([
  {
    label: "malformed remote manifest",
    text: "{",
    validates: false,
    error: "Git ownership/setup failed (unknown); refusing reuse or retry",
  },
  {
    label: "unrelated remote dependency update lost during rebase",
    text: JSON.stringify({
      name: "docs-fixture",
      private: true,
      devDependencies: { "@sindresorhus/slugify": "2.2.0", "markdown-it": "15.0.1" },
    }),
    validates: true,
    error: "docs sync changed unrelated publisher dependencies",
  },
])(
  "docs publication rejects $label before push without Git retries",
  async ({ text, validates, error }) => {
    const report = await runDocs("Commit publish repo sync", {
      objects: {
        [sourceObject]: { text: JSON.stringify({ sha: candidate }) },
        [dependencyReads[0]![1]!]: { text },
      },
    });
    expect(report.code, report.output).toBe(125);
    expect(gitArgs(report)).toEqual([
      diff,
      fetch,
      show,
      ...commit,
      fetch,
      show,
      rebase,
      ...dependencyReads.slice(0, validates ? 2 : 1),
    ]);
    expect(report.commands.filter(({ tool }) => tool === "node")).toHaveLength(validates ? 1 : 0);
    expect(report.output).toContain(error);
    expect(report.pushes).toEqual([]);
    expect(report.rebases.map(({ args }) => args)).toEqual([rebase]);
    expect(backoffs(report)).toEqual([]);
  },
  55_000,
);

posixIt.each([0, 23, "cleanup-failure"] satisfies FetchResult[])(
  "docs ClawHub HEAD is owned before Node consumption (%s)",
  async (revParseResult) => {
    const report = await runDocs("Sync docs into publish repo", { revParseResult });
    expect(report.code, report.output).toBe(
      revParseResult === "cleanup-failure" ? 125 : revParseResult,
    );
    expect(gitArgs(report)).toEqual([["rev-parse", "HEAD"]]);
    expect(report.commands[0]?.cwd).toBe(path.join(report.workspace, "clawhub-source"));
    expect(report.commands.filter(({ tool }) => tool === "node").map(({ args }) => args)).toEqual(
      revParseResult === 0
        ? [
            [
              "scripts/docs-sync-publish.mjs",
              "--target",
              path.join(report.workspace, "publish"),
              "--source-repo",
              "fixture/checkout",
              "--source-sha",
              candidate,
              "--clawhub-repo",
              path.join(report.workspace, "clawhub-source"),
              "--clawhub-source-repo",
              "openclaw/clawhub",
              "--clawhub-source-sha",
              candidate,
            ],
          ]
        : [],
    );
  },
  55_000,
);

posixIt.each(["Clone publish repo", "Commit publish repo sync"])(
  "docs %s cancellation never reaches retry, abort, or the next Git call",
  async (step) => {
    const report = await runDocs(step, {
      scenario: "cancel-SIGTERM",
      cloneResults: ["hang"],
      fetchResults: ["hang"],
      cooperativeTrees: true,
      realClock: true,
    });
    expect(report.code, report.output).toBe(143);
    expect(report.readyAttempts).toEqual([1]);
    expect(report.commands.filter(({ tool }) => tool === "git")).toHaveLength(
      step === "Clone publish repo" ? 1 : 2,
    );
    expect(report.rebases).toEqual([]);
    expect(report.pushes).toEqual([]);
    expect(report.output).not.toContain("retrying");
    expect(report.boundaries.filter(({ name }) => name === "delete")).toHaveLength(
      step === "Clone publish repo" ? 1 : 0,
    );
  },
  55_000,
);

const agentGate = "Gate trusted main activity and hourly cadence";
const agentCommit = "Commit docs updates";
const agentFetch = ["fetch", "--no-tags", "origin", "main"];
const agentPush = [
  "push",
  "https://x-access-token:fixture-docs-agent-token@github.com/fixture/checkout.git",
  "HEAD:main",
];
const agentCommitCommands = [
  ["diff", "HEAD", "--quiet"],
  ["config", "user.name", "openclaw-docs-agent[bot]"],
  ["config", "user.email", "openclaw-docs-agent[bot]@users.noreply.github.com"],
  ["add", "docs", "README.md", "CHANGELOG"],
  ["commit", "--no-verify", "-m", "docs: refresh documentation"],
];
const agentOutput = (reviewBase = base) =>
  `run_agent=true\nbase_sha=${candidate}\nreview_base_sha=${reviewBase}\nreview_head_sha=${candidate}\n`;

function runDocsAgent(step: string, options: Partial<Parameters<typeof runCiGitStep>[0]> = {}) {
  return runCiGitStep({
    ...options,
    workflow: { file: ".github/workflows/docs-agent.yml", job: "update-docs", step },
    fetchResults: options.fetchResults ?? [],
    poisonPython: true,
    env: {
      EVENT_NAME: "workflow_run",
      WORKFLOW_HEAD_SHA: candidate,
      GITHUB_RUN_ID: "123",
      GITHUB_TOKEN: "",
      BASE_SHA: candidate,
      ...options.env,
    },
    revisions: { "origin/main": candidate, [`${candidate}^`]: base, ...options.revisions },
  });
}

posixIt.each([0, 128, 125, 143])(
  "Docs Agent manual gate owns HEAD and parent before exact outputs (parent=%s)",
  async (code) => {
    const report = await runDocsAgent(agentGate, {
      env: { EVENT_NAME: "workflow_dispatch" },
      commandResults: { "rev-parse HEAD": { code: 0 }, [`rev-parse ${candidate}^`]: { code } },
    });
    expect(report.code, report.output).toBe(0);
    expect(gitArgs(report)).toEqual([
      ["rev-parse", "HEAD"],
      ["rev-parse", `${candidate}^`],
    ]);
    expect(report.commands.filter(({ tool }) => tool === "gh")).toEqual([]);
    expect(report.githubOutput).toBe(agentOutput(code === 0 ? base : candidate));
  },
  55_000,
);

posixIt.each([23, 125, 143, "hang"] satisfies FetchResult[])(
  "Docs Agent gate drains failed fetch before retry, remote read, gh and output (%s)",
  async (failure) => {
    const report = await runDocsAgent(agentGate, { fetchResults: [failure, 0] });
    expect(report.code, report.output).toBe(0);
    expect(report.fetches.map(({ args }) => args)).toEqual([agentFetch, agentFetch]);
    expect(backoffs(report)).toEqual([2]);
    expect(report.output).toContain("Fetch attempt 1 failed; retrying.");
    expect(report.githubOutput).toBe(agentOutput());
    expect(report.commands.filter(({ tool }) => tool === "gh").map(({ args }) => args)).toEqual([
      [
        "api",
        "--method",
        "GET",
        "repos/fixture/checkout/actions/workflows/docs-agent.yml/runs",
        "-f",
        "branch=main",
        "-f",
        "event=workflow_run",
        "-f",
        "per_page=100",
      ],
    ]);
  },
  55_000,
);

posixIt.each([false, true])(
  "Docs Agent gate stops before gh/output/retry on fatal cleanup (cancel=%s)",
  async (cancel) => {
    const report = await runDocsAgent(agentGate, {
      fetchResults: cancel ? ["hang"] : ["cleanup-failure"],
      ...(cancel ? { scenario: "cancel-SIGTERM", cooperativeTrees: true, realClock: true } : {}),
    });
    expect(report.code, report.output).toBe(cancel ? 143 : 125);
    expect(gitArgs(report)).toEqual([agentFetch]);
    expect(report.commands.filter(({ tool }) => tool === "gh")).toEqual([]);
    expect(report.githubOutput).toBe("");
    expect(backoffs(report)).toEqual([]);
    expect(report.output).not.toContain("retrying");
  },
  55_000,
);

posixIt(
  "Docs Agent superseded gate drains before false output without gh",
  async () => {
    const report = await runDocsAgent(agentGate, { revisions: { "origin/main": moved } });
    expect(report.code, report.output).toBe(0);
    expect(gitArgs(report)).toEqual([agentFetch, ["rev-parse", "origin/main"]]);
    expect(report.githubOutput).toBe("run_agent=false\n");
    expect(report.commands.filter(({ tool }) => tool === "gh")).toEqual([]);
    expect(report.output).toContain(
      `CI run is superseded by ${moved}; skipping docs agent for ${candidate}.`,
    );
  },
  55_000,
);

posixIt.each([
  { probe: 128, parent: 0, code: 0, reviewBase: base },
  { probe: 128, parent: 128, code: 0, reviewBase: candidate },
  { probe: 0, parent: 0, code: 0, reviewBase: moved },
  { probe: "cleanup-failure", parent: 0, code: 125, reviewBase: "" },
  { probe: 128, parent: "cleanup-failure", code: 125, reviewBase: "" },
] satisfies { probe: FetchResult; parent: FetchResult; code: number; reviewBase: string }[])(
  "Docs Agent review base only falls back after ordinary Git failure ($probe/$parent)",
  async ({ probe, parent, code, reviewBase }) => {
    const report = await runDocsAgent(agentGate, {
      workflowRuns: [
        {
          id: 122,
          created_at: "2026-08-28T20:00:00Z",
          status: "completed",
          conclusion: "success",
          head_sha: moved,
        },
      ],
      commandResults: {
        [`cat-file -e ${moved}^{commit}`]: { code: probe },
        [`rev-parse ${candidate}^`]: { code: parent },
      },
    });
    expect(report.code, report.output).toBe(code);
    expect(gitArgs(report)).toEqual([
      agentFetch,
      ["rev-parse", "origin/main"],
      ["cat-file", "-e", `${moved}^{commit}`],
      ...(probe === 128 ? [["rev-parse", `${candidate}^`]] : []),
    ]);
    expect(report.githubOutput).toBe(code === 0 ? agentOutput(reviewBase) : "");
    expect(report.commands.filter(({ tool }) => tool === "gh")).toHaveLength(1);
    expect(backoffs(report)).toEqual([]);
  },
  55_000,
);

posixIt(
  "Docs Agent no-change commit owns diff before successful exit",
  async () => {
    const report = await runDocsAgent(agentCommit, {
      commandResults: { "diff HEAD --quiet": { code: 0 } },
    });
    expect(report.code, report.output).toBe(0);
    expect(gitArgs(report)).toEqual([["diff", "HEAD", "--quiet"]]);
    expect(report.output).toBe("No docs changes.\n");
  },
  55_000,
);

posixIt.each([23, 125, "hang"] satisfies FetchResult[])(
  "Docs Agent commit drains diff before config/commit and failed fetch before retry (%s)",
  async (failure) => {
    const report = await runDocsAgent(agentCommit, {
      commandResults: { "diff HEAD --quiet": { code: failure === 125 ? 125 : 1 } },
      fetchResults: [failure, 0],
    });
    expect(report.code, report.output).toBe(0);
    expect(gitArgs(report)).toEqual([...agentCommitCommands, agentFetch, agentFetch, agentPush]);
    expect(backoffs(report)).toEqual([2]);
    expect(report.output).toContain("Fetch attempt 1 failed; retrying.");
    expect(report.output).not.toContain("fixture-docs-agent-token");
  },
  55_000,
);

posixIt.each([false, true])(
  "Docs Agent push failure drains before owned read and retry/stale success (advanced=%s)",
  async (advanced) => {
    const report = await runDocsAgent(agentCommit, {
      pushResults: [143, 0],
      revParseResult: 0,
      revisions: { "origin/main": advanced ? moved : candidate },
    });
    expect(report.code, report.output).toBe(0);
    expect(gitArgs(report)).toEqual([
      ...agentCommitCommands,
      agentFetch,
      agentPush,
      ["rev-parse", "origin/main"],
      ...(advanced ? [] : [agentFetch, agentPush]),
    ]);
    expect(backoffs(report)).toEqual(advanced ? [] : [2]);
    expect(report.output).toContain(
      advanced
        ? `main advanced from ${candidate} to ${moved}; skipping stale docs update.`
        : "Docs update attempt 1 failed; retrying.",
    );
  },
  55_000,
);

posixIt.each(["diff", "config", "commit", "fetch", "push", "read"])(
  "Docs Agent commit cleanup failure at %s is terminal before retry/stale success",
  async (operation) => {
    const index = operation === "diff" ? 0 : operation === "config" ? 1 : 4;
    const report = await runDocsAgent(agentCommit, {
      commandResults: ["diff", "config", "commit"].includes(operation)
        ? { [agentCommitCommands[index]!.join(" ")]: { code: "cleanup-failure" } }
        : {},
      fetchResults: operation === "fetch" ? ["cleanup-failure"] : [],
      pushResults: operation === "push" ? ["cleanup-failure"] : operation === "read" ? [23] : [],
      revParseResult: operation === "read" ? "cleanup-failure" : undefined,
      revisions: { "origin/main": moved },
    });
    expect(report.code, report.output).toBe(125);
    expect(gitArgs(report)).toEqual(
      ["diff", "config", "commit"].includes(operation)
        ? agentCommitCommands.slice(0, index + 1)
        : [
            ...agentCommitCommands,
            agentFetch,
            ...(operation === "fetch" ? [] : [agentPush]),
            ...(operation === "read" ? [["rev-parse", "origin/main"]] : []),
          ],
    );
    expect(backoffs(report)).toEqual([]);
    expect(report.output).not.toMatch(/retrying|skipping stale|No docs changes/u);
  },
  55_000,
);

posixIt.each(["gate", "commit fetch", "commit push"])(
  "Docs Agent %s preserves five attempts and terminal backoff contract",
  async (phase) => {
    const gate = phase === "gate";
    const report = await runDocsAgent(gate ? agentGate : agentCommit, {
      fetchResults: phase === "commit push" ? [] : Array<FetchResult>(5).fill(23),
      pushResults: phase === "commit push" ? Array<FetchResult>(5).fill(23) : [],
    });
    expect(report.code, report.output).toBe(1);
    expect(report.fetches).toHaveLength(5);
    expect(report.pushes).toHaveLength(phase === "commit push" ? 5 : 0);
    expect(backoffs(report)).toEqual(gate ? [2, 4, 6, 8] : [2, 4, 6, 8, 10]);
    const diagnostic = phase === "commit push" ? "Docs update" : "Fetch";
    expect(report.output.match(/(?:Fetch|Docs update) attempt \d failed; retrying\./gu)).toEqual(
      (gate ? [1, 2, 3, 4] : [1, 2, 3, 4, 5]).map(
        (attempt) => `${diagnostic} attempt ${attempt} failed; retrying.`,
      ),
    );
    expect(
      report.output
        .trim()
        .endsWith(
          gate
            ? "Failed to fetch main after retries."
            : "Failed to push docs updates after retries.",
        ),
    ).toBe(true);
  },
  55_000,
);

const agentProducers = [
  ["ls-files", "--others", "--exclude-standard"],
  ["diff", "HEAD", "--name-status", "--diff-filter=AD"],
  ["diff", "--cached", "HEAD", "--name-status", "--diff-filter=AD"],
  ["diff", "HEAD", "--name-only"],
  ["diff", "--cached", "HEAD", "--name-only"],
];
posixIt.each(agentProducers.map((args, index) => ({ args, index })))(
  "Docs Agent enforcement stops on failed producer $args before consuming partial output",
  async ({ args, index }) => {
    const report = await runDocsAgent("Enforce existing-docs-only patch", {
      commandResults: { [args.join(" ")]: { code: 23, output: "src/forbidden.ts\n" } },
    });
    expect(report.code, report.output).toBe(23);
    expect(gitArgs(report)).toEqual(agentProducers.slice(0, index + 1));
    expect(report.output).not.toContain("forbidden");
  },
  55_000,
);
