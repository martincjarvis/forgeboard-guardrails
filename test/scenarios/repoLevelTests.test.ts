import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { scaffoldFixtureRepo } from "../fixtures/scaffold.ts";
import { runPreCommitHook } from "../../src/hooks/preCommitHook.ts";

test("a failing repo-level architectureTest rejects regardless of which component changed", async () => {
  const fixture = scaffoldFixtureRepo({ statusContractEnabled: false });
  execFileSync("git", ["checkout", "-b", "feature/FB-0005-x"], { cwd: fixture.dir });
  writeFileSync(join(fixture.dir, "tests", "architecture.js"), "process.exit(1);\n");
  writeFileSync(join(fixture.dir, "src", "api", "index.js"), "console.log('changed');\n");
  execFileSync("git", ["add", "."], { cwd: fixture.dir });

  const exitCode = await runPreCommitHook(fixture.dir);

  assert.equal(exitCode, 1);
  fixture.cleanup();
});
