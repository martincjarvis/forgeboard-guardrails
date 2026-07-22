import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { scaffoldFixtureRepo } from "../fixtures/scaffold.ts";
import { runPreCommitHook } from "../../src/hooks/preCommitHook.ts";

test("rejects a commit attempted on the default branch", async () => {
  const fixture = scaffoldFixtureRepo({ statusContractEnabled: false });
  execFileSync("git", ["checkout", "main"], { cwd: fixture.dir });

  const exitCode = await runPreCommitHook(fixture.dir);

  assert.equal(exitCode, 1);
  fixture.cleanup();
});

test("accepts the same change on a feature branch", async () => {
  const fixture = scaffoldFixtureRepo({ statusContractEnabled: false });
  execFileSync("git", ["checkout", "-b", "feature/FB-0001-x"], {
    cwd: fixture.dir,
  });

  const exitCode = await runPreCommitHook(fixture.dir);

  assert.equal(exitCode, 0);
  fixture.cleanup();
});
