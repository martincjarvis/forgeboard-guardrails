import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { scaffoldFixtureRepo } from "../fixtures/scaffold.ts";
import { runPreCommitHook } from "../../src/hooks/preCommitHook.ts";
import { skipWithoutSemgrep } from "../support/semgrep.ts";

// Gated on semgrep so that exit 1 is attributable to the spelling gate rather than
// to a semgrep-absence cascade, and so the accepting case can reach exit 0 at all.
test("rejects a staged file containing a misspelling", { skip: skipWithoutSemgrep }, async () => {
  const fixture = scaffoldFixtureRepo({ statusContractEnabled: false });
  execFileSync("git", ["checkout", "-b", "feature/FB-0011-x"], { cwd: fixture.dir });
  writeFileSync(join(fixture.dir, "src", "api", "index.js"), "// teh recieve handler\nconst x = 1;\n");
  execFileSync("git", ["add", "src/api/index.js"], { cwd: fixture.dir });

  const exitCode = await runPreCommitHook(fixture.dir);

  assert.equal(exitCode, 1);
  fixture.cleanup();
});

test("accepts the commit once the misspelling is corrected", { skip: skipWithoutSemgrep }, async () => {
  const fixture = scaffoldFixtureRepo({ statusContractEnabled: false });
  execFileSync("git", ["checkout", "-b", "feature/FB-0011-y"], { cwd: fixture.dir });
  writeFileSync(join(fixture.dir, "src", "api", "index.js"), "// the receive handler\nconst x = 1;\n");
  execFileSync("git", ["add", "src/api/index.js"], { cwd: fixture.dir });

  const exitCode = await runPreCommitHook(fixture.dir);

  assert.equal(exitCode, 0);
  fixture.cleanup();
});
