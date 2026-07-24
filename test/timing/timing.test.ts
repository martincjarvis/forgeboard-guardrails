// Run via `npm run test:timing` (CI / on demand), NOT the commit-gate `npm test`.
// This measures pre-commit wall-clock, which is only meaningful in isolation: inside
// the parallel suite — or worse, inside the dogfood pre-commit gate that runs npm
// test concurrently with semgrep and the other file gates — CPU contention inflates
// a ~5s pre-commit past the 30s budget and flakes. Alone, the number is honest.
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
