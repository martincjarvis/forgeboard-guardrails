import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { branchDiff, resolveBase } from "../../src/git/branchDiff.ts";

function git(dir: string, args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" });
}

function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "gr-bdiff-"));
  git(dir, ["init", "-b", "main"]);
  git(dir, ["config", "user.email", "t@t.t"]);
  git(dir, ["config", "user.name", "t"]);
  writeFileSync(join(dir, "seed.txt"), "seed\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "seed", "--no-verify"]);
  git(dir, ["checkout", "-b", "feature"]);
  return dir;
}

test("counts added and deleted lines and lists files against the default branch", () => {
  const dir = initRepo();
  writeFileSync(join(dir, "a.ts"), "one\ntwo\nthree\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "add a", "--no-verify"]);

  const result = branchDiff(dir, "main");
  assert.deepEqual(result.files, [{ path: "a.ts", added: 3, deleted: 0 }]);
  assert.ok(result.base && result.base.length > 0);
  rmSync(dir, { recursive: true, force: true });
});

test("returns an empty diff with a null base when on the default branch itself", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-bdiff-main-"));
  git(dir, ["init", "-b", "main"]);
  git(dir, ["config", "user.email", "t@t.t"]);
  git(dir, ["config", "user.name", "t"]);
  writeFileSync(join(dir, "seed.txt"), "seed\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "seed", "--no-verify"]);

  const result = branchDiff(dir, "main");
  assert.deepEqual(result.files, []);
  assert.equal(result.base, null);
  assert.equal(resolveBase(dir, "main"), null);
  rmSync(dir, { recursive: true, force: true });
});
