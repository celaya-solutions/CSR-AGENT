import { describe, expect, it } from "vitest";
import {
  createDocumentedCompletionProgram,
  runGeneratedBashCompletion,
} from "./completion-cli.test-support.js";

describe("completion-cli native Bash words", () => {
  it.skipIf(process.platform !== "darwin")("uses macOS Bash byte offsets in a UTF-8 locale", () => {
    const prefix = "openagent gateway --token=é status --j";

    expect(
      runGeneratedBashCompletion(
        createDocumentedCompletionProgram(),
        ["openagent", "gateway", "--token=é", "status", "--json"],
        {
          line: `${prefix}son`,
          word: "--j",
          point: Buffer.byteLength(prefix),
          bashPath: "/bin/bash",
          env: { ...process.env, LC_ALL: "en_US.UTF-8" },
        },
      ),
    ).toEqual(["--json"]);
  });

  it.skipIf(process.platform === "win32").each([
    {
      line: "openagent completion --shell=",
      words: ["openagent", "completion", "--shell", "="],
      word: "",
      expected: ["zsh", "bash", "powershell", "fish"],
    },
    {
      line: "openagent --profile=gateway completion --shell f",
      words: ["openagent", "--profile", "=", "gateway", "completion", "--shell", "f"],
      word: "f",
      expected: ["fish"],
    },
    {
      line: "openagent completion --shell=f",
      words: ["openagent", "completion", "--shell=f"],
      word: "f",
      expected: ["fish"],
    },
    {
      line: "openagent completion --shell=fish",
      words: ["openagent", "completion", "--shell", "=", "fish"],
      word: "f",
      point: 30,
      expected: ["fish"],
    },
    {
      line: "openagent completion --shell=fish",
      words: ["openagent", "completion", "--shell=fish"],
      word: "f",
      point: 30,
      expected: ["fish"],
    },
    {
      line: "openagent completion --shell=fish",
      words: ["openagent", "completion", "--shell", "=", "fish"],
      word: "",
      point: 29,
      expected: ["zsh", "bash", "powershell", "fish"],
    },
    {
      line: "openagent completion --shell=bogus",
      words: ["openagent", "completion", "--shell", "=", "bogus"],
      word: "b",
      point: 30,
      expected: ["bash"],
    },
    {
      line: "openagent completion --sh=fish",
      words: ["openagent", "completion", "--sh=fish"],
      word: "--sh",
      point: 25,
      expected: ["--shell"],
    },
    {
      line: "openagent completion -ysfish",
      words: ["openagent", "completion", "-ysfish"],
      word: "-ysf",
      point: 25,
      expected: ["-ysfish"],
    },
    {
      line: "openagent --profile=gateway completion --shell=fish --yes",
      words: [
        "openagent",
        "--profile",
        "=",
        "gateway",
        "completion",
        "--shell",
        "=",
        "fish",
        "--yes",
      ],
      word: "f",
      point: 48,
      cword: 7,
      expected: ["fish"],
    },
    {
      line: "openagent completion --shell=fish",
      words: ["openagent", "completion", "--shell=fish"],
      word: "comple",
      point: 16,
      cword: 1,
      expected: ["completion"],
    },
    {
      line: "openagent gateway --token = status --j",
      words: ["openagent", "gateway", "--token", "=", "status", "--j"],
      word: "--j",
      expected: ["--json"],
    },
    {
      line: "openagent completion>/dev/null --shell f",
      words: ["openagent", "completion", ">", "/dev/null", "--shell", "f"],
      word: "f",
      expected: ["fish"],
    },
    {
      line: "openagent gateway --token=prefix:status --f",
      words: ["openagent", "gateway", "--token", "=", "prefix", ":", "status", "--f"],
      word: "--f",
      expected: ["--force"],
    },
    {
      line: "openagent gateway --token=foo==status --f",
      words: ["openagent", "gateway", "--token", "=", "foo", "==", "status", "--f"],
      word: "--f",
      expected: ["--force"],
    },
    ...['"f', "'f", '"f"', "\\f", 'f"i'].map((value) => ({
      line: `openagent completion --shell ${value}`,
      words: ["openagent", "completion", "--shell", value],
      word: value === 'f"i' ? "i" : value === '"f' || value === "'f" ? "f" : value,
      expected: [value === 'f"i' ? "ish" : "fish"],
    })),
    ...['"', "'"].flatMap((quote) => [
      {
        line: `openagent completion --shell=${quote}f`,
        words: ["openagent", "completion", `--shell=${quote}f`],
        word: "f",
        expected: ["fish"],
      },
      {
        line: `openagent completion --shell=${quote}f`,
        words: ["openagent", "completion", "--shell", "=", `${quote}f`],
        word: "f",
        expected: ["fish"],
      },
      {
        line: `openagent completion -s ${quote}f`,
        words: ["openagent", "completion", "-s", `${quote}f`],
        word: "f",
        expected: ["fish"],
      },
    ]),
  ])("respects native Bash word boundaries in $line at $point", ({ words, expected, ...input }) => {
    const program = createDocumentedCompletionProgram().option("--profile <name>", "Profile");

    expect(runGeneratedBashCompletion(program, words, input)).toEqual(expected);
  });
});
