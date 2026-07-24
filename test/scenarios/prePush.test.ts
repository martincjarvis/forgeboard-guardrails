import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { scaffoldFixtureRepo } from "../fixtures/scaffold.ts";
import { runPrePushHook } from "../../src/hooks/prePushHook.ts";

const ZERO = "0000000000000000000000000000000000000000";

/** Puts the fixture on a feature branch with one commit touching src/api, and
 *  returns the new-branch pre-push stdin line for that HEAD. */
function pushOfApiChange(dir: string, branch: string): string {
  execFileSync("git", ["checkout", "-b", branch], { cwd: dir });
  writeFileSync(join(dir, "src", "api", "index.js"), "console.log('api2');\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-m", "feat: change api", "--no-verify"], {
    cwd: dir,
  });
  const sha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: dir,
    encoding: "utf8",
  }).trim();
  return `refs/heads/${branch} ${sha} refs/heads/${branch} ${ZERO}\n`;
}

function setConfig(dir: string, mutate: (c: any) => void): void {
  const path = join(dir, ".forgeboard", "guardrails.config.json");
  const c = JSON.parse(readFileSync(path, "utf8"));
  mutate(c);
  writeFileSync(path, JSON.stringify(c, null, 2));
}

test("coverage shortfall rejects the push, passing coverage allows it", async () => {
  const dir = scaffoldFixtureRepo({ statusContractEnabled: false }).dir;
  setConfig(dir, (c) => {
    c.coverage =
      "node -e \"console.error('lines 70% < 80%'); process.exit(1)\"";
  });
  const line = pushOfApiChange(dir, "feature/FB-0001-a");
  assert.equal(await runPrePushHook(dir, line), 1);

  setConfig(dir, (c) => {
    c.coverage = 'node -e "process.exit(0)"';
  });
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-m", "chore: pass coverage", "--no-verify"], {
    cwd: dir,
  });
  const sha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: dir,
    encoding: "utf8",
  }).trim();
  const line2 = `refs/heads/feature/FB-0001-a ${sha} refs/heads/feature/FB-0001-a ${ZERO}\n`;
  assert.equal(await runPrePushHook(dir, line2), 0);
});

test("a failing component integration test rejects the push", async () => {
  const dir = scaffoldFixtureRepo({ statusContractEnabled: false }).dir;
  setConfig(dir, (c) => {
    c.components.api.integrationTest = 'node -e "process.exit(1)"';
  });
  const line = pushOfApiChange(dir, "feature/FB-0001-b");
  assert.equal(await runPrePushHook(dir, line), 1);
});

test("a failing component e2e test rejects the push", async () => {
  const dir = scaffoldFixtureRepo({ statusContractEnabled: false }).dir;
  setConfig(dir, (c) => {
    c.components.api.e2eTest = 'node -e "process.exit(1)"';
  });
  const line = pushOfApiChange(dir, "feature/FB-0001-c");
  assert.equal(await runPrePushHook(dir, line), 1);
});

test("all gates green: push allowed and pre-push event recorded", async () => {
  const dir = scaffoldFixtureRepo({ statusContractEnabled: true }).dir;
  setConfig(dir, (c) => {
    c.coverage = 'node -e "process.exit(0)"';
    c.components.api.integrationTest = 'node -e "process.exit(0)"';
    c.components.api.e2eTest = 'node -e "process.exit(0)"';
  });
  const line = pushOfApiChange(dir, "feature/FB-0001-d");
  assert.equal(await runPrePushHook(dir, line), 0);

  const events = join(dir, ".forgeboard", "state", "FB-0001", "events.ndjson");
  assert.ok(existsSync(events), "events file should exist");
  const lines = readFileSync(events, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  assert.ok(
    lines.some((e) => e.hook === "pre-push" && e.result === "pass"),
    "a passing pre-push gate-run event should be recorded",
  );
});
