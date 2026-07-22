import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { getStagedPaths } from "../../src/git/staged.ts";

test("includes a staged deletion so the deleted file's component is still gated", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-staged-del-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "fixture@example.com"], {
    cwd: dir,
  });
  execFileSync("git", ["config", "user.name", "Fixture"], { cwd: dir });
  writeFileSync(join(dir, "keep.js"), "const a = 1;\n");
  writeFileSync(join(dir, "gone.js"), "const b = 2;\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-m", "chore: seed"], { cwd: dir });

  rmSync(join(dir, "gone.js"));
  writeFileSync(join(dir, "keep.js"), "const a = 11;\n");
  execFileSync("git", ["add", "-A"], { cwd: dir });

  const staged = getStagedPaths(dir);

  assert.deepEqual(staged.sort(), ["gone.js", "keep.js"]);
  rmSync(dir, { recursive: true, force: true });
});

test("includes both sides of a rename so either component is gated", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-staged-ren-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "fixture@example.com"], {
    cwd: dir,
  });
  execFileSync("git", ["config", "user.name", "Fixture"], { cwd: dir });
  writeFileSync(join(dir, "old.js"), "const a = 1;\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-m", "chore: seed"], { cwd: dir });

  execFileSync("git", ["mv", "old.js", "new.js"], { cwd: dir });

  const staged = getStagedPaths(dir);

  assert.ok(
    staged.includes("new.js"),
    "the destination component must be gated",
  );
  rmSync(dir, { recursive: true, force: true });
});
