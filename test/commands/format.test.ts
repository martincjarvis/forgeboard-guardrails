import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { runFormat } from "../../src/commands/format.ts";

test("formats every tracked file in the repo, not just staged ones", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-format-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: dir });
  writeFileSync(join(dir, "a.json"), '{"a":1}');
  execFileSync("git", ["add", "a.json"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "T"], { cwd: dir });
  execFileSync("git", ["commit", "-m", "chore: add a.json"], { cwd: dir });

  await runFormat(dir);

  const content = readFileSync(join(dir, "a.json"), "utf8");
  assert.match(content, /\n/);
});
