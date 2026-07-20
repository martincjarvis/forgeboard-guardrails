import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { scaffoldFixtureRepo } from "../fixtures/scaffold.ts";
import { runPreCommitHook } from "../../src/hooks/preCommitHook.ts";

test("events.ndjson is append-only across a scripted double-run — no rewritten history", async () => {
  const fixture = scaffoldFixtureRepo({ statusContractEnabled: true });
  execFileSync("git", ["checkout", "-b", "feature/FB-0007-x"], { cwd: fixture.dir });
  writeFileSync(join(fixture.dir, "src", "api", "index.js"), "console.log('run one');\n");
  execFileSync("git", ["add", "."], { cwd: fixture.dir });

  await runPreCommitHook(fixture.dir);
  const eventsPath = join(fixture.dir, ".forgeboard", "state", "FB-0007", "events.ndjson");
  const afterFirstRun = readFileSync(eventsPath, "utf8");

  writeFileSync(join(fixture.dir, "src", "api", "index.js"), "console.log('run two');\n");
  execFileSync("git", ["add", "."], { cwd: fixture.dir });
  await runPreCommitHook(fixture.dir);
  const afterSecondRun = readFileSync(eventsPath, "utf8");

  assert.ok(afterSecondRun.startsWith(afterFirstRun)); // prior lines untouched, only appended to
  assert.ok(afterSecondRun.split("\n").filter(Boolean).length > afterFirstRun.split("\n").filter(Boolean).length);

  fixture.cleanup();
});
