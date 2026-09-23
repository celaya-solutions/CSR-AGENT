// E2E Shell Tempfiles tests cover e2e shell tempfiles script behavior.
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { useAutoCleanupTempDirTracker } from "../helpers/temp-dir.js";

const tempDirs = useAutoCleanupTempDirTracker(afterEach);

async function listShellScripts(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const scripts: string[] = [];

  for (const entry of entries.toSorted((a, b) => a.name.localeCompare(b.name))) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scripts.push(...(await listShellScripts(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".sh")) {
      scripts.push(entryPath);
    }
  }

  return scripts;
}

describe("e2e shell tempfile hygiene", () => {
  it("does not allocate FIFO paths with mktemp -u", async () => {
    const offenders: string[] = [];

    for (const scriptPath of await listShellScripts("scripts/e2e")) {
      const contents = await readFile(path.resolve(scriptPath), "utf8");
      if (contents.includes("mktemp -u")) {
        offenders.push(scriptPath);
      }
    }

    expect(offenders).toEqual([]);
  });

  it.each([
    { name: "persistent failure", succeedsAfter: 0, exitCode: 7, calls: 2 },
    { name: "immediate success", succeedsAfter: 1, exitCode: 0, calls: 1 },
    { name: "success after a failed probe", succeedsAfter: 2, exitCode: 0, calls: 2 },
  ])("preserves config reload RPC status on $name", async (scenario) => {
    const tempRoot = tempDirs.make("openclaw-config-reload-status-");
    const script = await readFile("scripts/e2e/config-reload-source-docker.sh", "utf8");
    const rpcFunction = script.match(/^check_rpc_status\(\) \{[\s\S]*?^\}/m)?.[0];
    if (!rpcFunction) {
      throw new Error("Config reload RPC status function was not found");
    }
    const callsPath = path.join(tempRoot, "calls.txt");
    const result = spawnSync(
      process.platform === "darwin" ? "/bin/bash" : "bash",
      [
        "-c",
        `
set -euo pipefail
PORT=18789
TOKEN=synthetic-token
CONTAINER_NAME=synthetic-container
docker_e2e_docker_cmd() {
  "$BASH" -c "$PROBE_PRELUDE
$5"
}
${rpcFunction}
check_rpc_status "$OUTPUT_PATH"
`,
      ],
      {
        encoding: "utf8",
        timeout: 5_000,
        env: {
          ...process.env,
          OUTPUT_PATH: path.join(tempRoot, "rpc.log"),
          CALLS_PATH: callsPath,
          SUCCEEDS_AFTER: String(scenario.succeedsAfter),
          PROBE_PRELUDE: `
source() { :; }
openclaw_e2e_resolve_entrypoint() { printf '%s' synthetic-entry; }
calls=0
SECONDS=0
node() {
  calls=$((calls + 1))
  printf '%s' "$calls" > "$CALLS_PATH"
  if [ "$SUCCEEDS_AFTER" -gt 0 ] && [ "$calls" -ge "$SUCCEEDS_AFTER" ]; then
    return 0
  fi
  printf '%s\\n' 'synthetic RPC failure' >&2
  return 7
}
# Advance the real loop's clock without waiting for its 120-second deadline.
sleep() { SECONDS=$((SECONDS + 61)); }
`,
        },
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(scenario.exitCode);
    expect(await readFile(callsPath, "utf8")).toBe(String(scenario.calls));
    if (scenario.exitCode !== 0) {
      expect(result.stderr).toContain("synthetic RPC failure");
    }
  });

  it("preserves wizard exit status when reporting failures", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "openclaw-onboard-status-test-"));
    const fixturePath = path.join(tempRoot, "wizard-status.sh");
    await writeFile(
      fixturePath,
      `#!/usr/bin/env bash
set -euo pipefail

export OPENCLAW_ONBOARD_SCENARIO_SOURCE_ONLY=1
export OPENCLAW_ONBOARD_E2E_TMPDIR=${JSON.stringify(tempRoot)}
OPENCLAW_ENTRY=node
openclaw_test_state_create() { :; }
source scripts/e2e/lib/onboard/scenario.sh

openclaw_e2e_run_script_with_pty() {
  local _command="$1"
  local log_path="$2"
  printf 'fake wizard log\\n' >"$log_path"
  exit 7
}

send_noop() { :; }

run_wizard_cmd failing-wizard fake-state "node fake-wizard" send_noop false
`,
    );

    try {
      const result = spawnSync("bash", [fixturePath], {
        cwd: process.cwd(),
        encoding: "utf8",
      });
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status).toBe(7);
      expect(output).toContain("Wizard exited with status 7");
      expect(output).toContain("fake wizard log");
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  it("does not wait for a skills prompt after the ready state renders", async () => {
    const tempRoot = tempDirs.make("openclaw-onboard-skills-ready-");
    const fixturePath = path.join(tempRoot, "skills-ready.sh");
    const sentPath = path.join(tempRoot, "sent.txt");
    const wizardLogPath = path.join(tempRoot, "skills.log");
    await writeFile(
      fixturePath,
      `#!/usr/bin/env bash
set -euo pipefail

export OPENCLAW_ONBOARD_SCENARIO_SOURCE_ONLY=1
export OPENCLAW_ONBOARD_E2E_TMPDIR=${JSON.stringify(tempRoot)}
OPENCLAW_ENTRY=node
source scripts/e2e/lib/onboard/scenario.sh

sleep() { :; }
WIZARD_LOG_PATH=${JSON.stringify(wizardLogPath)}
printf 'Skills status\\nAll skills ready\\n' >"$WIZARD_LOG_PATH"
exec 3>${JSON.stringify(sentPath)}
send_skills_flow
exec 3>&-
test ! -s ${JSON.stringify(sentPath)}
`,
    );

    const result = spawnSync("bash", [fixturePath], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).not.toContain("Timeout waiting");
  });

  it("checks local onboarding logs for systemd noise", async () => {
    const contents = await readFile("scripts/e2e/lib/onboard/scenario.sh", "utf8");

    expect(contents).toContain(
      'ONBOARD_TMP_DIR="$(mktemp -d "$ONBOARD_TMP_ROOT/openclaw-onboard.XXXXXX")"',
    );
    expect(contents).toContain('OPENCLAW_E2E_LOG_DIR="$ONBOARD_TMP_DIR/logs"');
    expect(contents).toContain('GATEWAY_LOG_PATH="$ONBOARD_TMP_DIR/gateway-e2e.log"');
    expect(contents).not.toContain("/tmp/gateway-e2e.log");
    expect(contents).toContain('validate_local_basic_log "$OPENCLAW_E2E_LAST_LOG_PATH"');
    expect(contents).not.toContain(
      "validate_local_basic_log /tmp/openclaw-onboard-local-basic.log",
    );
    expect(contents).toContain(
      'openclaw_e2e_assert_log_not_contains "$log_path" "systemctl --user unavailable"',
    );
  });

  it("probes onboarding gateway readiness through TCP", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "openclaw-onboard-gateway-log-"));
    const fixturePath = path.join(tempRoot, "gateway-log.sh");
    await writeFile(
      fixturePath,
      `#!/usr/bin/env bash
set -euo pipefail

export OPENCLAW_ONBOARD_SCENARIO_SOURCE_ONLY=1
export OPENCLAW_ONBOARD_E2E_TMPDIR=${JSON.stringify(tempRoot)}
OPENCLAW_ENTRY=node
source scripts/e2e/lib/onboard/scenario.sh

openclaw_e2e_probe_tcp() { return 0; }
sleep 30 &
GATEWAY_PID="$!"
printf 'listening on ws://127.0.0.1:18789\\n' >"$GATEWAY_LOG_PATH"
wait_for_gateway
case "$GATEWAY_LOG_PATH" in
  "$ONBOARD_TMP_DIR"/*) ;;
  *) echo "gateway log escaped scratch root: $GATEWAY_LOG_PATH" >&2; exit 1 ;;
esac
cleanup_onboard_artifacts
test ! -e "$ONBOARD_TMP_DIR"
`,
    );

    try {
      const result = spawnSync("bash", [fixturePath], {
        cwd: process.cwd(),
        encoding: "utf8",
      });

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  it("rejects onboarding gateway readiness when the TCP probe fails", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "openclaw-onboard-gateway-tcp-"));
    const fixturePath = path.join(tempRoot, "gateway-tcp.sh");
    await writeFile(
      fixturePath,
      `#!/usr/bin/env bash
set -euo pipefail

export OPENCLAW_ONBOARD_SCENARIO_SOURCE_ONLY=1
export OPENCLAW_ONBOARD_E2E_TMPDIR=${JSON.stringify(tempRoot)}
export OPENCLAW_ONBOARD_GATEWAY_WAIT_ATTEMPTS=2
export OPENCLAW_ONBOARD_GATEWAY_WAIT_INTERVAL_S=0.1
OPENCLAW_ENTRY=node
source scripts/e2e/lib/onboard/scenario.sh

openclaw_e2e_probe_tcp() { return 1; }
sleep 30 &
GATEWAY_PID="$!"
printf 'listening on ws://127.0.0.1:18789\\n' >"$GATEWAY_LOG_PATH"
if wait_for_gateway; then
  echo "gateway readiness passed without TCP reachability" >&2
  cleanup_onboard_artifacts
  exit 1
fi
cleanup_onboard_artifacts
test ! -e "$ONBOARD_TMP_DIR"
`,
    );

    try {
      const result = spawnSync("bash", [fixturePath], {
        cwd: process.cwd(),
        encoding: "utf8",
      });

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      expect(result.stdout).toContain("Gateway failed to start");
      expect(result.stdout).toContain("TCP probe never succeeded");
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  it("rejects invalid onboarding gateway wait attempts before probing", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "openclaw-onboard-gateway-attempts-"));
    const fixturePath = path.join(tempRoot, "gateway-attempts.sh");
    await writeFile(
      fixturePath,
      `#!/usr/bin/env bash
set -euo pipefail

export OPENCLAW_ONBOARD_SCENARIO_SOURCE_ONLY=1
export OPENCLAW_ONBOARD_E2E_TMPDIR=${JSON.stringify(tempRoot)}
export OPENCLAW_ONBOARD_GATEWAY_WAIT_ATTEMPTS=2x
OPENCLAW_ENTRY=node
source scripts/e2e/lib/onboard/scenario.sh

openclaw_e2e_probe_tcp() {
  echo "probe should not run" >&2
  return 1
}
set +e
wait_for_gateway
status="$?"
set -e
cleanup_onboard_artifacts
exit "$status"
`,
    );

    try {
      const result = spawnSync("bash", [fixturePath], {
        cwd: process.cwd(),
        encoding: "utf8",
      });

      expect(result.status).toBe(2);
      expect(result.stderr).toContain("invalid OPENCLAW_ONBOARD_GATEWAY_WAIT_ATTEMPTS: 2x");
      expect(result.stderr).not.toContain("probe should not run");
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });
});
