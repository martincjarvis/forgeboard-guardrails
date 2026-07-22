import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { getStagedPaths } from "../../src/git/staged.ts";
import { getCurrentBranch } from "../../src/git/branch.ts";

function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "gr-git-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], {
    cwd: dir,
  });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
  return dir;
}

test("getStagedPaths lists staged paths", () => {
  const dir = initRepo();
  writeFileSync(join(dir, "a.txt"), "hello");
  execFileSync("git", ["add", "a.txt"], { cwd: dir });

  assert.deepEqual(getStagedPaths(dir), ["a.txt"]);
});

test("getCurrentBranch returns the checked-out branch name", () => {
  const dir = initRepo();
  execFileSync("git", ["checkout", "-b", "feature/FB-0001-test"], { cwd: dir });

  assert.equal(getCurrentBranch(dir), "feature/FB-0001-test");
});
