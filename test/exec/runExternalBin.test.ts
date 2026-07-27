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

test("captures stderr from an external tool, on both the passing and failing paths", () => {
  // semgrep, the only external tool today, reports rule-loading errors and crashes
  // on stderr. Reading stdout alone reported those as a failure with nothing to
  // say about it. `node` stands in for it here: it is the one binary guaranteed on
  // PATH wherever this suite runs.
  const passing = runExternalBin(
    "node",
    ["-e", "console.log('out'); console.error('warn')"],
    process.cwd(),
  );
  assert.equal(passing.pass, true);
  assert.match(passing.output, /out/);
  assert.match(passing.output, /warn/, "a warning on a clean run must survive");

  const failing = runExternalBin(
    "node",
    ["-e", "console.error('the real diagnosis'); process.exit(1)"],
    process.cwd(),
  );
  assert.equal(failing.pass, false);
  assert.match(failing.output, /the real diagnosis/);
});
