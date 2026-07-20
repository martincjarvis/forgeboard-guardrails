import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { scaffoldFixtureRepo } from "../fixtures/scaffold.ts";
import { runPreCommitHook } from "../../src/hooks/preCommitHook.ts";

function setComponentBuildCommand(dir: string, component: string, command: string): void {
  const configPath = join(dir, ".forgeboard", "guardrails.config.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  config.components[component].build = command;
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

test("rejects when a changed component's build fails", async () => {
  const fixture = scaffoldFixtureRepo({ statusContractEnabled: false });
  execFileSync("git", ["checkout", "-b", "feature/FB-0003-x"], { cwd: fixture.dir });
  setComponentBuildCommand(fixture.dir, "api", 'node -e "process.exit(1)"');
  writeFileSync(join(fixture.dir, "src", "api", "index.js"), "console.log('changed');\n");
  execFileSync("git", ["add", "."], { cwd: fixture.dir });

  const exitCode = await runPreCommitHook(fixture.dir);

  assert.equal(exitCode, 1);
  fixture.cleanup();
});

test("passes once the planted build failure is fixed", async () => {
  const fixture = scaffoldFixtureRepo({ statusContractEnabled: false });
  execFileSync("git", ["checkout", "-b", "feature/FB-0003-x"], { cwd: fixture.dir });
  writeFileSync(join(fixture.dir, "src", "api", "index.js"), "console.log('changed');\n");
  execFileSync("git", ["add", "."], { cwd: fixture.dir });

  const exitCode = await runPreCommitHook(fixture.dir);

  assert.equal(exitCode, 0);
  fixture.cleanup();
});
