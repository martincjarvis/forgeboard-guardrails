// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis Uncited uncited bypassable
// Split from hooks.test.mjs — subject group: scan-output-classification.
// Classifies scan tools' output into clean / finding / unavailable: c8 and
// diff-cover coverage outcomes (scripts/lib.mjs), and osv-scanner
// (check-osv-scanner.mjs + lib.mjs). Loaded by hooks/test/hooks.test.mjs;
// not invoked directly by the test runner.
import { test } from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  classifyTestCoverageOutcome,
  extractCoverageAndTestSummary,
  classifyDiffCoverOutcome,
  diffCoverTotalLines,
  classifyOsvScannerOutcome,
  extractOsvJsonFindings,
  extractOsvSarifFindings,
} from "../../scripts/lib.mjs";
import { checkOsvScanner } from "../../scripts/check-osv-scanner.mjs";
import assert from "node:assert/strict";

// --- scripts/lib.mjs:classifyTestCoverageOutcome — gate-5-push.md:
// "A broken coverage command blocks the push without claiming a shortfall."
// The combined `c8 --check-coverage ... node --test ...` command exits
// non-zero for three different reasons; these are real captured output
// shapes from each (node --test's own TAP/spec summary line, c8's own
// threshold message, and a command that never got that far), not
// hypothetical fixtures.

test("classifyTestCoverageOutcome: a failing unit test is named as a test failure, not folded into coverage", () => {
  const output =
    "✖ a failing test (1.2ms)\nℹ tests 1\nℹ suites 0\nℹ pass 0\nℹ fail 1\n" +
    "ℹ cancelled 0\nℹ skipped 0\nℹ todo 0\n" +
    "----------|---------|----------|---------|---------|-------------------\n" +
    "All files |       0 |        0 |       0 |       0 |                   \n";
  const outcome = classifyTestCoverageOutcome(output);
  assert.equal(outcome.kind, "test-failure");
  assert.match(outcome.detail, /1 unit test\(s\) failed/);
});

test("classifyTestCoverageOutcome: a genuine coverage shortfall is named as coverage, with the actual percentages", () => {
  const output =
    "✔ a passing test (0.6ms)\nℹ tests 1\nℹ suites 0\nℹ pass 1\nℹ fail 0\n" +
    "ℹ cancelled 0\nℹ skipped 0\nℹ todo 0\n" +
    "ERROR: Coverage for lines (67.33%) does not meet global threshold (99.9%)\n";
  const outcome = classifyTestCoverageOutcome(output);
  assert.equal(outcome.kind, "coverage-shortfall");
  assert.match(outcome.detail, /67\.33%.*99\.9%/s);
});

test("classifyTestCoverageOutcome: a command that never ran (neither summary present) is its own outcome, not a guessed shortfall", () => {
  // The real shape of `c8 ... node --test nonexistent.mjs`: neither node:test's
  // summary nor c8's threshold message ever prints, because node --test itself
  // errored out before producing either.
  const output =
    "Could not find 'hooks/test/nonexistent.mjs'\n" +
    "----------|---------|----------|---------|---------|-------------------\n" +
    "All files |       0 |        0 |       0 |       0 |                   \n";
  const outcome = classifyTestCoverageOutcome(output);
  assert.equal(outcome.kind, "broken-command");
  assert.doesNotMatch(
    outcome.detail,
    /shortfall|below the .* floor|%/,
    "must not claim a coverage shortfall when the command never ran to completion",
  );
});

// extractCoverageAndTestSummary — "coverage legible
// without a download" needs the test counts and the coverage percentage on
// the run's own page whether the run passed or failed, so
// scripts/gate-6-pull-request.mjs reads them from the same command output
// classifyTestCoverageOutcome above already parses, rather than a second,
// divergent source.

test("extractCoverageAndTestSummary reads the test counts and lines-coverage percentage from a passing run's real output shape", () => {
  const output =
    "✔ a passing test (0.6ms)\nℹ tests 132\nℹ suites 0\nℹ pass 132\nℹ fail 0\n" +
    "ℹ cancelled 0\nℹ skipped 0\nℹ todo 0\n" +
    "----------|---------|----------|---------|---------|-------------------\n" +
    "All files |   80.44 |    73.54 |   85.81 |   80.44 |                   \n";
  const summary = extractCoverageAndTestSummary(output);
  assert.deepEqual(summary, {
    tests: 132,
    pass: 132,
    fail: 0,
    linesCoveragePercent: 80.44,
  });
});

test("extractCoverageAndTestSummary reads the same figures on a failing run — coverage legible without a download applies there too", () => {
  const output =
    "✖ a failing test (1.2ms)\nℹ tests 132\nℹ suites 0\nℹ pass 131\nℹ fail 1\n" +
    "ℹ cancelled 0\nℹ skipped 0\nℹ todo 0\n" +
    "----------|---------|----------|---------|---------|-------------------\n" +
    "All files |   79.84 |    73.54 |   85.81 |   79.84 |                   \n";
  const summary = extractCoverageAndTestSummary(output);
  assert.deepEqual(summary, {
    tests: 132,
    pass: 131,
    fail: 1,
    linesCoveragePercent: 79.84,
  });
});

test("extractCoverageAndTestSummary returns null figures, never a false zero, when the command never reached either reporter", () => {
  const output = "Could not find 'hooks/test/nonexistent.mjs'\n";
  const summary = extractCoverageAndTestSummary(output);
  assert.deepEqual(summary, {
    tests: null,
    pass: null,
    fail: null,
    linesCoveragePercent: null,
  });
});

// classifyDiffCoverOutcome — gate 6 check 8, "changed-line coverage" (fix
// 42; gate-6-pull-request.md "coverage and untrusted runs": the overall
// floor and the changed-line floor are two different numbers, computed two
// different ways, and both must be wired as blocking). Same disambiguation
// problem as classifyTestCoverageOutcome above, on diff-cover's own output
// instead of c8's: a genuine shortfall against `--fail-under` and a command
// that did not run to completion (report missing, tool crashed) both exit
// non-zero, and only the output text tells them apart.

test("classifyDiffCoverOutcome: a genuine changed-line shortfall is named as shortfall, with the actual percentages", () => {
  const output =
    "-------------\nDiff Coverage\n-------------\n" +
    "scripts/gate-6-pull-request.mjs (16.1%): Missing lines 75-83\n" +
    "-------------\nTotal:   40 lines\nMissing: 8 lines\nCoverage: 80%\n-------------\n\n" +
    "Failure: Coverage (80%) is below the threshold (95%)\n";
  const outcome = classifyDiffCoverOutcome(output);
  assert.equal(outcome.kind, "shortfall");
  assert.match(outcome.detail, /80%.*95%/s);
});

test("classifyDiffCoverOutcome: a command that never produced a coverage line is its own outcome, not a guessed shortfall", () => {
  const output = "Error: no such file 'coverage/cobertura-coverage.xml'\n";
  const outcome = classifyDiffCoverOutcome(output);
  assert.equal(outcome.kind, "broken-command");
  assert.doesNotMatch(
    outcome.detail,
    /shortfall|below the .* threshold|%/,
    "must not claim a changed-line shortfall when the command never ran to completion",
  );
});

// diffCoverTotalLines — a test suite that crashed before
// executing anything left a Cobertura report with zero instrumented
// statements; diff-cover found no changed line to check against it and
// printed `Total: 0 lines` / `Coverage: 100%`, exiting 0. Nothing escaped
// that particular run (the unit-test failure blocked separately), but the
// same shape passes silently on a suite that exits 0 having exercised
// nothing — the exit-0 class the changed-line coverage check exists to
// close, reproduced inside the check itself.

test("diffCoverTotalLines: the audit's own zero-statement report is read as zero, not ignored", () => {
  const output = "Total:   0 lines\nMissing: 0 lines\nCoverage: 100%\n";
  assert.equal(diffCoverTotalLines(output), 0);
});

test("diffCoverTotalLines: a genuine report with measured lines is read as its real total", () => {
  const output =
    "-------------\nDiff Coverage\n-------------\n" +
    "scripts/gate-6-pull-request.mjs (16.1%): Missing lines 75-83\n" +
    "-------------\nTotal:   40 lines\nMissing: 8 lines\nCoverage: 80%\n-------------\n";
  assert.equal(diffCoverTotalLines(output), 40);
});

test("diffCoverTotalLines: output with no Total: line at all (the command never got that far) is null, distinct from a genuine zero", () => {
  assert.equal(
    diffCoverTotalLines(
      "Error: no such file 'coverage/cobertura-coverage.xml'\n",
    ),
    null,
  );
});

// --- scripts/check-osv-scanner.mjs — osv-scanner is external,
// PATH-resolved and never bundled (ADR-0002), exactly like semgrep and
// lizard.
//
// This used to call checkOsvScanner() with no injected collaborator
// and rely on osv-scanner genuinely being absent from the host running the
// test. A bootstrapped repo's CI failure (`1 unit test(s)
// failed` in CI, green locally) was traced to exactly that coupling:
// .github/workflows/pull-request.yml installs osv-scanner (`go install
// .../osv-scanner@latest`) before running this suite, so the tool this test
// required to be absent was already on PATH by the time it ran — the
// workflow installed the precondition its own test depended on not holding.
// The sibling checkBranchProtection tests inject `have`/`run` for exactly
// this reason (check-branch-protection.mjs); checkOsvScanner now takes the
// same injectable shape, and this asserts the skip path through an injected
// absence — deterministic regardless of what happens to be on the PATH of
// whatever host or CI runner executes it.
test("osv-scanner check is a visible skip, naming the tool, when it is not on PATH", () => {
  const { findings, skips } = checkOsvScanner({ have: () => false });
  assert.deepEqual(
    findings,
    [],
    "an unavailable tool must never read as a passing scan",
  );
  assert.equal(skips.length, 1);
  const skip = skips[0];
  assert.ok(skip, "expected a skip");
  assert.match(skip, /osv-scanner/);
  assert.match(skip, /not on PATH/);
});

// --- lib.mjs:classifyOsvScannerOutcome / extractOsvJsonFindings /
// extractOsvSarifFindings — on a live CI run: gate 6 failed
// "cross-stack dependency scan (osv-scanner)" with the tool's own startup
// banner ("Scanning dir .\nScanning ... at commit d43f2a3\nScanned
// .../package-lock.json file and found 476 packages") as the problem text —
// no vulnerability id anywhere in it — while the standalone osv-scanner check
// on the same commit passed with zero findings. check-osv-scanner.mjs and
// gate-6-pull-request.mjs both used to treat any non-zero exit as a finding
// and dump raw stdout+stderr; this proves the refusal-proof rule
// (cross-gate-rules.md: "a refusal names the specific thing being refused; a
// refusal whose problem text contains no identifier is itself a finding")
// both directions: a real advisory names a finding, a scanner failure names
// an unavailable result instead.
test("extractOsvJsonFindings: a real advisory in osv-scanner's own --format json shape is named", () => {
  const stdout = JSON.stringify({
    results: [
      {
        source: { path: "package-lock.json", type: "lockfile" },
        packages: [
          {
            package: { name: "left-pad", version: "1.0.0", ecosystem: "npm" },
            vulnerabilities: [{ id: "GHSA-aaaa-bbbb-cccc" }],
          },
        ],
      },
    ],
  });
  assert.deepEqual(extractOsvJsonFindings(stdout), ["GHSA-aaaa-bbbb-cccc"]);
});

test("extractOsvJsonFindings: osv-scanner's own startup banner — text that looks like a finding — names no vulnerability", () => {
  const banner =
    "Scanning dir .\n" +
    "Scanning ... at commit d43f2a3\n" +
    "Scanned .../package-lock.json file and found 476 packages\n";
  assert.deepEqual(extractOsvJsonFindings(banner), []);
});

test("extractOsvSarifFindings: a real advisory in the SARIF gate 6 uploads is named by its ruleId", () => {
  const tmp = mkdtempSync(join(tmpdir(), "osv-sarif-"));
  const sarif = join(tmp, "osv-results.sarif");
  writeFileSync(
    sarif,
    JSON.stringify({
      runs: [{ results: [{ ruleId: "GHSA-aaaa-bbbb-cccc" }] }],
    }),
  );
  try {
    assert.deepEqual(extractOsvSarifFindings(sarif), ["GHSA-aaaa-bbbb-cccc"]);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("extractOsvSarifFindings: a SARIF file with no results — every finding suppressed, or none found — names nothing", () => {
  const tmp = mkdtempSync(join(tmpdir(), "osv-sarif-"));
  const sarif = join(tmp, "osv-results.sarif");
  writeFileSync(sarif, JSON.stringify({ runs: [{ results: [] }] }));
  try {
    assert.deepEqual(extractOsvSarifFindings(sarif), []);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("extractOsvSarifFindings: an unreadable file names nothing rather than throwing", () => {
  assert.deepEqual(
    extractOsvSarifFindings(join(tmpdir(), "does-not-exist.sarif")),
    [],
  );
});

test("classifyOsvScannerOutcome: exit 0 is clean, whatever findings were somehow extracted", () => {
  const outcome = classifyOsvScannerOutcome(0, ["GHSA-aaaa-bbbb-cccc"]);
  assert.equal(outcome.kind, "clean");
});

test("classifyOsvScannerOutcome: a non-zero exit with a named vulnerability is the finding, by id", () => {
  const outcome = classifyOsvScannerOutcome(1, ["GHSA-aaaa-bbbb-cccc"]);
  assert.equal(outcome.kind, "vulnerabilities");
  assert.deepEqual(outcome.findings, ["GHSA-aaaa-bbbb-cccc"]);
});

test("classifyOsvScannerOutcome: a non-zero exit with no named vulnerability is unavailable, not a finding", () => {
  const outcome = classifyOsvScannerOutcome(127, []);
  assert.equal(outcome.kind, "unavailable");
  assert.ok(outcome.detail, "an unavailable outcome carries its own detail");
  assert.doesNotMatch(
    outcome.detail,
    /GHSA|CVE|OSV-/,
    "must not assert a vulnerability the evidence does not name",
  );
  assert.match(outcome.detail, /127/, "names the exit status it saw");
});

// checkOsvScanner end to end, through its injected run() — proves the fix
// where it actually ships (gate 5's local check), not only in the pure
// classifier: that banner must be a skip, and a real advisory must
// still be a finding.
test("checkOsvScanner: a scanner failure with no parseable finding (the startup banner) is an unavailable skip, never a finding", () => {
  const banner =
    "Scanning dir .\n" +
    "Scanning ... at commit d43f2a3\n" +
    "Scanned .../package-lock.json file and found 476 packages\n";
  const { findings, skips } = checkOsvScanner({
    have: () => true,
    run: () => ({ status: 127, stdout: "", stderr: banner }),
  });
  assert.deepEqual(
    findings,
    [],
    "a refusal with no named vulnerability must never block as a finding",
  );
  assert.equal(skips.length, 1);
  const skip = skips[0];
  assert.ok(skip, "expected a skip");
  assert.match(skip, /osv-scanner/);
  assert.doesNotMatch(skip, /GHSA|CVE|OSV-/);
});

test("checkOsvScanner: a real advisory in osv-scanner's JSON output is a finding, named by id", () => {
  const stdout = JSON.stringify({
    results: [
      {
        source: { path: "package-lock.json", type: "lockfile" },
        packages: [
          {
            package: { name: "left-pad", version: "1.0.0", ecosystem: "npm" },
            vulnerabilities: [{ id: "GHSA-aaaa-bbbb-cccc" }],
          },
        ],
      },
    ],
  });
  const { findings, skips } = checkOsvScanner({
    have: () => true,
    run: () => ({ status: 1, stdout, stderr: "" }),
  });
  assert.equal(skips.length, 0);
  assert.equal(findings.length, 1);
  const finding = findings[0];
  assert.ok(finding, "expected one finding");
  assert.match(finding.problem, /GHSA-aaaa-bbbb-cccc/);
});
