// Package Acceptance Workflow tests cover package acceptance workflow script behavior.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { parseUpgradeSurvivorScenarios } from "../../scripts/lib/upgrade-survivor-policy.mjs";
import { createReleaseWorkflowMatrixPlan } from "../../scripts/plan-release-workflow-matrix.mjs";
import { releaseWorkflowJobNeeds as jobNeeds } from "../helpers/release-workflow-timeouts.js";
import { useAutoCleanupTempDirTracker } from "../helpers/temp-dir.js";

const PACKAGE_ACCEPTANCE_WORKFLOW = ".github/workflows/package-acceptance.yml";
const LIVE_E2E_WORKFLOW = ".github/workflows/openclaw-live-and-e2e-checks-reusable.yml";
const LIVE_MEDIA_RUNNER_DOCKERFILE = ".github/images/live-media-runner/Dockerfile";
const LIVE_MEDIA_RUNNER_IMAGE = "ghcr.io/openclaw/openclaw-live-media-runner:ubuntu-24.04";
const LIVE_MEDIA_RUNNER_IMAGE_WORKFLOW = ".github/workflows/live-media-runner-image.yml";
const NPM_TELEGRAM_WORKFLOW = ".github/workflows/npm-telegram-beta-e2e.yml";
const MANTIS_DISCORD_SMOKE_WORKFLOW = ".github/workflows/mantis-discord-smoke.yml";
const MANTIS_DISCORD_STATUS_REACTIONS_WORKFLOW =
  ".github/workflows/mantis-discord-status-reactions.yml";
const MANTIS_DISCORD_THREAD_ATTACHMENT_WORKFLOW =
  ".github/workflows/mantis-discord-thread-attachment.yml";
const MANTIS_SLACK_DESKTOP_SMOKE_WORKFLOW = ".github/workflows/mantis-slack-desktop-smoke.yml";
const MANTIS_TELEGRAM_BOT_E2E_PROOF_WORKFLOW =
  ".github/workflows/mantis-telegram-bot-e2e-proof.yml";
const MANTIS_WEB_UI_CHAT_PROOF_WORKFLOW = ".github/workflows/mantis-web-ui-chat-proof.yml";
const PACKAGE_JSON = "package.json";
const SETUP_PNPM_STORE_CACHE_ACTION = ".github/actions/setup-pnpm-store-cache/action.yml";
const SETUP_RELEASE_HARNESS_ACTION = ".github/actions/setup-release-harness/action.yml";
const QA_LIVE_TRANSPORTS_WORKFLOW = ".github/workflows/qa-live-transports-convex.yml";
const UPDATE_MIGRATION_WORKFLOW = ".github/workflows/update-migration.yml";
const CI_CHECK_TESTBOX_WORKFLOW = ".github/workflows/ci-check-testbox.yml";
const CI_CHECK_ARM_TESTBOX_WORKFLOW = ".github/workflows/ci-check-arm-testbox.yml";
const CI_BUILD_ARTIFACTS_TESTBOX_WORKFLOW = ".github/workflows/ci-build-artifacts-testbox.yml";
const WINDOWS_BLACKSMITH_TESTBOX_WORKFLOW = ".github/workflows/windows-blacksmith-testbox.yml";
const CRABBOX_HYDRATE_WORKFLOW = ".github/workflows/crabbox-hydrate.yml";
const CRABBOX_CONFIG = ".crabbox.yaml";
const SCHEDULED_LIVE_CHECKS_WORKFLOW = ".github/workflows/openclaw-scheduled-live-checks.yml";
const CI_HYDRATE_LIVE_AUTH_SCRIPT = "scripts/ci-hydrate-live-auth.sh";
const UPGRADE_SURVIVOR_RUN_SCRIPT = "scripts/e2e/lib/upgrade-survivor/run.sh";
const SETUP_NODE_V6 = "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020";
const DOWNLOAD_ARTIFACT_V8 = "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c";
const UPLOAD_ARTIFACT_V7 = "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a";
const RUN_TESTBOX_WITH_FAILURE_REPORTING =
  "steipete/run-testbox@2b6b1be536ec7f3c73757fedf5460a27ab4856b4";
const tempDirs = useAutoCleanupTempDirTracker(afterEach);

const frozenAdmissionClosure = [
  "scripts/preflight-frozen-target-contracts.mjs",
  "scripts/lib/frozen-target-source.mjs",
  "scripts/lib/docker-e2e-plan.mts",
  "scripts/lib/docker-e2e-scenarios.mts",
  "scripts/lib/official-external-channel-catalog.json",
  "scripts/lib/upgrade-survivor-policy.mjs",
  "scripts/lib/release-version.mjs",
  "scripts/lib/frozen-target-compat.sh",
  "scripts/resolve-frozen-codex-live-suite.mjs",
  "scripts/resolve-fs-safe-native-contract.mjs",
  "scripts/e2e/lib/upgrade-survivor/config-recipe.mts",
  "scripts/windows-cmd-helpers.mjs",
  "package.json",
  "pnpm-lock.yaml",
  "scripts/plan-release-workflow-matrix.mjs",
  "scripts/lib/direct-run.mjs",
  "scripts/lib/plugin-prerelease-test-plan.mts",
  "scripts/plan-targeted-docker-lane-groups.mjs",
  "scripts/lib/numeric-options.mjs",
];

function frozenWorkflowFixture(
  file: string,
  jobName: string,
  inputs: Record<string, string | boolean | number>,
  files: Record<string, string> = {},
  overrides: Record<string, string> = {},
  toolingPaths: string[] = [],
) {
  const root = tempDirs.make("frozen-workflow-");
  const target = join(root, "target");
  mkdirSync(target);
  for (const [path, value] of Object.entries({
    "package.json": '{"type":"module","version":"2026.7.33"}',
    ...files,
  })) {
    mkdirSync(dirname(join(target, path)), { recursive: true });
    writeFileSync(join(target, path), value);
  }
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      [
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "commit.gpgsign=false",
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.test",
        "-C",
        target,
        ...args,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  git("init", "-q");
  git("add", ".");
  git("commit", "-qm", "fixture");
  const sha = git("rev-parse", "HEAD");
  const tooling = join(root, "tooling");
  // The acquisition step also uses the existing npm-output parser.
  for (const path of [...frozenAdmissionClosure, "scripts/lib/npm-json-output.mts"]) {
    mkdirSync(dirname(join(tooling, path)), { recursive: true });
    copyFileSync(path, join(tooling, path));
  }
  const recipes = "scripts/e2e/lib/upgrade-survivor/config-recipe";
  cpSync(recipes, join(tooling, recipes), { recursive: true });
  for (const path of toolingPaths) {
    mkdirSync(dirname(join(tooling, path)), { recursive: true });
    cpSync(path, join(tooling, path), { recursive: true });
  }
  const toolingGit = (...args: string[]) => git("-C", tooling, ...args);
  toolingGit("init", "-q");
  toolingGit("add", ".");
  toolingGit("commit", "-qm", "candidate tooling fixture");
  const toolingSha = toolingGit("rev-parse", "HEAD");
  const job = workflowJob(file, jobName);
  const plan = workflowStep(job, "Plan frozen source admission");
  const env = {
    PATH: process.env.PATH,
    LANG: "C.UTF-8",
    RUNNER_TEMP: root,
    GITHUB_OUTPUT: join(root, "outputs"),
    GITHUB_REPOSITORY: "openclaw/openclaw",
    GITHUB_RUN_ID: "123",
    GITHUB_RUN_ATTEMPT: "2",
    ADMISSION_WORKFLOW: plan.env?.ADMISSION_WORKFLOW ?? "",
    ADMISSION_INPUTS: JSON.stringify(inputs, null, 2),
    ADMISSION_SELECTED_ROOT: target,
    ADMISSION_SELECTED_SHA: sha,
    ADMISSION_TOOLING_ROOT: tooling,
    ADMISSION_TOOLING_SHA: toolingSha,
    ADMISSION_WORKFLOW_REF: `openclaw/openclaw/${file}@${toolingSha}`,
    ...overrides,
  };
  function run(
    stepName: string,
    extra: Record<string, string> = {},
    suffix = "",
    options: { cwd?: string; timeout?: number } = {},
  ) {
    return spawnSync(
      "bash",
      ["--noprofile", "--norc", "-c", `${workflowStep(job, stepName).run ?? ""}\n${suffix}`],
      { encoding: "utf8", cwd: root, env: { ...env, ...extra }, timeout: 30_000, ...options },
    );
  }
  function selection() {
    const result = run("Plan frozen source admission");
    expect(result.status, result.stderr).toBe(0);
    return JSON.parse(readFileSync(join(root, "frozen-admission-selection.json"), "utf8"));
  }
  const forbidden = join(root, "forbidden");
  const bin = join(root, "bin");
  mkdirSync(bin);
  for (const command of [
    "npm",
    "pnpm",
    "npx",
    "tsx",
    "docker",
    "curl",
    "wget",
    "gh",
    "ghx",
    "git-remote-fixture",
  ]) {
    writeFileSync(
      join(bin, command),
      `#!/bin/sh\nprintf '${command}\\n' >> '${forbidden}'\nexit 97\n`,
      { mode: 0o755 },
    );
  }
  const gitPath = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  writeFileSync(
    join(bin, "git"),
    `#!/bin/sh\nfor arg in "$@"; do\ncase "$arg" in fetch|clone) printf 'hydration\\n' >> '${forbidden}'; exit 97;; esac\ndone\nexec '${gitPath}' "$@"\n`,
    { mode: 0o755 },
  );
  env.PATH = `${bin}:${process.env.PATH}`;
  function admit(extra: Record<string, string> = {}, stepName = "Admit frozen source contracts") {
    const result = run(
      stepName,
      {
        PATH: `${bin}:${process.env.PATH}`,
        NODE_OPTIONS: "--import=forbidden-startup",
        NODE_PATH: join(root, "poison-modules"),
        GH_TOKEN: "synthetic-secret-must-not-survive",
        ...extra,
      },
      "printf 'producer-ran\\n'",
    );
    expect(existsSync(forbidden), result.stderr).toBe(false);
    return result;
  }
  function provisionParser() {
    cpSync("node_modules/typescript", join(tooling, "node_modules/typescript"), {
      recursive: true,
      dereference: true,
    });
  }
  return {
    root,
    target,
    sha,
    tooling,
    toolingSha,
    git,
    toolingGit,
    env,
    run,
    selection,
    admit,
    provisionParser,
  };
}

function reconstructAdmissionEvaluations(record: {
  evaluationIdentity: {
    version: number;
    repository: string;
    selectedSha: string;
    toolingSha: string;
  };
  sources: Record<"selected" | "tooling", Array<{ path: string; oid: string }>>;
  evaluations: Array<{
    selection: unknown;
    contracts: unknown[];
    docker?: unknown;
    sourceRefs: Record<"selected" | "tooling", number[]>;
    digest: string;
  }>;
}) {
  return record.evaluations.map((evaluation) => {
    const sources = {
      selected: [] as Array<{ path: string; oid: string }>,
      tooling: [] as Array<{ path: string; oid: string }>,
    };
    for (const role of ["selected", "tooling"] as const) {
      sources[role] = evaluation.sourceRefs[role].map((index) => {
        expect(Number.isInteger(index)).toBe(true);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(record.sources[role].length);
        const identity = record.sources[role][index];
        if (identity === undefined) {
          throw new Error("missing admission source identity");
        }
        return identity;
      });
    }
    const child = {
      ...record.evaluationIdentity,
      selection: evaluation.selection,
      contracts: evaluation.contracts,
      ...(evaluation.docker ? { docker: evaluation.docker } : {}),
      sources,
    };
    expect(evaluation.digest).toBe(
      createHash("sha256").update(JSON.stringify(child)).digest("hex"),
    );
    return { ...child, digest: evaluation.digest };
  });
}

function packageAdmissionBaselineFixture(
  inputs: Record<string, string | boolean | number>,
  failRegistry = false,
) {
  const f = frozenWorkflowFixture(
    PACKAGE_ACCEPTANCE_WORKFLOW,
    "resolve_package",
    {
      source: "artifact",
      suite_profile: "custom",
      telegram_mode: "none",
      ...inputs,
    },
    {
      "package.json": '{"type":"module","version":"2026.9.9"}',
      "scripts/e2e/lib/upgrade-survivor/assertions.mjs": readFileSync(
        "scripts/e2e/lib/upgrade-survivor/assertions.mjs",
        "utf8",
      ),
    },
    {},
    ["scripts/resolve-upgrade-survivor-baselines.mts", "scripts/lib/release-upgrade-baseline.mjs"],
  );
  // Only the existing trusted acquisition command needs tsx; admission uses plain Node.
  symlinkSync(resolve("node_modules"), join(f.tooling, "node_modules"), "dir");
  const calls = join(f.root, "registry-calls");
  writeFileSync(
    join(f.root, "bin/npm"),
    `#!/bin/sh\nprintf '%s\\n' "$*" >> '${calls}'\n${
      failRegistry
        ? "echo 'controlled baseline lookup failure' >&2\nexit 73"
        : "printf '\"2026.9.1\"\\n'"
    }\n`,
    { mode: 0o755 },
  );
  const selected = join(f.root, "not-acquired");
  const identity = {
    ADMISSION_SELECTED_ROOT: selected,
    ADMISSION_STAGE: "resolved-package",
    ADMISSION_PACKAGE_SOURCE_SHA: f.sha,
    ADMISSION_PACKAGE_SHA256: "d".repeat(64),
    ADMISSION_PACKAGE_VERSION: "2026.9.9",
  };
  const outputs: Record<string, { outputs: Record<string, string> }> = {};
  const job = workflowJob(PACKAGE_ACCEPTANCE_WORKFLOW, "resolve_package");
  const completed: string[] = [];
  const readOutputs = (path: string) => {
    const values: Record<string, string> = {};
    const lines = (existsSync(path) ? readFileSync(path, "utf8") : "").split("\n");
    for (let index = 0; index < lines.length - 1; index++) {
      const line = lines[index];
      if (line === undefined) {
        throw new Error("missing output line");
      }
      const heredoc = line.indexOf("<<");
      const equals = line.indexOf("=");
      if (heredoc >= 0 && (equals < 0 || heredoc < equals)) {
        const delimiter = line.slice(heredoc + 2);
        const content: string[] = [];
        while (++index < lines.length && lines[index] !== delimiter) {
          const value = lines[index];
          if (value === undefined) {
            throw new Error("missing multiline output");
          }
          content.push(value);
        }
        expect(lines[index]).toBe(delimiter);
        values[line.slice(0, heredoc)] = content.join("\n");
      } else {
        expect(equals, line).toBeGreaterThan(0);
        values[line.slice(0, equals)] = line.slice(equals + 1);
      }
    }
    return values;
  };
  function run(stepName: string) {
    const step = workflowStep(job, stepName);
    if (!step.id) {
      throw new Error("missing baseline step identity");
    }
    const outputPath = join(f.root, `${step.id}-outputs`);
    const resolver = outputs.upgrade_survivor_baselines?.outputs ?? {};
    const pin = outputs.exact_baselines?.outputs ?? {};
    if (!runInNewContext(step.if ?? "true", { steps: outputs })) {
      outputs[step.id] = { outputs: {} };
      return { status: 0, stderr: "", stdout: "" };
    }
    const result = f.run(
      stepName,
      {
        ...identity,
        GITHUB_OUTPUT: outputPath,
        CANDIDATE_VERSION: "2026.9.9",
        CANDIDATE_PUBLISHED: "false",
        FALLBACK_BASELINE: String(inputs.published_upgrade_survivor_baseline ?? "openclaw@beta"),
        REQUESTED_BASELINES: String(inputs.published_upgrade_survivor_baselines ?? ""),
        TARGET_CONTEXT_REF: "",
        GH_TOKEN: "",
        BASELINE:
          step.id === "resolved_admission" ? (pin.baseline ?? "") : (resolver.baseline ?? ""),
        BASELINES:
          step.id === "resolved_admission" ? (pin.baselines ?? "") : (resolver.baselines ?? ""),
        BASELINE_SCOPE: resolver.baseline_scope ?? "",
      },
      "",
      { cwd: f.tooling },
    );
    outputs[step.id] = { outputs: readOutputs(outputPath) };
    if (result.status === 0) {
      completed.push(stepName);
    }
    return result;
  }
  const request = () =>
    JSON.parse(readFileSync(join(f.root, "frozen-admission-request.json"), "utf8"));
  const plan = () =>
    JSON.parse(readFileSync(join(f.root, "frozen-admission-selection.json"), "utf8"));
  const planned = run("Plan frozen source admission");
  expect(planned.status, planned.stderr).toBe(0);
  expect(existsSync(selected)).toBe(false);
  const initialRequest = request();
  const initialPlan = plan();
  function resolveBaselines() {
    for (const name of [
      "Resolve published upgrade survivor baselines",
      "Pin published upgrade baseline versions",
      "Finalize frozen source admission",
    ]) {
      const result = run(name);
      if (result.status !== 0) {
        return { ...result, failedStep: name };
      }
    }
    return { status: 0, stderr: "", stdout: "", failedStep: undefined };
  }
  function admit() {
    renameSync(f.target, selected);
    return f.admit();
  }
  return {
    f,
    calls,
    outputs,
    completed,
    initialRequest,
    initialPlan,
    request,
    plan,
    resolveBaselines,
    admit,
  };
}

function packageToolingCheckoutFixture() {
  const root = tempDirs.make("package-tooling-checkout-");
  const repository = join(root, "repository");
  const beforeCheckout = join(root, "before-checkout");
  mkdirSync(repository);
  mkdirSync(beforeCheckout);
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      [
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "commit.gpgsign=false",
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.test",
        "-C",
        repository,
        ...args,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  git("init", "-q", "--initial-branch=main");
  mkdirSync(join(repository, ".github/workflows"), { recursive: true });
  copyFileSync(PACKAGE_ACCEPTANCE_WORKFLOW, join(repository, PACKAGE_ACCEPTANCE_WORKFLOW));
  git("add", ".");
  git("commit", "-qm", "captured workflow");
  const capturedSha = git("rev-parse", "HEAD");
  git("branch", "release/candidate", capturedSha);
  git("branch", "alias", capturedSha);
  git("tag", "release-candidate", capturedSha);
  writeFileSync(join(repository, "advanced.txt"), "main advanced after dispatch\n");
  git("add", ".");
  git("commit", "-qm", "advance main");
  const advancedSha = git("rev-parse", "HEAD");
  const job = workflowJob(PACKAGE_ACCEPTANCE_WORKFLOW, "resolve_package");
  const checkout = workflowStep(job, "Checkout package workflow ref");
  const validate = workflowStep(job, "Validate exact package tooling checkout");
  const identity = job.steps?.find((step) => step.id === "tooling_identity");
  let sequence = 0;
  function run(
    options: {
      workflowRef?: string;
      capturedRef?: string;
      context?: Record<string, unknown>;
      attempt?: number;
      wrongCheckout?: boolean;
      githubRepository?: string;
      callerWorkflowRef?: string;
    } = {},
  ) {
    const context = {
      workflow_repository: "openclaw/openclaw",
      workflow_ref: `openclaw/openclaw/.github/workflows/package-acceptance.yml@${options.capturedRef ?? "refs/heads/main"}`,
      workflow_sha: capturedSha,
      ...options.context,
    };
    const identityOutput = join(root, `identity-${sequence}`);
    const validationOutput = join(root, `validation-${sequence++}`);
    writeFileSync(identityOutput, "");
    writeFileSync(validationOutput, "");
    const env = {
      PATH: process.env.PATH,
      JOB_CONTEXT: JSON.stringify(context),
      GITHUB_REPOSITORY: options.githubRepository ?? "openclaw/openclaw",
      GITHUB_SHA: advancedSha,
      GITHUB_REF: "refs/heads/other-caller",
      GITHUB_WORKFLOW_REF:
        options.callerWorkflowRef ??
        "openclaw/openclaw/.github/workflows/other-caller.yml@refs/heads/main",
      GITHUB_RUN_ATTEMPT: String(options.attempt ?? 1),
      WORKFLOW_REF: options.workflowRef ?? "main",
      PACKAGE_REF: advancedSha,
    };
    const outputs = (file: string): Record<string, string> =>
      Object.fromEntries(
        readFileSync(file, "utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const separator = line.indexOf("=");
            return [line.slice(0, separator), line.slice(separator + 1)];
          }),
      );
    if (identity) {
      const result = spawnSync("bash", ["--noprofile", "--norc", "-c", identity.run ?? ""], {
        cwd: beforeCheckout,
        encoding: "utf8",
        env: { ...env, GITHUB_OUTPUT: identityOutput },
      });
      if (result.status !== 0) {
        return {
          result,
          checkoutReached: false,
          selectedRef: undefined,
          sha: undefined,
          identityOutputs: outputs(identityOutput),
          validationOutputs: outputs(validationOutput),
        };
      }
    }
    const identityOutputs = outputs(identityOutput);
    const selectedRef: unknown = runInNewContext(
      String(checkout.with?.ref).replace(/^\$\{\{(.*)\}\}$/u, "$1"),
      {
        inputs: { workflow_ref: env.WORKFLOW_REF, package_ref: env.PACKAGE_REF },
        steps: { tooling_identity: { outputs: identityOutputs } },
      },
    );
    if (typeof selectedRef !== "string") {
      throw new Error("package workflow checkout did not select a ref");
    }
    git("checkout", "-q", "--detach", options.wrongCheckout ? advancedSha : selectedRef);
    const sha = git("rev-parse", "HEAD");
    const result = spawnSync(
      "bash",
      ["--noprofile", "--norc", "-c", `${validate.run}\nprintf 'installation-reachable\\n'`],
      {
        cwd: repository,
        encoding: "utf8",
        env: {
          ...env,
          EXPECTED_TOOLING_SHA: identityOutputs.sha ?? "",
          GITHUB_OUTPUT: validationOutput,
        },
      },
    );
    return {
      result,
      checkoutReached: true,
      selectedRef,
      sha,
      identityOutputs,
      validationOutputs: outputs(validationOutput),
    };
  }
  return { capturedSha, advancedSha, git, job, checkout, validate, identity, run };
}

describe("frozen admission workflow barriers", () => {
  it.each(["beta", "alpha"])(
    "preserves an unused package %s baseline without a registry lookup",
    (tag) => {
      const baseline = `openclaw@${tag}`;
      const f = frozenWorkflowFixture(PACKAGE_ACCEPTANCE_WORKFLOW, "resolve_package", {
        source: "artifact",
        suite_profile: "custom",
        docker_lanes: "onboard",
        telegram_mode: "none",
        published_upgrade_survivor_baseline: baseline,
      });
      const planned = f.run("Plan frozen source admission", {
        ADMISSION_STAGE: "resolved-package",
        ADMISSION_PACKAGE_SOURCE_SHA: f.sha,
        ADMISSION_PACKAGE_SHA256: "d".repeat(64),
        ADMISSION_PACKAGE_VERSION: "2026.7.33",
      });
      expect(planned.status, planned.stderr).toBe(0);
      expect(
        JSON.parse(readFileSync(join(f.root, "frozen-admission-selection.json"), "utf8"))
          .obligations,
      ).toEqual([]);
      const calls = join(f.root, "registry-calls");
      writeFileSync(
        join(f.root, "bin/npm"),
        `#!/bin/sh\nprintf '%s\\n' "$*" >> '${calls}'\necho 'unexpected unused baseline lookup' >&2\nexit 73\n`,
        { mode: 0o755 },
      );
      const step = workflowStep(
        workflowJob(PACKAGE_ACCEPTANCE_WORKFLOW, "resolve_package"),
        "Pin published upgrade baseline versions",
      );
      const outputs = Object.fromEntries(
        (existsSync(join(f.root, "outputs")) ? readFileSync(join(f.root, "outputs"), "utf8") : "")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const at = line.indexOf("=");
            return [line.slice(0, at), line.slice(at + 1)];
          }),
      );
      const enabled = runInNewContext(step.if ?? "true", {
        steps: { frozen_selection: { outputs } },
      });
      const result = enabled
        ? f.run(
            "Pin published upgrade baseline versions",
            { BASELINE: baseline, BASELINES: "" },
            "",
            { cwd: f.tooling },
          )
        : { status: 0, stderr: "", stdout: "" };
      expect(result.status, result.stderr).toBe(0);
      expect(existsSync(calls)).toBe(false);
    },
  );

  it.each([
    "published-upgrade-survivor",
    "update-migration",
    "root-managed-vps-upgrade",
    "update-restart-auth",
  ])("pins package %s baselines only after the canonical plan", (lane) => {
    const f = packageAdmissionBaselineFixture({
      docker_lanes: lane,
      published_upgrade_survivor_baseline: "openclaw@beta",
    });
    expect(f.initialPlan.obligations).toContainEqual({
      kind: "upgrade-baselines",
      status: "UNRESOLVED",
      requested: f.initialRequest.requestedBaselines,
    });
    expect(f.initialRequest.options.baselinesResolved).toBe(false);
    const resolved = f.resolveBaselines();
    expect(resolved.status, resolved.stderr).toBe(0);
    expect(readFileSync(f.calls, "utf8").trim().split("\n")).toEqual([
      "view openclaw@beta version --json --silent --prefer-online",
    ]);
    const request = f.request();
    expect(request.binding).toEqual(f.initialRequest.binding);
    expect(request.selected).toEqual(f.initialRequest.selected);
    expect(request.requestedBaselines).toEqual(f.initialRequest.requestedBaselines);
    expect(request.options).toMatchObject({
      upgradeSurvivorBaseline: "openclaw@2026.9.1",
      upgradeSurvivorBaselines: "openclaw@2026.9.1",
      baselinesResolved: true,
    });
    expect(f.plan().obligations).toEqual([]);
    const admitted = f.admit();
    expect(admitted.status, admitted.stderr).toBe(0);
    const record = JSON.parse(readFileSync(join(f.f.root, "frozen-admission.json"), "utf8"));
    expect(record.status).toBe("ADMITTED");
    expect(record.binding).toEqual(request.binding);
    expect(record.requestedBaselines.baseline).toBe("openclaw@beta");
    reconstructAdmissionEvaluations(record);
  });

  it.each([
    "published-upgrade-survivor",
    "update-migration",
    "root-managed-vps-upgrade",
    "update-restart-auth",
  ])("blocks package %s admission when baseline lookup fails", (lane) => {
    const f = packageAdmissionBaselineFixture(
      { docker_lanes: lane, published_upgrade_survivor_baseline: "openclaw@alpha" },
      true,
    );
    const result = f.resolveBaselines();
    expect(result.status).toBe(1);
    expect(result.failedStep).toBe("Pin published upgrade baseline versions");
    expect(result.stderr).toContain("controlled baseline lookup failure");
    expect(readFileSync(f.calls, "utf8").trim().split("\n")).toEqual([
      "view openclaw@alpha version --json --silent --prefer-online",
    ]);
    expect(f.completed).not.toContain("Finalize frozen source admission");
    expect(f.request().options.baselinesResolved).toBe(false);
    expect(existsSync(join(f.f.root, "frozen-admission.json"))).toBe(false);
  });

  it("does not look up already exact selected package baselines", () => {
    const f = packageAdmissionBaselineFixture(
      {
        docker_lanes: "root-managed-vps-upgrade",
        published_upgrade_survivor_baseline: "openclaw@2026.9.1",
        published_upgrade_survivor_baselines: "openclaw@2026.9.1",
      },
      true,
    );
    const resolved = f.resolveBaselines();
    expect(resolved.status, resolved.stderr).toBe(0);
    expect(existsSync(f.calls)).toBe(false);
    expect(f.request().options.baselinesResolved).toBe(true);
    expect(f.outputs.resolved_admission?.outputs.baseline_scope).toBe("all-scenarios");
  });

  it.each(["onboard", "upgrade-survivor"])(
    "preserves unused multiline package baselines and scope for %s",
    (lane) => {
      const baselines = "OPENCLAW_ADMISSION_OUTPUT\r\nopenclaw@alpha\nopenclaw@beta\n";
      const f = packageAdmissionBaselineFixture(
        {
          docker_lanes: lane,
          published_upgrade_survivor_baseline: "openclaw@beta",
          published_upgrade_survivor_baselines: baselines,
        },
        true,
      );
      expect(f.initialPlan.obligations).toEqual([]);
      const resolved = f.resolveBaselines();
      expect(resolved.status, resolved.stderr).toBe(0);
      expect(existsSync(f.calls)).toBe(false);
      expect(f.request()).toEqual(f.initialRequest);
      expect(f.request().options.baselinesResolved).toBe(false);
      expect(f.outputs.resolved_admission?.outputs).toEqual({
        baseline: "openclaw@beta",
        baselines,
        baseline_scope: "all-scenarios",
      });
      expect(f.completed).not.toContain("Resolve published upgrade survivor baselines");
      expect(f.completed).not.toContain("Pin published upgrade baseline versions");
    },
  );

  it("orders package planning, acquisition and final outputs around selected baseline resolution", () => {
    const job = workflowJob(PACKAGE_ACCEPTANCE_WORKFLOW, "resolve_package");
    const names = (job.steps ?? []).map((step) => step.name);
    const ordered = [
      "Admit known package source before packing",
      "Resolve package candidate",
      "Plan frozen source admission",
      "Resolve published upgrade survivor baselines",
      "Pin published upgrade baseline versions",
      "Finalize frozen source admission",
      "Validate resolved package source",
      "Acquire resolved package source",
      "Acquire selected contract objects",
      "Admit frozen source contracts",
    ];
    for (const [index, name] of ordered.entries()) {
      const previous = ordered[index - 1];
      expect(names.indexOf(name), name).toBeGreaterThan(previous ? names.indexOf(previous) : -1);
    }
    for (const name of [
      "Resolve published upgrade survivor baselines",
      "Pin published upgrade baseline versions",
    ]) {
      expect(workflowStep(job, name).if).toBe(
        "steps.frozen_selection.outputs.upgrade_baselines_required == 'true'",
      );
    }
    for (const [suffix, output] of [
      ["baseline", "baseline"],
      ["baselines", "baselines"],
      ["baseline_scope", "baseline_scope"],
    ] as const) {
      expect(job.outputs?.[`published_upgrade_survivor_${suffix}`]).toBe(
        `\${{ steps.resolved_admission.outputs.${output} }}`,
      );
    }
    const summary = workflowStep(job, "Summarize package candidate");
    expect(summary.env?.PUBLISHED_UPGRADE_SURVIVOR_BASELINE_SCOPE).toBe(
      "${{ steps.resolved_admission.outputs.baseline_scope }}",
    );
    expect(summary.run).toContain("${PUBLISHED_UPGRADE_SURVIVOR_BASELINE_SCOPE}");
  });

  it.each([
    { groups: 256, scenarios: "base", admitted: true },
    { groups: 64, scenarios: "base ".repeat(800).trim(), admitted: false },
  ])(
    "bounds the complete CLI record for $groups real planner groups",
    { timeout: 420_000 },
    ({ groups, scenarios, admitted }) => {
      const baselines = Array.from(
        { length: groups / 2 },
        (_, index) => `openclaw@2026.9.${index + 1}`,
      ).join(" ");
      const f = frozenWorkflowFixture(
        LIVE_E2E_WORKFLOW,
        "validate_selected_ref",
        {
          docker_lanes: "published-upgrade-survivor update-migration",
          targeted_docker_lane_group_size: 1,
          include_live_suites: true,
          live_suite_filter: "live-gateway-docker",
          include_release_path_suites: false,
          published_upgrade_survivor_baseline: "openclaw@2026.9.1",
          published_upgrade_survivor_baselines: baselines,
          published_upgrade_survivor_scenarios: scenarios,
        },
        {
          "package.json": '{"type":"module","version":"2026.9.9"}',
          "scripts/e2e/lib/upgrade-survivor/assertions.mjs": readFileSync(
            "scripts/e2e/lib/upgrade-survivor/assertions.mjs",
            "utf8",
          ),
        },
        { ADMISSION_BASELINES_RESOLVED: "true" },
      );
      const plan = f.selection();
      expect(plan.docker).toHaveLength(groups);
      expect(plan.explicitConsumers).toContain("live-cli-backend");
      const result = f.run("Admit frozen source contracts", {}, "printf 'producer-ran\\n'", {
        timeout: 360_000,
      });
      expect(result.status, result.stderr).toBe(admitted ? 0 : 1);
      const bytes = readFileSync(join(f.root, "frozen-admission.json"));
      if (admitted) {
        expect(bytes.length).toBeLessThanOrEqual(262_144);
        const record = JSON.parse(bytes.toString("utf8"));
        const children = reconstructAdmissionEvaluations(record);
        expect(children).toHaveLength(groups + 1);
        expect(record.status).toBe("ADMITTED");
        expect(
          record.evaluations
            .slice(0, -1)
            .map(
              (evaluation: { selection: { docker: { baselines: string } } }) =>
                evaluation.selection.docker.baselines,
            ),
        ).toEqual(plan.docker.map((group: { baselines: string }) => group.baselines));
        expect(record.evaluations.at(-1).selection.consumers).toContain("live-cli-backend");
        const { digest, provenance: _provenance, ...content } = record;
        expect(digest).toBe(createHash("sha256").update(JSON.stringify(content)).digest("hex"));
        expect(result.stdout).toContain("producer-ran");
        console.info(
          `high-cardinality admission: ${children.length} evaluations, ${bytes.length} emitted bytes`,
        );
      } else {
        expect(result.stderr).toContain("workflow admission record exceeds limit");
        expect(bytes.length).toBe(0);
        expect(result.stdout).toBe("");
      }
      expect(existsSync(join(f.root, "forbidden"))).toBe(false);
    },
  );

  it.each(["root-managed-vps-upgrade", "update-restart-auth"])(
    "rejects unresolved published baseline for the exact %s wrapper",
    (lane) => {
      const f = frozenWorkflowFixture(LIVE_E2E_WORKFLOW, "validate_selected_ref", {
        docker_lanes: lane,
        include_live_suites: false,
        include_release_path_suites: false,
        published_upgrade_survivor_baseline: "openclaw@latest",
      });
      const plan = f.selection();
      const result = f.admit();
      expect(result.status, result.stderr).toBe(1);
      expect(result.stderr).toContain("unresolved upgrade baselines at the execution boundary");
      expect(result.stdout).toBe("");
      expect(plan.obligations).toContainEqual(
        expect.objectContaining({ kind: "upgrade-baselines" }),
      );
      expect(readFileSync(join(f.root, "frozen-admission.json"), "utf8")).toBe("");
    },
  );

  it.each(["root-managed-vps-upgrade", "update-restart-auth"])(
    "rejects a falsely resolved moving baseline for %s",
    (lane) => {
      const f = frozenWorkflowFixture(
        LIVE_E2E_WORKFLOW,
        "validate_selected_ref",
        {
          docker_lanes: lane,
          include_live_suites: false,
          include_release_path_suites: false,
          published_upgrade_survivor_baseline: "openclaw@latest",
        },
        {},
        { ADMISSION_BASELINES_RESOLVED: "true" },
      );
      const result = f.run("Plan frozen source admission", {}, "printf 'acquisition-reachable\\n'");
      expect(result.status, result.stderr).toBe(1);
      expect(result.stderr).toContain("unresolved upgrade baselines at the execution boundary");
      expect(result.stdout).toBe("");
      expect(existsSync(join(f.root, "forbidden"))).toBe(false);
    },
  );

  it.each([
    { lane: "onboard", prepareOnly: false },
    { lane: "upgrade-survivor", prepareOnly: false },
    { lane: "root-managed-vps-upgrade update-restart-auth", prepareOnly: true },
  ])(
    "leaves unselected published baselines unresolved for $lane prepare=$prepareOnly",
    ({ lane, prepareOnly }) => {
      const f = frozenWorkflowFixture(LIVE_E2E_WORKFLOW, "validate_selected_ref", {
        docker_lanes: lane,
        include_live_suites: false,
        include_release_path_suites: false,
        prepare_only: prepareOnly,
        published_upgrade_survivor_baseline: "openclaw@latest",
      });
      expect(f.selection().obligations).toEqual([]);
      expect(f.run("Resolve selected upgrade baseline versions").status).toBe(0);
      expect(existsSync(join(f.root, "forbidden"))).toBe(false);
    },
  );

  it("keeps shared verification evidence separate from each child's selected and tooling reads", () => {
    const inputs = {
      docker_lanes: "onboard codex-on-demand",
      targeted_docker_lane_group_size: 1,
      include_live_suites: false,
      include_release_path_suites: false,
    };
    const f = frozenWorkflowFixture(
      LIVE_E2E_WORKFLOW,
      "validate_selected_ref",
      inputs,
      {
        "extensions/codex/package.json": readFileSync("extensions/codex/package.json", "utf8"),
      },
      {},
      ["scripts/e2e/lib", "scripts/lib/record-shared.mjs"],
    );
    f.selection();
    const result = f.admit();
    expect(result.status, result.stderr).toBe(0);
    const record = JSON.parse(readFileSync(join(f.root, "frozen-admission.json"), "utf8"));
    const children = reconstructAdmissionEvaluations(record);
    expect(children).toHaveLength(3);
    const extra = "scripts/lib/record-shared.mjs";
    for (const [index, child] of children.entries()) {
      const toolingPaths = child.sources.tooling.map(({ path }) => path);
      const selectedPaths = child.sources.selected.map(({ path }) => path);
      if (index === 1) {
        expect(toolingPaths).toContain(extra);
        expect(selectedPaths).toContain("extensions/codex/package.json");
      } else {
        expect(toolingPaths).not.toContain(extra);
        expect(selectedPaths).not.toContain("extensions/codex/package.json");
      }
    }
    const onlyOnboard = f.run("Plan frozen source admission", {
      ADMISSION_INPUTS: JSON.stringify({ ...inputs, docker_lanes: "onboard" }),
    });
    expect(onlyOnboard.status, onlyOnboard.stderr).toBe(0);
    const single = f.admit();
    expect(single.status, single.stderr).toBe(0);
    const isolated = reconstructAdmissionEvaluations(
      JSON.parse(readFileSync(join(f.root, "frozen-admission.json"), "utf8")),
    );
    expect(children[0]).toEqual(isolated[0]);
  });

  it.each([
    { prepareOnly: false, baselines: "openclaw@2026.9.1\r\nopenclaw@2026.7.33" },
    { prepareOnly: true, baselines: "openclaw@2026.9.1\r\nopenclaw@2026.7.33" },
    {
      prepareOnly: false,
      baselines: "OPENCLAW_ADMISSION_OUTPUT\nOPENCLAW_ADMISSION_OUTPUT_\nopenclaw@2026.9.1\n",
    },
  ])(
    "round-trips unselected multiline baseline outputs with prepare_only=$prepareOnly $baselines",
    ({ prepareOnly, baselines }) => {
      const f = frozenWorkflowFixture(LIVE_E2E_WORKFLOW, "validate_selected_ref", {
        docker_lanes: "onboard",
        include_live_suites: false,
        include_release_path_suites: false,
        prepare_only: prepareOnly,
        published_upgrade_survivor_baselines: baselines,
      });
      expect(f.selection().obligations).toEqual([]);
      const result = f.run("Resolve selected upgrade baseline versions");
      expect(result.status, result.stderr).toBe(0);
      const output = readFileSync(join(f.root, "outputs"), "utf8");
      const values = new Map<string, string>();
      const lines = output.split("\n");
      for (let index = 0; index < lines.length - 1; index++) {
        const line = lines[index];
        if (line === undefined) {
          throw new Error("missing workflow output line");
        }
        const heredoc = line.indexOf("<<");
        const equals = line.indexOf("=");
        if (heredoc >= 0 && (equals < 0 || heredoc < equals)) {
          const key = line.slice(0, heredoc);
          const delimiter = line.slice(heredoc + 2);
          const content = [];
          while (++index < lines.length && lines[index] !== delimiter) {
            content.push(lines[index]);
          }
          expect(lines[index], key).toBe(delimiter);
          values.set(key, content.join("\n"));
        } else {
          expect(equals, `invalid output line: ${line}`).toBeGreaterThan(0);
          values.set(line.slice(0, equals), line.slice(equals + 1));
        }
      }
      expect(values.get("baselines")).toBe(baselines);
      expect(values.get("baseline")).toBe("openclaw@latest");
      expect(values.get("baseline_scope")).toBe("all-scenarios");
      expect(values.get("parser_required")).toBe("false");
      expect(existsSync(join(f.root, "forbidden"))).toBe(false);
      expect(
        JSON.parse(readFileSync(join(f.root, "frozen-admission-request.json"), "utf8"))
          .requestedBaselines.baselines,
      ).toBe(baselines);
    },
  );

  it("verifies tooling without selected identity, objects, dependencies or admission output", () => {
    const f = frozenWorkflowFixture(PACKAGE_ACCEPTANCE_WORKFLOW, "resolve_package", {});
    const result = spawnSync(
      process.execPath,
      [
        join(f.tooling, "scripts/preflight-frozen-target-contracts.mjs"),
        "--verify-tooling",
        f.tooling,
        f.toolingSha,
      ],
      {
        encoding: "utf8",
        env: { PATH: f.env.PATH, ADMISSION_SELECTED_ROOT: join(f.root, "not-acquired") },
      },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("");
    expect(existsSync(join(f.root, "not-acquired"))).toBe(false);
    expect(existsSync(join(f.root, "outputs"))).toBe(false);
    expect(existsSync(join(f.root, "frozen-admission.json"))).toBe(false);
    expect(existsSync(join(f.tooling, "node_modules"))).toBe(false);
    expect(existsSync(join(f.root, "forbidden"))).toBe(false);
  });

  it.each([
    [LIVE_E2E_WORKFLOW, "validate_selected_ref", "known-source"],
    [PACKAGE_ACCEPTANCE_WORKFLOW, "resolve_package", "known-source"],
    [PACKAGE_ACCEPTANCE_WORKFLOW, "resolve_package", "resolved-package"],
  ])("fulfills evaluations before emitting %s %s %s admission", (file, job, stage) => {
    const f = frozenWorkflowFixture(
      file,
      job,
      {
        release_profile: "beta",
        release_test_profile: "beta",
        rerun_group: "live-e2e",
        live_suite_filter: "live-gateway-docker",
        include_live_suites: true,
        include_release_path_suites: false,
        suite_profile: "custom",
        docker_lanes: "onboard plugins-offline",
        allow_frozen_target_scenario_omissions: true,
      },
      { "package.json": '{"type":"module","version":"2026.9.9"}' },
      { ADMISSION_STAGE: stage },
    );
    const known = file === PACKAGE_ACCEPTANCE_WORKFLOW && stage === "known-source";
    const result = f.run(
      known ? "Plan known package source admission" : "Plan frozen source admission",
      stage === "resolved-package"
        ? {
            ADMISSION_PACKAGE_SOURCE_SHA: f.sha,
            ADMISSION_PACKAGE_SHA256: "d".repeat(64),
            ADMISSION_PACKAGE_VERSION: "2026.9.9",
          }
        : {},
    );
    expect(result.status, result.stderr).toBe(0);
    const plan = JSON.parse(readFileSync(join(f.root, "frozen-admission-selection.json"), "utf8"));
    const admitted = f.admit(
      {},
      known ? "Admit known package source before packing" : "Admit frozen source contracts",
    );
    expect(admitted.status, admitted.stderr).toBe(0);
    expect(admitted.stdout).toContain("producer-ran");
    const record = JSON.parse(
      readFileSync(
        join(f.root, known ? "frozen-admission-known-source.json" : "frozen-admission.json"),
        "utf8",
      ),
    );
    expect(record.status).toBe("ADMITTED");
    expect(record.evaluations).toHaveLength(plan.docker.length + 1);
    for (const evaluation of reconstructAdmissionEvaluations(record)) {
      expect(evaluation).toMatchObject({
        version: 1,
        selectedSha: f.sha,
        toolingSha: f.toolingSha,
      });
      expect(Array.isArray(evaluation.contracts)).toBe(true);
      expect(evaluation.digest).toMatch(/^[a-f0-9]{64}$/u);
      const identities = evaluation.sources.tooling.map(
        ({ path, oid }: { path: string; oid: string }) => {
          expect(f.toolingGit("rev-parse", `${f.toolingSha}:${path}`)).toBe(oid);
          return path;
        },
      );
      expect(identities).toEqual(expect.arrayContaining(frozenAdmissionClosure));
    }
    const { digest, provenance: _provenance, ...content } = record;
    expect(digest).toBe(createHash("sha256").update(JSON.stringify(content)).digest("hex"));
    expect(existsSync(join(f.target, "node_modules"))).toBe(false);
    expect(existsSync(join(f.tooling, "node_modules"))).toBe(false);
  });

  it("plans without selected objects and rejects admission before acquisition", () => {
    const f = frozenWorkflowFixture(
      LIVE_E2E_WORKFLOW,
      "validate_selected_ref",
      {
        docker_lanes: "onboard",
        include_live_suites: false,
        include_release_path_suites: false,
        allow_frozen_target_scenario_omissions: true,
      },
      { "src/config/zod-schema.ts": "lastRunAt:" },
    );
    const oid = f.git("rev-parse", "HEAD:src/config/zod-schema.ts");
    unlinkSync(join(f.target, ".git/objects", oid.slice(0, 2), oid.slice(2)));
    const missingRoot = join(f.root, "not-acquired");
    const unavailable = f.run("Plan frozen source admission", {
      ADMISSION_SELECTED_ROOT: missingRoot,
    });
    expect(unavailable.status, unavailable.stderr).toBe(0);
    expect(existsSync(missingRoot)).toBe(false);
    expect(f.selection().sourcePaths).toContain("src/config/zod-schema.ts");
    const rejected = f.admit();
    expect(rejected.status, rejected.stderr).toBe(1);
    expect(rejected.stderr).toContain("unable to read selected source");
    expect(rejected.stdout).toBe("");
    expect(readFileSync(join(f.root, "frozen-admission.json"), "utf8")).toBe("");
  });

  it("stops on a later Docker rejection before explicit consumers or success output", () => {
    const f = frozenWorkflowFixture(
      LIVE_E2E_WORKFLOW,
      "validate_selected_ref",
      {
        docker_lanes: "onboard root-managed-vps-upgrade",
        targeted_docker_lane_group_size: 1,
        published_upgrade_survivor_baseline: "openclaw@2026.9.1",
        include_live_suites: true,
        live_suite_filter: "live-gateway-docker",
        include_release_path_suites: false,
        allow_frozen_target_scenario_omissions: true,
      },
      {
        "package.json": '{"type":"module","version":"not-a-release"}',
        "scripts/print-cli-backend-live-metadata.ts":
          "export function resolveCliBackendDockerPackages() {}",
      },
      { ADMISSION_BASELINES_RESOLVED: "true" },
    );
    const oid = f.git("rev-parse", "HEAD:scripts/print-cli-backend-live-metadata.ts");
    unlinkSync(join(f.target, ".git/objects", oid.slice(0, 2), oid.slice(2)));
    const planned = f.selection();
    expect(planned.explicitConsumers).toContain("live-cli-backend");
    expect(planned.docker.map((group: { lanes: string[] }) => group.lanes)).toEqual([
      ["onboard"],
      ["root-managed-vps-upgrade"],
    ]);
    const outputs = readFileSync(join(f.root, "outputs"), "utf8");
    const rejected = f.admit();
    expect(rejected.status, rejected.stderr).toBe(1);
    expect(rejected.stderr.split("\n")[0]).toBe(
      "frozen admission: selected upgrade target has an invalid release version",
    );
    expect(rejected.stderr).not.toContain("unable to read selected source");
    expect(rejected.stderr).not.toContain("UnhandledPromiseRejection");
    expect(rejected.stdout).toBe("");
    expect(readFileSync(join(f.root, "frozen-admission.json"), "utf8")).toBe("");
    expect(readFileSync(join(f.root, "outputs"), "utf8")).toBe(outputs);
  });

  it.each([
    [LIVE_E2E_WORKFLOW, "validate_selected_ref"],
    [PACKAGE_ACCEPTANCE_WORKFLOW, "resolve_package"],
  ])("accepts pretty-printed workflow inputs at the actual %s CLI boundary", (file, jobName) => {
    const inputs = {
      release_profile: "beta",
      release_test_profile: "beta",
      suite_profile: "custom",
      docker_lanes: "onboard",
      targeted_docker_lane_group_size: 2,
      include_live_suites: false,
      allow_frozen_target_scenario_omissions: true,
    };
    const fixture = frozenWorkflowFixture(
      file,
      jobName,
      inputs,
      {},
      {
        ADMISSION_STAGE: "known-source",
      },
    );
    expect(
      workflowStep(workflowJob(file, jobName), "Plan frozen source admission").env,
    ).toHaveProperty("ADMISSION_INPUTS", "${{ toJSON(inputs) }}");
    const planned = fixture.run("Plan frozen source admission");
    expect(planned.status, planned.stderr).toBe(0);
    const prettyRequest = JSON.parse(
      readFileSync(join(fixture.root, "frozen-admission-request.json"), "utf8"),
    );
    const compact = spawnSync(
      process.execPath,
      [resolve("scripts/preflight-frozen-target-contracts.mjs"), "--workflow-request"],
      {
        encoding: "utf8",
        env: { ...fixture.env, ADMISSION_INPUTS: JSON.stringify(inputs) },
        timeout: 30_000,
      },
    );
    expect(compact.status, compact.stderr).toBe(0);
    expect(prettyRequest).toEqual(JSON.parse(compact.stdout));
    expect(prettyRequest.options).toMatchObject({
      includeLiveSuites: false,
      targetedDockerLaneGroupSize: "2",
    });
  });

  it("bounds raw workflow JSON separately from scalar input validation", () => {
    const fixture = frozenWorkflowFixture(LIVE_E2E_WORKFLOW, "validate_selected_ref", {
      include_live_suites: false,
      include_release_path_suites: false,
    });
    const raw = fixture.env.ADMISSION_INPUTS;
    const limit = 48 * 1024;
    const bounded = raw + " ".repeat(limit - Buffer.byteLength(raw));
    expect(Buffer.byteLength(bounded)).toBe(limit);
    const accepted = fixture.run("Plan frozen source admission", { ADMISSION_INPUTS: bounded });
    expect(accepted.status, accepted.stderr).toBe(0);
    for (const value of [
      `${bounded} `,
      JSON.stringify({ label: "\u00e9".repeat(limit / 2) }),
      "{",
      "null",
      "[]",
      "true",
      '{"docker_lanes":null}',
      '{"docker_lanes":[]}',
      '{"docker_lanes":{}}',
      '{"release_test_profile":"beta\\n"}',
      '{"docker_lanes":"onboard\\u0001"}',
    ]) {
      const rejected = fixture.run(
        "Plan frozen source admission",
        { ADMISSION_INPUTS: value },
        "printf 'producer-ran\\n'",
      );
      expect(rejected.status, value.slice(0, 80)).not.toBe(0);
      expect(rejected.stderr).toContain("frozen admission:");
      expect(rejected.stdout).not.toContain("producer-ran");
    }
    const invalidScalar = fixture.run("Plan frozen source admission", {
      ADMISSION_WORKFLOW_REF: `${fixture.env.ADMISSION_WORKFLOW_REF}\n`,
    });
    expect(invalidScalar.status).not.toBe(0);
    expect(invalidScalar.stderr).toContain("invalid workflow ref");
  });

  it.each<{
    name: string;
    file: string;
    job: string;
    multiline: Record<string, string>;
    normalized: Record<string, string>;
  }>([
    {
      name: "Docker lane lists",
      file: LIVE_E2E_WORKFLOW,
      job: "validate_selected_ref",
      multiline: { docker_lanes: "onboard\n\tplugins-offline" },
      normalized: { docker_lanes: "onboard plugins-offline" },
    },
    {
      name: "survivor baseline and scenario inventories",
      file: LIVE_E2E_WORKFLOW,
      job: "validate_selected_ref",
      multiline: {
        docker_lanes: "published-upgrade-survivor",
        published_upgrade_survivor_baseline: "openclaw@2026.9.1",
        published_upgrade_survivor_baselines: "openclaw@2026.9.1\r\nopenclaw@2026.7.33",
        published_upgrade_survivor_scenarios: "base\nabandoned-update",
      },
      normalized: {
        docker_lanes: "published-upgrade-survivor",
        published_upgrade_survivor_baseline: "openclaw@2026.9.1",
        published_upgrade_survivor_baselines: "openclaw@2026.9.1,openclaw@2026.7.33",
        published_upgrade_survivor_scenarios: "base,abandoned-update",
      },
    },
    {
      name: "Telegram scenario lists",
      file: PACKAGE_ACCEPTANCE_WORKFLOW,
      job: "resolve_package",
      multiline: {
        suite_profile: "telegram",
        telegram_mode: "synthetic",
        telegram_scenarios: "\nmain-telegram\r\n",
      },
      normalized: {
        suite_profile: "telegram",
        telegram_mode: "synthetic",
        telegram_scenarios: "main-telegram",
      },
    },
  ])("preserves multiline $name through actual workflow admission", (entry) => {
    const common = { include_live_suites: false, include_release_path_suites: false };
    const fixture = frozenWorkflowFixture(
      entry.file,
      entry.job,
      { ...common, ...entry.multiline },
      {
        "scripts/e2e/lib/upgrade-survivor/assertions.mjs": readFileSync(
          "scripts/e2e/lib/upgrade-survivor/assertions.mjs",
          "utf8",
        ),
      },
      { ADMISSION_STAGE: "known-source", ADMISSION_BASELINES_RESOLVED: "true" },
    );
    const multilinePlan = fixture.selection();
    const admitted = fixture.admit();
    expect(admitted.status, admitted.stderr).toBe(0);
    const multilineRecord = JSON.parse(
      readFileSync(join(fixture.root, "frozen-admission.json"), "utf8"),
    );
    const normalized = fixture.run("Plan frozen source admission", {
      ADMISSION_INPUTS: JSON.stringify({ ...common, ...entry.normalized }, null, 2),
    });
    expect(normalized.status, normalized.stderr).toBe(0);
    const normalizedPlan = JSON.parse(
      readFileSync(join(fixture.root, "frozen-admission-selection.json"), "utf8"),
    );
    const parsedDocker = (plan: { docker: Array<{ scenarios?: string }> }) =>
      plan.docker.map((group) => ({
        ...group,
        scenarios: parseUpgradeSurvivorScenarios(group.scenarios ?? ""),
      }));
    expect(parsedDocker(multilinePlan)).toEqual(parsedDocker(normalizedPlan));
    expect(multilinePlan.consumers).toEqual(normalizedPlan.consumers);
    const normalizedAdmission = fixture.admit();
    expect(normalizedAdmission.status, normalizedAdmission.stderr).toBe(0);
    const normalizedRecord = JSON.parse(
      readFileSync(join(fixture.root, "frozen-admission.json"), "utf8"),
    );
    expect(multilineRecord.evaluations).toHaveLength(normalizedRecord.evaluations.length);
    const normalizedChildren = reconstructAdmissionEvaluations(normalizedRecord);
    for (const [index, evaluated] of reconstructAdmissionEvaluations(multilineRecord).entries()) {
      const normalizedChild = normalizedChildren[index];
      if (normalizedChild === undefined) {
        throw new Error("missing normalized admission evaluation");
      }
      expect(evaluated.docker).toEqual(normalizedChild.docker);
      expect(evaluated.contracts).toEqual(normalizedChild.contracts);
      expect(evaluated.sources).toEqual(normalizedChild.sources);
    }
  });

  it.each([1, 2])(
    "pins package tooling after main advances for queued/rerun attempt %s",
    (attempt) => {
      const fixture = packageToolingCheckoutFixture();
      expect(fixture.git("rev-parse", "refs/heads/main")).toBe(fixture.advancedSha);
      expect(fixture.advancedSha).not.toBe(fixture.capturedSha);
      const actual = fixture.run({ attempt });
      expect(actual.checkoutReached).toBe(true);
      expect(
        actual.result.status,
        JSON.stringify({
          checkoutRef: fixture.checkout.with?.ref,
          selectedRef: actual.selectedRef,
          capturedSha: fixture.capturedSha,
          advancedSha: fixture.advancedSha,
          checkedOutSha: actual.sha,
          stderr: actual.result.stderr,
        }),
      ).toBe(0);
      expect(actual.selectedRef).toBe(fixture.capturedSha);
      expect(actual.sha).toBe(fixture.capturedSha);
      expect(actual.validationOutputs).toEqual({ sha: fixture.capturedSha });
      expect(actual.result.stdout).toBe("installation-reachable\n");
    },
  );

  it("validates exact package tooling before reusing its sole dependency installation", () => {
    const fixture = packageToolingCheckoutFixture();
    const { job, checkout, validate } = fixture;
    const steps = job.steps ?? [];
    const identity = workflowStep(job, "Resolve called package tooling identity");
    const setup = workflowStep(job, "Setup Node environment");
    expect(steps.indexOf(identity)).toBe(0);
    expect(steps.indexOf(identity)).toBeLessThan(steps.indexOf(checkout));
    expect(steps.indexOf(checkout)).toBeLessThan(steps.indexOf(validate));
    expect(steps.indexOf(validate)).toBeLessThan(steps.indexOf(setup));
    expect(identity.env).toEqual({
      JOB_CONTEXT: "${{ toJSON(job) }}",
      WORKFLOW_REF: "${{ inputs.workflow_ref }}",
    });
    expect(checkout.with).toEqual({
      ref: "${{ steps.tooling_identity.outputs.sha }}",
      "fetch-depth": 0,
      filter: "blob:none",
      "persist-credentials": false,
    });
    expect(validate.env).toEqual({
      EXPECTED_TOOLING_SHA: "${{ steps.tooling_identity.outputs.sha }}",
    });
    expect(
      steps.filter(
        (step) => step.uses?.includes("setup-node-env") || step.run?.includes("pnpm install"),
      ),
    ).toEqual([setup]);
    const actual = fixture.run({ wrongCheckout: true });
    expect(actual.checkoutReached).toBe(true);
    expect(actual.sha).toBe(fixture.advancedSha);
    expect(actual.result.status).toBe(1);
    expect(actual.result.stderr).toContain("checkout must match the captured called workflow SHA");
    expect(actual.result.stdout).toBe("");
    expect(actual.validationOutputs).toEqual({});
    expect(job.outputs?.tooling_sha).toBe("${{ steps.tooling.outputs.sha }}");
  });

  it.each([
    ["main", "refs/heads/main"],
    ["refs/heads/main", "refs/heads/main"],
    ["release/candidate", "refs/heads/release/candidate"],
    ["refs/heads/release/candidate", "refs/heads/release/candidate"],
    ["release-candidate", "refs/tags/release-candidate"],
    ["refs/tags/release-candidate", "refs/tags/release-candidate"],
    ["captured-sha", "refs/heads/main"],
    ["captured-sha", "captured-sha"],
  ])("accepts package tooling assertion %s for captured %s", (input, ref) => {
    const fixture = packageToolingCheckoutFixture();
    const actual = fixture.run({
      workflowRef: input === "captured-sha" ? fixture.capturedSha : input,
      capturedRef: ref === "captured-sha" ? fixture.capturedSha : ref,
    });
    expect(actual.result.status, actual.result.stderr).toBe(0);
    expect(actual.selectedRef).toBe(fixture.capturedSha);
    expect(actual.sha).toBe(fixture.capturedSha);
    expect(actual.sha).not.toBe(fixture.advancedSha);
    expect(actual.identityOutputs).toEqual({ sha: fixture.capturedSha });
    expect(actual.validationOutputs).toEqual({ sha: fixture.capturedSha });
    expect(actual.result.stdout).toBe("installation-reachable\n");
  });

  it.each([
    ["advanced-sha", "refs/heads/main"],
    ["alias", "refs/heads/main"],
    ["refs/heads/alias", "refs/heads/main"],
    ["release-candidate", "refs/heads/main"],
    ["main", "refs/heads/release/candidate"],
    [" main", "refs/heads/main"],
    ["", "refs/heads/main"],
    ["refs/heads/main\n", "refs/heads/main"],
  ])("rejects package tooling assertion %j for captured %s before checkout", (input, ref) => {
    const fixture = packageToolingCheckoutFixture();
    const actual = fixture.run({
      workflowRef: input === "advanced-sha" ? fixture.advancedSha : input,
      capturedRef: ref,
    });
    expect(actual.checkoutReached).toBe(false);
    expect(actual.result.status).toBe(1);
    expect(actual.result.stderr).toContain(
      "Dispatch or call package-acceptance.yml at the desired ref",
    );
    expect(actual.result.stdout).toBe("");
    expect(actual.identityOutputs).toEqual({});
    expect(actual.validationOutputs).toEqual({});
  });

  it.each([
    ["repository", { workflow_repository: "other/openclaw" }],
    ["missing repository", { workflow_repository: undefined }],
    ["missing SHA", { workflow_sha: undefined }],
    ["short SHA", { workflow_sha: "a".repeat(39) }],
    ["uppercase SHA", { workflow_sha: "A".repeat(40) }],
    ["newline SHA", { workflow_sha: `${"a".repeat(40)}\n` }],
    ["non-string SHA", { workflow_sha: 42 }],
    [
      "wrong file",
      { workflow_ref: "openclaw/openclaw/.github/workflows/other.yml@refs/heads/main" },
    ],
    [
      "wrong path owner",
      { workflow_ref: "other/openclaw/.github/workflows/package-acceptance.yml@refs/heads/main" },
    ],
    ["missing ref", { workflow_ref: undefined }],
    ["non-string ref", { workflow_ref: 42 }],
    [
      "short captured ref",
      { workflow_ref: "openclaw/openclaw/.github/workflows/package-acceptance.yml@main" },
    ],
    [
      "empty branch",
      { workflow_ref: "openclaw/openclaw/.github/workflows/package-acceptance.yml@refs/heads/" },
    ],
    [
      "invalid branch",
      {
        workflow_ref:
          "openclaw/openclaw/.github/workflows/package-acceptance.yml@refs/heads/../main",
      },
    ],
    [
      "newline ref",
      {
        workflow_ref:
          "openclaw/openclaw/.github/workflows/package-acceptance.yml@refs/heads/main\n",
      },
    ],
  ] as const)("rejects malformed package tooling identity: %s", (_label, context) => {
    const fixture = packageToolingCheckoutFixture();
    const actual = fixture.run({
      context,
      callerWorkflowRef:
        "openclaw/openclaw/.github/workflows/package-acceptance.yml@refs/heads/main",
    });
    expect(actual.checkoutReached).toBe(false);
    expect(actual.result.status).toBe(1);
    expect(actual.result.stderr).toContain(
      "Invalid package tooling identity or workflow_ref assertion",
    );
    expect(actual.result.stdout).toBe("");
    expect(actual.identityOutputs).toEqual({});
    expect(actual.validationOutputs).toEqual({});
  });

  it.each(["repository", "SHA ref"])(
    "rejects inconsistent package tooling %s before checkout",
    (kind) => {
      const fixture = packageToolingCheckoutFixture();
      const actual = fixture.run(
        kind === "repository"
          ? { githubRepository: "other/openclaw" }
          : { capturedRef: fixture.advancedSha },
      );
      expect(actual.checkoutReached).toBe(false);
      expect(actual.result.status).toBe(1);
      expect(actual.result.stderr).toContain(
        "Invalid package tooling identity or workflow_ref assertion",
      );
      expect(actual.result.stdout).toBe("");
      expect(actual.identityOutputs).toEqual({});
      expect(actual.validationOutputs).toEqual({});
    },
  );

  it.each([
    [LIVE_E2E_WORKFLOW, "validate_selected_ref"],
    [PACKAGE_ACCEPTANCE_WORKFLOW, "resolve_package"],
  ])("dominates every execution job after failed admission in %s", (file, barrier) => {
    const jobs = readWorkflow(file).jobs ?? {};
    const diagnostics = new Set([
      "summary",
      "release_execution_plan",
      "release_decision",
      "diagnostic_drain",
    ]);
    const outputs = new Proxy(
      {
        state: "ready",
        reuse: "false",
        rerun_group: "all",
        live_suite_filter: "",
        target_version: "2026.9.1",
        coverage_policy: "full",
      },
      { get: (values, key) => Reflect.get(values, key) ?? "true" },
    );
    const inputs = {
      rerun_group: "all",
      reuse_evidence: true,
      suite_profile: "full",
      telegram_waiver: "",
      npm_telegram_package_spec: "",
      release_package_spec: "",
      include_live_suites: true,
      include_repo_e2e: true,
      include_release_path_suites: true,
      include_openwebui: true,
      live_suite_filter: "",
      live_model_providers: "",
      docker_lanes: "",
      release_test_profile: "full",
      emit_candidate_evidence: true,
    };
    for (const policy of ["no-push-artifact", "existing-only"]) {
      let enabled = 0;
      for (const [name, job] of Object.entries(jobs)) {
        if (name === barrier || diagnostics.has(name)) {
          continue;
        }
        expect(jobNeeds(job), name).toContain(barrier);
        const expression = (job.if ?? "success()").replace(/^\$\{\{\s*([\s\S]*?)\s*\}\}$/u, "$1");
        const evaluate = (admitted: boolean) => {
          const implicitSuccess =
            /\b(?:always|cancelled|failure|success)\s*\(/u.test(expression) || admitted;
          return (
            implicitSuccess &&
            Boolean(
              runInNewContext(expression, {
                inputs: { ...inputs, shared_image_policy: policy },
                github: { ref: "refs/heads/main", run_attempt: 1 },
                needs: Object.fromEntries(
                  Object.keys(jobs).map((key) => [
                    key,
                    { result: key === barrier && !admitted ? "failure" : "success", outputs },
                  ]),
                ),
                always: () => true,
                success: () => admitted,
                failure: () => !admitted,
                cancelled: () => false,
                contains: (values: string | string[], value: string) => values.includes(value),
                startsWith: (value: string, prefix: string) => value.startsWith(prefix),
                fromJSON: JSON.parse,
              }),
            )
          );
        };
        expect(evaluate(false), `${policy}: ${name}`).toBe(false);
        if (evaluate(true)) {
          enabled += 1;
        }
      }
      expect(enabled, policy).toBeGreaterThan(0);
    }
  });

  it.each(["published-upgrade-survivor", "root-managed-vps-upgrade", "update-restart-auth"])(
    "captures a moving baseline once and carries the exact version through %s evaluation",
    (lane) => {
      const f = frozenWorkflowFixture(
        LIVE_E2E_WORKFLOW,
        "validate_selected_ref",
        {
          docker_lanes: lane,
          include_release_path_suites: false,
          include_live_suites: false,
          published_upgrade_survivor_baseline: "openclaw@latest",
        },
        {
          "scripts/e2e/lib/upgrade-survivor/assertions.mjs": readFileSync(
            "scripts/e2e/lib/upgrade-survivor/assertions.mjs",
            "utf8",
          ),
        },
      );
      f.selection();
      const bin = join(f.root, "acquisition-bin");
      const calls = join(f.root, "registry-calls");
      mkdirSync(bin);
      writeFileSync(
        join(bin, "npm"),
        `#!/bin/sh\nprintf '%s\\n' "$*" >> '${calls}'\nprintf '"2026.9.1"\\n'\n`,
        { mode: 0o755 },
      );
      const result = f.run("Resolve selected upgrade baseline versions", {
        PATH: `${bin}:${process.env.PATH}`,
      });
      expect(result.status, result.stderr).toBe(0);
      const continuation = f.run("Resolve selected upgrade baseline versions", {
        PATH: `${bin}:${process.env.PATH}`,
      });
      expect(continuation.status, continuation.stderr).toBe(0);
      expect(readFileSync(calls, "utf8").trim().split("\n")).toEqual([
        "view openclaw@latest version --json --silent --prefer-online",
      ]);
      const admitted = f.admit();
      expect(admitted.status, admitted.stderr).toBe(0);
      const record = JSON.parse(readFileSync(join(f.root, "frozen-admission.json"), "utf8"));
      expect(record).toMatchObject({
        status: "ADMITTED",
        requestedBaselines: { baseline: "openclaw@latest" },
        options: {
          upgradeSurvivorBaseline: "openclaw@2026.9.1",
          upgradeSurvivorBaselines: "openclaw@2026.9.1",
          baselinesResolved: true,
        },
        obligations: [],
      });
      expect(record.evaluations[0].docker.lanes).toEqual([
        lane === "published-upgrade-survivor" ? `${lane}-2026.9.1` : lane,
      ]);
      expect(record.selectedSha).toBe(f.sha);
      expect(record.toolingSha).toBe(f.toolingSha);
      reconstructAdmissionEvaluations(record);
    },
  );

  it.each(["published-upgrade-survivor", "update-migration"])(
    "acquires the selected mobile-pairing blob before expanded %s admission",
    (lane) => {
      const path = "src/gateway/node-command-policy.ts";
      const inputs = {
        docker_lanes: lane,
        include_release_path_suites: false,
        include_live_suites: false,
        allow_frozen_target_scenario_omissions: true,
        published_upgrade_survivor_baseline: "openclaw@2026.9.1",
        published_upgrade_survivor_baselines: "openclaw@2026.9.1",
        published_upgrade_survivor_scenarios: "mobile-pairing-reconnect",
      };
      const fixture = frozenWorkflowFixture(
        LIVE_E2E_WORKFLOW,
        "validate_selected_ref",
        inputs,
        {
          "package.json": '{"type":"module","version":"2026.9.2"}',
          [path]: readFileSync(path, "utf8"),
          "scripts/e2e/lib/upgrade-survivor/assertions.mjs": readFileSync(
            "scripts/e2e/lib/upgrade-survivor/assertions.mjs",
            "utf8",
          ),
        },
        { ADMISSION_BASELINES_RESOLVED: "true" },
      );
      const planned = fixture.selection();
      expect(planned.sourcePaths).toContain(path);
      const origin = join(fixture.root, "origin.git");
      fixture.git("clone", "--bare", "--no-hardlinks", fixture.target, origin);
      fixture.git("-C", origin, "config", "uploadpack.allowFilter", "true");
      fixture.git("remote", "add", "origin", pathToFileURL(origin).href);
      fixture.git("config", "remote.origin.promisor", "true");
      fixture.git("config", "remote.origin.partialclonefilter", "blob:none");
      const oid = fixture.git("rev-parse", `${fixture.sha}:${path}`);
      unlinkSync(join(fixture.target, ".git", "objects", oid.slice(0, 2), oid.slice(2)));

      const unavailable = fixture.admit();
      expect(unavailable.status).not.toBe(0);
      expect(unavailable.stderr).toContain("unable to read selected source");
      expect(unavailable.stdout).not.toContain("producer-ran");
      const acquisitionBin = join(fixture.root, "acquisition-bin");
      const requested = join(fixture.root, "requested-blob");
      mkdirSync(acquisitionBin);
      const gitPath = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
      writeFileSync(
        join(acquisitionBin, "git"),
        `#!/bin/sh\nif [ "$#" = 5 ] && [ "$3" = cat-file ] && [ "$4" = blob ] && [ "$5" = '${oid}' ]; then printf '%s\\n' "$5" >> '${requested}'; fi\nexec '${gitPath}' "$@"\n`,
        { mode: 0o755 },
      );
      const acquired = fixture.run("Acquire selected contract objects", {
        PATH: `${acquisitionBin}:${process.env.PATH}`,
      });
      expect(acquired.status, acquired.stderr).toBe(0);
      expect(readFileSync(requested, "utf8")).toBe(`${oid}\n`);
      const admitted = fixture.admit();
      expect(admitted.status, admitted.stderr).toBe(0);
      const record = JSON.parse(readFileSync(join(fixture.root, "frozen-admission.json"), "utf8"));
      expect(
        record.evaluations.flatMap(
          (entry: { docker?: { lanes: string[] } }) => entry.docker?.lanes ?? [],
        ),
      ).toContain(`${lane}-2026.9.1-mobile-pairing-reconnect`);
      expect(
        reconstructAdmissionEvaluations(record).flatMap((entry) => entry.sources.selected),
      ).toEqual(expect.arrayContaining([expect.objectContaining({ path, oid })]));
      for (const [overrides, selected] of [
        [{ published_upgrade_survivor_scenarios: "base" }, false],
        [{ published_upgrade_survivor_scenarios: "reported-issues" }, false],
        [{ allow_frozen_target_scenario_omissions: false }, false],
        [{ docker_lanes: "" }, false],
        [{ docker_lanes: "onboard" }, false],
        [{ prepare_only: true }, false],
        [{ docker_lanes: `${lane}-2026.9.1-mobile-pairing-reconnect` }, true],
      ] as const) {
        const sibling = fixture.run("Plan frozen source admission", {
          ADMISSION_INPUTS: JSON.stringify({ ...inputs, ...overrides }, null, 2),
        });
        expect(sibling.status, sibling.stderr).toBe(0);
        const selection = JSON.parse(
          readFileSync(join(fixture.root, "frozen-admission-selection.json"), "utf8"),
        );
        expect(selection.sourcePaths.includes(path), JSON.stringify(overrides)).toBe(selected);
        if (selected) {
          const explicit = fixture.admit();
          expect(explicit.status, explicit.stderr).toBe(0);
        }
      }
    },
  );

  it("blocks a known package source before packing and admits a different exact acquired package source", () => {
    const known = frozenWorkflowFixture(
      PACKAGE_ACCEPTANCE_WORKFLOW,
      "resolve_package",
      {
        source: "ref",
        suite_profile: "custom",
        docker_lanes: "agent-bundle-mcp-tools",
        allow_frozen_target_scenario_omissions: true,
      },
      {},
      { ADMISSION_STAGE: "known-source" },
    );
    const planned = known.run("Plan known package source admission");
    expect(planned.status, planned.stderr).toBe(0);
    known.provisionParser();
    const rejected = known.admit({}, "Admit known package source before packing");
    expect(rejected.status).not.toBe(0);
    expect(rejected.stdout).not.toContain("producer-ran");
    expect(rejected.stderr).toContain("expected exactly one committed bundle client layout");

    const acquired = frozenWorkflowFixture(
      PACKAGE_ACCEPTANCE_WORKFLOW,
      "resolve_package",
      {
        source: "npm",
        suite_profile: "custom",
        docker_lanes: "onboard",
        allow_frozen_target_scenario_omissions: true,
      },
      { "src/config/zod-schema.ts": "lastRunAt:" },
      { ADMISSION_STAGE: "resolved-package" },
    );
    const identity = {
      ADMISSION_PACKAGE_SOURCE_SHA: acquired.sha,
      ADMISSION_PACKAGE_SHA256: "d".repeat(64),
      ADMISSION_PACKAGE_VERSION: "2026.7.33",
    };
    const resolved = acquired.run("Plan frozen source admission", identity);
    expect(resolved.status, resolved.stderr).toBe(0);
    const admitted = acquired.admit();
    expect(admitted.status, admitted.stderr).toBe(0);
    const record = JSON.parse(readFileSync(join(acquired.root, "frozen-admission.json"), "utf8"));
    expect(record.selectedSha).not.toBe(known.sha);
    expect(record.binding).toMatchObject({
      packageSourceSha: acquired.sha,
      packageSha256: "d".repeat(64),
    });
    const mismatch = acquired.run("Plan frozen source admission", {
      ...identity,
      ADMISSION_PACKAGE_SOURCE_SHA: known.sha,
    });
    expect(mismatch.status).not.toBe(0);
    expect(mismatch.stderr).toContain("package source differs");
  });

  it.each([
    [
      LIVE_E2E_WORKFLOW,
      "validate_selected_ref",
      "Plan frozen source admission",
      ".release-harness",
    ],
  ])(
    "initializes Node before planning and fails selected parser installation in %s",
    (file, jobName, firstPlan, toolingRoot) => {
      const job = workflowJob(file, jobName);
      const steps = job.steps ?? [];
      const setup = workflowStep(job, "Setup admission Node.js");
      expect(setup.if).toBeUndefined();
      expect(setup.env).toMatchObject({ REQUESTED_NODE_VERSION: "24.x" });
      expect(setup.run).toContain(
        `source ${toolingRoot}/.github/actions/setup-pnpm-store-cache/ensure-node.sh`,
      );
      expect(setup.run).toContain('openclaw_ensure_node "$REQUESTED_NODE_VERSION"');
      expect(steps.indexOf(setup)).toBeLessThan(steps.indexOf(workflowStep(job, firstPlan)));
      const plan = workflowStep(job, "Plan frozen source admission");
      const provision = workflowStep(job, "Provision trusted admission parser");
      const admission = workflowStep(job, "Admit frozen source contracts");
      expect(steps.indexOf(plan)).toBeLessThan(steps.indexOf(provision));
      expect(steps.indexOf(provision)).toBeLessThan(steps.indexOf(admission));
      expect(provision.if).toBe("steps.frozen_selection.outputs.parser_required == 'true'");
      let install = provision.run;
      if (provision.uses) {
        expect(provision.uses).toBe("./.release-harness/.github/actions/setup-release-harness");
        const action = parse(readFileSync(SETUP_RELEASE_HARNESS_ACTION, "utf8")) as {
          runs: { steps: WorkflowStep[] };
        };
        install = action.runs.steps.find((step) => step.run?.includes("pnpm install"))?.run;
      } else {
        expect(provision["working-directory"]).toBe("workflow");
        expect(workflowStep(job, "Setup trusted admission package manager").with).toMatchObject({
          "package-manager-file": "workflow/package.json",
          "lockfile-path": "workflow/pnpm-lock.yaml",
          "cache-mode": "off",
        });
      }
      expect(install).toContain("pnpm install --frozen-lockfile --prefer-offline --ignore-scripts");
      const root = tempDirs.make("frozen-parser-prerequisite-");
      writeFileSync(join(root, "pnpm"), "#!/bin/sh\nexit 79\n", { mode: 0o755 });
      const result = spawnSync(
        "bash",
        ["-c", `set -euo pipefail\n${install}\nprintf 'producer-ran\\n'`],
        {
          cwd: root,
          encoding: "utf8",
          env: { PATH: `${root}:${process.env.PATH}` },
        },
      );
      expect(result.status).toBe(79);
      expect(result.stdout).not.toContain("producer-ran");
    },
  );

  it.each(["June", "July"])(
    "runs the actual %s workflow request and shared parser before producers",
    (layout) => {
      const client =
        layout === "June"
          ? "scripts/e2e/agent-bundle-mcp-tools-docker-client.ts"
          : "test/e2e/qa-lab/runtime/agent-bundle-mcp-tools-docker-client.ts";
      const prefix = layout === "June" ? "../.." : "../../../..";
      const f = frozenWorkflowFixture(
        LIVE_E2E_WORKFLOW,
        "validate_selected_ref",
        {
          docker_lanes: "agent-bundle-mcp-tools",
          include_release_path_suites: false,
          include_live_suites: false,
          allow_frozen_target_scenario_omissions: true,
        },
        {
          [client]: `import { getOrCreateSessionMcpRuntime, disposeAllSessionMcpRuntimes } from "${prefix}/dist/agents/agent-bundle-mcp-runtime.js";\nimport { createE2eStateDir } from "${layout === "June" ? "./lib" : `${prefix}/scripts/e2e/lib`}/temp-state-dir.ts";\nthrow new Error("target client executed");`,
          "scripts/e2e/lib/temp-state-dir.ts":
            'export async function createE2eStateDir() { throw new Error("target helper executed"); }',
          "src/agents/agent-bundle-mcp-runtime.ts":
            'export async function getOrCreateSessionMcpRuntime() { throw new Error("target runtime executed"); }\nexport async function disposeAllSessionMcpRuntimes() {}',
        },
      );
      expect(f.selection()).toMatchObject({
        parserRequired: true,
        consumers: ["agent-bundle-mcp-tools"],
      });
      f.provisionParser();
      const result = f.admit();
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("producer-ran");
      const record = JSON.parse(readFileSync(join(f.root, "frozen-admission.json"), "utf8"));
      expect(record).toMatchObject({
        status: "ADMITTED",
        selectedSha: f.sha,
        toolingSha: f.toolingSha,
        provenance: { runId: "123", runAttempt: "2" },
      });
      expect(record.evaluations[0].contracts[0].files).toEqual([
        { source: "selected", path: client },
      ]);
      expect(existsSync(join(f.target, "node_modules"))).toBe(false);
    },
  );

  it("rejects unresolved survivor baselines at the reusable execution barrier", () => {
    const f = frozenWorkflowFixture(
      LIVE_E2E_WORKFLOW,
      "validate_selected_ref",
      {
        docker_lanes: "published-upgrade-survivor",
        include_release_path_suites: false,
        include_live_suites: false,
        published_upgrade_survivor_baseline: "openclaw@latest",
        allow_frozen_target_scenario_omissions: false,
      },
      {
        "scripts/e2e/lib/upgrade-survivor/assertions.mjs": readFileSync(
          "scripts/e2e/lib/upgrade-survivor/assertions.mjs",
          "utf8",
        ),
      },
    );
    expect(f.selection().obligations).toContainEqual(
      expect.objectContaining({ kind: "upgrade-baselines" }),
    );
    const result = f.admit();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("unresolved upgrade baselines");
    expect(result.stdout).not.toContain("producer-ran");
  });

  it("requires the resolved package identity at the final package barrier", () => {
    const f = frozenWorkflowFixture(
      PACKAGE_ACCEPTANCE_WORKFLOW,
      "resolve_package",
      {
        suite_profile: "custom",
        docker_lanes: "onboard",
      },
      {},
      { ADMISSION_STAGE: "resolved-package" },
    );
    const result = f.run("Plan frozen source admission");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("complete resolved package identity");
  });

  it("records a parser-free unselected workflow without implying execution coverage", () => {
    const f = frozenWorkflowFixture(LIVE_E2E_WORKFLOW, "validate_selected_ref", {
      include_live_suites: true,
      include_release_path_suites: false,
      live_suite_filter: "live-cache",
      allow_frozen_target_scenario_omissions: true,
    });
    expect(f.selection()).toMatchObject({ parserRequired: false, sourcePaths: [], consumers: [] });
    const result = f.admit();
    expect(result.status, result.stderr).toBe(0);
    const record = JSON.parse(readFileSync(join(f.root, "frozen-admission.json"), "utf8"));
    expect(record.status).toBe("UNSELECTED");
    const digest = record.digest;
    const nextAttempt = f.run("Plan frozen source admission", { GITHUB_RUN_ATTEMPT: "3" });
    expect(nextAttempt.status, nextAttempt.stderr).toBe(0);
    expect(f.admit().status).toBe(0);
    const continued = JSON.parse(readFileSync(join(f.root, "frozen-admission.json"), "utf8"));
    expect(continued.digest).toBe(digest);
    expect(continued.provenance.runAttempt).toBe("3");
  });

  it.each([
    [LIVE_E2E_WORKFLOW, "validate_selected_ref"],
    [PACKAGE_ACCEPTANCE_WORKFLOW, "resolve_package"],
  ])("rejects unsupported selected source before producers in %s", (file, jobName) => {
    const f = frozenWorkflowFixture(
      file,
      jobName,
      {},
      { "package.json": '{"type":"module","version":"2026.6.33"}' },
    );
    f.provisionParser();
    const request = {
      version: 1,
      repository: "openclaw/openclaw",
      selected: { root: f.target, sha: f.sha },
      tooling: { root: f.tooling, sha: f.toolingSha },
      allowFrozenTargetScenarioOmissions: true,
      selection: { consumers: ["agent-bundle-mcp-tools"] },
    };
    writeFileSync(join(f.root, "frozen-admission-request.json"), JSON.stringify(request));
    const result = f.admit();
    expect(result.stdout).not.toContain("producer-ran");
    expect(result.status, result.stderr).not.toBe(0);
    expect(result.stderr).toContain("expected exactly one committed bundle client layout");
  });
});

type WorkflowStep = {
  "continue-on-error"?: boolean | string;
  env?: Record<string, string>;
  id?: string;
  if?: string;
  name?: string;
  run?: string;
  shell?: string;
  uses?: string;
  with?: Record<string, string>;
  "working-directory"?: string;
};

type WorkflowMatrixEntry = {
  advisory?: boolean;
  chunk_id?: string;
  command?: string;
  profiles?: string;
  suite_group?: string;
  suite_id?: string;
  timeout_minutes?: number;
};

type WorkflowJob = {
  "continue-on-error"?: boolean | string;
  concurrency?: {
    group?: string;
    "cancel-in-progress"?: boolean | string;
  };
  environment?: string;
  env?: Record<string, string>;
  if?: string;
  name?: string;
  needs?: string | string[];
  outputs?: Record<string, string>;
  permissions?: Record<string, string>;
  "runs-on"?: string;
  strategy?: {
    "fail-fast"?: boolean;
    "max-parallel"?: number;
    matrix?: {
      include?: WorkflowMatrixEntry[];
      lane?: string;
      profile?: string[];
      shard?: number[];
    };
  };
  secrets?: string | Record<string, string>;
  "timeout-minutes"?: number | string;
  steps?: WorkflowStep[];
  uses?: string;
  with?: Record<string, boolean | number | string>;
};

type Workflow = {
  concurrency?: {
    group?: string;
    "cancel-in-progress"?: boolean | string;
    queue?: string;
  };
  env?: Record<string, string>;
  jobs?: Record<string, WorkflowJob>;
  on?: {
    schedule?: Array<{ cron?: string }>;
    workflow_call?: {
      inputs?: Record<string, unknown>;
    };
    workflow_dispatch?: {
      inputs?: Record<string, unknown>;
    };
  };
  permissions?: Record<string, string>;
};

const parsedWorkflows = new Map<string, Workflow>();

function readWorkflow(path: string): Workflow {
  const cachedWorkflow = parsedWorkflows.get(path);
  if (cachedWorkflow) {
    return cachedWorkflow;
  }
  const workflow = parse(readFileSync(path, "utf8")) as Workflow;
  parsedWorkflows.set(path, workflow);
  return workflow;
}

function workflowPaths(): string[] {
  return readdirSync(".github/workflows")
    .filter((name) => name.endsWith(".yml"))
    .map((name) => `.github/workflows/${name}`);
}

function workflowJob(path: string, jobName: string): WorkflowJob {
  const job = readWorkflow(path).jobs?.[jobName];
  if (!job) {
    throw new Error(`Expected workflow job ${jobName} in ${path}`);
  }
  return job;
}

function workflowStep(job: WorkflowJob, stepName: string): WorkflowStep {
  const step = job.steps?.find((candidate) => candidate.name === stepName);
  if (!step) {
    throw new Error(`Expected workflow step ${stepName}`);
  }
  return step;
}

function releaseCandidateArtifactJson(selectedSha = "a".repeat(40), packagePublished = false) {
  return JSON.stringify({
    packagePublished,
    packageArtifactName: "docker-e2e-package-123-1",
    packageArtifactId: "456",
    packageArtifactDigest: "b".repeat(64),
    packageArtifactRunId: "123",
    packageArtifactRunAttempt: "1",
    packageFileName: "openclaw-current.tgz",
    packageSourceSha: selectedSha,
    packageSha256: "c".repeat(64),
    packageVersion: "2026.8.1",
    imageArtifactName: "docker-e2e-shared-images-123-1",
    imageArtifactId: "789",
    imageArtifactDigest: "d".repeat(64),
    imageArtifactRunId: "123",
    imageArtifactRunAttempt: "1",
    imageArchiveSha256: "e".repeat(64),
  });
}

function runFullReleaseCandidateRequest(packagePublished: boolean) {
  const step = workflowStep(
    workflowJob(LIVE_E2E_WORKFLOW, "prepare_docker_e2e_image"),
    "Build full release candidate request",
  );
  const workdir = tempDirs.make("full-release-candidate-request-");
  const harnessRoot = resolve(workdir, ".release-harness");
  const outputPath = resolve(workdir, "github-output");
  mkdirSync(harnessRoot);
  symlinkSync(resolve("scripts"), resolve(harnessRoot, "scripts"), "dir");
  writeFileSync(outputPath, "", "utf8");
  const result = spawnSync("bash", ["-c", step.run ?? ""], {
    cwd: workdir,
    encoding: "utf8",
    env: {
      ALLOW_FROZEN_TARGET_SCENARIO_OMISSIONS: "false",
      ALLOW_UNRELEASED_CHANGELOG: "false",
      GITHUB_OUTPUT: outputPath,
      NODE_OPTIONS: "--preserve-symlinks-main",
      PACKAGE_PUBLISHED: String(packagePublished),
      PATH: process.env.PATH,
      RELEASE_PROFILE: "beta",
      RELEASE_SOAK: "false",
      RUNNER_TEMP: workdir,
      SHARED_IMAGE_POLICY: "no-push-artifact",
      TARGET_REPOSITORY: "openclaw/openclaw",
      TARGET_SHA: "a".repeat(40),
      TOOLING_SHA: "b".repeat(40),
      UPGRADE_SURVIVOR_BASELINE: "openclaw@latest",
      UPGRADE_SURVIVOR_BASELINES: "",
      UPGRADE_SURVIVOR_SCENARIOS: "",
    },
  });
  const output = Object.fromEntries(
    readFileSync(outputPath, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
  return { output, result };
}

function workflowMatrixEntry(path: string, jobName: string, suiteId: string): WorkflowMatrixEntry {
  const entry = workflowJob(path, jobName).strategy?.matrix?.include?.find(
    (candidate) => candidate.suite_id === suiteId,
  );
  if (!entry) {
    throw new Error(`Expected workflow matrix entry ${suiteId} in ${jobName}`);
  }
  return entry;
}

function runFocusedLiveSuiteValidation(suiteId: string, overrides: Record<string, string> = {}) {
  const step = workflowStep(
    workflowJob(LIVE_E2E_WORKFLOW, "validate_selected_ref"),
    "Validate focused live suite filter",
  );
  return spawnSync("bash", ["-c", step.run ?? ""], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      LIVE_SUITE_FILTER: suiteId,
      RELEASE_TEST_PROFILE: "full",
      INCLUDE_REPO_E2E: "true",
      INCLUDE_LIVE_SUITES: "true",
      LIVE_MODELS_ONLY: "false",
      LIVE_MODEL_PROVIDERS: "",
      ADMISSION_TOOLING_ROOT: resolve("."),
      ...overrides,
    },
  });
}

function expectTextToIncludeAll(text: string | undefined, snippets: string[]): void {
  if (text === undefined) {
    throw new Error("Expected text to be defined before checking snippets");
  }
  for (const snippet of snippets) {
    expect(text).toContain(snippet);
  }
}

function runPackageAcceptanceSummary(params: {
  advisory?: boolean;
  dockerArtifactResult?: string;
  dockerRegistryResult?: string;
  npm12InstallResult?: string;
  suiteProfile?: string;
  telegramAdvisory?: boolean;
  telegramEnabled: boolean;
  telegramResult: string;
}) {
  const summary = workflowJob(PACKAGE_ACCEPTANCE_WORKFLOW, "summary");
  const script = workflowStep(summary, "Verify package acceptance results").run;
  if (!script) {
    throw new Error("Expected package acceptance summary script");
  }
  return spawnSync("bash", ["-c", script], {
    encoding: "utf8",
    env: {
      ADVISORY: String(params.advisory ?? false),
      DOCKER_ARTIFACT_RESULT: params.dockerArtifactResult ?? "success",
      DOCKER_REGISTRY_RESULT: params.dockerRegistryResult ?? "skipped",
      PACKAGE_INTEGRITY_RESULT: "success",
      NPM_12_INSTALL_RESULT: params.npm12InstallResult ?? "success",
      PACKAGE_TELEGRAM_RESULT: params.telegramResult,
      PATH: process.env.PATH,
      RESOLVE_RESULT: "success",
      SUITE_PROFILE: params.suiteProfile ?? "package",
      TELEGRAM_ADVISORY: String(params.telegramAdvisory ?? false),
      TELEGRAM_ENABLED: String(params.telegramEnabled),
    },
  });
}

function runPackageAcceptanceProfile(params: {
  dockerLanes?: string;
  suiteProfile: string;
  telegramMode?: string;
  telegramScenarios?: string;
}) {
  const job = workflowJob(PACKAGE_ACCEPTANCE_WORKFLOW, "resolve_package");
  const script = workflowStep(job, "Select acceptance profile").run;
  if (!script) {
    throw new Error("Expected package acceptance profile script");
  }
  const fixture = frozenWorkflowFixture(PACKAGE_ACCEPTANCE_WORKFLOW, "resolve_package", {});
  const workdir = fixture.root;
  const outputPath = resolve(workdir, "github-output");
  const result = spawnSync("bash", ["-c", script], {
    cwd: fixture.tooling,
    encoding: "utf8",
    env: {
      ADMISSION_TOOLING_ROOT: fixture.tooling,
      ADMISSION_TOOLING_SHA: fixture.toolingSha,
      CUSTOM_DOCKER_LANES: params.dockerLanes ?? "",
      GITHUB_OUTPUT: outputPath,
      PACKAGE_ARTIFACT_NAME: "package-under-test",
      PATH: process.env.PATH,
      SOURCE: "ref",
      SUITE_PROFILE: params.suiteProfile,
      TELEGRAM_MODE: params.telegramMode ?? "none",
      TELEGRAM_SCENARIOS: params.telegramScenarios ?? "",
    },
  });
  const outputs =
    result.status === 0
      ? Object.fromEntries(
          readFileSync(outputPath, "utf8")
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => {
              const separator = line.indexOf("=");
              return [line.slice(0, separator), line.slice(separator + 1)];
            }),
        )
      : {};
  return { outputs, result };
}

function runPackageAcceptanceRegistryInputValidation(params: {
  candidateArtifactJson?: string;
  prepublishPluginRegistryJson?: string;
}) {
  const job = workflowJob(PACKAGE_ACCEPTANCE_WORKFLOW, "resolve_package");
  const script = workflowStep(job, "Validate prerelease plugin registry input").run;
  if (!script) {
    throw new Error("Expected package acceptance registry input validation script");
  }
  const workdir = tempDirs.make("package-acceptance-registry-input-");
  const outputPath = resolve(workdir, "github-output");
  const result = spawnSync("bash", ["-c", script], {
    encoding: "utf8",
    env: {
      CANDIDATE_ARTIFACT_JSON: params.candidateArtifactJson ?? "",
      GITHUB_OUTPUT: outputPath,
      PATH: process.env.PATH,
      PREPUBLISH_PLUGIN_REGISTRY_JSON: params.prepublishPluginRegistryJson ?? "",
    },
  });
  const output = result.status === 0 ? readFileSync(outputPath, "utf8") : "";
  return { output, result };
}

function packageAcceptanceRegistryTuple(overrides: Record<string, string> = {}) {
  return {
    prepublishPluginRegistryArtifactName: "docker-e2e-prepublish-plugin-registry-123-2",
    prepublishPluginRegistryArtifactId: "456",
    prepublishPluginRegistryArtifactDigest: "a".repeat(64),
    prepublishPluginRegistryArtifactRunId: "123",
    prepublishPluginRegistryArtifactRunAttempt: "2",
    prepublishPluginRegistryManifestSha256: "b".repeat(64),
    ...overrides,
  };
}

function runPackageAcceptanceResolveScript(params: {
  candidateArtifactJson?: string;
  prepublishPluginRegistryJson?: string;
  source: "artifact" | "npm" | "ref" | "trusted-url" | "url";
  telegramMode: "mock-openai" | "none";
}) {
  const job = workflowJob(PACKAGE_ACCEPTANCE_WORKFLOW, "resolve_package");
  const script = workflowStep(job, "Resolve package candidate").run;
  if (!script) {
    throw new Error("Expected package acceptance resolve script");
  }
  const workdir = tempDirs.make("package-acceptance-resolve-");
  const binDir = resolve(workdir, "bin");
  const capturePath = resolve(workdir, "node-args");
  const outputPath = resolve(workdir, "github-output");
  const artifactDir = resolve(workdir, ".artifacts/package-candidate-input");
  mkdirSync(binDir, { recursive: true });
  mkdirSync(artifactDir, { recursive: true });
  const nodePath = resolve(binDir, "node");
  const artifactPath = resolve(artifactDir, "openclaw-current.tgz");
  const artifactBody = "package acceptance artifact";
  writeFileSync(artifactPath, artifactBody);
  writeFileSync(
    nodePath,
    `#!/bin/sh
printf "%s\\n" "$@" > "$CAPTURE_PATH"
if [ "$SOURCE" = "artifact" ]; then
  mkdir -p .artifacts/docker-e2e-package
  printf '{"name":"openclaw","sha256":"%s","packageSourceSha":"%s","version":"%s"}\\n' \
    "$PACKAGE_SHA256" "$PACKAGE_SOURCE_SHA" "$PACKAGE_VERSION" \
    > .artifacts/docker-e2e-package/package-candidate.json
fi
`,
  );
  chmodSync(nodePath, 0o755);
  const result = spawnSync("bash", ["-c", script], {
    cwd: workdir,
    encoding: "utf8",
    env: {
      CAPTURE_PATH: capturePath,
      GITHUB_OUTPUT: outputPath,
      OPENCLAW_TRUSTED_PACKAGE_TOKEN: "",
      PACKAGE_FILE_NAME: "openclaw-current.tgz",
      PACKAGE_REF: "HEAD",
      PACKAGE_SHA256: createHash("sha256").update(artifactBody).digest("hex"),
      PACKAGE_SOURCE_SHA: "a".repeat(40),
      PACKAGE_SPEC: "openclaw@beta",
      PACKAGE_URL: "https://example.invalid/openclaw.tgz",
      PACKAGE_VERSION: "2026.8.26",
      PATH: `${binDir}:${process.env.PATH}`,
      PREPUBLISH_PLUGIN_REGISTRY_JSON: params.prepublishPluginRegistryJson ?? "",
      PUBLISHED_ARTIFACT: String(
        JSON.parse(params.candidateArtifactJson ?? "{}").packagePublished === true,
      ),
      SOURCE: params.source,
      TELEGRAM_MODE: params.telegramMode,
      TRUSTED_SOURCE_ID: "",
    },
  });
  const args = result.status === 0 ? readFileSync(capturePath, "utf8") : "";
  return { args, result };
}

function runPackageAcceptanceBaselineStep(params: {
  candidateArtifactJson?: string;
  candidateVersion: string;
  fallbackBaseline?: string;
  source: "artifact" | "npm" | "ref";
  targetContextRef?: string;
}) {
  const job = workflowJob(PACKAGE_ACCEPTANCE_WORKFLOW, "resolve_package");
  const script = workflowStep(job, "Resolve published upgrade survivor baselines").run;
  if (!script) {
    throw new Error("Expected package acceptance baseline script");
  }
  const executableScript = script.replace(
    "node scripts/lib/release-upgrade-baseline.mjs",
    `node ${JSON.stringify(resolve("scripts/lib/release-upgrade-baseline.mjs"))}`,
  );
  const workdir = tempDirs.make("package-acceptance-baseline-");
  const binDir = resolve(workdir, "bin");
  const outputPath = resolve(workdir, "github-output");
  const npmLog = resolve(workdir, "npm.log");
  mkdirSync(binDir, { recursive: true });
  symlinkSync(resolve("node_modules"), resolve(workdir, "node_modules"), "dir");
  symlinkSync(resolve("scripts"), resolve(workdir, "scripts"), "dir");
  writeFileSync(
    resolve(binDir, "npm"),
    `#!/bin/sh
printf '%s\n' "$*" >> "$NPM_LOG"
if [ "$1 $2 $3" = "view openclaw versions" ]; then
  printf '%s\n' '["2026.6.34","2026.6.35","2026.7.1","2026.7.1-2","2026.8.1","2026.9.1"]'
elif [ "$1 $2" = "view openclaw@latest" ]; then
  printf '%s\n' '2026.9.1'
else
  exit 64
fi
`,
    { mode: 0o755 },
  );
  const result = spawnSync("bash", ["-c", executableScript], {
    cwd: workdir,
    encoding: "utf8",
    env: {
      CANDIDATE_VERSION: params.candidateVersion,
      CANDIDATE_PUBLISHED: String(
        params.source === "npm" ||
          JSON.parse(params.candidateArtifactJson ?? "{}").packagePublished === true,
      ),
      FALLBACK_BASELINE: params.fallbackBaseline ?? "openclaw@latest",
      GH_TOKEN: "",
      GITHUB_OUTPUT: outputPath,
      GITHUB_REPOSITORY: "openclaw/openclaw",
      NPM_LOG: npmLog,
      PATH: `${binDir}:${process.env.PATH}`,
      REQUESTED_BASELINES: "",
      RUNNER_TEMP: workdir,
      TARGET_CONTEXT_REF: params.targetContextRef ?? "",
    },
  });
  return {
    npmCalls: existsSync(npmLog) ? readFileSync(npmLog, "utf8").trim().split("\n") : [],
    output: existsSync(outputPath) ? readFileSync(outputPath, "utf8") : "",
    result,
  };
}

function runNpmTelegramInputValidation(overrides: Record<string, string>) {
  const job = workflowJob(NPM_TELEGRAM_WORKFLOW, "run_package_telegram_e2e");
  const script = workflowStep(job, "Validate inputs and secrets").run;
  if (!script) {
    throw new Error("Expected npm Telegram input validation script");
  }
  return spawnSync("bash", ["-c", script], {
    encoding: "utf8",
    env: {
      OPENCLAW_QA_CONVEX_SECRET_CI: "test-secret",
      OPENCLAW_QA_CONVEX_SITE_URL: "https://example.invalid",
      PACKAGE_ARTIFACT_DIGEST: "",
      PACKAGE_ARTIFACT_ID: "",
      PACKAGE_ARTIFACT_NAME: "",
      PACKAGE_ARTIFACT_RUN_ATTEMPT: "",
      PACKAGE_ARTIFACT_RUN_ID: "",
      PACKAGE_FILE_NAME: "",
      PACKAGE_SHA256: "",
      PACKAGE_SOURCE_SHA: "",
      PACKAGE_SPEC: "openclaw@beta",
      PACKAGE_VERSION: "",
      PATH: process.env.PATH,
      PREPUBLISH_PLUGIN_REGISTRY_ARTIFACT_DIGEST: "",
      PREPUBLISH_PLUGIN_REGISTRY_ARTIFACT_ID: "",
      PREPUBLISH_PLUGIN_REGISTRY_ARTIFACT_NAME: "",
      PREPUBLISH_PLUGIN_REGISTRY_ARTIFACT_RUN_ATTEMPT: "",
      PREPUBLISH_PLUGIN_REGISTRY_ARTIFACT_RUN_ID: "",
      PREPUBLISH_PLUGIN_REGISTRY_MANIFEST_SHA256: "",
      PROVIDER_MODE: "mock-openai",
      ...overrides,
    },
  });
}

function runNpmTelegramArtifactValidation(params: {
  currentRunId: string;
  producerRunId: string;
  producerStatus: "completed" | "in_progress" | "pending" | "queued" | "requested" | "waiting";
  producerConclusion: "success" | null;
}) {
  const job = workflowJob(NPM_TELEGRAM_WORKFLOW, "run_package_telegram_e2e");
  const script = workflowStep(job, "Validate package artifact identity").run;
  if (!script) {
    throw new Error("Expected npm Telegram artifact identity script");
  }
  const binDir = tempDirs.make("npm-telegram-artifact-gh-");
  const ghPath = `${binDir}/gh`;
  writeFileSync(
    ghPath,
    `#!/bin/sh
case "$*" in
  *actions/artifacts*) printf '%s\\n' "$MOCK_ARTIFACT_JSON" ;;
  *actions/runs*) printf '%s\\n' "$MOCK_ATTEMPT_JSON" ;;
  *) exit 2 ;;
esac
`,
  );
  chmodSync(ghPath, 0o755);
  const attempt = "2";
  const artifactId = "987";
  const artifactName = `package-under-test-${params.producerRunId}-${attempt}`;
  const digest = "a".repeat(64);
  return spawnSync("bash", ["-c", script], {
    encoding: "utf8",
    env: {
      ARTIFACT_DIGEST: digest,
      ARTIFACT_ID: artifactId,
      ARTIFACT_NAME: artifactName,
      ARTIFACT_RUN_ATTEMPT: attempt,
      ARTIFACT_RUN_ID: params.producerRunId,
      GITHUB_REPOSITORY: "openclaw/openclaw",
      GITHUB_RUN_ID: params.currentRunId,
      MOCK_ARTIFACT_JSON: JSON.stringify({
        created_at: "2026-07-15T08:49:20Z",
        digest: `sha256:${digest}`,
        expired: false,
        id: Number(artifactId),
        name: artifactName,
        workflow_run: { id: Number(params.producerRunId) },
      }),
      MOCK_ATTEMPT_JSON: JSON.stringify({
        conclusion: params.producerConclusion,
        id: Number(params.producerRunId),
        run_attempt: Number(attempt),
        run_started_at: "2026-07-15T08:39:00Z",
        status: params.producerStatus,
        updated_at: "2026-07-15T08:49:30Z",
      }),
      PATH: `${binDir}:${process.env.PATH}`,
    },
  });
}

describe("package acceptance workflow", () => {
  it("keeps pnpm version selection sourced from packageManager", () => {
    const packageJson = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as {
      packageManager?: string;
    };
    const setupPnpmAction = readFileSync(SETUP_PNPM_STORE_CACHE_ACTION, "utf8");

    expect(packageJson.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+\+sha512\.[a-f0-9]+$/u);
    expect(setupPnpmAction).toContain("Setup pnpm from packageManager");
    expect(setupPnpmAction).toContain("PACKAGE_MANAGER_FILE: ${{ inputs.package-manager-file }}");
    expect(setupPnpmAction).toContain('case "$package_manager" in');
    expect(setupPnpmAction).toContain('corepack prepare "$package_manager" --activate');
    expect(setupPnpmAction).toContain(
      "if: ${{ inputs.cache-mode != 'off' && runner.os != 'Windows' }}",
    );
    expect(setupPnpmAction).toContain(
      "key: pnpm-store-${{ runner.os }}-${{ runner.arch }}-${{ inputs.node-version }}-${{ hashFiles(inputs.package-manager-file) }}-${{ hashFiles(inputs.lockfile-path) }}",
    );
    expect(setupPnpmAction).not.toContain("pnpm/action-setup");
    expect(setupPnpmAction).not.toContain("shasum");
    expect(setupPnpmAction).not.toContain("PNPM_VERSION_INPUT");
    expect(setupPnpmAction).not.toContain("version: ${{ inputs.pnpm-version }}");
    expect(setupPnpmAction).toContain('corepack enable --install-directory "$PNPM_HOME"');
    expect(setupPnpmAction).toContain('echo "PNPM_HOME=$PNPM_HOME" >> "$GITHUB_ENV"');

    const setupReleaseHarnessAction = readFileSync(SETUP_RELEASE_HARNESS_ACTION, "utf8");
    const setupHarnessPackageManagerIndex = setupReleaseHarnessAction.indexOf(
      "Setup trusted release harness package manager",
    );
    const installHarnessDependenciesIndex = setupReleaseHarnessAction.indexOf(
      "Install trusted release harness dependencies",
    );
    expect(setupHarnessPackageManagerIndex).toBeGreaterThan(-1);
    expect(installHarnessDependenciesIndex).toBeGreaterThan(setupHarnessPackageManagerIndex);
    expect(setupReleaseHarnessAction).toContain(
      "uses: ./.release-harness/.github/actions/setup-pnpm-store-cache",
    );
    expect(setupReleaseHarnessAction).toContain(
      "package-manager-file: .release-harness/package.json",
    );
    expect(setupReleaseHarnessAction).toContain("working-directory: .release-harness");
    expect(setupReleaseHarnessAction).toContain(
      "pnpm install --frozen-lockfile --prefer-offline --ignore-scripts",
    );

    const setupNodeAction = readFileSync(".github/actions/setup-node-env/action.yml", "utf8");
    expect(setupNodeAction).toContain("Normalize container toolcache");
    expect(setupNodeAction).toContain("ln -s /__t /opt/hostedtoolcache");

    for (const workflowPath of workflowPaths()) {
      const workflowText = readFileSync(workflowPath, "utf8");
      expect(workflowText, workflowPath).not.toContain("PNPM_VERSION");
      expect(workflowText, workflowPath).not.toContain("pnpm-version:");
      expect(workflowText, workflowPath).not.toContain("pnpm/action-setup");
    }
  });

  it("retries pnpm store path resolution after a transient executable download failure", () => {
    const action = parse(readFileSync(SETUP_PNPM_STORE_CACHE_ACTION, "utf8")) as {
      runs: { steps: WorkflowStep[] };
    };
    const step = action.runs.steps.find(
      (candidate) => candidate.name === "Resolve pnpm store path",
    );
    expect(step?.run).toBeDefined();

    const root = tempDirs.make("pnpm-store-path-retry-");
    const binDir = join(root, "bin");
    const attemptsPath = join(root, "attempts");
    const sleepPath = join(root, "sleeps");
    const outputPath = join(root, "output");
    const storePath = join(root, "store");
    mkdirSync(binDir, { recursive: true });
    writeFileSync(
      join(binDir, "pnpm"),
      `#!/bin/sh
attempts=$(cat "$MOCK_ATTEMPTS" 2>/dev/null || printf 0)
attempts=$((attempts + 1))
printf '%s' "$attempts" > "$MOCK_ATTEMPTS"
if [ "$attempts" -lt 3 ]; then
  printf 'transient pnpm download failure\\n' >&2
  exit 1
fi
printf '%s\\n' "$MOCK_STORE_PATH"
`,
      { mode: 0o755 },
    );
    writeFileSync(
      join(binDir, "sleep"),
      `#!/bin/sh
printf '%s\\n' "$1" >> "$MOCK_SLEEPS"
`,
      { mode: 0o755 },
    );

    const result = spawnSync("bash", ["-c", step?.run ?? ""], {
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_OUTPUT: outputPath,
        MOCK_ATTEMPTS: attemptsPath,
        MOCK_SLEEPS: sleepPath,
        MOCK_STORE_PATH: storePath,
        PATH: `${binDir}:${process.env.PATH ?? ""}`,
      },
    });

    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(attemptsPath, "utf8")).toBe("3");
    expect(readFileSync(sleepPath, "utf8")).toBe("5\n10\n");
    expect(readFileSync(outputPath, "utf8")).toContain(`path=${storePath}`);
  });

  it("keeps Crabbox hydration compatible with local Actions replay", () => {
    const crabboxConfig = parse(readFileSync(CRABBOX_CONFIG, "utf8")) as {
      actions?: { job?: string };
    };
    const workflowText = readFileSync(CRABBOX_HYDRATE_WORKFLOW, "utf8");
    const hydrate = workflowJob(CRABBOX_HYDRATE_WORKFLOW, "hydrate");
    const hydrateWindowsDaemon = workflowJob(CRABBOX_HYDRATE_WORKFLOW, "hydrate-windows-daemon");
    const hydrateGithub = workflowJob(CRABBOX_HYDRATE_WORKFLOW, "hydrate-github");

    expect(crabboxConfig.actions?.job).toBe("hydrate");
    expect(hydrate.if).toBe(
      "${{ inputs.crabbox_job != 'hydrate-github' && inputs.crabbox_job != 'hydrate-windows-daemon' }}",
    );
    const hydrateNode = workflowStep(hydrate, "Setup Node.js");
    expect(hydrateNode.shell).toBe("bash");
    expect(hydrateNode.run).toContain(
      "source .github/actions/setup-pnpm-store-cache/ensure-node.sh",
    );
    expect(hydrateNode.run).toContain('openclaw_ensure_node "24.x"');
    const hydratePnpm = workflowStep(hydrate, "Setup pnpm and dependencies");
    expect(hydratePnpm.if).toBeUndefined();
    expect(hydratePnpm.run).toContain('corepack enable --install-directory "$PNPM_HOME"');
    expect(hydratePnpm.run).toContain("COREPACK_HOME");
    expect(workflowText).not.toContain('PNPM_CONFIG_STORE_DIR: "/var/cache/crabbox/pnpm/store"');
    expect(hydratePnpm.run).toContain('preferred_pnpm_store="/var/cache/crabbox/pnpm/store"');
    expect(hydratePnpm.run).toContain('mkdir -p "$preferred_pnpm_store" 2>/dev/null');
    expect(hydratePnpm.run).toContain('[ -w "$preferred_pnpm_store" ]');
    expect(hydratePnpm.run).toContain(
      'pnpm_cache_root="${XDG_CACHE_HOME:-$HOME/.cache}/openclaw/pnpm"',
    );
    expect(hydratePnpm.run).toContain('pnpm_install_root="$pnpm_cache_root/install"');
    expect(hydratePnpm.run).toContain('export PNPM_CONFIG_STORE_DIR="$pnpm_cache_root/store"');
    expect(hydratePnpm.run).toContain(
      'export PNPM_CONFIG_MODULES_DIR="$pnpm_install_root/node_modules"',
    );
    expect(hydratePnpm.run).toContain('export PNPM_CONFIG_PACKAGE_IMPORT_METHOD="hardlink"');
    expect(hydratePnpm.run).toContain(
      'export PNPM_CONFIG_VIRTUAL_STORE_DIR="$pnpm_install_root/virtual-store"',
    );
    expect(hydratePnpm.run).toContain('echo "PNPM_CONFIG_STORE_DIR=$PNPM_CONFIG_STORE_DIR"');
    expect(hydratePnpm.run).toContain('echo "PNPM_CONFIG_MODULES_DIR=$PNPM_CONFIG_MODULES_DIR"');
    expect(hydratePnpm.run).toContain('echo "CRABBOX_PNPM_MODULES_DIR=$PNPM_CONFIG_MODULES_DIR"');
    expect(hydratePnpm.run).toContain(
      'echo "PNPM_CONFIG_PACKAGE_IMPORT_METHOD=${PNPM_CONFIG_PACKAGE_IMPORT_METHOD:-}"',
    );
    expect(hydratePnpm.run).toContain(
      'echo "PNPM_CONFIG_VIRTUAL_STORE_DIR=$PNPM_CONFIG_VIRTUAL_STORE_DIR"',
    );
    expect(hydratePnpm.run).toContain('} >> "$GITHUB_ENV"');
    expect(hydratePnpm.run).toContain("prepare_crabbox_pnpm_dirs");
    expect(hydratePnpm.run).toContain(
      'case "${PNPM_CONFIG_MODULES_DIR:?}" in "$pnpm_install_root"/*)',
    );
    expect(hydratePnpm.run).toContain(
      'case "${PNPM_CONFIG_VIRTUAL_STORE_DIR:?}" in "$pnpm_install_root"/*)',
    );
    expect(hydratePnpm.run).toContain('rm -rf -- "$pnpm_install_root"');
    expect(hydratePnpm.run).toContain('mkdir -p "$pnpm_install_root" "$PNPM_CONFIG_STORE_DIR"');
    expect(hydratePnpm.run).toContain(
      'mkdir -p "$PNPM_CONFIG_MODULES_DIR" "$PNPM_CONFIG_VIRTUAL_STORE_DIR"',
    );
    expect(hydratePnpm.run).toContain(
      '"$(stat -c %d "$PNPM_CONFIG_STORE_DIR")" != "$(stat -c %d "$PNPM_CONFIG_MODULES_DIR")"',
    );
    expect(hydratePnpm.run).toContain(
      "Fallback pnpm store and modules directories must share a filesystem",
    );
    expect(hydratePnpm.run).toContain(
      "append_pnpm_option_arg PNPM_CONFIG_PACKAGE_IMPORT_METHOD package-import-method",
    );
    expect(hydratePnpm.run).toContain("Refusing unsafe pnpm directory");
    expect(hydratePnpm.run).not.toContain('rm -rf -- "${PNPM_CONFIG_MODULES_DIR:?}"');
    expect(hydratePnpm.run).toContain(
      '[ "$(readlink node_modules)" = "${PNPM_CONFIG_MODULES_DIR:-}" ]',
    );
    expect(hydratePnpm.run).toContain("pnpm_install_artifacts_ready");
    expect(hydratePnpm.run).toContain("run_pnpm_install || run_pnpm_install");
    expect(hydratePnpm.run).toContain('setsid pnpm "${install_args[@]}"');
    expect(hydratePnpm.run).toContain("grep -qE '^Done in .+ using pnpm v'");
    expect(hydratePnpm.run).toContain("https://github.com/pnpm/pnpm/issues/12297");
    expect(hydratePnpm.run).toContain('kill -TERM -- "-$pnpm_pid"');
    expect(hydratePnpm.run).toContain('kill -KILL -- "-$pnpm_pid"');
    expect(hydratePnpm.run).toContain('test -s "$PNPM_CONFIG_MODULES_DIR/.modules.yaml"');
    expect(hydratePnpm.run).toContain('test -x "$PNPM_CONFIG_MODULES_DIR/.bin/oxfmt"');
    expect(hydratePnpm.run).toContain('test -f "$PNPM_CONFIG_MODULES_DIR/typescript/package.json"');
    expect(workflowStep(hydrate, "Fetch main ref").run).toContain(
      "timeout --signal=TERM --kill-after=10s 30s git",
    );
    expect(workflowStep(hydrate, "Fetch main ref").run).toContain(
      "fetch --no-tags --prune --no-recurse-submodules --depth=50 origin",
    );
    expect(workflowStep(hydrate, "Fetch main ref").run).toContain(
      '"+refs/heads/main:refs/remotes/origin/main"',
    );
    expect(workflowStep(hydrate, "Prepare Crabbox shell").if).toBeUndefined();
    const prepareCrabboxShell = workflowStep(hydrate, "Prepare Crabbox shell").run;
    expect(prepareCrabboxShell).toContain("link_node_tool()");
    expect(prepareCrabboxShell).toContain('readlink -f "$source"');
    expect(prepareCrabboxShell).toContain('readlink -f "$target"');
    expect(prepareCrabboxShell).toContain("link_node_tool corepack");
    const ensureDocker = workflowStep(hydrate, "Ensure Docker is running");
    expect(ensureDocker.if).toBeUndefined();
    expect(ensureDocker.env).toEqual({
      CRABBOX_JOB: "${{ inputs.crabbox_job }}",
    });
    expect(ensureDocker.run).toContain("docker_required=false");
    expect(ensureDocker.run).toContain('if [ "${CRABBOX_JOB:-hydrate}" = "hydrate-docker" ]; then');
    expect(ensureDocker.run).toContain("other marker names do not");
    expect(ensureDocker.run).toContain('if [ "$docker_required" = true ]; then');
    expect(ensureDocker.run).toContain(
      "Docker is unavailable for ${CRABBOX_JOB:-hydrate}; route this workload to a Docker-capable provider",
    );
    expect(ensureDocker.run).toContain(
      "Docker is unavailable; standard hydration will continue without Docker",
    );
    expect(ensureDocker.run).toContain(
      'echo "OPENCLAW_CRABBOX_DOCKER_AVAILABLE=0" >> "$GITHUB_ENV"',
    );
    expect(ensureDocker.run).toContain(
      'echo "OPENCLAW_CRABBOX_DOCKER_AVAILABLE=1" >> "$GITHUB_ENV"',
    );
    expect(workflowStep(hydrate, "Ensure SSH is available").if).toBeUndefined();
    expect(workflowStep(hydrate, "Hydrate provider env helper").if).toBeUndefined();
    const markCrabboxReady = workflowStep(hydrate, "Mark Crabbox ready").run;
    expect(markCrabboxReady).toContain("COREPACK_HOME");
    expect(markCrabboxReady).toContain("OPENCLAW_CRABBOX_DOCKER_AVAILABLE");
    expect(markCrabboxReady).toContain("CRABBOX_PNPM_MODULES_DIR");
    expect(markCrabboxReady).toContain("PNPM_CONFIG_PACKAGE_IMPORT_METHOD");
    expect(markCrabboxReady).not.toContain("PNPM_CONFIG_MODULES_DIR");
    expect(markCrabboxReady).not.toContain("PNPM_CONFIG_VIRTUAL_STORE_DIR");
    expect(workflowStep(hydrate, "Hydrate provider env helper").env).toBeUndefined();

    expect(hydrateWindowsDaemon.if).toBe("${{ inputs.crabbox_job == 'hydrate-windows-daemon' }}");
    expect(workflowStep(hydrateWindowsDaemon, "Setup Node.js").uses).toBe(SETUP_NODE_V6);
    const hydrateWindowsPnpm = workflowStep(hydrateWindowsDaemon, "Setup pnpm and dependencies");
    expect(hydrateWindowsPnpm.shell).toBe("powershell");
    expect(hydrateWindowsPnpm.run).toContain(
      '$env:PNPM_CONFIG_MODULES_DIR = Join-Path $pnpmCacheRoot "node_modules"',
    );
    expect(hydrateWindowsPnpm.run).toContain(
      '$env:PNPM_CONFIG_VIRTUAL_STORE_DIR = Join-Path $pnpmCacheRoot "virtual-store"',
    );
    expect(hydrateWindowsPnpm.run).not.toContain("PNPM_CONFIG_PACKAGE_IMPORT_METHOD");
    expect(hydrateWindowsPnpm.run).toContain("--config.side-effects-cache=false");
    expect(hydrateWindowsPnpm.run).toContain('"--ignore-scripts"');
    expect(hydrateWindowsPnpm.run).toContain('$env:PNPM_CONFIG_CHILD_CONCURRENCY = "4"');
    expect(hydrateWindowsPnpm.run).toContain('$env:PNPM_CONFIG_NETWORK_CONCURRENCY = "8"');
    expect(hydrateWindowsPnpm.run).toContain('$env:PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN = "false"');
    expect(hydrateWindowsPnpm.run).toContain(
      "$Value | Out-File -FilePath $Path -Encoding utf8 -Append",
    );
    expect(hydrateWindowsPnpm.run).toContain('"--filter",');
    expect(hydrateWindowsPnpm.run).toContain('"openclaw",');
    expect(hydrateWindowsPnpm.run).toContain(
      "New-Item -ItemType Junction -Path $workspaceNodeModules -Target $env:PNPM_CONFIG_MODULES_DIR",
    );
    expect(hydrateWindowsPnpm.run).toContain(".pnpm-workspace-state-v1.json");
    expect(hydrateWindowsPnpm.run).not.toContain("Remove-Item -Recurse -Force");
    expect(hydrateWindowsPnpm.run).not.toContain("Add-Content -Path $env:GITHUB_ENV");
    expect(hydrateWindowsPnpm.run).not.toContain("Add-Content -Path $env:GITHUB_PATH");
    expect(hydrateWindowsPnpm.run).toContain("corepack enable --install-directory $env:PNPM_HOME");
    expect(hydrateWindowsPnpm.run).toContain("pnpm @installArgs");
    expect(hydrateWindowsPnpm.run).toContain(
      '$corepackShimDir = Join-Path $nodeBin "node_modules\\corepack\\shims"',
    );
    const hydrateWindowsFetch = workflowStep(hydrateWindowsDaemon, "Fetch main ref");
    expect(hydrateWindowsFetch.shell).toBe("powershell");
    expect(hydrateWindowsFetch.run).toContain(
      "$fetchInfo = New-Object System.Diagnostics.ProcessStartInfo",
    );
    expect(hydrateWindowsFetch.run).toContain('$fetchInfo.FileName = "git"');
    expect(hydrateWindowsFetch.run).toContain("$fetchInfo.WorkingDirectory = $repo");
    expect(hydrateWindowsFetch.run).toContain("$fetchInfo.UseShellExecute = $false");
    expect(hydrateWindowsFetch.run).not.toContain("$fetchInfo.RedirectStandardOutput = $true");
    expect(hydrateWindowsFetch.run).not.toContain("$fetchInfo.RedirectStandardError = $true");
    expect(hydrateWindowsFetch.run).toContain("$fetch = New-Object System.Diagnostics.Process");
    expect(hydrateWindowsFetch.run).toContain("$fetch.StartInfo = $fetchInfo");
    expect(hydrateWindowsFetch.run).toContain("$fetch.WaitForExit(30000)");
    expect(hydrateWindowsFetch.run).toContain("$fetch.Kill()");
    expect(hydrateWindowsFetch.run).not.toContain("StandardOutput.ReadToEnd()");
    expect(hydrateWindowsFetch.run).not.toContain("StandardError.ReadToEnd()");
    expect(hydrateWindowsFetch.run).toContain("git fetch failed with exit code $($fetch.ExitCode)");
    expect(hydrateWindowsFetch.run).toContain(
      "--no-tags --no-progress --prune --no-recurse-submodules --depth=50",
    );
    expect(hydrateWindowsFetch.run).toContain('"+refs/heads/main:refs/remotes/origin/main"');
    expect(workflowStep(hydrateWindowsDaemon, "Mark Crabbox ready").shell).toBe("powershell");
    const markWindowsCrabboxReady = workflowStep(hydrateWindowsDaemon, "Mark Crabbox ready").run;
    expect(markWindowsCrabboxReady).toContain('"NODE_BIN"');
    expect(markWindowsCrabboxReady).toContain('"PNPM_HOME"');
    expect(markWindowsCrabboxReady).toContain('"CRABBOX_PNPM_MODULES_DIR"');
    expect(markWindowsCrabboxReady).not.toContain('"PNPM_CONFIG_MODULES_DIR"');
    expect(markWindowsCrabboxReady).not.toContain('"PNPM_CONFIG_VIRTUAL_STORE_DIR"');
    expect(markWindowsCrabboxReady).toContain('"PATH"');
    expect(workflowText).toContain("OPENCLAW_CRABBOX_HYDRATE_DOWNLOAD_TIMEOUT_SECONDS:-300");
    expect(workflowText).toContain("OPENCLAW_CRABBOX_HYDRATE_DOWNLOAD_RETRIES:-3");
    expect(workflowText).toContain("--retry-all-errors");
    expect(workflowText).not.toContain("curl -fsSL https://get.docker.com | sudo sh");

    expect(hydrateGithub.if).toBe("${{ inputs.crabbox_job == 'hydrate-github' }}");
    expect(workflowStep(hydrateGithub, "Setup Node environment").uses).toBe(
      "./.github/actions/setup-node-env",
    );
    expect(workflowStep(hydrateGithub, "Setup Node environment").env?.PNPM_HOME).toBe(
      "${{ runner.temp }}/pnpm-home",
    );
    const hydrateGithubCrabboxShell = workflowStep(hydrateGithub, "Prepare Crabbox shell").run;
    expect(hydrateGithubCrabboxShell).toContain("link_node_tool()");
    expect(hydrateGithubCrabboxShell).toContain('readlink -f "$source"');
    expect(hydrateGithubCrabboxShell).toContain('readlink -f "$target"');
    expect(hydrateGithubCrabboxShell).toContain("link_node_tool corepack");
    const markHydrateGithubReady = workflowStep(hydrateGithub, "Mark Crabbox ready").run;
    expect(markHydrateGithubReady).toContain("OPENCLAW_CRABBOX_DOCKER_AVAILABLE");
    expect(markHydrateGithubReady).toContain("PNPM_CONFIG_PACKAGE_IMPORT_METHOD");
    expect(workflowStep(hydrateGithub, "Hydrate provider env helper").env?.FACTORY_API_KEY).toBe(
      "${{ secrets.FACTORY_API_KEY }}",
    );
  });

  it("defaults Crabbox proof to Blacksmith while keeping direct jobs on Azure", () => {
    const crabboxConfig = parse(readFileSync(CRABBOX_CONFIG, "utf8")) as {
      aws?: { region?: string };
      capacity?: {
        availabilityZones?: string[];
        fallback?: string;
        market?: string;
        regions?: string[];
      };
      jobs?: {
        changed?: {
          command?: string;
          market?: string;
          provider?: string;
          shell?: boolean;
          type?: string;
        };
        prewarm?: { market?: string; provider?: string; type?: string };
      };
      provider?: string;
      ssh?: { port?: string; user?: string };
    };

    expect(crabboxConfig.provider).toBe("blacksmith-testbox");
    expect(crabboxConfig.capacity?.market).toBe("on-demand");
    expect(crabboxConfig.capacity?.fallback).toBeUndefined();
    expect(crabboxConfig.capacity?.regions).toBeUndefined();
    expect(crabboxConfig.capacity?.availabilityZones).toBeUndefined();
    expect(crabboxConfig.aws?.region).toBe("eu-west-1");
    expect(crabboxConfig.jobs?.prewarm?.market).toBe("on-demand");
    expect(crabboxConfig.jobs?.prewarm?.provider).toBe("azure");
    expect(crabboxConfig.jobs?.prewarm?.type).toBe("Standard_D4ads_v6");
    expect(crabboxConfig.jobs?.changed?.market).toBe("on-demand");
    expect(crabboxConfig.jobs?.changed?.provider).toBe("azure");
    expect(crabboxConfig.jobs?.changed?.type).toBe("Standard_D4ads_v6");
    expect(crabboxConfig.jobs?.changed?.shell).toBe(true);
    expect(crabboxConfig.jobs?.changed?.command).toContain("set -euo pipefail");
    expect(crabboxConfig.jobs?.changed?.command).toContain("git init -q");
    expect(crabboxConfig.jobs?.changed?.command).toContain(
      "commit -q --no-gpg-sign -m remote-check-tree",
    );
    expect(crabboxConfig.jobs?.changed?.command).toContain("env CI=1 corepack pnpm check --timed");
    expect(crabboxConfig.ssh?.user).toBe("crabbox");
    expect(crabboxConfig.ssh?.port).toBe("22");
  });

  it("resolves candidate package sources before reusing Docker E2E lanes", () => {
    const workflow = readFileSync(PACKAGE_ACCEPTANCE_WORKFLOW, "utf8");

    expect(workflow).toContain("name: Package Acceptance");
    expect(workflow).toContain("workflow_call:");
    expect(workflow).toContain("workflow_ref:");
    expect(workflow).toContain("package_ref:");
    expect(workflow).toContain("source:");
    expect(workflow).toContain("- npm");
    expect(workflow).toContain("- ref");
    expect(workflow).toContain("- url");
    expect(workflow).toContain("- trusted-url");
    expect(workflow).toContain("- artifact");
    expect(workflow).toContain("trusted_source_id:");
    expect(workflow).toContain("TRUSTED_SOURCE_ID: ${{ inputs.trusted_source_id }}");
    expect(workflow).toContain('--trusted-source-id "$TRUSTED_SOURCE_ID"');
    expect(workflow).toContain("scripts/resolve-openclaw-package-candidate.mts");
    expect(workflow).toContain('--package-ref "$PACKAGE_REF"');
    expect(workflow).toContain("artifact-ids: ${{ inputs.artifact_id }}");
    expect(workflow).toContain("actions/artifacts/${ARTIFACT_ID}");
    expect(workflow).toContain("name: ${{ env.PACKAGE_ARTIFACT_NAME }}");
    expect(workflow).toContain("pull-requests: read");
    expect(workflow).toContain(
      "uses: ./.github/workflows/openclaw-live-and-e2e-checks-reusable.yml",
    );
    expect(workflow).toContain("ref: ${{ needs.resolve_package.outputs.package_source_sha }}");
    expect(workflow).toContain(
      "package_artifact_name: ${{ needs.resolve_package.outputs.package_artifact_name }}",
    );
    expect(workflow).toContain("package_integrity:");
    expect(workflow).toContain("name: Package integrity");
    expect(workflow).toContain('node scripts/check-openclaw-package-tarball.mjs "$package"');
    expect(workflow).toContain('[[ "$actual_sha256" == "$EXPECTED_PACKAGE_SHA256" ]]');
    expect(workflow).toContain("needs: [resolve_package, package_integrity]");
    expect(workflow).toContain("package_integrity=${PACKAGE_INTEGRITY_RESULT}");
    const npm12Job = workflowJob(PACKAGE_ACCEPTANCE_WORKFLOW, "npm_12_install_sh");
    expect(jobNeeds(npm12Job)).toEqual(["resolve_package", "package_integrity"]);
    expect(npm12Job.permissions).toEqual({ actions: "read", contents: "read" });
    const npm12Step = workflowStep(npm12Job, "Run install.sh with npm 12");
    expect(npm12Step.run).toContain("npm@12.0.2");
    expect(npm12Step.run).toContain("bash scripts/install.sh");
    expect(npm12Step.run).toContain("scripts/docker/install-sh-common/version-parse.sh");
    expect(npm12Step.run).toContain("extract_openclaw_semver");
    expect(npm12Step.run).toContain(".openclaw-lifecycle-pending");
    expect(JSON.stringify(npm12Job)).not.toContain("secrets.");
  });

  it("binds npm 12 installation to the supplied prerelease dependency artifact", () => {
    const job = workflowJob(PACKAGE_ACCEPTANCE_WORKFLOW, "npm_12_install_sh");
    const validate = workflowStep(job, "Validate prerelease plugin registry artifact identity");
    const download = workflowStep(job, "Download prerelease plugin registry artifact");
    const install = workflowStep(job, "Run install.sh with npm 12");
    const tuple = "needs.resolve_package.outputs.prepublish_plugin_registry_json";
    const field = (name: string) =>
      `\${{ fromJSON(${tuple} || '{}').prepublishPluginRegistry${name} || '' }}`;

    expect(validate.if).toBe(`${tuple} != ''`);
    expect(validate.env).toMatchObject({
      ARTIFACT_DIGEST: field("ArtifactDigest"),
      ARTIFACT_ID: field("ArtifactId"),
      ARTIFACT_NAME: field("ArtifactName"),
      ARTIFACT_RUN_ATTEMPT: field("ArtifactRunAttempt"),
      ARTIFACT_RUN_ID: field("ArtifactRunId"),
    });
    expect(validate.run).toContain('verify-upload "Prerelease plugin registry"');
    expect(download.if).toBe(validate.if);
    expect(download.uses).toBe(DOWNLOAD_ARTIFACT_V8);
    expect(download.with).toMatchObject({
      "artifact-ids": field("ArtifactId"),
      "run-id": field("ArtifactRunId"),
      path: ".artifacts/prepublish-plugin-registry",
    });
    expect(install.env).toMatchObject({
      OPENCLAW_DOCKER_E2E_SELECTED_SHA: "${{ needs.resolve_package.outputs.package_source_sha }}",
      OPENCLAW_PREPUBLISH_PLUGIN_REGISTRY_CANDIDATE_VERSION:
        "${{ needs.resolve_package.outputs.package_version }}",
      OPENCLAW_PREPUBLISH_PLUGIN_REGISTRY_DIR: `\${{ ${tuple} != '' && format('{0}/.artifacts/prepublish-plugin-registry', github.workspace) || '' }}`,
      OPENCLAW_PREPUBLISH_PLUGIN_REGISTRY_MANIFEST_SHA256: field("ManifestSha256"),
    });
    expect(install.run).toMatch(
      /bash scripts\/e2e\/lib\/prepublish-plugin-registry\.sh\s*\\\s*bash scripts\/install\.sh/u,
    );
    const steps = job.steps ?? [];
    expect(steps.indexOf(validate)).toBeLessThan(steps.indexOf(download));
    expect(steps.indexOf(download)).toBeLessThan(steps.indexOf(install));
  });

  it("keeps ref packaging independent of workflow-checkout dependencies", () => {
    const workflow = readFileSync(PACKAGE_ACCEPTANCE_WORKFLOW, "utf8");
    const resolveJob = workflow.slice(
      workflow.indexOf("  resolve_package:"),
      workflow.indexOf("  package_integrity:"),
    );

    expect(resolveJob).toContain("scripts/resolve-openclaw-package-candidate.mts");
    expect(resolveJob).not.toContain("pnpm install");
  });

  it("offers bounded product profiles and can run Telegram against the resolved artifact", () => {
    const parsedWorkflow = readWorkflow(PACKAGE_ACCEPTANCE_WORKFLOW);
    const workflow = readFileSync(PACKAGE_ACCEPTANCE_WORKFLOW, "utf8");
    const npmTelegramWorkflow = readFileSync(NPM_TELEGRAM_WORKFLOW, "utf8");
    const packageTelegram = workflowJob(PACKAGE_ACCEPTANCE_WORKFLOW, "package_telegram");
    const dockerAcceptance = workflowJob(PACKAGE_ACCEPTANCE_WORKFLOW, "docker_acceptance");
    const dockerAcceptanceRegistry = workflowJob(
      PACKAGE_ACCEPTANCE_WORKFLOW,
      "docker_acceptance_registry",
    );
    const npm12Install = workflowJob(PACKAGE_ACCEPTANCE_WORKFLOW, "npm_12_install_sh");
    const npmTelegram = workflowJob(NPM_TELEGRAM_WORKFLOW, "run_package_telegram_e2e");
    const buildPrivateQa = workflowStep(npmTelegram, "Build private QA harness runtime");

    expect(workflow).toContain("suite_profile:");
    expect(parsedWorkflow.on?.workflow_dispatch?.inputs?.suite_profile).toMatchObject({
      default: "package",
      description: "Acceptance profile: smoke, package, telegram, product, full, or custom",
      options: ["smoke", "package", "telegram", "product", "full", "custom"],
    });
    const dispatchInputs = parsedWorkflow.on?.workflow_dispatch?.inputs;
    const callInputs = parsedWorkflow.on?.workflow_call?.inputs;
    expect(dispatchInputs?.prepublish_plugin_registry_json).toBeUndefined();
    expect(dispatchInputs?.advisory).toEqual(callInputs?.advisory);
    expect(callInputs?.advisory).toEqual({
      description: "Treat acceptance failures as advisory for the caller",
      required: false,
      default: false,
      type: "boolean",
    });
    expect(Object.keys(dispatchInputs ?? {})).toHaveLength(25);
    expect(parsedWorkflow.on?.workflow_dispatch?.inputs?.telegram_advisory).toBeUndefined();
    expect(parsedWorkflow.on?.workflow_call?.inputs?.suite_profile).toMatchObject({
      default: "package",
      description: "Acceptance profile: smoke, package, telegram, product, full, or custom",
    });
    expect(workflow).toContain("published_upgrade_survivor_baseline:");
    expect(workflow).toContain("published_upgrade_survivor_baselines:");
    expect(workflow).toContain("last-stable-4");
    expect(workflow).toContain("all-since-2026.4.23");
    expect(workflow).toContain("published_upgrade_survivor_scenarios:");
    expect(workflow).toContain("scripts/resolve-upgrade-survivor-baselines.mts");
    expect(workflow).toContain("--history-count 6");
    expect(workflow).toContain("--include-version 2026.4.23");
    expect(workflow).toContain("--pre-date 2026-03-15T00:00:00Z");
    expect(workflow).toContain('"last-stable-"');
    expect(workflow).toContain('"all-since-"');
    const smoke = runPackageAcceptanceProfile({ suiteProfile: "smoke" });
    expect(smoke.result.status, smoke.result.stderr).toBe(0);
    expect(smoke.outputs.docker_lanes).toBe(
      "npm-onboard-channel-agent gateway-network config-reload",
    );
    const packageProfile = runPackageAcceptanceProfile({ suiteProfile: "package" });
    expect(packageProfile.result.status, packageProfile.result.stderr).toBe(0);
    expect(packageProfile.outputs.docker_lanes?.split(" ")).toEqual([
      "npm-onboard-channel-agent",
      "doctor-switch",
      "update-channel-switch",
      "skill-install",
      "update-corrupt-plugin",
      "upgrade-survivor",
      "update-first-hop-compat",
      "published-upgrade-survivor",
      "root-managed-vps-upgrade",
      "update-restart-auth",
      "plugins-offline",
      "plugin-update",
    ]);
    expect(
      runPackageAcceptanceProfile({ suiteProfile: "full" }).outputs.include_release_path_suites,
    ).toBe("true");
    expect(workflow).not.toContain("telegram_mode requires source=npm");
    expect(workflow).toContain("uses: ./.github/workflows/npm-telegram-beta-e2e.yml");
    expect(workflow).toContain(
      "package_artifact_name: ${{ needs.resolve_package.outputs.package_artifact_name }}",
    );
    expect(workflow).toContain(
      "package_artifact_digest: ${{ needs.resolve_package.outputs.package_artifact_digest }}",
    );
    expect(workflow).toContain(
      "package_artifact_id: ${{ needs.resolve_package.outputs.package_artifact_id }}",
    );
    expect(workflow).toContain(
      "package_artifact_run_attempt: ${{ needs.resolve_package.outputs.package_artifact_run_attempt }}",
    );
    expect(workflow).toContain(
      "package_artifact_run_id: ${{ needs.resolve_package.outputs.package_artifact_run_id }}",
    );
    expect(workflow).toContain(
      "package_file_name: ${{ needs.resolve_package.outputs.package_file_name }}",
    );
    expect(workflow).toContain(
      "package_sha256: ${{ needs.resolve_package.outputs.package_sha256 }}",
    );
    expect(workflow).toContain(
      "package_source_sha: ${{ needs.resolve_package.outputs.package_source_sha }}",
    );
    expect(workflow).toContain(
      "package_version: ${{ needs.resolve_package.outputs.package_version }}",
    );
    expect(workflow).toContain("telegram_scenarios:");
    expect(packageTelegram.with?.scenario).toBe(
      "${{ needs.resolve_package.outputs.telegram_scenarios }}",
    );
    expect(packageTelegram.with?.advisory).toBe(
      "${{ inputs.advisory || inputs.telegram_advisory || false }}",
    );
    expect(packageTelegram.with).not.toHaveProperty("allow_older_binary_destructive_actions");
    expect(workflow).toContain(
      "package_label: openclaw@${{ needs.resolve_package.outputs.package_version }}",
    );
    expect(npmTelegramWorkflow).toContain("package_artifact_run_id:");
    expect(npmTelegramWorkflow).toContain("Download package-under-test artifact from release run");
    expect(npmTelegramWorkflow).toContain("run-id: ${{ inputs.package_artifact_run_id }}");
    expect(npmTelegramWorkflow).toContain("github-token: ${{ github.token }}");
    expect(workflow).toContain(
      "package_source_sha: ${{ steps.resolve.outputs.package_source_sha }}",
    );
    expect(packageTelegram.with?.harness_ref).toBe(
      "${{ needs.resolve_package.outputs.tooling_sha }}",
    );
    expect(packageTelegram.with?.package_source_sha).toBe(
      "${{ needs.resolve_package.outputs.package_source_sha }}",
    );
    const registryInputs = {
      prepublish_plugin_registry_artifact_name:
        "${{ fromJSON(needs.resolve_package.outputs.prepublish_plugin_registry_json || '{}').prepublishPluginRegistryArtifactName || '' }}",
      prepublish_plugin_registry_artifact_id:
        "${{ fromJSON(needs.resolve_package.outputs.prepublish_plugin_registry_json || '{}').prepublishPluginRegistryArtifactId || '' }}",
      prepublish_plugin_registry_artifact_digest:
        "${{ fromJSON(needs.resolve_package.outputs.prepublish_plugin_registry_json || '{}').prepublishPluginRegistryArtifactDigest || '' }}",
      prepublish_plugin_registry_artifact_run_id:
        "${{ fromJSON(needs.resolve_package.outputs.prepublish_plugin_registry_json || '{}').prepublishPluginRegistryArtifactRunId || '' }}",
      prepublish_plugin_registry_artifact_run_attempt:
        "${{ fromJSON(needs.resolve_package.outputs.prepublish_plugin_registry_json || '{}').prepublishPluginRegistryArtifactRunAttempt || '' }}",
      prepublish_plugin_registry_manifest_sha256:
        "${{ fromJSON(needs.resolve_package.outputs.prepublish_plugin_registry_json || '{}').prepublishPluginRegistryManifestSha256 || '' }}",
    };
    expect(packageTelegram.with).toMatchObject(registryInputs);
    const registryInputSchema = Object.fromEntries(
      Object.keys(registryInputs).map((name) => [
        name,
        expect.objectContaining({ default: "", required: false, type: "string" }),
      ]),
    );
    const npmTelegramInputs = readWorkflow(NPM_TELEGRAM_WORKFLOW).on;
    expect(npmTelegramInputs?.workflow_call?.inputs).toMatchObject(registryInputSchema);
    expect(npmTelegramInputs?.workflow_dispatch?.inputs).toMatchObject(registryInputSchema);
    expect(npmTelegramWorkflow).toContain(
      "Artifact-backed Telegram E2E requires the complete prerelease plugin registry tuple.",
    );
    expect(npmTelegramWorkflow).toContain(
      "Prerelease plugin registry inputs require an artifact-backed OpenAgent package.",
    );
    expect(npmTelegramWorkflow).toContain(
      'expected_registry_suffix="-${PREPUBLISH_PLUGIN_REGISTRY_ARTIFACT_RUN_ID}-${PREPUBLISH_PLUGIN_REGISTRY_ARTIFACT_RUN_ATTEMPT}"',
    );
    expect(npmTelegramWorkflow).toContain(
      '"docker-e2e-prepublish-plugin-registry${expected_registry_suffix}" | \\\n' +
        '                "package-acceptance-telegram-plugin-registry${expected_registry_suffix}"',
    );
    expect(npmTelegramWorkflow).not.toContain(
      "Prerelease plugin registry and package artifacts must come from the same workflow run attempt.",
    );
    expect(npmTelegramWorkflow).toContain('verify-upload "Prerelease plugin registry"');
    expect(npmTelegramWorkflow).toContain("Download prerelease plugin registry artifact");
    expect(npmTelegramWorkflow).toContain("--required-packages-json '[\"@openclaw/codex\"]'");
    expect(packageTelegram.secrets).toEqual({
      OPENAI_API_KEY: "${{ secrets.OPENAI_API_KEY }}",
      OPENCLAW_QA_CONVEX_SECRET_CI: "${{ secrets.OPENCLAW_QA_CONVEX_SECRET_CI }}",
      OPENCLAW_QA_CONVEX_SITE_URL: "${{ secrets.OPENCLAW_QA_CONVEX_SITE_URL }}",
    });
    expect(dockerAcceptance.with?.ref).toBe(
      "${{ needs.resolve_package.outputs.package_source_sha }}",
    );
    expect(dockerAcceptance.with?.advisory).toBe("${{ inputs.advisory || false }}");
    expect(dockerAcceptanceRegistry.with?.advisory).toBe("${{ inputs.advisory || false }}");
    expect(dockerAcceptance.with?.prepublish_plugin_registry_artifact_name).toContain(
      "startsWith(",
    );
    expect(dockerAcceptance.with?.prepublish_plugin_registry_artifact_name).toContain(
      "'docker-e2e-prepublish-plugin-registry-'",
    );
    expect(packageTelegram.with?.prepublish_plugin_registry_artifact_name).not.toContain(
      "startsWith(",
    );
    expect(npm12Install.if).toBe("inputs.suite_profile != 'telegram'");
    expect(dockerAcceptance.if).toBe(
      "inputs.suite_profile != 'telegram' && inputs.shared_image_policy == 'no-push-artifact'",
    );
    expect(dockerAcceptanceRegistry.if).toBe(
      "inputs.suite_profile != 'telegram' && inputs.shared_image_policy == 'existing-only'",
    );
    expect(parsedWorkflow.permissions).toEqual({
      actions: "read",
      contents: "read",
      packages: "read",
      "pull-requests": "read",
    });
    expect(workflow).not.toContain("NPM_TOKEN");
    expect(workflow).not.toContain("contents: write");
    expect(workflow).not.toContain("packages: write");
    expect(workflow).not.toContain("id-token: write");
    expect(buildPrivateQa.env).toMatchObject({
      NODE_OPTIONS: "--max-old-space-size=8192",
      OPENCLAW_BUILD_PRIVATE_QA: "1",
    });
    expectTextToIncludeAll(buildPrivateQa.run, [
      "pnpm build qaRuntime",
      "test -f dist/plugin-sdk/qa-runtime.js",
      "test -f dist/extensions/qa-lab/runtime-api.js",
    ]);
    expect(workflow).toContain('echo "baseline=$fallback_baseline" >> "$GITHUB_OUTPUT"');
    expect(workflow).toContain(
      "published_upgrade_survivor_baseline: ${{ needs.resolve_package.outputs.published_upgrade_survivor_baseline }}",
    );
    expect(workflow).toContain(
      "published_upgrade_survivor_baselines: ${{ needs.resolve_package.outputs.published_upgrade_survivor_baselines }}",
    );
    expect(workflow).toContain(
      "published_upgrade_survivor_scenarios: ${{ needs.resolve_package.outputs.published_upgrade_survivor_scenarios }}",
    );
    expect(workflow).toContain("Published upgrade survivor baseline:");
    expect(workflow).toContain("Published upgrade survivor baselines:");
    expect(workflow).toContain("Published upgrade survivor scenarios:");
  });

  it("normalizes one closed prerelease registry tuple before child workflows", () => {
    const tuple = packageAcceptanceRegistryTuple();
    const direct = runPackageAcceptanceRegistryInputValidation({
      prepublishPluginRegistryJson: JSON.stringify(tuple),
    });
    expect(direct.result.status, direct.result.stderr).toBe(0);
    expect(direct.output).toContain(`json=${JSON.stringify(tuple)}\n`);

    const candidate = runPackageAcceptanceRegistryInputValidation({
      candidateArtifactJson: JSON.stringify({
        imageArtifactName: "image-123-2",
        ...tuple,
      }),
    });
    expect(candidate.result.status, candidate.result.stderr).toBe(0);
    expect(candidate.output).toContain(`json=${JSON.stringify(tuple)}\n`);

    const identical = runPackageAcceptanceRegistryInputValidation({
      candidateArtifactJson: JSON.stringify(tuple),
      prepublishPluginRegistryJson: JSON.stringify(tuple),
    });
    expect(identical.result.status, identical.result.stderr).toBe(0);
    expect(identical.output).toContain(`json=${JSON.stringify(tuple)}\n`);
  });

  it("rejects partial or ambiguous prerelease registry tuples before child workflows", () => {
    const tuple = packageAcceptanceRegistryTuple();
    const partial = runPackageAcceptanceRegistryInputValidation({
      prepublishPluginRegistryJson: JSON.stringify({
        prepublishPluginRegistryArtifactId: tuple.prepublishPluginRegistryArtifactId,
      }),
    });
    expect(partial.result.status).toBe(1);
    expect(partial.result.stderr).toContain(
      "Prerelease plugin registry JSON must contain one complete immutable tuple.",
    );

    const ambiguous = runPackageAcceptanceRegistryInputValidation({
      candidateArtifactJson: JSON.stringify(tuple),
      prepublishPluginRegistryJson: JSON.stringify(
        packageAcceptanceRegistryTuple({
          prepublishPluginRegistryArtifactId: "789",
        }),
      ),
    });
    expect(ambiguous.result.status).toBe(1);
    expect(ambiguous.result.stderr).toContain("Prerelease plugin registry inputs disagree.");
  });

  it("generates a Telegram-only registry only for direct ref or artifact candidates", () => {
    for (const source of ["ref", "artifact"] as const) {
      const generated = runPackageAcceptanceResolveScript({
        source,
        telegramMode: "mock-openai",
      });
      expect(generated.result.status, generated.result.stderr).toBe(0);
      expect(generated.args).toContain("--plugin-registry-output-dir\n");
      expect(generated.args).toContain(".artifacts/package-acceptance-telegram-plugin-registry\n");
      expect(generated.args).toContain('--required-plugin-packages-json\n["@openclaw/codex"]\n');
    }

    for (const source of ["npm", "url", "trusted-url"] as const) {
      const skipped = runPackageAcceptanceResolveScript({
        source,
        telegramMode: "mock-openai",
      });
      expect(skipped.result.status, skipped.result.stderr).toBe(0);
      expect(skipped.args).not.toContain("--plugin-registry-output-dir");
    }

    const telegramDisabled = runPackageAcceptanceResolveScript({
      source: "ref",
      telegramMode: "none",
    });
    expect(telegramDisabled.result.status, telegramDisabled.result.stderr).toBe(0);
    expect(telegramDisabled.args).not.toContain("--plugin-registry-output-dir");

    const publishedArtifact = runPackageAcceptanceResolveScript({
      candidateArtifactJson: releaseCandidateArtifactJson("a".repeat(40), true),
      source: "artifact",
      telegramMode: "mock-openai",
    });
    expect(publishedArtifact.result.status, publishedArtifact.result.stderr).toBe(0);
    expect(publishedArtifact.args).not.toContain("--plugin-registry-output-dir");
  });

  it.each([
    { candidateVersion: "2026.8.1", targetContextRef: "", expected: "2026.7.1-2" },
    {
      candidateVersion: "2026.6.35",
      targetContextRef: "extended-stable/2026.6.33",
      expected: "2026.6.34",
    },
  ])(
    "derives the default baseline from resolved candidate $candidateVersion, not a moving latest tag",
    ({ candidateVersion, targetContextRef, expected }) => {
      const result = runPackageAcceptanceBaselineStep({
        candidateVersion,
        targetContextRef,
        source: "npm",
      });

      expect(result.result.status, result.result.stderr).toBe(0);
      expect(result.output).toContain(`baseline=openclaw@${expected}\n`);
      expect(result.npmCalls).toHaveLength(1);
      expect(result.npmCalls[0]).toContain("view openclaw versions");
      expect(result.npmCalls[0]).not.toContain("openclaw@latest");
    },
  );

  it("reuses a propagated artifact baseline without resolving npm metadata again", () => {
    const result = runPackageAcceptanceBaselineStep({
      candidateVersion: "2026.8.1",
      fallbackBaseline: "openclaw@2026.7.1-2",
      source: "artifact",
    });

    expect(result.result.status, result.result.stderr).toBe(0);
    expect(result.output).toContain("baseline=openclaw@2026.7.1-2\n");
    expect(result.npmCalls).toEqual([]);
  });

  it("reuses a supplied registry and keeps generated artifact names distinct from Docker", () => {
    const tuple = packageAcceptanceRegistryTuple();
    const reused = runPackageAcceptanceResolveScript({
      prepublishPluginRegistryJson: JSON.stringify(tuple),
      source: "ref",
      telegramMode: "mock-openai",
    });
    expect(reused.result.status, reused.result.stderr).toBe(0);
    expect(reused.args).not.toContain("--plugin-registry-output-dir");

    const workflow = readFileSync(PACKAGE_ACCEPTANCE_WORKFLOW, "utf8");
    expect(workflow).toContain(
      "package-acceptance-telegram-plugin-registry-${{ github.run_id }}-${{ github.run_attempt }}",
    );
    expect(workflow).toContain('"docker-e2e-prepublish-plugin-registry-" +');
  });

  it.each(["package", "product"])(
    "schedules updater first-hop compatibility in the %s acceptance profile",
    (suiteProfile) => {
      const { outputs, result } = runPackageAcceptanceProfile({ suiteProfile });

      expect(result.status, result.stderr).toBe(0);
      expect((outputs.docker_lanes ?? "").split(/\s+/u)).toContain("update-first-hop-compat");
    },
  );

  it("selects one normalized Telegram scenario without enabling broad acceptance lanes", () => {
    const { outputs, result } = runPackageAcceptanceProfile({
      suiteProfile: "telegram",
      telegramMode: "mock-openai",
      telegramScenarios: "  telegram-commands-command  ",
    });

    expect(result.status).toBe(0);
    expect(outputs).toMatchObject({
      docker_lanes: "",
      include_live_suites: "false",
      include_openwebui: "false",
      include_release_path_suites: "false",
      telegram_enabled: "true",
      telegram_mode: "mock-openai",
      telegram_scenarios: "telegram-commands-command",
    });
  });

  it.each([
    {
      expected: "telegram_mode must not be none",
      telegramMode: "none",
      telegramScenarios: "telegram-commands-command",
    },
    {
      expected: "telegram_scenarios must contain exactly one scenario",
      telegramMode: "mock-openai",
      telegramScenarios: "",
    },
    {
      expected: "telegram_scenarios must contain exactly one scenario",
      telegramMode: "mock-openai",
      telegramScenarios: "telegram-help-command, telegram-commands-command",
    },
  ])(
    "rejects an invalid Telegram-only profile: $expected",
    ({ expected, telegramMode, telegramScenarios }) => {
      const { result } = runPackageAcceptanceProfile({
        suiteProfile: "telegram",
        telegramMode,
        telegramScenarios,
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(expected);
    },
  );

  it("runs secretless weekly supported-line migration with optional manual historical replays", () => {
    const workflow = readFileSync(UPDATE_MIGRATION_WORKFLOW, "utf8");
    const packageWorkflow = readFileSync(PACKAGE_ACCEPTANCE_WORKFLOW, "utf8");
    const job = workflowJob(UPDATE_MIGRATION_WORKFLOW, "update_migration");

    expect(workflow).toContain("name: Update Migration");
    expect(workflow).toContain("uses: ./.github/workflows/package-acceptance.yml");
    expect(workflow).toContain("source: ref");
    expect(workflow).toContain("suite_profile: custom");
    expect(workflow).toContain("docker_lanes: update-migration");
    expect(
      readWorkflow(UPDATE_MIGRATION_WORKFLOW).on?.workflow_dispatch?.inputs?.baselines,
    ).toMatchObject({
      default: "supported-lines",
      required: false,
    });
    expect(
      readWorkflow(UPDATE_MIGRATION_WORKFLOW).on?.workflow_dispatch?.inputs,
    ).not.toHaveProperty("allow_frozen_target_scenario_omissions");
    expect(readWorkflow(UPDATE_MIGRATION_WORKFLOW).on?.schedule).toEqual([{ cron: "17 3 * * 0" }]);
    expect(job.with).toMatchObject({
      workflow_ref: "${{ inputs.workflow_ref || 'main' }}",
      package_ref: "${{ inputs.package_ref || 'main' }}",
      published_upgrade_survivor_baselines: "${{ inputs.baselines || 'supported-lines' }}",
      published_upgrade_survivor_scenarios:
        "${{ inputs.scenarios || 'plugin-deps-cleanup legacy-operator-state' }}",
    });
    expect(job.with).not.toHaveProperty("allow_frozen_target_scenario_omissions");
    expect(workflow).toContain("telegram_mode: none");
    expect(job.secrets).toBeUndefined();
    expect(packageWorkflow).toContain("supported-lines for latest/previous/extended/floor");
  });
});

describe("package artifact reuse", () => {
  it("binds package acceptance input artifacts to the complete producer tuple", () => {
    const resolvePackage = workflowJob(PACKAGE_ACCEPTANCE_WORKFLOW, "resolve_package");
    expect(workflowStep(resolvePackage, "Setup Node environment").with).toMatchObject({
      "install-deps": "true",
    });
    expect(
      workflowStep(resolvePackage, "Checkout package workflow ref").with?.["persist-credentials"],
    ).toBe(false);
    const identity = workflowStep(resolvePackage, "Validate package artifact input identity");
    expect(identity.env).toMatchObject({
      ARTIFACT_DIGEST: "${{ inputs.artifact_digest }}",
      ARTIFACT_ID: "${{ inputs.artifact_id }}",
      ARTIFACT_NAME: "${{ inputs.artifact_name }}",
      ARTIFACT_RUN_ATTEMPT: "${{ inputs.artifact_run_attempt }}",
      ARTIFACT_RUN_ID: "${{ inputs.artifact_run_id }}",
      EXPECTED_PACKAGE_FILE_NAME: "${{ inputs.package_file_name }}",
      EXPECTED_PACKAGE_SHA256: "${{ inputs.package_sha256 }}",
      EXPECTED_PACKAGE_SOURCE_SHA: "${{ inputs.package_source_sha }}",
      EXPECTED_PACKAGE_VERSION: "${{ inputs.package_version }}",
    });
    expectTextToIncludeAll(identity.run, [
      "source=artifact requires the complete immutable artifact and package identity tuple.",
      '[[ "$ARTIFACT_NAME" == *"-${ARTIFACT_RUN_ID}-${ARTIFACT_RUN_ATTEMPT}" ]]',
      '--arg digest "sha256:${ARTIFACT_DIGEST}"',
      "actions/runs/${ARTIFACT_RUN_ID}/attempts/${ARTIFACT_RUN_ATTEMPT}",
    ]);
    expect(workflowStep(resolvePackage, "Download package artifact input").with).toMatchObject({
      "artifact-ids": "${{ inputs.artifact_id }}",
      "github-token": "${{ github.token }}",
      "run-id": "${{ inputs.artifact_run_id }}",
    });
    const resolveStep = workflowStep(resolvePackage, "Resolve package candidate");
    expect(resolveStep.env).toMatchObject({
      PACKAGE_FILE_NAME: "${{ inputs.package_file_name }}",
      PACKAGE_SHA256: "${{ inputs.package_sha256 }}",
      PACKAGE_SOURCE_SHA: "${{ inputs.package_source_sha }}",
      PACKAGE_VERSION: "${{ inputs.package_version }}",
    });
    expectTextToIncludeAll(resolveStep.run, [
      'artifact_tarball="${artifact_dir}/${PACKAGE_FILE_NAME}"',
      "Selected artifact package SHA-256 differs from package_sha256.",
      "Resolved package identity differs from the declared immutable tuple.",
    ]);

    const packageIntegrity = workflowJob(PACKAGE_ACCEPTANCE_WORKFLOW, "package_integrity");
    expect(
      workflowStep(packageIntegrity, "Setup package validation dependencies").with,
    ).toMatchObject({
      "install-deps": "true",
    });
    expect(
      workflowStep(packageIntegrity, "Download package-under-test artifact").with,
    ).toMatchObject({
      "artifact-ids": "${{ needs.resolve_package.outputs.package_artifact_id }}",
      "github-token": "${{ github.token }}",
      "run-id": "${{ needs.resolve_package.outputs.package_artifact_run_id }}",
    });
  });

  it("lets reusable Docker E2E consume an already resolved package artifact", () => {
    const workflow = readFileSync(LIVE_E2E_WORKFLOW, "utf8");
    const parsedWorkflow = parse(workflow) as {
      jobs?: Record<string, WorkflowJob>;
      on?: { workflow_call?: { inputs?: Record<string, unknown> } };
    };
    const packageJson = readFileSync(PACKAGE_JSON, "utf8");
    const scheduler = readFileSync("scripts/test-docker-all.mts", "utf8");
    const publishedUpgradeSurvivor = readFileSync(UPGRADE_SURVIVOR_RUN_SCRIPT, "utf8");

    expect(workflow).toContain("package_artifact_name:");
    expect(workflow).toContain("package_artifact_digest:");
    expect(workflow).toContain("package_artifact_id:");
    expect(workflow).toContain("package_artifact_run_attempt:");
    expect(workflow).toContain("package_artifact_run_id:");
    expect(workflow).toContain("package_file_name:");
    expect(workflow).toContain("package_source_sha:");
    expect(workflow).toContain("package_sha256:");
    expect(workflow).toContain("package_version:");
    expect(workflow).toContain("published_upgrade_survivor_baseline:");
    expect(workflow).toContain("published_upgrade_survivor_baselines:");
    expect(workflow).toContain("published_upgrade_survivor_scenarios:");
    expect(parsedWorkflow.on?.workflow_call?.inputs).toHaveProperty(
      "allow_frozen_target_scenario_omissions",
    );
    expect(workflow).toContain("docker_e2e_bare_image:");
    expect(workflow).toContain("docker_e2e_functional_image:");
    expect(workflow).toContain("OPENCLAW_DOCKER_E2E_SELECTED_SHA:");
    expect(workflow).toContain(
      "OPENCLAW_UPGRADE_SURVIVOR_BASELINE_SPEC: ${{ needs.validate_selected_ref.outputs.upgrade_baseline }}",
    );
    expect(workflow).toContain(
      "OPENCLAW_UPGRADE_SURVIVOR_BASELINE_SPECS: ${{ matrix.group.published_upgrade_survivor_baselines || needs.validate_selected_ref.outputs.upgrade_baselines }}",
    );
    expect(workflow).toContain(
      "OPENCLAW_UPGRADE_SURVIVOR_SCENARIOS: ${{ inputs.published_upgrade_survivor_scenarios }}",
    );
    expect(workflow).toContain("OPENCLAW_UPGRADE_SURVIVOR_TARGET_ROOT: ${{ github.workspace }}");
    expect(workflow).toContain(
      "OPENCLAW_ALLOW_FROZEN_TARGET_SCENARIO_OMISSIONS: ${{ inputs.allow_frozen_target_scenario_omissions && '1' || '0' }}",
    );
    expect(workflow).toContain("Download current-run OpenAgent Docker E2E package");
    expect(workflow).toContain("Download previous-run OpenAgent Docker E2E package");
    expect(workflow).toContain(
      "needs.validate_selected_ref.outputs.package_artifact_present == 'true'",
    );
    expect(workflow).toContain(
      'bare_image="${PROVIDED_BARE_IMAGE:-ghcr.io/${repository}-docker-e2e-bare:${image_tag}}"',
    );
    expect(workflow).toContain(
      'functional_image="${PROVIDED_FUNCTIONAL_IMAGE:-ghcr.io/${repository}-docker-e2e-functional:${image_tag}}"',
    );
    expect(workflow).toContain("artifact-ids: ${{ inputs.package_artifact_id }}");
    expect(workflow).toContain(
      '[[ "$ARTIFACT_NAME" == *"-${ARTIFACT_RUN_ID}-${ARTIFACT_RUN_ATTEMPT}" ]]',
    );
    expect(workflow).toContain('--arg digest "sha256:${ARTIFACT_DIGEST}"');
    expect(workflow).toContain("actions/runs/${ARTIFACT_RUN_ID}/attempts/${ARTIFACT_RUN_ATTEMPT}");
    expect(workflow).not.toContain("uses: ./.github/actions/docker-e2e-plan");
    expect(workflow).toContain("Checkout trusted release harness");
    expect(workflow).toContain("OPENCLAW_DOCKER_E2E_REPO_ROOT:");
    expect(workflow).toContain("node .release-harness/scripts/test-docker-all.mjs --plan-json");
    expect(workflow).toContain("node .release-harness/scripts/docker-e2e.mjs github-outputs");
    expect(parsedWorkflow.on?.workflow_call?.inputs).toHaveProperty(
      "enable_prepublish_plugin_registry",
    );
    expect(workflow).toContain("Pack prerelease plugin registry artifact");
    expect(workflow).toContain("Validate prerelease plugin registry artifact");
    expect(workflow).toContain("Download targeted prerelease plugin registry artifact");
    expect(workflow).toContain("OPENCLAW_PREPUBLISH_PLUGIN_REGISTRY_DIR");
    expect(workflow).toContain("prepublishPluginRegistryManifestSha256");
    expect(
      workflowStep(
        workflowJob(LIVE_E2E_WORKFLOW, "prepare_docker_e2e_image"),
        "Pack prerelease plugin registry artifact",
      ).id,
    ).toBe("create_prepublish_plugin_registry");
    expect(
      workflowStep(
        workflowJob(LIVE_E2E_WORKFLOW, "prepare_docker_e2e_image"),
        "Validate prerelease plugin registry artifact",
      ).env?.EXPECTED_MANIFEST_SHA256,
    ).toBe(
      "${{ steps.create_prepublish_plugin_registry.outputs.manifest_sha256 || inputs.prepublish_plugin_registry_manifest_sha256 }}",
    );
    expect(
      workflowStep(
        workflowJob(LIVE_E2E_WORKFLOW, "prepare_docker_e2e_image"),
        "Pack prerelease plugin registry artifact",
      ).if,
    ).toBe(
      "steps.plan.outputs.needs_package == '1' && (inputs.prepared_npm_bundle_json != '' || (inputs.enable_prepublish_plugin_registry && steps.plan.outputs.needs_prepublish_plugin_registry == '1')) && inputs.prepublish_plugin_registry_artifact_id == ''",
    );
    expect(
      workflowJob(LIVE_E2E_WORKFLOW, "prepare_docker_e2e_image").outputs
        ?.prepublish_plugin_registry_artifact_id,
    ).toContain("steps.prepublish_plugin_registry.outputs.manifest_sha256 != ''");
    for (const jobId of ["validate_docker_e2e", "validate_docker_lanes"]) {
      const job = workflowJob(LIVE_E2E_WORKFLOW, jobId);
      expect(job.env).toMatchObject({
        OPENCLAW_SELECTED_SHA: "${{ needs.validate_selected_ref.outputs.selected_sha }}",
        OPENCLAW_TOOLING_SHA: "${{ needs.validate_selected_ref.outputs.workflow_sha }}",
      });
      const registrySteps = (job.steps ?? []).filter((step) =>
        /^(Validate|Download) .*prerelease plugin registry/u.test(step.name ?? ""),
      );
      expect(registrySteps).toHaveLength(3);
      for (const step of registrySteps) {
        expect(step.if).toBe(
          "steps.plan.outputs.needs_package == '1' && needs.prepare_docker_e2e_image.outputs.prepublish_plugin_registry_artifact_id != ''",
        );
      }
      expect(registrySteps.at(-1)?.env?.REQUIRED_PACKAGES_JSON).toBe(
        "${{ steps.plan.outputs.required_prepublish_plugin_packages }}",
      );
      const runStep = (job.steps ?? []).find((step) =>
        step.run?.includes("export OPENCLAW_PREPUBLISH_PLUGIN_REGISTRY_DIR="),
      );
      expect(runStep).toBeDefined();
      expect(runStep?.run).toContain("openclaw_resolve_frozen_update_channel_dry_run_mode");
      expect(`${runStep?.run}\n${JSON.stringify(runStep?.env)}`).toContain(
        "steps.plan.outputs.needs_package",
      );
      expect(`${runStep?.run}\n${JSON.stringify(runStep?.env)}`).not.toContain(
        "steps.plan.outputs.needs_prepublish_plugin_registry",
      );
    }
    expect(workflow).toContain("bash .release-harness/scripts/ci-docker-pull-retry.sh");
    const setupHarnessStepName = "Setup trusted release harness";
    const harnessJobCases = [
      {
        jobId: "validate_docker_e2e",
        planStepName: "Plan Docker E2E chunk",
        setupIf: "contains(matrix.profiles, inputs.release_test_profile)",
      },
      {
        jobId: "validate_docker_lanes",
        planStepName: "Plan targeted Docker E2E lanes",
        setupIf: undefined,
      },
      {
        jobId: "validate_docker_openwebui",
        planStepName: "Plan Open WebUI Docker E2E chunk",
        setupIf: undefined,
      },
      {
        jobId: "prepare_docker_e2e_image",
        planStepName: "Plan Docker E2E images",
        setupIf: undefined,
      },
    ] as const;
    const typedHarnessJobIds = Object.entries(parsedWorkflow.jobs ?? {})
      .filter(([, job]) =>
        (job.steps ?? []).some(
          (step) =>
            step.run?.includes("node .release-harness/scripts/test-docker-all.mjs") ||
            step.run?.includes("node .release-harness/scripts/docker-e2e.mjs"),
        ),
      )
      .map(([jobId]) => jobId)
      .toSorted();
    expect(typedHarnessJobIds).toEqual(harnessJobCases.map(({ jobId }) => jobId).toSorted());

    for (const { jobId, planStepName, setupIf } of harnessJobCases) {
      const harnessJob = workflowJob(LIVE_E2E_WORKFLOW, jobId);
      const harnessJobSteps = harnessJob.steps ?? [];
      const harnessJobStepNames = harnessJobSteps.map((step) => step.name);
      const checkoutIndex = harnessJobStepNames.indexOf("Checkout trusted release harness");
      const setupIndex = harnessJobStepNames.indexOf(setupHarnessStepName);
      const typedHarnessIndex = harnessJobSteps.findIndex(
        (step) =>
          step.run?.includes("node .release-harness/scripts/test-docker-all.mjs") ||
          step.run?.includes("node .release-harness/scripts/docker-e2e.mjs"),
      );
      expect(harnessJobStepNames.filter((name) => name === setupHarnessStepName)).toHaveLength(1);
      expect(checkoutIndex).toBeGreaterThan(-1);
      expect(setupIndex).toBeGreaterThan(checkoutIndex);
      expect(typedHarnessIndex).toBeGreaterThan(setupIndex);
      expect(workflowStep(harnessJob, planStepName)).toBeDefined();
      const setupHarnessStep = workflowStep(harnessJob, setupHarnessStepName);
      expect(setupHarnessStep).toMatchObject({
        uses: "./.release-harness/.github/actions/setup-release-harness",
        with: { "node-version": "${{ env.NODE_VERSION }}" },
      });
      expect(setupHarnessStep.if).toBe(setupIf);
    }

    const prepareDockerImage = workflowJob(LIVE_E2E_WORKFLOW, "prepare_docker_e2e_image");
    const prepareDockerImageStepNames = (prepareDockerImage.steps ?? []).map((step) => step.name);
    const planStepName = "Plan Docker E2E images";
    const setupCandidateStepName = "Setup Node environment";
    expect(
      prepareDockerImageStepNames.filter((name) => name === setupCandidateStepName),
    ).toHaveLength(1);
    expect(prepareDockerImageStepNames.indexOf(setupCandidateStepName)).toBeGreaterThan(
      prepareDockerImageStepNames.indexOf(planStepName),
    );
    expect(workflowStep(prepareDockerImage, setupCandidateStepName)).toMatchObject({
      if: "(steps.plan.outputs.needs_package == '1' && steps.package_source.outputs.required == 'true') || (inputs.enable_prepublish_plugin_registry && steps.plan.outputs.needs_prepublish_plugin_registry == '1' && inputs.prepublish_plugin_registry_artifact_id == '')",
      uses: "./.github/actions/setup-node-env",
    });
    expect(workflowStep(prepareDockerImage, planStepName).env).toEqual({
      INCLUDE_OPENWEBUI: "${{ inputs.include_openwebui }}",
      INCLUDE_RELEASE_PATH_SUITES: "${{ inputs.include_release_path_suites }}",
      LANES: "${{ inputs.docker_lanes }}",
      OPENCLAW_UPGRADE_SURVIVOR_BASELINE_SPEC:
        "${{ needs.validate_selected_ref.outputs.upgrade_baseline }}",
      OPENCLAW_UPGRADE_SURVIVOR_BASELINE_SPECS:
        "${{ needs.validate_selected_ref.outputs.upgrade_baselines }}",
      OPENCLAW_UPGRADE_SURVIVOR_SCENARIOS: "${{ inputs.published_upgrade_survivor_scenarios }}",
      PREPARE_ONLY: "${{ inputs.prepare_only }}",
      RELEASE_TEST_PROFILE: "${{ inputs.release_test_profile }}",
    });
    expect(workflow).toContain("plan_docker_lane_groups:");
    const reusable = readWorkflow(LIVE_E2E_WORKFLOW);
    expect(reusable.on?.workflow_dispatch?.inputs).not.toHaveProperty(
      "published_upgrade_survivor_baseline_scope",
    );
    expect(reusable.on?.workflow_call?.inputs).toHaveProperty(
      "published_upgrade_survivor_baseline_scope",
    );
    const groupPlanner = workflowStep(
      workflowJob(LIVE_E2E_WORKFLOW, "plan_docker_lane_groups"),
      "Build targeted Docker lane groups",
    );
    expect(groupPlanner.env).toMatchObject({
      OPENCLAW_UPGRADE_SURVIVOR_BASELINE_SPEC:
        "${{ needs.validate_selected_ref.outputs.upgrade_baseline }}",
      OPENCLAW_UPGRADE_SURVIVOR_BASELINE_SCOPE:
        "${{ needs.validate_selected_ref.outputs.upgrade_baseline_scope }}",
    });
    expect(workflowJob(LIVE_E2E_WORKFLOW, "validate_docker_lanes").strategy?.["max-parallel"]).toBe(
      32,
    );
    expect(workflowJob(PACKAGE_ACCEPTANCE_WORKFLOW, "docker_acceptance").with).toMatchObject({
      published_upgrade_survivor_baseline_scope:
        "${{ needs.resolve_package.outputs.published_upgrade_survivor_baseline_scope }}",
    });
    expect(workflow).toContain("targeted_docker_lane_group_size:");
    expect(workflow).toContain("scripts/plan-targeted-docker-lane-groups.mjs");
    expect(workflow).toContain(
      "OPENCLAW_UPGRADE_SURVIVOR_BASELINE_SPECS: ${{ needs.validate_selected_ref.outputs.upgrade_baselines }}",
    );
    expect(workflow).toContain("Docker E2E targeted lanes (${{ matrix.group.label }})");
    expect(workflow).toContain("LANES: ${{ matrix.group.docker_lanes }}");
    expect(workflow).toContain("GROUP_LABEL: ${{ matrix.group.label }}");
    expect(workflow).toContain("DOCKER_E2E_LANES: ${{ matrix.group.docker_lanes }}");
    expect(workflow).toContain("name: docker-e2e-${{ steps.plan.outputs.artifact_suffix }}");
    expect(scheduler).toContain(
      "published_upgrade_survivor_baseline=${shellQuote(env.OPENCLAW_UPGRADE_SURVIVOR_BASELINE_SPEC)}",
    );
    expect(scheduler).toContain(
      "published_upgrade_survivor_baselines=${shellQuote(env.OPENCLAW_UPGRADE_SURVIVOR_BASELINE_SPECS)}",
    );
    expect(scheduler).toContain(
      '["OPENCLAW_UPGRADE_SURVIVOR_BASELINE_SPEC", baseEnv.OPENCLAW_UPGRADE_SURVIVOR_BASELINE_SPEC]',
    );
    expect(scheduler).toContain('["OPENCLAW_UPGRADE_SURVIVOR_BASELINE_SPECS",');
    expect(scheduler).toContain('["OPENCLAW_UPGRADE_SURVIVOR_SCENARIOS",');
    expect(packageJson).toContain("OPENCLAW_UPGRADE_SURVIVOR_PUBLISHED_BASELINE=1");
    expect(packageJson).toContain("test:docker:update-restart-auth");
    expect(packageJson).toContain("OPENCLAW_UPGRADE_SURVIVOR_UPDATE_RESTART_MODE=auto-auth");
    expect(publishedUpgradeSurvivor).toContain("validate_baseline_package_spec");
    expect(publishedUpgradeSurvivor).toContain("OPENCLAW_UPGRADE_SURVIVOR_UPDATE_RESTART_MODE");
    expect(publishedUpgradeSurvivor).toContain("write_update_restart_service_env");
    expect(publishedUpgradeSurvivor).toContain("GATEWAY_AUTH_TOKEN_REF=%s");
    expect(publishedUpgradeSurvivor).toContain("OPENCLAW_CLAWHUB_URL=%s");
    expect(publishedUpgradeSurvivor).toContain("assert-no-requests");
    expect(publishedUpgradeSurvivor).toContain(
      "env -u OPENCLAW_GATEWAY_TOKEN -u OPENCLAW_GATEWAY_PASSWORD openclaw",
    );
    expect(publishedUpgradeSurvivor).toContain("phase prepare-update-restart-probe");
    expect(publishedUpgradeSurvivor).toContain("openclaw@(alpha|beta|latest|");
    expect(publishedUpgradeSurvivor).toContain("configure_watchos_tls_fixture");
    expect(publishedUpgradeSurvivor).toContain('"publicUrl":"wss://localhost:18789"');
    expect(publishedUpgradeSurvivor).toContain('export NODE_EXTRA_CA_CERTS="$WATCH_TLS_CA_CERT"');
    expect(publishedUpgradeSurvivor).not.toContain(
      "--base-url http://127.0.0.1:18789/api/nodes/watch",
    );
    expect(publishedUpgradeSurvivor).toContain(
      "source scripts/e2e/lib/upgrade-survivor/plugin-dependency-fixtures.sh",
    );
    expect(publishedUpgradeSurvivor).toContain("probe_gateway_endpoint");
    const preDoctorCleanupIndex = publishedUpgradeSurvivor.indexOf(
      "run_plugin_fixture_phase assert-package-local-dependency-cleanup assert_legacy_plugin_dependency_debris_cleaned",
    );
    const doctorIndex = publishedUpgradeSurvivor.indexOf("phase doctor run_doctor");
    const postDoctorCleanupIndex = publishedUpgradeSurvivor.indexOf(
      "run_plugin_fixture_phase assert-legacy-plugin-dependency-debris-cleaned assert_legacy_plugin_dependency_debris_cleaned",
    );
    expect(preDoctorCleanupIndex).toBeGreaterThan(-1);
    expect(doctorIndex).toBeGreaterThan(preDoctorCleanupIndex);
    expect(postDoctorCleanupIndex).toBeGreaterThan(doctorIndex);
    expect(publishedUpgradeSurvivor.indexOf("phase seed-source-only-plugin-shadow")).toBeLessThan(
      publishedUpgradeSurvivor.indexOf("phase assert-baseline"),
    );
    expect(publishedUpgradeSurvivor).toContain('"id": "opik-openclaw"');
    expect(publishedUpgradeSurvivor).toContain('"configSchema": {');
    expect(
      publishedUpgradeSurvivor.indexOf('validate_baseline_package_spec "$baseline_spec"'),
    ).toBeLessThan(
      publishedUpgradeSurvivor.indexOf('npm install -g --prefix "$npm_config_prefix"'),
    );
  });

  it("reuses a content-addressed bare image for prepared E2E images", () => {
    const workflow = readFileSync(LIVE_E2E_WORKFLOW, "utf8");

    expect(workflow).toContain("bare_context_sha=");
    expect(workflow).toContain("-docker-e2e-bare:base-${bare_context_sha:0:32}");
    expect(workflow).toContain('docker manifest inspect "$CACHE_IMAGE_REF"');
    expect(workflow).toContain('cache=(--cache-from "$CACHE_IMAGE_REF")');
    expect(workflow).not.toContain('docker tag "$CACHE_IMAGE_REF" "$IMAGE_REF"');
    expect(workflow).toContain(
      "Shared release candidate preparation requires both Docker image variants.",
    );
    expect(workflow).toContain(
      "inputs.shared_image_artifact_id != '' && '1' || steps.plan.outputs.needs_bare_image",
    );
    expect(workflow).toContain("env DOCKER_BUILDKIT=1 docker build");
    expect(workflow).toContain(
      'if bash .release-harness/scripts/ci-docker-pull-retry.sh "$CACHE_IMAGE_REF"; then',
    );
    expect(workflow).toContain("Bare image cache pull failed; continuing with a cold build.");
    expect(workflow).toContain('--build-context "openclaw_package=$package_context"');
    expect(workflow).toContain('cache=(--cache-from "$BARE_IMAGE_REF")');
    expect(workflow).not.toContain('docker push "$CACHE_IMAGE_REF"');
    expect(workflow).toContain("uses: useblacksmith/setup-docker-builder@");
    expect(workflow).toContain("uses: useblacksmith/build-push-action@");
    expect(workflow).not.toContain("cache-from: type=gha,scope=docker-e2e");
    expect(workflow).not.toContain("cache-to: type=gha,mode=max,scope=docker-e2e");
  });

  it("separates daily live checks from the secretless weekly upgrade survivors", () => {
    const workflow = readWorkflow(SCHEDULED_LIVE_CHECKS_WORKFLOW);
    const daily = workflowJob(SCHEDULED_LIVE_CHECKS_WORKFLOW, "live_and_openwebui_checks");
    const weekly = workflowJob(SCHEDULED_LIVE_CHECKS_WORKFLOW, "weekly_upgrade_survivors");

    expect(workflow.on?.schedule).toEqual([{ cron: "23 4 * * *" }, { cron: "41 6 * * 1" }]);
    expect(daily.if).toBe(
      "github.event_name == 'workflow_dispatch' || github.event.schedule == '23 4 * * *'",
    );
    expect(daily.with).toMatchObject({
      enable_prepublish_plugin_registry: true,
      ref: "${{ github.sha }}",
    });
    expect(weekly.if).toBe(
      "github.event_name == 'schedule' && github.event.schedule == '41 6 * * 1'",
    );
    expect(weekly.permissions).toEqual({
      actions: "read",
      contents: "read",
      packages: "read",
      "pull-requests": "read",
    });
    expect(weekly.with).toMatchObject({
      ref: "${{ github.sha }}",
      include_repo_e2e: false,
      include_release_path_suites: false,
      include_openwebui: false,
      include_live_suites: false,
      allow_unreleased_changelog: true,
      docker_lanes: "update-migration",
      published_upgrade_survivor_baselines: "2026.7.1 2026.8.1",
      published_upgrade_survivor_scenarios: "mobile-pairing-reconnect watchos-direct-node",
      shared_image_artifact_namespace: "scheduled-upgrade-survivors",
      shared_image_policy: "no-push-artifact",
    });
    expect(weekly.secrets).toBeUndefined();
    expect(weekly.with).not.toHaveProperty("docker_e2e_bare_image");
    expect(weekly.with).not.toHaveProperty("docker_e2e_functional_image");
    expect(weekly.with).not.toHaveProperty("allow_frozen_target_scenario_omissions");
  });

  it.each([false, true])(
    "reconstructs packagePublished=%s in the produced candidate request",
    (packagePublished) => {
      const { output, result } = runFullReleaseCandidateRequest(packagePublished);

      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(output.json ?? "{}")).toMatchObject({ packagePublished });
    },
  );

  it.each(["beta", "minimum", "stable", "full"])(
    "accepts every runnable focused live suite for the %s profile",
    (profile) => {
      const suiteIds = new Set(["openshell-e2e", "live-cache", "docker-live-models"]);
      for (const jobName of [
        "validate_live_provider_suites",
        "validate_live_docker_provider_suites",
        "validate_live_media_provider_suites",
      ]) {
        const entries =
          jobName === "validate_live_docker_provider_suites"
            ? createReleaseWorkflowMatrixPlan({ releaseProfile: profile, includeLiveSuites: true })
                .liveDocker.matrix.include
            : workflowJob(LIVE_E2E_WORKFLOW, jobName).strategy?.matrix?.include;
        expect(entries?.length, jobName).toBeGreaterThan(0);
        for (const entry of entries ?? []) {
          if (!entry.profiles?.split(/\s+/u).includes(profile)) {
            continue;
          }
          for (const suiteId of [entry.suite_id, entry.suite_group]) {
            if (suiteId) {
              suiteIds.add(suiteId);
            }
          }
        }
      }

      for (const suiteId of suiteIds) {
        const result = runFocusedLiveSuiteValidation(suiteId, { RELEASE_TEST_PROFILE: profile });
        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toContain(`Focused live suite filter is valid: ${suiteId}`);
      }
    },
  );

  it("accepts the OpenCode Go aggregate for its stable smoke lane", () => {
    const result = runFocusedLiveSuiteValidation("native-live-src-gateway-profiles-opencode-go", {
      RELEASE_TEST_PROFILE: "stable",
    });

    expect(result.status, result.stderr).toBe(0);
  });

  it.each<{ suiteId: string; env?: Record<string, string> }>([
    { suiteId: "native-live-src-gateway-profiles-opencode-go-unknown" },
    { suiteId: "native-live-extensions-media-video-e" },
    { suiteId: "unknown-live-suite" },
    {
      suiteId: "native-live-src-gateway-profiles-opencode-go-kimi",
      env: { RELEASE_TEST_PROFILE: "stable" },
    },
    {
      suiteId: "native-live-extensions-media-video-a",
      env: { RELEASE_TEST_PROFILE: "beta" },
    },
    {
      suiteId: "native-live-src-gateway-profiles-opencode-go-kimi",
      env: { INCLUDE_LIVE_SUITES: "false" },
    },
    {
      suiteId: "native-live-extensions-media-video-a",
      env: { LIVE_MODELS_ONLY: "true" },
    },
    { suiteId: "openshell-e2e", env: { INCLUDE_REPO_E2E: "false" } },
    { suiteId: "docker-live-models", env: { INCLUDE_LIVE_SUITES: "false" } },
  ])("rejects unavailable focused suite $suiteId with $env", ({ suiteId, env }) => {
    const result = runFocusedLiveSuiteValidation(suiteId, env);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `live_suite_filter '${suiteId}' does not match any runnable suite`,
    );
  });

  it("shards broad native live tests instead of one serial live-all job", () => {
    const workflow = readFileSync(LIVE_E2E_WORKFLOW, "utf8");
    const retryHelper = readFileSync("scripts/ci-live-command-retry.sh", "utf8");
    const nativeLiveJob = workflowJob(LIVE_E2E_WORKFLOW, "validate_live_provider_suites");
    const selection = workflowStep(nativeLiveJob, "Select native live suite");

    expect(workflow).not.toContain("suite_id: live-all");
    expect(workflow).not.toContain("command: pnpm test:live\n");
    expect(workflow).toContain("suite_id: native-live-src-agents");
    expect(workflow).toContain("Checkout trusted live shard harness");
    expect(selection.if).toContain("contains(matrix.profiles, inputs.release_test_profile)");
    expect(selection.if).toContain("inputs.live_suite_filter == matrix.suite_id");
    for (const stepName of [
      "Checkout selected ref",
      "Checkout trusted live shard harness",
      "Setup Node environment",
      "Setup trusted release harness",
      "Hydrate live auth/profile inputs",
      "Configure suite-specific env",
      "Run ${{ matrix.label }}",
    ]) {
      expect(workflowStep(nativeLiveJob, stepName).if).toBe(
        "steps.selection.outputs.run == 'true'",
      );
    }
    expect(workflowStep(nativeLiveJob, "Setup trusted release harness")).toMatchObject({
      uses: "./.release-harness/.github/actions/setup-release-harness",
      with: { "node-version": "${{ env.NODE_VERSION }}" },
    });
    expect(
      workflowMatrixEntry(
        LIVE_E2E_WORKFLOW,
        "validate_live_provider_suites",
        "native-live-src-agents",
      ),
    ).toMatchObject({
      command:
        "OPENCLAW_LIVE_OPENAI_COMPACTION=1 OPENCLAW_LIVE_OPENAI_COMPACTION_FULL=0 node .release-harness/scripts/test-live-shard.mjs native-live-src-agents",
      profiles: "stable full",
    });
    expect(workflow).toContain("suite_id: native-live-src-agents-zai-coding");
    expect(workflow).toContain(
      "command: ZAI_CODING_LIVE_TEST=1 node .release-harness/scripts/test-live-shard.mjs native-live-src-agents-zai-coding",
    );
    expect(workflow).toContain("OPENCLAW_LIVE_COMMAND: ${{ matrix.command }}");
    expect(workflow).toContain("live_suite_filter:");
    const admissionSteps = workflowJob(LIVE_E2E_WORKFLOW, "validate_selected_ref").steps ?? [];
    expect(
      admissionSteps.findIndex((step) => step.name === "Validate focused live suite filter"),
    ).toBeLessThan(
      admissionSteps.findIndex((step) => step.name === "Admit frozen source contracts"),
    );
    expect(workflow).toContain("LIVE_SUITE_FILTER: ${{ inputs.live_suite_filter }}");
    expect(workflow).toContain("live-cache attempt ${attempt}/2");
    expect(workflow).toContain(
      "live_suite_filter '${LIVE_SUITE_FILTER}' does not match any runnable suite",
    );
    expect(workflow).toContain(
      "inputs.live_suite_filter == '' || inputs.live_suite_filter == matrix.suite_id",
    );
    expect(workflow).not.toContain("openai-ws-stream-live-e2e");
    expect(workflow).not.toContain("src/agents/openai-ws-stream.e2e.test.ts");
    expect(
      createReleaseWorkflowMatrixPlan({ releaseProfile: "full", includeLiveSuites: true })
        .liveDocker.matrix.include,
    ).toContainEqual(
      expect.objectContaining({ suite_id: "live-gateway-advisory-docker-deepseek-fireworks" }),
    );
    const dockerSuiteIds = createReleaseWorkflowMatrixPlan({
      releaseProfile: "full",
      includeLiveSuites: true,
    }).liveDocker.matrix.include.map((row: { suite_id: string }) => row.suite_id);
    expect(dockerSuiteIds).toEqual(
      expect.arrayContaining([
        "live-gateway-advisory-docker-opencode-openrouter",
        "live-gateway-advisory-docker-xai-zai",
        "live-subagent-announce-docker",
        "live-cli-cache-docker",
      ]),
    );
    const advisoryRows = createReleaseWorkflowMatrixPlan({
      releaseProfile: "full",
      includeLiveSuites: true,
      liveSuiteFilter: "live-gateway-advisory-docker",
    }).liveDocker.matrix.include;
    expect(advisoryRows.map((row: { suite_group?: string }) => row.suite_group)).toEqual(
      Array(3).fill("live-gateway-advisory-docker"),
    );
    for (const providers of ["deepseek,fireworks", "opencode-go,openrouter", "xai,zai"]) {
      expect(
        advisoryRows.some((row: { command: string }) =>
          row.command.includes(`OPENCLAW_LIVE_GATEWAY_PROVIDERS=${providers}`),
        ),
      ).toBe(true);
    }
    expect(workflow).toContain("inputs.live_suite_filter == matrix.suite_group");
    expect(workflow).toContain("OPENCLAW_LIVE_CLI_BACKEND_MODEL=claude-cli/claude-sonnet-4-6");
    expect(workflow).toContain("OPENCLAW_LIVE_CLI_BACKEND_AUTH=api-key");
    expect(workflow).toContain("OPENCLAW_LIVE_CLI_BACKEND_CACHE_PROBE=1");
    expect(workflow).not.toContain("OPENCLAW_LIVE_CLI_BACKEND_USE_CI_SAFE_CODEX_CONFIG=1");
    expect(workflow).not.toContain('service_tier=\\"fast\\"');
    expect(workflow).not.toContain("OPENCLAW_LIVE_CLI_BACKEND_ARGS=");
    expect(workflow).not.toContain("OPENCLAW_LIVE_CLI_BACKEND_RESUME_ARGS=");
    expect(workflow).not.toContain(
      'OPENCLAW_LIVE_CLI_BACKEND_ARGS=["exec","--json","--color","never","--sandbox","danger-full-access","--skip-git-repo-check"]',
    );
    expect(workflow).toContain("bash .release-harness/scripts/ci-live-command-retry.sh");
    expect(workflow).toContain("use_github_hosted_runners:");
    for (const [jobName, runner] of [
      ["validate_special_e2e", "blacksmith-32vcpu-ubuntu-2404"],
      ["validate_live_provider_suites", "blacksmith-8vcpu-ubuntu-2404"],
    ] as const) {
      expect(workflowJob(LIVE_E2E_WORKFLOW, jobName)["runs-on"]).toBe(
        `\${{ inputs.use_github_hosted_runners && 'ubuntu-24.04' || '${runner}' }}`,
      );
    }
    for (const jobName of ["build", "test"]) {
      expect(
        workflowJob(".github/workflows/openclaw-repo-e2e-reusable.yml", jobName)["runs-on"],
      ).toBe(
        "${{ inputs.use_github_hosted_runners && 'ubuntu-24.04' || 'blacksmith-32vcpu-ubuntu-2404' }}",
      );
    }
    expect(workflow).toContain("suite_id: native-live-src-gateway-core");
    expect(workflow).toContain("suite_id: native-live-src-gateway-backends");
    expect(workflow).toContain(
      "command: OPENCLAW_LIVE_CODEX_HARNESS=1 OPENCLAW_LIVE_CODEX_HARNESS_AUTH=api-key node .release-harness/scripts/test-live-shard.mjs native-live-src-gateway-core",
    );
    expect(workflow).toContain(
      "command: OPENCLAW_LIVE_CODEX_HARNESS=1 OPENCLAW_LIVE_CODEX_HARNESS_AUTH=api-key node .release-harness/scripts/test-live-shard.mjs native-live-src-gateway-backends",
    );
    expect(workflow).toContain("suite_id: native-live-src-infra");
    expect(workflow).toContain(
      "command: OPENCLAW_LIVE_APNS_REACHABILITY=1 OPENCLAW_LIVE_SESSION_EVENT_WAKE=1 node .release-harness/scripts/test-live-shard.mjs native-live-src-infra",
    );
    expect(workflow).toContain("suite_id: native-live-src-gateway-profiles-anthropic-smoke");
    expect(workflow).toContain("OPENCLAW_LIVE_GATEWAY_SETUP_TIMEOUT_MS=300000");
    expect(workflow).toContain("suite_id: native-live-src-gateway-profiles-anthropic-opus");
    expect(workflow).toContain("suite_id: native-live-src-gateway-profiles-anthropic-sonnet-haiku");
    expect(workflow).toContain("suite_group: native-live-src-gateway-profiles-anthropic");
    expect(workflow).toContain("OPENCLAW_LIVE_GATEWAY_MODELS=anthropic/claude-opus-5");
    expect(workflow).toContain("anthropic/claude-sonnet-4-6,anthropic/claude-haiku-4-5");
    expect(workflow).toMatch(
      /suite_id: native-live-src-gateway-profiles-fireworks[\s\S]*?advisory: true/u,
    );
    expect(workflow).toMatch(
      /suite_id: native-live-src-gateway-profiles-openai[\s\S]*?timeout_minutes: 60[\s\S]*?profiles: beta minimum stable full/u,
    );
    expect(workflow).toContain(
      "command: OPENCLAW_LIVE_GATEWAY_SETUP_TIMEOUT_MS=300000 OPENCLAW_LIVE_GATEWAY_THINKING=off OPENCLAW_LIVE_GATEWAY_PROVIDERS=openai OPENCLAW_LIVE_GATEWAY_MODELS=openai/gpt-5.6-luna OPENCLAW_LIVE_GATEWAY_STEP_TIMEOUT_MS=180000 OPENCLAW_LIVE_GATEWAY_MODEL_TIMEOUT_MS=600000",
    );
    expect(workflow).toContain(
      "OPENCLAW_LIVE_GATEWAY_MODELS=google/gemini-3.1-pro-preview node .release-harness/scripts/test-live-shard.mjs native-live-src-gateway-profiles",
    );
    expect(workflow).toContain(
      "OPENCLAW_LIVE_GATEWAY_MODELS=minimax/MiniMax-M3,minimax-portal/MiniMax-M3 OPENCLAW_LIVE_GATEWAY_MAX_MODELS=2",
    );
    expect(workflow).toMatch(
      /suite_id: native-live-src-gateway-profiles-fireworks[\s\S]*?timeout_minutes: 30[\s\S]*?advisory: true/u,
    );
    expect(workflow).toContain("suite_id: native-live-src-gateway-profiles-deepseek");
    expect(workflow).toContain("suite_id: native-live-src-gateway-profiles-opencode-go");
    expect(workflow).toContain("suite_id: native-live-src-gateway-profiles-openrouter");
    expect(workflow).toContain("suite_id: native-live-src-gateway-profiles-xai");
    expect(workflow).toContain("suite_id: native-live-src-gateway-profiles-zai");
    expect(workflow).not.toContain("Z.AI API Platform validation is temporarily disabled");
    expect(workflow).not.toContain(
      "OPENCLAW_LIVE_GATEWAY_PROVIDERS=deepseek,opencode-go,openrouter,xai,zai",
    );
    const dockerRows = ["stable", "full"].flatMap(
      (releaseProfile) =>
        createReleaseWorkflowMatrixPlan({ releaseProfile, includeLiveSuites: true }).liveDocker
          .matrix.include,
    );
    const dockerCommands = dockerRows.map((row: { command: string }) => row.command).join("\n");
    expect(dockerRows).toContainEqual(
      expect.objectContaining({ suite_id: "live-gateway-anthropic-docker" }),
    );
    expect(workflow).toContain("OPENCLAW_LIVE_GATEWAY_MAX_MODELS=2");
    expect(dockerCommands).toContain(
      "OPENCLAW_LIVE_GATEWAY_THINKING=off OPENCLAW_LIVE_GATEWAY_PROVIDERS=openai OPENCLAW_LIVE_GATEWAY_MODELS=openai/gpt-5.6-luna OPENCLAW_LIVE_GATEWAY_MAX_MODELS=1 OPENCLAW_LIVE_GATEWAY_STEP_TIMEOUT_MS=90000 OPENCLAW_LIVE_GATEWAY_MODEL_TIMEOUT_MS=600000",
    );
    expect(dockerCommands).toContain(
      "OPENCLAW_LIVE_GATEWAY_MODELS=anthropic/claude-sonnet-4-6,anthropic/claude-haiku-4-5 OPENCLAW_LIVE_GATEWAY_MAX_MODELS=2",
    );
    expect(workflow).toContain("OPENCLAW_LIVE_GATEWAY_MODEL_TIMEOUT_MS=600000");
    expect(workflow).toContain("timeout --foreground --kill-after=30s 35m");
    expect(dockerRows).toContainEqual(
      expect.objectContaining({ suite_id: "live-gateway-docker", timeout_minutes: 40 }),
    );
    expect(workflow).toContain("suite_id: native-live-extensions-a-k");
    expect(workflow).toContain("suite_id: native-live-extensions-l-n");
    expect(workflow).toContain("suite_id: native-live-extensions-moonshot");
    expect(workflow).toMatch(/suite_id: native-live-extensions-moonshot[\s\S]*?advisory: true/u);
    expect(workflow).toContain("OPENCLAW_LIVE_SUITE_ADVISORY: ${{ matrix.advisory }}");
    expect(workflow).toContain("Advisory live suite failed with exit code");
    expect(workflow).toMatch(
      /validate_live_media_provider_suites:[\s\S]*?OPENCLAW_LIVE_SUITE_ADVISORY: \$\{\{ matrix\.advisory \}\}[\s\S]*?shell: bash[\s\S]*?Advisory live suite failed with exit code/u,
    );
    expect(dockerRows).toContainEqual(
      expect.objectContaining({
        suite_id: "live-gateway-advisory-docker-deepseek-fireworks",
        advisory: true,
      }),
    );
    expect(workflow).toMatch(
      /validate_live_media_provider_suites:[\s\S]*?OPENCLAW_LIVE_SUITE_ADVISORY: \$\{\{ matrix\.advisory \}\}/u,
    );
    expect(workflow).toMatch(
      /suite_id: native-live-extensions-media-video-d[\s\S]*?timeout_minutes: 30[\s\S]*?advisory: true/u,
    );
    expect(workflow).toContain("suite_id: native-live-extensions-openai");
    expect(workflow).toContain("suite_id: native-live-extensions-o-z-other");
    expect(workflow).toContain("validate_live_media_provider_suites:");
    expect(workflow).toMatch(
      /validate_live_media_provider_suites:[\s\S]*?runs-on: \$\{\{ inputs\.use_github_hosted_runners && 'ubuntu-24\.04' \|\| 'blacksmith-8vcpu-ubuntu-2404' \}\}/u,
    );
    expect(workflow).toContain(`image: ${LIVE_MEDIA_RUNNER_IMAGE}`);
    expect(workflow).toContain("ffmpeg -version | head -1");
    expect(workflow).toContain("ffprobe -version | head -1");
    const imageDockerfile = readFileSync(LIVE_MEDIA_RUNNER_DOCKERFILE, "utf8");
    const imageWorkflow = readFileSync(LIVE_MEDIA_RUNNER_IMAGE_WORKFLOW, "utf8");
    const buildJob = workflowJob(LIVE_MEDIA_RUNNER_IMAGE_WORKFLOW, "build");
    const buildStep = workflowStep(buildJob, "Build and push live media runner image");
    expect(imageDockerfile).toMatch(/^FROM ubuntu:24\.04$/m);
    expect(imageDockerfile).toContain("apt-get install -y --no-install-recommends");
    for (const packageName of ["bash", "curl", "ffmpeg", "git", "openssh-client", "zstd"]) {
      expect(imageDockerfile).toContain(`    ${packageName} \\`);
    }
    expect(imageDockerfile).toContain("rm -rf /var/lib/apt/lists/*");
    expect(imageWorkflow).toContain(`- "${LIVE_MEDIA_RUNNER_DOCKERFILE}"`);
    expect(buildStep.with?.context).toBe(".github/images/live-media-runner");
    expect(buildStep.with?.file).toBe(LIVE_MEDIA_RUNNER_DOCKERFILE);
    expect(buildStep.with?.tags).toContain(LIVE_MEDIA_RUNNER_IMAGE);
    expect(workflow).toContain("suite_id: native-live-extensions-media-audio");
    expect(workflow).toContain("suite_id: native-live-extensions-media-music-google");
    expect(workflow).toContain("suite_id: native-live-extensions-media-music-minimax");
    expect(workflow).toContain("suite_id: native-live-extensions-media-video");
    expect(workflow).toContain("suite_group: native-live-extensions-media-video");
    expect(workflow).toContain("OPENCLAW_LIVE_VIDEO_GENERATION_PROVIDERS=google,minimax");
    expect(workflow).toContain("OPENCLAW_LIVE_VIDEO_GENERATION_PROVIDERS=openai,openrouter,xai");
    expect(workflow).toContain(
      "inputs.live_suite_filter == 'native-live-src-gateway-profiles-anthropic'",
    );
    expect(workflow).toContain(
      "inputs.live_suite_filter == 'native-live-src-gateway-profiles-opencode-go'",
    );
    expect(workflow).toContain("inputs.live_suite_filter == 'native-live-extensions-media-video'");
    expect(workflow).not.toContain("needs_ffmpeg: true");
    expect(retryHelper).toContain("OPENCLAW_LIVE_COMMAND_ATTEMPTS:-2");
    expect(retryHelper).toContain("ECONNRESET");
    expect(retryHelper).toContain("fetch failed");
    expect(retryHelper).toContain("gateway request timeout");
    expect(retryHelper).toContain("model idle timeout");
    expect(retryHelper).toContain("OPENCLAW_LIVE_COMMAND_RATE_LIMIT_RETRY_DELAY_SECONDS:-60");
    expect(retryHelper).toContain("Rate limit reached");
    expect(retryHelper).toContain("tokens per min");
    expect(
      workflow.match(/moonshot\) require_any Moonshot MOONSHOT_API_KEY KIMI_API_KEY ;;/gu),
    ).toHaveLength(2);
  });

  it("pins DeepSeek live profiles to both current V4 model refs", () => {
    const deepSeek = workflowMatrixEntry(
      LIVE_E2E_WORKFLOW,
      "validate_live_provider_suites",
      "native-live-src-gateway-profiles-deepseek",
    );
    const openCodeGo = workflowMatrixEntry(
      LIVE_E2E_WORKFLOW,
      "validate_live_provider_suites",
      "native-live-src-gateway-profiles-opencode-go-deepseek-glm",
    );

    expect(deepSeek).toMatchObject({
      advisory: true,
      command:
        "OPENCLAW_LIVE_GATEWAY_PROVIDERS=deepseek OPENCLAW_LIVE_GATEWAY_MODELS=deepseek/deepseek-v4-flash,deepseek/deepseek-v4-pro node .release-harness/scripts/test-live-shard.mjs native-live-src-gateway-profiles",
      profiles: "full",
    });
    expect(openCodeGo.command).toContain(
      "OPENCLAW_LIVE_GATEWAY_MODELS=opencode-go/deepseek-v4-flash,opencode-go/deepseek-v4-pro",
    );
  });

  it("pins OpenCode Go MiMo live profiles to both current V2.5 model refs", () => {
    const mimo = workflowMatrixEntry(
      LIVE_E2E_WORKFLOW,
      "validate_live_provider_suites",
      "native-live-src-gateway-profiles-opencode-go-mimo",
    );

    expect(mimo).toMatchObject({
      advisory: true,
      command:
        "OPENCLAW_LIVE_GATEWAY_PROVIDERS=opencode-go OPENCLAW_LIVE_GATEWAY_MODELS=opencode-go/mimo-v2.5,opencode-go/mimo-v2.5-pro node .release-harness/scripts/test-live-shard.mjs native-live-src-gateway-profiles",
      profiles: "full",
      suite_group: "native-live-src-gateway-profiles-opencode-go",
    });
    expect(mimo.command).not.toContain("opencode-go/mimo-v2-omni");
    expect(mimo.command).not.toContain("opencode-go/mimo-v2-pro");
  });

  it("runs the fresh OpenAI API-key default without hard-coding a model filter", () => {
    const openaiDefault = workflowMatrixEntry(
      LIVE_E2E_WORKFLOW,
      "validate_live_provider_suites",
      "native-live-src-gateway-profiles-openai-api-default",
    );

    expect(openaiDefault).toMatchObject({ profiles: "stable full" });
    expect(openaiDefault.command).toContain("OPENCLAW_LIVE_GATEWAY_OPENAI_API_DEFAULT=1");
    expect(openaiDefault.command).toContain("OPENCLAW_LIVE_GATEWAY_PROVIDERS=openai");
    expect(openaiDefault.command).not.toContain("OPENCLAW_LIVE_GATEWAY_MODELS=");
  });

  it("retains the full OpenAI Ultra model coverage independently of the fresh default", () => {
    const ultra = workflowMatrixEntry(
      LIVE_E2E_WORKFLOW,
      "validate_live_provider_suites",
      "native-live-src-gateway-profiles-openai-gpt56-ultra",
    );
    expect(ultra).toMatchObject({
      profiles: "stable full",
      timeout_minutes: 75,
      profile_env_only: false,
      command:
        "OPENCLAW_LIVE_GATEWAY_THINKING=ultra OPENCLAW_LIVE_GATEWAY_PROVIDERS=openai OPENCLAW_LIVE_GATEWAY_MODELS=openai/gpt-5.6-sol,openai/gpt-5.6-terra,openai/gpt-5.6-luna OPENCLAW_LIVE_GATEWAY_STEP_TIMEOUT_MS=300000 OPENCLAW_LIVE_GATEWAY_MODEL_TIMEOUT_MS=900000 node .release-harness/scripts/test-live-shard.mjs native-live-src-gateway-profiles",
    });
  });

  it("runs Docker live harnesses from trusted helper scripts", () => {
    const workflow = readFileSync(LIVE_E2E_WORKFLOW, "utf8");
    const providerSuites = workflowJob(LIVE_E2E_WORKFLOW, "validate_live_docker_provider_suites");
    const scenarios = readFileSync("scripts/lib/docker-e2e-scenarios.mts", "utf8");
    const harness = readFileSync("scripts/test-live-codex-harness-docker.sh", "utf8");
    const codexLiveTest = readFileSync("src/gateway/gateway-codex-harness.live.test.ts", "utf8");
    const liveDockerAuth = readFileSync("scripts/lib/live-docker-auth.sh", "utf8");
    const sharedLiveScripts = [
      readFileSync("scripts/test-live-models-docker.sh", "utf8"),
      readFileSync("scripts/test-live-gateway-models-docker.sh", "utf8"),
      readFileSync("scripts/test-live-cli-backend-docker.sh", "utf8"),
      readFileSync("scripts/test-live-acp-bind-docker.sh", "utf8"),
      readFileSync("scripts/test-live-subagent-announce-docker.sh", "utf8"),
    ];
    const build = readFileSync("scripts/test-live-build-docker.sh", "utf8");
    const stage = readFileSync("scripts/lib/live-docker-stage.sh", "utf8");
    const dockerRows = createReleaseWorkflowMatrixPlan({
      releaseProfile: "full",
      includeLiveSuites: true,
    }).liveDocker.matrix.include;
    const commands = dockerRows.map((row: { command: string }) => row.command).join("\n");

    expect(workflow).toContain(
      'run: OPENCLAW_LIVE_DOCKER_REPO_ROOT="$GITHUB_WORKSPACE" timeout --foreground --kill-after=30s 35m bash .release-harness/scripts/test-live-models-docker.sh',
    );
    expect(commands).toContain(
      "OPENCLAW_LIVE_GATEWAY_THINKING=off OPENCLAW_LIVE_GATEWAY_PROVIDERS=openai OPENCLAW_LIVE_GATEWAY_MODELS=openai/gpt-5.6-luna OPENCLAW_LIVE_GATEWAY_MAX_MODELS=1",
    );
    expect(commands).toContain(
      "OPENCLAW_LIVE_GATEWAY_PROVIDERS=minimax,minimax-portal OPENCLAW_LIVE_GATEWAY_MODELS=minimax/MiniMax-M3,minimax-portal/MiniMax-M3 OPENCLAW_LIVE_GATEWAY_MAX_MODELS=2",
    );
    expect(commands).toContain(
      'OPENCLAW_LIVE_DOCKER_REPO_ROOT="$GITHUB_WORKSPACE" timeout --foreground --kill-after=30s 45m bash .release-harness/scripts/test-live-cli-backend-docker.sh',
    );
    expect(commands).toContain(
      'OPENCLAW_LIVE_DOCKER_REPO_ROOT="$GITHUB_WORKSPACE" timeout --foreground --kill-after=30s 45m bash .release-harness/scripts/test-live-acp-bind-docker.sh',
    );
    expect(commands).toContain(
      'OPENCLAW_LIVE_DOCKER_REPO_ROOT="$GITHUB_WORKSPACE" timeout --foreground --kill-after=30s 35m bash .release-harness/scripts/test-live-codex-harness-docker.sh',
    );
    const codexCompatibility = workflowStep(
      providerSuites,
      "Resolve frozen Codex live compatibility",
    );
    expect(codexCompatibility).toMatchObject({
      id: "codex_compat",
      env: {
        OPENCLAW_FROZEN_CODEX_SUITE_ID: "${{ matrix.suite_id }}",
        OPENCLAW_FROZEN_TARGET_ROOT: "${{ github.workspace }}",
        OPENCLAW_SELECTED_SHA: "${{ needs.validate_selected_ref.outputs.selected_sha }}",
        OPENCLAW_WORKFLOW_SHA: "${{ needs.validate_selected_ref.outputs.workflow_sha }}",
      },
      run: "node .release-harness/scripts/resolve-frozen-codex-live-suite.mjs",
    });
    for (const stepName of [
      "Validate live-test image artifact binding",
      "Download live-test image artifact",
      "Verify and load live-test image artifact",
      "Setup Node environment",
      "Hydrate live auth/profile inputs",
      "Log in to GHCR",
      "Configure suite-specific env",
    ]) {
      expect(workflowStep(providerSuites, stepName).if, stepName).toContain(
        "steps.codex_compat.outputs.run_lane != 'false'",
      );
    }
    const runCodexSuite = providerSuites.steps?.find((candidate) =>
      candidate.name?.startsWith("Run ${{ matrix.label }}"),
    );
    expect(runCodexSuite?.if).toContain("steps.codex_compat.outputs.run_lane != 'false'");
    for (const [model, thinking] of [
      ["sol", "ultra"],
      ["terra", "ultra"],
      ["luna", "max"],
    ]) {
      expect(commands).toContain(
        `OPENCLAW_LIVE_CODEX_HARNESS_TARGETS=openai/gpt-5.6-${model}=${thinking}`,
      );
    }
    expect(workflow.match(/live-codex-harness\*-docker\)/gu)).toHaveLength(2);
    for (const suiteId of [
      "native-live-src-gateway-profiles-openai-api-default",
      "native-live-src-gateway-profiles-openai-gpt56-ultra",
    ]) {
      expect(workflow).toContain(`add_profile_suite ${suiteId} "stable full"`);
    }
    expect(codexLiveTest).toContain("command: `/model ${modelKey} --runtime codex`");
    expect(codexLiveTest).toContain("thinkingLevel: CODEX_HARNESS_THINKING");
    expect(commands).toContain(
      'OPENCLAW_LIVE_DOCKER_REPO_ROOT="$GITHUB_WORKSPACE" timeout --foreground --kill-after=30s 20m bash .release-harness/scripts/test-live-subagent-announce-docker.sh',
    );
    expect(scenarios).toContain("function liveDockerScriptCommand");
    expect(scenarios).toContain("const LIVE_DOCKER_DEFAULT_HARNESS_DIR");
    expect(scenarios).toContain("fileURLToPath(import.meta.url)");
    expect(scenarios).toContain('? ".release-harness"');
    expect(scenarios).toContain("process.env.OPENCLAW_DOCKER_E2E_REPO_ROOT");
    expect(scenarios).toContain(
      'harness="\\${OPENCLAW_DOCKER_E2E_TRUSTED_HARNESS_DIR:-${LIVE_DOCKER_DEFAULT_HARNESS_DIR}}"',
    );
    expect(scenarios).not.toContain("harness=.release-harness");
    expect(scenarios).toMatch(/liveDockerScriptCommand\(\s*"test-live-models-docker\.sh"/u);
    expect(scenarios).toMatch(/liveDockerScriptCommand\(\s*"test-live-gateway-models-docker\.sh"/u);
    expect(scenarios).toMatch(/liveDockerScriptCommand\(\s*"test-live-cli-backend-docker\.sh"/u);
    expect(scenarios).toMatch(/liveDockerScriptCommand\(\s*"test-live-acp-bind-docker\.sh"/u);
    expect(scenarios).toMatch(/liveDockerScriptCommand\(\s*"test-live-codex-harness-docker\.sh"/u);
    expect(scenarios).toMatch(
      /liveDockerScriptCommand\(\s*"e2e\/codex-npm-plugin-live-docker\.sh"/u,
    );
    expect(scenarios).toMatch(
      /liveDockerScriptCommand\(\s*"test-live-subagent-announce-docker\.sh"/u,
    );
    expect(liveDockerAuth).toContain("codex-cli | openai)");
    expect(liveDockerAuth).toContain("openclaw_live_init_docker_run_args()");
    expect(liveDockerAuth).toContain("openclaw_live_stage_profile_into_home()");
    expect(liveDockerAuth).toContain("openclaw_live_chown_bind_dirs_for_container_user()");
    expect(liveDockerAuth).toContain("openclaw_live_uses_managed_bind_dirs()");
    expect(liveDockerAuth).toContain('openclaw_live_truthy "${OPENCLAW_TESTBOX:-}"');
    expect(liveDockerAuth).toContain('[[ -n "${OPENCLAW_DOCKER_CACHE_HOME_DIR:-}" ]]');
    expect(liveDockerAuth).toContain(
      'timeout_value="${2:-${OPENCLAW_LIVE_DOCKER_RUN_TIMEOUT:-2700s}}"',
    );
    expect(harness).toContain('source "$TRUSTED_HARNESS_DIR/scripts/lib/live-docker-auth.sh"');
    expect(harness).not.toContain('source "$ROOT_DIR/scripts/lib/live-docker-auth.sh"');
    expect(harness).toContain(
      'OPENCLAW_LIVE_DOCKER_REPO_ROOT="$ROOT_DIR" "$TRUSTED_HARNESS_DIR/scripts/test-live-build-docker.sh"',
    );
    expect(harness).toContain(
      '-e OPENCLAW_LIVE_DOCKER_SCRIPTS_DIR="${DOCKER_TRUSTED_HARNESS_CONTAINER_DIR}/scripts"',
    );
    expect(harness).toContain('node --import tsx "$trusted_scripts_dir/prepare-codex-ci-auth.ts"');
    expect(harness).toContain('source "$trusted_scripts_dir/lib/live-docker-stage.sh"');
    for (const script of [harness, ...sharedLiveScripts]) {
      expect(script).toContain('source "$TRUSTED_HARNESS_DIR/scripts/lib/live-docker-auth.sh"');
      expect(script).not.toContain('source "$ROOT_DIR/scripts/lib/live-docker-auth.sh"');
      expect(script).toContain("openclaw_live_init_docker_run_args DOCKER_RUN_ARGS");
      expect(script).toContain("DOCKER_RUN_ARGS+=(--rm -t \\");
      expect(script).not.toContain("DOCKER_RUN_ARGS=(docker run --rm -t \\");
    }
    expect(liveDockerAuth).toContain("openclaw_live_prepare_bind_dir_for_container_user");
    for (const script of sharedLiveScripts) {
      expect(script).toContain("openclaw_live_uses_managed_bind_dirs");
      expect(script).toContain(
        'OPENCLAW_LIVE_DOCKER_REPO_ROOT="$ROOT_DIR" "$TRUSTED_HARNESS_DIR/scripts/test-live-build-docker.sh"',
      );
      expect(script).toContain('source "$trusted_scripts_dir/lib/live-docker-stage.sh"');
      expect(script).toContain(
        '-e OPENCLAW_LIVE_DOCKER_SCRIPTS_DIR="${DOCKER_TRUSTED_HARNESS_CONTAINER_DIR}/scripts"',
      );
      expect(script).toContain(
        "openclaw_live_append_array DOCKER_RUN_ARGS DOCKER_TRUSTED_HARNESS_MOUNT",
      );
    }
    for (const [file, helper] of [
      ["scripts/test-live-cli-backend-docker.sh", "openclaw_live_prepare_cli_backend"],
      ["scripts/test-live-acp-bind-docker.sh", "openclaw_live_run_setup_command"],
      ["scripts/test-live-codex-harness-docker.sh", "openclaw_live_run_setup_command"],
    ] as const) {
      const script = readFileSync(file, "utf8");
      expect(script).toContain(helper);
      expect(script).not.toContain('timeout --kill-after=30s "${OPENCLAW_LIVE_');
    }
    expect(stage).toContain("elif command -v gtimeout >/dev/null 2>&1; then");
    expect(stage).toContain('if "$timeout_bin" --kill-after=1s 1s true');
    expect(stage).toContain('"$timeout_bin" --kill-after=30s "${timeout_seconds}s" "$@"');
    expect(stage).toContain(
      'echo "timeout command not found; cannot bound ${label} after ${timeout_seconds}s"',
    );
    expect(readFileSync("scripts/test-live-models-docker.sh", "utf8")).toContain(
      "OPENCLAW_LIVE_MODELS_DOCKER_RUN_TIMEOUT:-2100s",
    );
    expect(readFileSync("scripts/test-live-gateway-models-docker.sh", "utf8")).toContain(
      "OPENCLAW_LIVE_GATEWAY_DOCKER_RUN_TIMEOUT:-2100s",
    );
    expect(readFileSync("scripts/test-live-cli-backend-docker.sh", "utf8")).toContain(
      "OPENCLAW_LIVE_CLI_BACKEND_DOCKER_RUN_TIMEOUT:-2700s",
    );
    expect(readFileSync("scripts/test-live-cli-backend-docker.sh", "utf8")).toContain(
      'CLI_SETUP_TIMEOUT_SECONDS="$(openclaw_live_read_positive_int_env OPENCLAW_LIVE_CLI_BACKEND_SETUP_TIMEOUT_SECONDS 180)"',
    );
    expect(readFileSync("scripts/test-live-cli-backend-docker.sh", "utf8")).toContain(
      '"$docker_package" "$OPENCLAW_LIVE_CLI_BACKEND_SETUP_TIMEOUT_SECONDS"',
    );
    expect(stage).toContain('"live CLI backend setup"');
    expect(readFileSync("scripts/test-live-acp-bind-docker.sh", "utf8")).toContain(
      "OPENCLAW_LIVE_ACP_BIND_DOCKER_RUN_TIMEOUT:-2700s",
    );
    expect(readFileSync("scripts/test-live-acp-bind-docker.sh", "utf8")).toContain(
      'ACP_SETUP_TIMEOUT_SECONDS="$(openclaw_live_read_positive_int_env OPENCLAW_LIVE_ACP_BIND_SETUP_TIMEOUT_SECONDS 180)"',
    );
    expect(readFileSync("scripts/test-live-acp-bind-docker.sh", "utf8")).toContain(
      '"${OPENCLAW_LIVE_ACP_BIND_SETUP_TIMEOUT_SECONDS:?missing live ACP bind setup timeout seconds}"',
    );
    expect(readFileSync("scripts/test-live-acp-bind-docker.sh", "utf8")).toContain(
      '-e OPENCLAW_LIVE_ACP_BIND_SETUP_TIMEOUT_SECONDS="$ACP_SETUP_TIMEOUT_SECONDS"',
    );
    expect(readFileSync("scripts/test-live-acp-bind-docker.sh", "utf8")).toContain(
      '-e OPENCLAW_LIVE_ACP_BIND_REQUIRE_CRON="${OPENCLAW_LIVE_ACP_BIND_REQUIRE_CRON:-}"',
    );
    expect(readFileSync("scripts/test-live-acp-bind-docker.sh", "utf8")).toContain(
      '"live ACP bind setup"',
    );
    const acpBindScript = readFileSync("scripts/test-live-acp-bind-docker.sh", "utf8");
    expect(acpBindScript).toContain(
      "OPENCLAW_LIVE_ACP_BIND_CLAUDE_AUTH must be one of: auto, api-key, subscription.",
    );
    expect(acpBindScript).toContain(
      'if [[ "$ACP_AGENT" == "claude" && "$CLAUDE_AUTH_MODE" == "subscription" ]]; then',
    );
    expect(acpBindScript).toContain(
      "unset ANTHROPIC_API_KEY ANTHROPIC_API_KEY_OLD ANTHROPIC_API_TOKEN",
    );
    expect(acpBindScript).toContain('-e CLAUDE_CODE_OAUTH_TOKEN="${CLAUDE_CODE_OAUTH_TOKEN:-}"');
    expect(acpBindScript).not.toContain("    -e ANTHROPIC_API_KEY \\\n");
    expect(workflow.match(/OPENCLAW_LIVE_ACP_BIND_CLAUDE_AUTH=subscription/g)).toHaveLength(2);
    expect(workflow.match(/OPENCLAW_LIVE_ACP_BIND_CLAUDE_AUTH=api-key/g)).toHaveLength(2);
    expect(readFileSync("scripts/test-live-acp-bind-docker.sh", "utf8")).toContain(
      "run_setup_command bash -lc 'curl -fsSL https://app.factory.ai/cli | sh'",
    );
    expect(readFileSync("scripts/test-live-codex-harness-docker.sh", "utf8")).toContain(
      "OPENCLAW_LIVE_CODEX_HARNESS_DOCKER_RUN_TIMEOUT:-$((2100 * CODEX_HARNESS_TARGET_COUNT))s",
    );
    expect(readFileSync("scripts/test-live-codex-harness-docker.sh", "utf8")).toContain(
      'CODEX_HARNESS_SETUP_TIMEOUT_SECONDS="$(openclaw_live_read_positive_int_env OPENCLAW_LIVE_CODEX_HARNESS_SETUP_TIMEOUT_SECONDS 180)"',
    );
    expect(readFileSync("scripts/test-live-codex-harness-docker.sh", "utf8")).toContain(
      '"${OPENCLAW_LIVE_CODEX_HARNESS_SETUP_TIMEOUT_SECONDS:?missing live Codex harness setup timeout seconds}"',
    );
    expect(readFileSync("scripts/test-live-codex-harness-docker.sh", "utf8")).toContain(
      '-e OPENCLAW_LIVE_CODEX_HARNESS_SETUP_TIMEOUT_SECONDS="$CODEX_HARNESS_SETUP_TIMEOUT_SECONDS"',
    );
    expect(readFileSync("scripts/test-live-codex-harness-docker.sh", "utf8")).toContain(
      '"live Codex harness setup"',
    );
    expect(readFileSync("scripts/test-live-codex-harness-docker.sh", "utf8")).toContain(
      'run_setup_command npm install -g "$OPENCLAW_LIVE_CODEX_CLI_PACKAGE_SPEC"',
    );
    expect(readFileSync("scripts/test-live-subagent-announce-docker.sh", "utf8")).toContain(
      "OPENCLAW_LIVE_SUBAGENT_DOCKER_RUN_TIMEOUT:-1200s",
    );
    expect(build).toContain('ROOT_DIR="${OPENCLAW_LIVE_DOCKER_REPO_ROOT:-$SCRIPT_ROOT_DIR}"');
    expect(build).toContain('source "$SCRIPT_ROOT_DIR/scripts/lib/docker-build.sh"');
    expect(build).toContain('source "$SCRIPT_ROOT_DIR/scripts/lib/docker-e2e-container.sh"');
    expect(build).toContain(
      'DOCKER_COMMAND_TIMEOUT="${DOCKER_COMMAND_TIMEOUT:-${OPENCLAW_LIVE_DOCKER_PULL_TIMEOUT:-600s}}"',
    );
    expect(build).toContain('LIVE_IMAGE_PULL_ATTEMPTS="${OPENCLAW_LIVE_DOCKER_PULL_ATTEMPTS:-3}"');
    expect(build).toContain('docker_e2e_docker_cmd pull "$LIVE_IMAGE_NAME"');
    expect(build).not.toContain('docker pull "$LIVE_IMAGE_NAME"');
    expect(stage).toContain(
      'local scripts_dir="${OPENCLAW_LIVE_DOCKER_SCRIPTS_DIR:-/src/scripts}"',
    );
    expect(stage).toContain('node --import tsx "$scripts_dir/live-docker-normalize-config.ts"');
  });

  it("fails Droid ACP Docker live proof when Factory auth is missing", () => {
    const script = readFileSync("scripts/test-live-acp-bind-docker.sh", "utf8");

    expect(script).toContain("openclaw_live_acp_bind_load_factory_api_key_from_profile");
    expect(script).not.toContain('source "$PROFILE_FILE"');
    expect(script.indexOf("openclaw_live_acp_bind_load_factory_api_key_from_profile")).toBeLessThan(
      script.indexOf('if [[ "$ACP_AGENT" == "droid" && -z "${FACTORY_API_KEY:-}" ]]; then'),
    );
    expect(script).toContain(
      "ERROR: Droid Docker ACP bind requires FACTORY_API_KEY; Factory OAuth/keyring auth in ~/.factory is not portable into the container.",
    );
    expect(script).not.toContain(
      "SKIP: Droid Docker ACP bind requires FACTORY_API_KEY; Factory OAuth/keyring auth in ~/.factory is not portable into the container.",
    );
    expect(script).not.toMatch(
      /Droid Docker ACP bind requires FACTORY_API_KEY[\s\S]{0,160}(exit 0|continue)/u,
    );
  });

  it("finalizes dispatched Testbox delegation even when setup or the remote command fails", () => {
    const workflow = readFileSync(CI_CHECK_TESTBOX_WORKFLOW, "utf8");
    const checkTestboxJob = workflowJob(CI_CHECK_TESTBOX_WORKFLOW, "check");
    const setupNodeStep = workflowStep(checkTestboxJob, "Setup Node environment");
    const runTestboxStep = workflowStep(checkTestboxJob, "Run Testbox");
    const closeTestboxSshStep = workflowStep(checkTestboxJob, "Close Testbox SSH sessions");
    const setupNodeWith = setupNodeStep.with ?? {};
    const checkTestboxSteps = checkTestboxJob.steps ?? [];
    const runArmTestboxStep = workflowStep(
      workflowJob(CI_CHECK_ARM_TESTBOX_WORKFLOW, "check-arm"),
      "Run Testbox",
    );
    const runBuildArtifactsTestboxStep = workflowStep(
      workflowJob(CI_BUILD_ARTIFACTS_TESTBOX_WORKFLOW, "build-artifacts"),
      "Run Testbox",
    );
    const windowsTestboxJob = workflowJob(WINDOWS_BLACKSMITH_TESTBOX_WORKFLOW, "windows");
    const runWindowsTestboxStep = workflowStep(windowsTestboxJob, "Run Testbox");
    const windowsTestboxActionMarker = workflowStep(windowsTestboxJob, "Testbox action marker");

    expect(workflow).not.toContain('PNPM_CONFIG_STORE_DIR: "/tmp/openclaw-pnpm-store"');
    expect(workflow).not.toContain("PNPM_CONFIG_MODULES_DIR");
    expect(workflow).not.toContain("PNPM_CONFIG_VIRTUAL_STORE_DIR");
    expect(setupNodeWith).not.toHaveProperty("dependency-cache");
    expect(setupNodeWith).not.toHaveProperty("sticky-disk");
    expect(setupNodeWith["cache-mode"]).toBe("restore");
    expect(checkTestboxJob["timeout-minutes"]).toBe(
      "${{ fromJSON(inputs.timeout_minutes || '120') }}",
    );
    for (const step of [runTestboxStep, runArmTestboxStep, runBuildArtifactsTestboxStep]) {
      expect(step.uses).toBe(RUN_TESTBOX_WITH_FAILURE_REPORTING);
    }
    expect(windowsTestboxActionMarker.uses).toBe(
      "useblacksmith/run-testbox@3f60ff9ceb2c10c3feefa87dc0c6490cffae059d",
    );
    expect(windowsTestboxActionMarker.if).toBe("${{ false }}");
    expect(runTestboxStep.if).toBe("github.event_name == 'workflow_dispatch' && always()");
    expect(closeTestboxSshStep.if).toBe("github.event_name == 'workflow_dispatch' && always()");
    expect(closeTestboxSshStep.run).toContain(
      `sudo sshd -T 2>/dev/null | awk '$1 == "port" { print $2; exit }'`,
    );
    expect(closeTestboxSshStep.run).toContain(
      'ss -K state established \\\n  "( sport = :${runner_ssh_local_port} )"',
    );
    expect(checkTestboxSteps.indexOf(closeTestboxSshStep)).toBe(
      checkTestboxSteps.indexOf(runTestboxStep) + 1,
    );
    expect(runArmTestboxStep.if).toBe("always()");
    expect(runBuildArtifactsTestboxStep.if).toBe(
      "github.event_name == 'workflow_dispatch' && always()",
    );
    expect(runWindowsTestboxStep.if).toBe("always()");
    expect(runWindowsTestboxStep.env?.JOB_STATUS).toBe("${{ job.status }}");
    expect(runWindowsTestboxStep.env?.NATIVE_SSH_USER).toBe(
      "${{ steps.prepare_windows.outputs.ssh_user }}",
    );
    expect(runWindowsTestboxStep.run).toContain("${NATIVE_SSH_USER}@${runner_host}");
    expect(runTestboxStep["continue-on-error"]).toBeUndefined();
  });

  it("allows the Telegram lane to run from reusable package acceptance artifacts", () => {
    const workflow = readFileSync(NPM_TELEGRAM_WORKFLOW, "utf8");

    expect(workflow).toContain("workflow_call:");
    expect(workflow).toContain("package_artifact_name:");
    expect(workflow).toContain("Download package-under-test artifact");
    expect(workflow).toContain("harness_ref:");
    expect(workflow).toContain("ref: ${{ inputs.harness_ref || github.sha }}");
    expect(workflow).toContain("OPENCLAW_NPM_TELEGRAM_PACKAGE_TGZ");
    expect(workflow).toContain("provider_mode:");
    expect(workflow).toContain("provider_mode must be mock-openai or live-frontier");
    expect(workflow).toContain("run_package_telegram_e2e:");
  });

  it("forwards optional RTT scenario selection from manual and reusable Telegram inputs", () => {
    const workflow = readWorkflow(NPM_TELEGRAM_WORKFLOW);
    const expectedInput = {
      default: "",
      description: "Optional Telegram QA scenario id for repeated RTT sampling",
      required: false,
      type: "string",
    };

    expect(workflow.on?.workflow_dispatch?.inputs?.rtt_scenario).toEqual(expectedInput);
    expect(workflow.on?.workflow_call?.inputs?.rtt_scenario).toEqual(expectedInput);
    expect(
      workflowStep(
        workflowJob(NPM_TELEGRAM_WORKFLOW, "run_package_telegram_e2e"),
        "Run package Telegram E2E",
      ).env?.OPENCLAW_NPM_TELEGRAM_RTT_CHECKS,
    ).toBe("${{ inputs.rtt_scenario }}");
  });

  it("requires explicit approval for historical package destructive actions", () => {
    const workflow = readWorkflow(NPM_TELEGRAM_WORKFLOW);
    const expectedInput = {
      default: false,
      description:
        "Allow destructive actions for intentional historical downgrade or recovery proof",
      required: false,
      type: "boolean",
    };

    expect(workflow.on?.workflow_dispatch?.inputs?.allow_older_binary_destructive_actions).toEqual(
      expectedInput,
    );
    expect(workflow.on?.workflow_call?.inputs?.allow_older_binary_destructive_actions).toEqual(
      expectedInput,
    );
    expect(
      workflowStep(
        workflowJob(NPM_TELEGRAM_WORKFLOW, "run_package_telegram_e2e"),
        "Run package Telegram E2E",
      ).env?.OPENCLAW_ALLOW_OLDER_BINARY_DESTRUCTIVE_ACTIONS,
    ).toBe("${{ inputs.allow_older_binary_destructive_actions && '1' || '' }}");
  });

  it("prefers fresh Claude OAuth credentials for direct Anthropic live provider lanes", () => {
    const hydrateScript = readFileSync(CI_HYDRATE_LIVE_AUTH_SCRIPT, "utf8");

    expect(hydrateScript).toContain("  ANTHROPIC_OAUTH_TOKEN \\");
    expect(hydrateScript).toContain("access_token=\"$(jq -r '.claudeAiOauth.accessToken // empty'");
    expect(hydrateScript).toContain('export ANTHROPIC_OAUTH_TOKEN="$access_token"');
    expect(hydrateScript).toContain('local min_remaining_ms="$(( 90 * 60 * 1000 ))"');
    expect(hydrateScript).toContain(
      'printf \'ANTHROPIC_OAUTH_TOKEN=%s\\n\' "$access_token" >>"$GITHUB_ENV"',
    );
    for (const jobName of [
      "validate_live_models_docker",
      "validate_live_models_docker_targeted",
      "validate_live_provider_suites",
    ]) {
      expect(workflowJob(LIVE_E2E_WORKFLOW, jobName).env?.ANTHROPIC_OAUTH_TOKEN).toBe(
        "${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}",
      );
    }
  });

  it("requires QA live evidence artifacts when lanes run", () => {
    const cases = [
      ["run_mock_parity", "Upload parity artifacts", "always()"],
      [
        "run_live_runtime_token_efficiency",
        "Upload live runtime token-efficiency artifacts",
        "always() && steps.run_lane.outputs.output_dir != ''",
      ],
      ["run_live_matrix", "Upload Matrix QA artifacts", "always()"],
      ["run_live_buzz", "Upload Buzz QA artifacts", "always()"],
      ["run_live_telegram", "Upload Telegram QA artifacts", "always()"],
      ["run_live_discord", "Upload Discord QA artifacts", "always()"],
      ["run_live_whatsapp", "Upload WhatsApp QA artifacts", "always()"],
      ["run_live_slack", "Upload Slack QA artifacts", "always()"],
    ] as const;

    for (const [jobName, stepName, uploadCondition] of cases) {
      const uploadStep = workflowStep(workflowJob(QA_LIVE_TRANSPORTS_WORKFLOW, jobName), stepName);

      expect(uploadStep.if, jobName).toBe(uploadCondition);
      expect(uploadStep.with?.["if-no-files-found"], jobName).toBe("error");
    }
  });

  it("preserves the primary runtime token-efficiency failure", () => {
    const job = workflowJob(QA_LIVE_TRANSPORTS_WORKFLOW, "run_live_runtime_token_efficiency");
    const runStep = workflowStep(job, "Run live core runtime-pair lane");
    const reportStep = workflowStep(job, "Generate live runtime token-efficiency report");

    expect(runStep.run).toContain('mkdir -p "${output_dir}"');
    expect(runStep.run).toContain(
      "printf 'Runtime token-efficiency lane started.\\n' > \"${output_dir}/runtime-lane-started.txt\"",
    );
    expect(reportStep.if).toBe("steps.run_lane.outcome == 'success'");
  });

  it("runs the core gateway restart pair on its pinned live model", () => {
    const job = workflowJob(QA_LIVE_TRANSPORTS_WORKFLOW, "run_live_runtime_token_efficiency");
    const credentialStep = workflowStep(job, "Validate required QA credential env");
    const runStep = workflowStep(job, "Run pinned GPT-5.4 gateway restart runtime pair");
    const stepNames = job.steps?.map((step) => step.name) ?? [];

    expect(credentialStep.run).toContain('if [[ -z "${OPENAI_API_KEY:-}" ]]');
    expect(credentialStep.run).toContain("exit 1");
    expect(runStep.run).toContain("--provider-mode live-frontier");
    expect(runStep.run).toContain("--scenario gateway-restart-multi-live");
    expect(runStep.run).toContain("--model openai/gpt-5.4");
    expect(runStep.run).toContain("--alt-model openai/gpt-5.4");
    expect(runStep.run).toContain("--runtime-pair openclaw,codex");
    expect(runStep.run).toContain(
      "steps.run_lane.outputs.output_dir }}/gateway-restart-gpt-5.4-runtime-pair",
    );
    expect(runStep.run).not.toContain("--allow-failures");
    expect(stepNames.indexOf("Run pinned GPT-5.4 gateway restart runtime pair")).toBeLessThan(
      stepNames.indexOf("Generate live runtime token-efficiency report"),
    );
  });

  it("requires live proof evidence artifacts when proof jobs run", () => {
    const cases = [
      {
        workflowPath: MANTIS_DISCORD_SMOKE_WORKFLOW,
        jobName: "run_discord_smoke",
        stepName: "Upload Mantis artifacts",
      },
      {
        workflowPath: MANTIS_DISCORD_STATUS_REACTIONS_WORKFLOW,
        jobName: "run_status_reactions",
        stepName: "Upload Mantis status reaction artifacts",
      },
      {
        workflowPath: MANTIS_DISCORD_THREAD_ATTACHMENT_WORKFLOW,
        jobName: "run_thread_attachment",
        stepName: "Upload Mantis thread attachment artifacts",
      },
      {
        workflowPath: MANTIS_SLACK_DESKTOP_SMOKE_WORKFLOW,
        jobName: "run_slack_desktop",
        stepName: "Upload Mantis Slack desktop artifacts",
      },
      {
        workflowPath: MANTIS_WEB_UI_CHAT_PROOF_WORKFLOW,
        jobName: "run_web_ui_chat",
        stepName: "Upload Mantis web UI chat artifacts",
      },
      {
        workflowPath: NPM_TELEGRAM_WORKFLOW,
        jobName: "run_package_telegram_e2e",
        stepName: "Upload npm Telegram E2E artifacts",
      },
    ];

    for (const item of cases) {
      const label = `${item.workflowPath} ${item.jobName}`;
      const uploadStep = workflowStep(workflowJob(item.workflowPath, item.jobName), item.stepName);

      expect(uploadStep.if, label).toContain("always()");
      expect(uploadStep.uses, label).toBe(UPLOAD_ARTIFACT_V7);
      expect(uploadStep.with?.["if-no-files-found"], label).toBe("error");
    }
  });

  it("pins Mantis worktree ownership and candidate dependency installation", () => {
    const cases = [
      [MANTIS_DISCORD_STATUS_REACTIONS_WORKFLOW, "run_status_reactions", 2],
      [MANTIS_DISCORD_THREAD_ATTACHMENT_WORKFLOW, "run_thread_attachment", 2],
      [MANTIS_SLACK_DESKTOP_SMOKE_WORKFLOW, "run_slack_desktop", 1],
      [MANTIS_WEB_UI_CHAT_PROOF_WORKFLOW, "run_web_ui_chat", 1],
    ] as const;
    const owner = 'python3 -I -S "$CI_GIT_OWNER"';
    let worktrees = 0;

    for (const [workflowPath, jobName, count] of cases) {
      const job = workflowJob(workflowPath, jobName);
      const initialSteps = [
        "Checkout harness ref",
        ...(jobName === "run_web_ui_chat" ? ["Allocate invocation evidence directory"] : []),
        "Prepare Git owner",
        "Setup Node environment",
      ];
      expect(
        job.steps?.slice(0, initialSteps.length).map(({ name }) => name),
        workflowPath,
      ).toEqual(initialSteps);
      expect(job.steps?.filter(({ name }) => name === "Prepare Git owner")).toEqual([
        {
          name: "Prepare Git owner",
          uses: "openclaw/openclaw/.github/actions/git-owner@dd4528b6393e7d00063067a080ca7241b48ce475",
        },
      ]);
      const prepare =
        workflowStep(
          job,
          count === 2 ? "Prepare baseline and candidate worktrees" : "Prepare candidate worktree",
        ).run ?? "";
      const calls = prepare
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.includes(" worktree add "));
      expect(calls, workflowPath).toEqual([
        ...(count === 2
          ? [
              `${owner} --checkout-git 0 worktree add --detach "$worktree_root/baseline" "$${jobName === "run_status_reactions" ? "BASELINE_SHA" : "CANDIDATE_SHA"}"`,
            ]
          : []),
        `${owner} --checkout-git 0 worktree add --detach "$worktree_root/candidate" "$CANDIDATE_SHA"`,
      ]);
      worktrees += calls.length;
      expect(prepare.startsWith("set -euo pipefail\n")).toBe(true);
      if (count === 2) {
        expect(prepare).toContain('pnpm --dir "$lane_dir" install --frozen-lockfile');
        expect(prepare).toContain('pnpm --dir "$lane_dir" build');
      } else {
        expect(prepare).toContain(
          'pnpm --dir "$worktree_root/candidate" install --frozen-lockfile --prefer-offline',
        );
        expect(prepare.includes('pnpm --dir "$worktree_root/candidate" build')).toBe(
          jobName === "run_slack_desktop",
        );
      }
    }
    expect(worktrees).toBe(6);
    for (const workflowPath of workflowPaths().filter((file) => file.includes("/mantis-"))) {
      expect(readFileSync(workflowPath, "utf8"), workflowPath).not.toMatch(
        /\btimeout\b[^\n]*\bgit\b|\bgit\s+(?:-C\s+\S+\s+)?(?:clone|fetch|worktree\s+add)\b/u,
      );
    }
  });

  it.each([
    {
      workflowPath: MANTIS_DISCORD_STATUS_REACTIONS_WORKFLOW,
      jobName: "run_status_reactions",
      candidateStep: "Prepare baseline and candidate worktrees",
    },
    {
      workflowPath: MANTIS_DISCORD_THREAD_ATTACHMENT_WORKFLOW,
      jobName: "run_thread_attachment",
      candidateStep: "Prepare baseline and candidate worktrees",
    },
    {
      workflowPath: MANTIS_SLACK_DESKTOP_SMOKE_WORKFLOW,
      jobName: "run_slack_desktop",
      candidateStep: "Prepare candidate worktree",
    },
    {
      workflowPath: MANTIS_TELEGRAM_BOT_E2E_PROOF_WORKFLOW,
      jobName: "run_telegram_proof",
      candidateStep: "Build exact candidate without credentials or network",
    },
  ])(
    "sets up plugin-owned Crabbox before candidate execution in $jobName",
    ({ workflowPath, jobName, candidateStep }) => {
      const workflow = readWorkflow(workflowPath);
      const job = workflowJob(workflowPath, jobName);
      const telegram = jobName === "run_telegram_proof";
      const checkout = workflowStep(
        job,
        telegram ? "Checkout trusted harness" : "Checkout harness ref",
      );
      const tooling = workflowStep(
        job,
        telegram ? "Setup trusted tooling" : "Setup Node environment",
      );
      const install = workflowStep(
        job,
        telegram ? "Install Crabbox for disposable candidate lifecycle" : "Install Crabbox CLI",
      );
      const steps = job.steps ?? [];

      expect(checkout.with?.["persist-credentials"]).toBe(false);
      expect(tooling.uses).toBe("./.github/actions/setup-node-env");
      expect(String(tooling.with?.["install-deps"] ?? true)).toBe("true");
      expect(steps.indexOf(tooling)).toBeGreaterThan(steps.indexOf(checkout));
      expect(steps.indexOf(install)).toBeGreaterThan(steps.indexOf(tooling));
      expect(steps.indexOf(install)).toBeLessThan(steps.indexOf(workflowStep(job, candidateStep)));
      expect(install.run).toBe("node scripts/crabbox-setup.mjs");
      expect(install.env).toEqual({
        OPENCLAW_STATE_DIR: "${{ runner.temp }}/openclaw-crabbox-setup",
      });
      expect(job.env?.OPENCLAW_STATE_DIR).toBeUndefined();
      expect(workflow.env?.OPENCLAW_STATE_DIR).toBeUndefined();
      expect(install.if).toBe(
        telegram ? "${{ inputs.scenario == 'telegram-bot-e2e-proof' }}" : undefined,
      );
      if (telegram) {
        expect(checkout.with?.ref).toBe("${{ github.workflow_sha }}");
      }
    },
  );

  it("maps every supported Slack approval checkpoint scenario family", () => {
    const workflow = readFileSync(MANTIS_SLACK_DESKTOP_SMOKE_WORKFLOW, "utf8");

    expectTextToIncludeAll(workflow, [
      'endswith("-exec-native")',
      'endswith("-plugin-native")',
      'startswith("slack-codex-")',
      'expected_result="Slack approval checkpoint passes for $scenario_label"',
    ]);
  });

  it("fails Docker E2E release lanes when summary artifacts are missing", () => {
    const cases = [
      {
        jobName: "validate_docker_e2e",
        summaryStep: "Summarize Docker E2E chunk",
        uploadStep: "Upload Docker E2E chunk artifacts",
      },
      {
        jobName: "validate_docker_lanes",
        summaryStep: "Summarize targeted Docker E2E lanes",
        uploadStep: "Upload targeted Docker E2E artifacts",
      },
      {
        jobName: "validate_docker_openwebui",
        summaryStep: "Summarize Open WebUI Docker E2E chunk",
        uploadStep: "Upload Open WebUI Docker E2E artifacts",
      },
    ];

    for (const item of cases) {
      const job = workflowJob(LIVE_E2E_WORKFLOW, item.jobName);
      const summaryStep = workflowStep(job, item.summaryStep);
      const uploadStep = workflowStep(job, item.uploadStep);

      expect(summaryStep.run, item.jobName).toContain("summary missing:");
      expect(summaryStep.run, item.jobName).toContain("exit 1");
      expect(uploadStep.with?.["if-no-files-found"], item.jobName).toBe("error");
    }
  });

  it("isolates Open WebUI release coverage with lean runtime setup", () => {
    const job = workflowJob(LIVE_E2E_WORKFLOW, "validate_docker_openwebui");
    const setupNode = workflowStep(job, "Setup Node environment");

    expect(job.if).toBe(
      "(!inputs.prepare_only) && inputs.include_openwebui && inputs.docker_lanes == '' && (inputs.release_test_profile == 'stable' || inputs.release_test_profile == 'full')",
    );
    expect(job.env?.OPENCLAW_DOCKER_ALL_RELEASE_PROFILE).toBe("${{ inputs.release_test_profile }}");
    expect(setupNode.with).toMatchObject({
      "cache-mode": "off",
      "install-bun": "false",
      "install-deps": "false",
    });
  });

  it("names package acceptance Telegram as artifact-backed package validation", () => {
    const workflow = readFileSync(PACKAGE_ACCEPTANCE_WORKFLOW, "utf8");

    expect(workflow).toContain("package_telegram:");
    expect(workflow).toContain("docker_acceptance_registry,");
    expect(workflow).toContain("PACKAGE_TELEGRAM_RESULT:");
    expect(workflow).toContain("package_telegram=${PACKAGE_TELEGRAM_RESULT}");
    expect(workflow).not.toContain("npm_telegram:");
  });

  it.each([
    {
      expectedOutput: undefined,
      expectedStatus: 0,
      name: "accepts Telegram result success when enabled=true",
      params: { telegramEnabled: true, telegramResult: "success" },
    },
    {
      expectedOutput: undefined,
      expectedStatus: 0,
      name: "accepts Telegram result skipped when enabled=false",
      params: { telegramEnabled: false, telegramResult: "skipped" },
    },
    {
      expectedOutput: "::error::package_telegram ended with skipped",
      expectedStatus: 1,
      name: "rejects a skipped Telegram lane when package acceptance enabled it",
      params: { telegramEnabled: true, telegramResult: "skipped" },
    },
    {
      expectedOutput: "::error::No Docker acceptance transport ran",
      expectedStatus: 1,
      name: "rejects package acceptance when no Docker transport ran",
      params: {
        dockerArtifactResult: "skipped",
        dockerRegistryResult: "skipped",
        telegramEnabled: false,
        telegramResult: "skipped",
      },
    },
    {
      expectedOutput: "::error::npm_12_install_sh ended with failure",
      expectedStatus: 1,
      name: "rejects a failed npm 12 installer acceptance lane",
      params: {
        npm12InstallResult: "failure",
        telegramEnabled: false,
        telegramResult: "skipped",
      },
    },
    {
      expectedOutput: undefined,
      expectedStatus: 0,
      name: "accepts Telegram-only profile when broad lanes skip and Telegram succeeds",
      params: {
        dockerArtifactResult: "skipped",
        dockerRegistryResult: "skipped",
        npm12InstallResult: "skipped",
        suiteProfile: "telegram",
        telegramEnabled: true,
        telegramResult: "success",
      },
    },
    {
      expectedOutput: "::error::npm_12_install_sh ran for suite_profile=telegram",
      expectedStatus: 1,
      name: "rejects Telegram-only profile when npm 12 acceptance runs",
      params: {
        dockerArtifactResult: "skipped",
        dockerRegistryResult: "skipped",
        suiteProfile: "telegram",
        telegramEnabled: true,
        telegramResult: "success",
      },
    },
    {
      expectedOutput: "::error::Docker acceptance ran for suite_profile=telegram",
      expectedStatus: 1,
      name: "rejects Telegram-only profile when a Docker transport runs",
      params: {
        dockerRegistryResult: "skipped",
        npm12InstallResult: "skipped",
        suiteProfile: "telegram",
        telegramEnabled: true,
        telegramResult: "success",
      },
    },
    {
      expectedOutput:
        "::warning::package_telegram ended with skipped; package acceptance is advisory for this caller.",
      expectedStatus: 0,
      name: "preserves advisory handling for an unexpectedly skipped Telegram lane",
      params: { advisory: true, telegramEnabled: true, telegramResult: "skipped" },
    },
  ] as const)("$name", ({ expectedOutput, expectedStatus, params }) => {
    const result = runPackageAcceptanceSummary(params);

    expect(result.status).toBe(expectedStatus);
    if (expectedOutput) {
      expect(result.stdout).toContain(expectedOutput);
    } else {
      expect(result.stderr).toBe("");
    }
  });

  it("allows release callers to make only Telegram package acceptance advisory", () => {
    const telegramResult = runPackageAcceptanceSummary({
      telegramAdvisory: true,
      telegramEnabled: true,
      telegramResult: "failure",
    });
    const dockerResult = runPackageAcceptanceSummary({
      dockerArtifactResult: "failure",
      telegramAdvisory: true,
      telegramEnabled: true,
      telegramResult: "success",
    });

    expect(telegramResult.status).toBe(0);
    expect(telegramResult.stdout).toContain(
      "::warning::package_telegram ended with failure; package acceptance is advisory for this caller.",
    );
    expect(dockerResult.status).toBe(1);
    expect(dockerResult.stdout).toContain("::error::docker_acceptance ended with failure");
  });

  it.each(["failure", "skipped"] as const)(
    "reports a package Telegram %s even when no suite report exists",
    (outcome) => {
      const report = workflowStep(
        workflowJob(NPM_TELEGRAM_WORKFLOW, "run_package_telegram_e2e"),
        "Summarize Telegram attempt",
      );
      expect(report.if).toBe("always()");
      const workdir = tempDirs.make("npm-telegram-attempt-summary-");
      const summary = resolve(workdir, "summary.md");
      const result = spawnSync("bash", ["-c", report.run ?? ""], {
        cwd: workdir,
        encoding: "utf8",
        env: {
          PATH: process.env.PATH,
          ADVISORY: "true",
          GITHUB_STEP_SUMMARY: summary,
          LANE_OUTCOME: outcome,
        },
      });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain(`::warning::Package Telegram attempt: ${outcome}`);
      expect(readFileSync(summary, "utf8")).toContain(`Telegram attempt: ${outcome}`);
      expect(readFileSync(summary, "utf8")).not.toContain("passed");
    },
  );

  it("lets npm Telegram consume current-run or release-run package artifacts", () => {
    const job = workflowJob(NPM_TELEGRAM_WORKFLOW, "run_package_telegram_e2e");
    const currentRunDownload = workflowStep(job, "Download package-under-test artifact");
    const releaseRunDownload = workflowStep(
      job,
      "Download package-under-test artifact from release run",
    );
    const validateStep = workflowStep(job, "Validate inputs and secrets");
    const identityStep = workflowStep(job, "Validate package artifact identity");
    const runStep = workflowStep(job, "Run package Telegram E2E");

    expect(currentRunDownload).toEqual({
      if: "inputs.package_artifact_name != '' && inputs.package_artifact_run_id == github.run_id",
      name: "Download package-under-test artifact",
      uses: DOWNLOAD_ARTIFACT_V8,
      with: {
        "artifact-ids": "${{ inputs.package_artifact_id }}",
        "github-token": "${{ github.token }}",
        path: ".artifacts/telegram-package-under-test",
        "run-id": "${{ inputs.package_artifact_run_id }}",
      },
    });
    expect(releaseRunDownload).toEqual({
      if: "inputs.package_artifact_name != '' && inputs.package_artifact_run_id != github.run_id",
      name: "Download package-under-test artifact from release run",
      uses: DOWNLOAD_ARTIFACT_V8,
      with: {
        "artifact-ids": "${{ inputs.package_artifact_id }}",
        "github-token": "${{ github.token }}",
        path: ".artifacts/telegram-package-under-test",
        "run-id": "${{ inputs.package_artifact_run_id }}",
      },
    });
    expectTextToIncludeAll(validateStep.run, [
      'if [[ -z "${PACKAGE_ARTIFACT_NAME// }" ]]; then',
      "Artifact-backed Telegram E2E requires all artifact identity fields or none.",
      "package_spec must be openclaw@alpha",
      "Artifact-backed Telegram E2E requires the complete immutable artifact and package identity tuple.",
    ]);
    expect(identityStep.env).toMatchObject({
      ARTIFACT_DIGEST: "${{ inputs.package_artifact_digest }}",
      ARTIFACT_ID: "${{ inputs.package_artifact_id }}",
      ARTIFACT_NAME: "${{ inputs.package_artifact_name }}",
      ARTIFACT_RUN_ATTEMPT: "${{ inputs.package_artifact_run_attempt }}",
      ARTIFACT_RUN_ID: "${{ inputs.package_artifact_run_id }}",
    });
    expectTextToIncludeAll(identityStep.run, [
      "actions/artifacts/${ARTIFACT_ID}",
      '--arg digest "sha256:${ARTIFACT_DIGEST}"',
      "actions/runs/${ARTIFACT_RUN_ID}/attempts/${ARTIFACT_RUN_ATTEMPT}",
      'if [[ "$ARTIFACT_RUN_ID" == "$GITHUB_RUN_ID" ]]',
      '.status == "pending" or .status == "queued" or .status == "requested" or .status == "waiting" or .status == "in_progress"',
      ".conclusion == null",
      "Package Telegram artifact predates the active producer run attempt.",
      '.status == "completed"',
      '.conclusion == "success"',
      "artifact_created_at <= attempt_started_at",
      "artifact_created_at > attempt_completed_at",
      "Package Telegram artifact creation time is outside the declared producer run attempt.",
      "Package Telegram artifact producer run attempt does not match the requested tuple.",
    ]);
    expect(runStep.env).toMatchObject({
      PACKAGE_FILE_NAME: "${{ inputs.package_file_name || '' }}",
      PACKAGE_SHA256: "${{ inputs.package_sha256 || '' }}",
      PACKAGE_SOURCE_SHA: "${{ inputs.package_source_sha || '' }}",
      PACKAGE_VERSION: "${{ inputs.package_version || '' }}",
    });
    expectTextToIncludeAll(runStep.run, [
      'declared_package_tgz="${package_dir}/${PACKAGE_FILE_NAME}"',
      'manifest="${package_dir}/preflight-manifest.json"',
      'candidate_manifest="${package_dir}/package-candidate.json"',
      'find "${package_dir}" -type f -name "*.tgz"',
      "package artifact manifest contains duplicate package metadata",
      "Array.isArray(manifest.corePackageTarballs)",
      "manifest.corePackageTarballs === undefined",
      "package artifact tarball set does not match preflight manifest",
      "package candidate manifest does not match the OpenAgent tarball",
      "Package Telegram artifact SHA-256 differs from package_sha256.",
      "package candidate digest mismatch",
      "Package Telegram artifact tarball differs from package_file_name.",
      "Package Telegram artifact source SHA/version differs from the declared identity.",
      'export OPENCLAW_NPM_TELEGRAM_PACKAGE_DIR="${package_dir}"',
      'export OPENCLAW_NPM_TELEGRAM_PACKAGE_TGZ="${package_tgz}"',
    ]);
  });

  it("accepts immutable artifacts produced earlier in the active workflow attempt", () => {
    const result = runNpmTelegramArtifactValidation({
      currentRunId: "123",
      producerConclusion: null,
      producerRunId: "123",
      producerStatus: "in_progress",
    });

    expect(result.status, result.stderr).toBe(0);
  });

  it("accepts active artifacts while GitHub still reports the workflow as queued", () => {
    const result = runNpmTelegramArtifactValidation({
      currentRunId: "123",
      producerConclusion: null,
      producerRunId: "123",
      producerStatus: "queued",
    });

    expect(result.status, result.stderr).toBe(0);
  });

  it("accepts active artifacts while GitHub still reports the workflow as pending", () => {
    const result = runNpmTelegramArtifactValidation({
      currentRunId: "123",
      producerConclusion: null,
      producerRunId: "123",
      producerStatus: "pending",
    });

    expect(result.status, result.stderr).toBe(0);
  });

  it("rejects queued artifacts after GitHub assigns a conclusion", () => {
    const result = runNpmTelegramArtifactValidation({
      currentRunId: "123",
      producerConclusion: "success",
      producerRunId: "123",
      producerStatus: "queued",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Current-run Package Telegram artifact is not from the active workflow attempt.",
    );
  });

  it("keeps completed external producer attempts success-gated", () => {
    const result = runNpmTelegramArtifactValidation({
      currentRunId: "456",
      producerConclusion: "success",
      producerRunId: "123",
      producerStatus: "completed",
    });

    expect(result.status, result.stderr).toBe(0);
  });

  it("rejects partial npm Telegram artifact identity instead of falling back to npm", () => {
    const result = runNpmTelegramInputValidation({
      PACKAGE_ARTIFACT_ID: "123",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Artifact-backed Telegram E2E requires all artifact identity fields or none.",
    );
  });

  it("accepts direct package artifacts and validates an optional registry tuple", () => {
    const packageTuple = {
      PACKAGE_ARTIFACT_DIGEST: "a".repeat(64),
      PACKAGE_ARTIFACT_ID: "123",
      PACKAGE_ARTIFACT_NAME: "package-under-test",
      PACKAGE_ARTIFACT_RUN_ATTEMPT: "2",
      PACKAGE_ARTIFACT_RUN_ID: "456",
      PACKAGE_FILE_NAME: "openclaw-2026.8.1.tgz",
      PACKAGE_SHA256: "b".repeat(64),
      PACKAGE_SOURCE_SHA: "c".repeat(40),
      PACKAGE_VERSION: "2026.8.1",
    };
    const registryTuple = {
      PREPUBLISH_PLUGIN_REGISTRY_ARTIFACT_DIGEST: "d".repeat(64),
      PREPUBLISH_PLUGIN_REGISTRY_ARTIFACT_ID: "789",
      PREPUBLISH_PLUGIN_REGISTRY_ARTIFACT_NAME: "docker-e2e-prepublish-plugin-registry-123-1",
      PREPUBLISH_PLUGIN_REGISTRY_ARTIFACT_RUN_ATTEMPT: "1",
      PREPUBLISH_PLUGIN_REGISTRY_ARTIFACT_RUN_ID: "123",
      PREPUBLISH_PLUGIN_REGISTRY_MANIFEST_SHA256: "e".repeat(64),
    };

    expect(runNpmTelegramInputValidation(packageTuple).status).toBe(0);
    expect(runNpmTelegramInputValidation({ ...packageTuple, ...registryTuple }).status).toBe(0);
    expect(
      runNpmTelegramInputValidation({
        ...packageTuple,
        ...registryTuple,
        PREPUBLISH_PLUGIN_REGISTRY_ARTIFACT_NAME:
          "package-acceptance-telegram-plugin-registry-123-1",
      }).status,
    ).toBe(0);

    const partial = runNpmTelegramInputValidation({
      ...packageTuple,
      PREPUBLISH_PLUGIN_REGISTRY_ARTIFACT_ID: "789",
    });
    expect(partial.status).toBe(1);
    expect(partial.stderr).toContain(
      "Artifact-backed Telegram E2E requires the complete prerelease plugin registry tuple.",
    );

    const wrongName = runNpmTelegramInputValidation({
      ...packageTuple,
      ...registryTuple,
      PREPUBLISH_PLUGIN_REGISTRY_ARTIFACT_NAME: "wrong-name",
    });
    expect(wrongName.status).toBe(1);
    expect(wrongName.stderr).toContain(
      "Prerelease plugin registry artifact name does not match its producer run.",
    );
  });

  it("rejects prerelease plugin registry inputs without a package artifact", () => {
    const result = runNpmTelegramInputValidation({
      PREPUBLISH_PLUGIN_REGISTRY_ARTIFACT_ID: "789",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Prerelease plugin registry inputs require an artifact-backed OpenAgent package.",
    );
  });

  it("documents checked extended-stable dispatch instead of a raw-SHA workflow ref", () => {
    const nightly = readFileSync(".agents/skills/release-openclaw-nightly/SKILL.md", "utf8");
    const releaseCi = readFileSync(".agents/skills/release-openclaw-ci/SKILL.md", "utf8");
    // The CI page is an index over docs/ci/**. Read the whole tree so this
    // assertion follows the content instead of a single file path. The walk is
    // recursive because docs/ci pages are themselves split into subdirectories
    // (docs/ci/scope-and-routing/*); a flat readdir silently drops those and
    // turns a content move into a failure.
    const ciDocs = [
      readFileSync("docs/ci.md", "utf8"),
      ...readdirSync("docs/ci", { encoding: "utf8", recursive: true })
        .filter((name) => name.endsWith(".md"))
        .toSorted()
        .map((name) => readFileSync(`docs/ci/${name}`, "utf8")),
    ].join("\n");
    // Full release validation is an index over docs/reference/full-release-validation/*.
    // Read the whole set so this assertion follows the content instead of a single file path.
    const fullReleaseDocs = [
      readFileSync("docs/reference/full-release-validation.md", "utf8"),
      ...readdirSync("docs/reference/full-release-validation")
        .filter((name) => name.endsWith(".md"))
        .toSorted()
        .map((name) => readFileSync(`docs/reference/full-release-validation/${name}`, "utf8")),
    ].join("\n");
    const releasingDocs = readFileSync("docs/reference/RELEASING.md", "utf8");

    expect(nightly).toContain('-f expected_sha="$SHA"');
    const canonicalExtendedStableDispatch = [
      'VALIDATION_SHA="<exact-candidate-sha>"',
      'TOOLING_SHA="<recorded-full-main-ancestor-sha>"',
      'CONTEXT_REF="extended-stable/YYYY.M.33"',
      "pnpm ci:full-release",
      '--sha "$VALIDATION_SHA"',
      '--target-ref "$CONTEXT_REF"',
      '--workflow-sha "$TOOLING_SHA"',
      "-f release_profile=stable",
      "-f run_release_soak=true",
      "-f fail_fast=false",
      "-f rerun_group=all",
      "-f reuse_evidence=false",
      "-f dispatch_release_evidence=false",
    ];
    for (const text of [releaseCi, fullReleaseDocs, releasingDocs]) {
      expectTextToIncludeAll(text, canonicalExtendedStableDispatch);
      expect(text).not.toContain('--ref "$VALIDATION_SHA"');
      expect(text).not.toContain('-f ref="$CONTEXT_REF"');
    }
    expectTextToIncludeAll(releaseCi, [
      "`--ref` accepts a branch or tag name, not a raw commit",
      '{"fullRef":"refs/heads/main","ref":"main","sha":"<tooling-sha>"}',
      "Outside this extended-stable procedure, a direct canonical-branch dispatch",
      "Current extended-stable validation requires distinct",
      "Direct canonical-branch and mutable-`main` dispatches are not valid",
      "--ref main",
      '-f tag="$VALIDATION_SHA"',
      "-f preflight_only=true",
      "-f npm_dist_tag=extended-stable",
      '-f release_candidate_branch="$CONTEXT_REF"',
    ]);
    expectTextToIncludeAll(releasingDocs, [
      "Extended-stable also requires a separate npm preflight from trusted `main`",
      "supplemental validation-only preflight",
      "Do not pass",
      "publication `preflight_run_id`",
      "Publication continues to use the integrated Full Release",
      "Validation npm artifact and exact run attempt",
      "--ref main",
      '-f tag="$VALIDATION_SHA"',
      "-f preflight_only=true",
      "-f npm_dist_tag=extended-stable",
      '-f release_candidate_branch="$CONTEXT_REF"',
    ]);
    for (const text of [releaseCi, releasingDocs]) {
      expectTextToIncludeAll(text, [
        "standalone run is a supplemental validation-only preflight",
        "Do not pass",
        "publication `preflight_run_id`",
        "Publication continues to use",
      ]);
    }
    expectTextToIncludeAll(ciDocs, [
      'VALIDATION_SHA="<full-commit-sha>"',
      '-f ref="$VALIDATION_SHA"',
      '-f expected_sha="$VALIDATION_SHA"',
      'TOOLING_SHA="<recorded-full-main-ancestor-sha>"',
      'VALIDATION_SHA="<full-release-candidate-sha>"',
      "--target-ref release/YYYY.M.PATCH",
      '--workflow-sha "$TOOLING_SHA"',
    ]);
  });

  it("keeps every tracked repository skill visible to Git-aware syncs", () => {
    const skillFiles = execFileSync("git", ["ls-files", ".agents/skills/*/SKILL.md"], {
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .filter(Boolean);

    expect(skillFiles.length).toBeGreaterThan(0);
    const ignored = spawnSync("git", ["check-ignore", "--no-index", "--stdin"], {
      encoding: "utf8",
      input: `${skillFiles.join("\n")}\n`,
    });
    expect(ignored.status).toBe(1);
    expect(ignored.stdout).toBe("");
    expect(ignored.stderr).toBe("");
  });

  it("does not track generated node_modules entries", () => {
    const tracked = execFileSync("git", ["ls-files", "-z", "--", ":(glob)**/node_modules/**"], {
      encoding: "utf8",
    });

    expect(tracked).toBe("");
  });

  it("keeps tracked sync metadata and QA Mantis sources visible to remote full syncs", () => {
    for (const path of [
      ".github/release/clawhub-cli/package-lock.json",
      ".gitignore",
      "apps/android/.gitignore",
      "docs/reference/templates/IDENTITY.md",
      "docs/reference/templates/USER.md",
      "extensions/qa-lab/src/mantis/cli.ts",
    ]) {
      const result = spawnSync("git", ["check-ignore", "--no-index", path], {
        encoding: "utf8",
      });

      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("");
    }
  });
});
