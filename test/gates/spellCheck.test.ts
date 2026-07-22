import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSpellCheck } from "../../src/gates/spellCheck.ts";

// deliberately misspelled to exercise the spell gate
// cspell:ignore Thsi mispelled sentance
function setupDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "gr-spell-"));
  copyFileSync(join(process.cwd(), "cspell.json"), join(dir, "cspell.json"));
  return dir;
}

test("passes on correctly spelled content", () => {
  const dir = setupDir();
  writeFileSync(
    join(dir, "notes.md"),
    "This function returns the current status.\n",
  );

  const result = runSpellCheck(["notes.md"], dir);
  assert.equal(result.pass, true);
});

test("fails on an obvious misspelling", () => {
  const dir = setupDir();
  writeFileSync(join(dir, "notes.md"), "Thsi is a mispelled sentance.\n");

  const result = runSpellCheck(["notes.md"], dir);
  assert.equal(result.pass, false);
});
