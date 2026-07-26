import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { scaffoldFixtureRepo } from "../fixtures/scaffold.ts";
import { runPreCommitHook } from "../../src/hooks/preCommitHook.ts";
import { skipWithoutSemgrep } from "../support/semgrep.ts";

test(
  "pre-commit accepts a markdown file with a long prose line",
  { skip: skipWithoutSemgrep },
  async () => {
    const fixture = scaffoldFixtureRepo({ statusContractEnabled: false });
    execFileSync("git", ["checkout", "-b", "feature/FB-0017-x"], {
      cwd: fixture.dir,
    });
    const longLine = "word ".repeat(60).trim();
    writeFileSync(
      join(fixture.dir, "src", "api", "notes.md"),
      `# Notes\n\n${longLine}\n`,
    );
    execFileSync("git", ["add", "src/api/notes.md"], { cwd: fixture.dir });

    // The hook prints the rejecting gate's message and returns a bare 1, so an
    // assertion on the number alone reports "expected 0, got 1" and nothing about
    // which gate objected. This test has been seen failing intermittently under a
    // nested run; capturing the gate's own words is what makes the next occurrence
    // diagnosable instead of another hunt.
    const reported: string[] = [];
    const realError = console.error;
    console.error = (...args: unknown[]) => {
      reported.push(args.map(String).join(" "));
    };
    let exitCode: number;
    try {
      exitCode = await runPreCommitHook(fixture.dir);
    } finally {
      console.error = realError;
    }

    assert.equal(
      exitCode,
      0,
      `pre-commit rejected the file. Gate output:\n${reported.join("\n") || "(the hook printed nothing)"}`,
    );
    fixture.cleanup();
  },
);
