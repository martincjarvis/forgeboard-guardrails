import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { getStagedFiles } from "../../src/git/staged.ts";

test("excludes a staged deletion so gates never receive a path that is not on disk", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-staged-del-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "fixture@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Fixture"], { cwd: dir });
  writeFileSync(join(dir, "keep.js"), "const a = 1;\n");
  writeFileSync(join(dir, "gone.js"), "const b = 2;\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-m", "chore: seed"], { cwd: dir });

  rmSync(join(dir, "gone.js"));
  writeFileSync(join(dir, "keep.js"), "const a = 11;\n");
  execFileSync("git", ["add", "-A"], { cwd: dir });

  const staged = getStagedFiles(dir);

  assert.deepEqual(staged, ["keep.js"]);
  rmSync(dir, { recursive: true, force: true });
});

test("reports the destination of a rename, never the vanished source path", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-staged-ren-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "fixture@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Fixture"], { cwd: dir });
  writeFileSync(join(dir, "old.js"), "const a = 1;\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-m", "chore: seed"], { cwd: dir });

  execFileSync("git", ["mv", "old.js", "new.js"], { cwd: dir });

  const staged = getStagedFiles(dir);

  assert.ok(staged.includes("new.js"), "destination path must be gated");
  assert.ok(!staged.includes("old.js"), "source path no longer exists on disk");
  rmSync(dir, { recursive: true, force: true });
});
