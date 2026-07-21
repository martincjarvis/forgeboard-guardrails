import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { scaffoldFixtureRepo } from "../fixtures/scaffold.ts";
import { runPreCommitHook } from "../../src/hooks/preCommitHook.ts";
import { skipWithoutSemgrep } from "../support/semgrep.ts";

/**
 * A1 AC 4 names a "planted build warning". The toolkit never parses warnings out of
 * build output — the 0-warning requirement is met by the consuming repo configuring
 * its build as warnings-as-errors, exactly as this fixture's build command does.
 * This scenario pins that division of responsibility.
 */
test("a warnings-as-errors build that emits a warning rejects the commit", { skip: skipWithoutSemgrep }, async () => {
  const fixture = scaffoldFixtureRepo({ statusContractEnabled: false });
  execFileSync("git", ["checkout", "-b", "feature/FB-0014-x"], { cwd: fixture.dir });

  const configPath = join(fixture.dir, ".forgeboard", "guardrails.config.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  config.components.api.build = 'node -e "console.error(\'warning: unused variable x\'); process.exit(1)"';
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  writeFileSync(join(fixture.dir, "src", "api", "index.js"), "const x = 1;\n");
  // The config edit must be staged too: unstaged changes are stashed before the gates
  // run, so an unstaged override would simply not be in effect.
  execFileSync("git", ["add", "."], { cwd: fixture.dir });

  const exitCode = await runPreCommitHook(fixture.dir);

  assert.equal(exitCode, 1);
  fixture.cleanup();
});
