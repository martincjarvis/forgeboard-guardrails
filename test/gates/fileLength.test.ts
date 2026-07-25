import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkFileLengths,
  checkFileLengthsTiered,
  DEFAULT_MAX_FILE_LINES,
} from "../../src/gates/fileLength.ts";

test("reports over-limit, passes under-limit, and passes exactly-at-limit", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-fl-"));
  writeFileSync(join(dir, "big.ts"), "x\n".repeat(10)); // 10 content lines
  writeFileSync(join(dir, "small.ts"), "x\n".repeat(3)); // 3 content lines
  writeFileSync(join(dir, "exact.ts"), "x\n".repeat(5)); // exactly max — must pass

  const offenders = checkFileLengths(
    ["big.ts", "small.ts", "exact.ts"],
    dir,
    5,
  );
  assert.equal(offenders.length, 1);
  assert.equal(offenders[0].file, "big.ts");
  // Exact count: a trailing newline must NOT be over-counted as an extra line.
  assert.equal(offenders[0].lines, 10);
  rmSync(dir, { recursive: true, force: true });
});

test("no offenders when all files are within the limit", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-fl-ok-"));
  writeFileSync(join(dir, "a.ts"), "x\n".repeat(3));
  assert.deepEqual(checkFileLengths(["a.ts"], dir, DEFAULT_MAX_FILE_LINES), []);
  rmSync(dir, { recursive: true, force: true });
});

test("skips a file that does not exist (a deletion)", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-fl-del-"));
  writeFileSync(join(dir, "real.ts"), "x\n".repeat(10));
  // gone.ts is never created.
  const offenders = checkFileLengths(["gone.ts", "real.ts"], dir, 5);
  assert.deepEqual(offenders, [{ file: "real.ts", lines: 10 }]);
  rmSync(dir, { recursive: true, force: true });
});

test("tiered check splits warn and error bands and skips missing files", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-fl-tier-"));
  writeFileSync(join(dir, "big.md"), "x\n".repeat(20)); // >= error 10
  writeFileSync(join(dir, "mid.md"), "x\n".repeat(7)); // warn band [5,10)
  writeFileSync(join(dir, "small.md"), "x\n".repeat(3)); // clean
  const { warnings, errors } = checkFileLengthsTiered(
    ["big.md", "mid.md", "small.md", "gone.md"],
    dir,
    { warn: 5, error: 10 },
  );
  assert.deepEqual(errors, [{ file: "big.md", lines: 20 }]);
  assert.deepEqual(warnings, [{ file: "mid.md", lines: 7 }]);
  rmSync(dir, { recursive: true, force: true });
});
