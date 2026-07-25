import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTaskCompleteHook } from "../../src/hooks/taskCompleteHook.ts";

function git(dir: string, args: string[]): void {
  execFileSync("git", args, { cwd: dir });
}

function initRepo(agentHooks: object = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "gr-tc-"));
  git(dir, ["init", "-b", "main"]);
  git(dir, ["config", "user.email", "t@t.t"]);
  git(dir, ["config", "user.name", "t"]);
  mkdirSync(join(dir, ".forgeboard"), { recursive: true });
  writeFileSync(
    join(dir, ".forgeboard", "guardrails.config.json"),
    JSON.stringify({
      appName: "x",
      defaultBranch: "main",
      components: { c: { paths: ["**"] } },
      agentHooks,
    }),
  );
  writeFileSync(join(dir, "seed.txt"), "seed\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "seed", "--no-verify"]);
  return dir;
}

const STDIN = JSON.stringify({ hook_event_name: "Stop" });

test("early-exit 0 on the default branch", async () => {
  const dir = initRepo();
  assert.equal(await runTaskCompleteHook(dir, STDIN), 0);
  rmSync(dir, { recursive: true, force: true });
});

test("PR-size in the warn band exits 0 (advisory)", async () => {
  const dir = initRepo({ prSize: { warn: 5, error: 100 } });
  git(dir, ["checkout", "-b", "feature"]);
  writeFileSync(join(dir, "a.ts"), "l\n".repeat(10)); // 10 added lines, 5<10<=100
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "work", "--no-verify"]);
  assert.equal(await runTaskCompleteHook(dir, STDIN), 0);
  rmSync(dir, { recursive: true, force: true });
});

test("PR-size over the error limit blocks with exit 2", async () => {
  const dir = initRepo({ prSize: { warn: 5, error: 8 } });
  git(dir, ["checkout", "-b", "feature"]);
  writeFileSync(join(dir, "a.ts"), "l\n".repeat(20)); // 20 > 8
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "work", "--no-verify"]);
  assert.equal(await runTaskCompleteHook(dir, STDIN), 2);
  rmSync(dir, { recursive: true, force: true });
});

test("[large-pr] token on a branch commit flips the over-error block to exit 0", async () => {
  const dir = initRepo({ prSize: { warn: 5, error: 8 } });
  git(dir, ["checkout", "-b", "feature"]);
  writeFileSync(join(dir, "a.ts"), "l\n".repeat(20));
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "work [large-pr]", "--no-verify"]);
  assert.equal(await runTaskCompleteHook(dir, STDIN), 0);
  rmSync(dir, { recursive: true, force: true });
});

test("an over-length file blocks with exit 2", async () => {
  const dir = initRepo({
    prSize: { warn: 5000, error: 9000 },
    maxFileLines: 5,
  });
  git(dir, ["checkout", "-b", "feature"]);
  writeFileSync(join(dir, "a.ts"), "l\n".repeat(20)); // 20 lines > maxFileLines 5
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "work", "--no-verify"]);
  assert.equal(await runTaskCompleteHook(dir, STDIN), 2);
  rmSync(dir, { recursive: true, force: true });
});
