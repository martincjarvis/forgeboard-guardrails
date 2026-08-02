// cspell:ignore
// Split from gate-2-commit.test.mjs — subject group: gate 2's file-length
// check. Loaded by hooks/test/hooks.test.mjs; not invoked directly.
import { test } from "node:test";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { git, scratchRepo, runScript, lines } from "./support.mjs";

test("gate 2 refuses a staged production file over the file-length band", () => {
  // File length moved here from gate 4: a file's length is true at every
  // moment, not only across a branch, so it is refused at the commit that
  // causes it — when the fix is extracting one function rather than
  // redesigning a file hundreds of lines later.
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  writeFileSync(join(dir, "big.ts"), lines(900));
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/pre-commit.mjs", dir);
  assert.equal(r.status, 2, "a staged file over the band must be refused");
  assert.match(r.stderr, /file length/);
  assert.match(r.stderr, /split it into smaller units/);
  rmSync(dir, { recursive: true, force: true });
});

test("gate 2 file length: a test file over the band blocks too — there is no warn band", () => {
  // The warn band is gone. A warning is a hint for an agent to act on before
  // it commits; anything reaching a gate is an error, whatever the class.
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  writeFileSync(join(dir, ".gitattributes"), "spec/** guardrail-class=test\n");
  mkdirSync(join(dir, "spec"), { recursive: true });
  writeFileSync(join(dir, "spec", "big.spec.ts"), lines(900));
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/pre-commit.mjs", dir);
  assert.equal(
    r.status,
    2,
    "a test file over the band blocks, it does not warn",
  );
  assert.match(r.stderr, /file length/);
  rmSync(dir, { recursive: true, force: true });
});

test("gate 2 file length: the [large-pr] marker does not clear it", () => {
  // thresholds.md: the override reaches change size only, "not the length or
  // complexity limits". A branch may legitimately be large; one file may not
  // legitimately be that long. The marker is a commit message, so it cannot
  // reach a staged-content check at all — asserted rather than assumed.
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  git(dir, [
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    "chore: accepted [large-pr]",
  ]);
  writeFileSync(join(dir, "big.ts"), lines(900));
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/pre-commit.mjs", dir);
  assert.equal(r.status, 2, "the marker clears change size, never file length");
  assert.match(r.stderr, /file length/);
  rmSync(dir, { recursive: true, force: true });
});

test("gate 2 file length: a file at the band exactly is allowed — the threshold is the last acceptable value", () => {
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  // lines(n) writes n lines; the blob then splits to n+1 with its trailing
  // newline, so 399 is the largest that reads as 400.
  writeFileSync(join(dir, "at-limit.ts"), lines(399));
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/pre-commit.mjs", dir);
  assert.doesNotMatch(
    r.stderr,
    /file length/,
    "400 lines is the last acceptable value, not the first refused",
  );
  rmSync(dir, { recursive: true, force: true });
});
