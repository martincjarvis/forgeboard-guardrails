import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { changedFilesForPush } from "../../src/git/pushRange.ts";

const ZERO = "0000000000000000000000000000000000000000";

function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "gr-push-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "f@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "F"], { cwd: dir });
  return dir;
}

function commitFile(dir: string, path: string, body: string): string {
  const full = join(dir, path);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, body);
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-m", `add ${path}`], { cwd: dir });
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: dir,
    encoding: "utf8",
  }).trim();
}

test("new branch (zero remote sha) diffs against merge-base with default branch", () => {
  const dir = initRepo();
  commitFile(dir, "src/base.js", "base\n");
  execFileSync("git", ["checkout", "-b", "feature"], { cwd: dir });
  const local = commitFile(dir, "src/api/new.js", "new\n");
  const line = `refs/heads/feature ${local} refs/heads/feature ${ZERO}\n`;
  const files = changedFilesForPush(dir, line, "main");
  assert.deepEqual(files, ["src/api/new.js"]);
  rmSync(dir, { recursive: true, force: true });
});

test("existing branch diffs the remote..local range", () => {
  const dir = initRepo();
  const remote = commitFile(dir, "src/base.js", "base\n");
  const local = commitFile(dir, "src/api/two.js", "two\n");
  const line = `refs/heads/main ${local} refs/heads/main ${remote}\n`;
  const files = changedFilesForPush(dir, line, "main");
  assert.deepEqual(files, ["src/api/two.js"]);
  rmSync(dir, { recursive: true, force: true });
});

test("branch deletion (zero local sha) contributes no files", () => {
  const dir = initRepo();
  const remote = commitFile(dir, "src/base.js", "base\n");
  const line = `(delete) ${ZERO} refs/heads/gone ${remote}\n`;
  const files = changedFilesForPush(dir, line, "main");
  assert.deepEqual(files, []);
  rmSync(dir, { recursive: true, force: true });
});
