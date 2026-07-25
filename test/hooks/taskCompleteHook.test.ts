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

test("PR-size ignores docs and tests, counts only production+config", async () => {
  const dir = initRepo({ prSize: { warn: 5, error: 8 } });
  git(dir, ["checkout", "-b", "feature"]);
  // 30 lines of docs + 30 lines of tests — well over error 8, but neither counts.
  writeFileSync(join(dir, "notes.md"), "l\n".repeat(30));
  mkdirSync(join(dir, "test"), { recursive: true });
  writeFileSync(join(dir, "test", "a.test.ts"), "l\n".repeat(30));
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "docs and tests", "--no-verify"]);
  assert.equal(await runTaskCompleteHook(dir, STDIN), 0);
  rmSync(dir, { recursive: true, force: true });
});

test("a large CLAUDE.md blocks via the tiered agent-doc limit", async () => {
  const dir = initRepo({ agentDocs: { warn: 3, error: 6 } });
  git(dir, ["checkout", "-b", "feature"]);
  writeFileSync(join(dir, "CLAUDE.md"), "l\n".repeat(10)); // 10 >= error 6
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "big claude", "--no-verify"]);
  assert.equal(await runTaskCompleteHook(dir, STDIN), 2);
  rmSync(dir, { recursive: true, force: true });
});

test("does not crash when the branch deletes a code file", async () => {
  const dir = initRepo({ prSize: { warn: 1, error: 100000 }, maxFileLines: 5 });
  // seed a code file on main-equivalent, then delete it on the feature branch.
  writeFileSync(join(dir, "old.ts"), "a\nb\nc\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "add old", "--no-verify"]);
  git(dir, ["checkout", "-b", "feature"]);
  execFileSync("git", ["rm", "old.ts"], { cwd: dir });
  git(dir, ["commit", "-m", "remove old", "--no-verify"]);
  // Must not throw; the deletion's removed lines are within the huge error limit.
  assert.equal(await runTaskCompleteHook(dir, STDIN), 0);
  rmSync(dir, { recursive: true, force: true });
});
