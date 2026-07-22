import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { scaffoldFixtureRepo } from "../fixtures/scaffold.ts";
import { runPreCommitHook } from "../../src/hooks/preCommitHook.ts";
import { skipWithoutSemgrep } from "../support/semgrep.ts";

test(
  "pre-commit completes well under the 30s budget with a clean commit",
  { skip: skipWithoutSemgrep },
  async () => {
    const fixture = scaffoldFixtureRepo({ statusContractEnabled: false });
    execFileSync("git", ["checkout", "-b", "feature/FB-0009-x"], {
      cwd: fixture.dir,
    });
    writeFileSync(
      join(fixture.dir, "src", "api", "index.js"),
      "console.log('clean change');\n",
    );
    execFileSync("git", ["add", "."], { cwd: fixture.dir });

    const start = Date.now();
    const exitCode = await runPreCommitHook(fixture.dir);
    const elapsedMs = Date.now() - start;

    assert.equal(exitCode, 0);
    assert.ok(
      elapsedMs < 30_000,
      `pre-commit took ${elapsedMs}ms, over the 30s budget`,
    );

    fixture.cleanup();
  },
);
