import { test } from "node:test";
import assert from "node:assert/strict";
import { runExternalBin } from "../../src/exec/runExternalBin.ts";

test("throws a named 'not found' error when the external binary is absent (all platforms)", () => {
  // Regression guard: on Windows with shell:true a missing binary surfaces as a
  // generic non-zero exit (status 1, "is not recognized ..."), NOT ENOENT, so the
  // named remediation error was silently swallowed and the gate returned pass:false
  // with empty output instead. A missing tool must always be an unambiguous, named
  // failure — never confused with "the tool ran and found an issue".
  assert.throws(
    () =>
      runExternalBin(
        "forgeboard-definitely-absent-bin",
        ["--version"],
        process.cwd(),
      ),
    /forgeboard-definitely-absent-bin.*was not found/s,
  );
});
