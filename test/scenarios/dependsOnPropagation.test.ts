import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { scaffoldFixtureRepo } from "../fixtures/scaffold.ts";
import { runPreCommitHook } from "../../src/hooks/preCommitHook.ts";

test("a shared-lib-only change triggers web's gates via dependsOn, catching a break", async () => {
  const fixture = scaffoldFixtureRepo({ statusContractEnabled: false });
  execFileSync("git", ["checkout", "-b", "feature/FB-0004-x"], { cwd: fixture.dir });

  const configPath = join(fixture.dir, ".forgeboard", "guardrails.config.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  config.components.web.build = 'node -e "process.exit(1)"'; // simulates a break caused by the shared-lib change
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  writeFileSync(join(fixture.dir, "src", "shared", "index.js"), "console.log('changed shared');\n");
  execFileSync("git", ["add", "."], { cwd: fixture.dir });

  const exitCode = await runPreCommitHook(fixture.dir);

  assert.equal(exitCode, 1); // web never had its own files staged, but still gated
  fixture.cleanup();
});
