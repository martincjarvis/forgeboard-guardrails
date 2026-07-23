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

    const exitCode = await runPreCommitHook(fixture.dir);

    assert.equal(exitCode, 0);
    fixture.cleanup();
  },
);
