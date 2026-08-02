// Coverage and test outcome classification, split out of lib.mjs by subject
// (ADR-0009). Each function distinguishes a genuine shortfall from a command
// that did not run to completion — the same three-outcome shape, applied to
// c8 / node:test and diff-cover. Every export is re-exported from lib.mjs, so
// consumers keep importing it from there unchanged.

/** Splits the test verdict from the coverage verdict (gate-5-push.md:
 *  "A broken coverage command blocks the push
 *  without claiming a shortfall") for a single combined `c8 --check-coverage ... node
 *  --test ...` invocation, rather than reporting one compound "either a test
 *  failed or coverage is below the floor" finding that cannot name its own
 *  cause.
 *
 *  Three outcomes, distinguished from the command's own output rather than
 *  its exit code (all three exit non-zero alike):
 *  - node:test's own spec-reporter summary line (`ℹ fail N` / `# fail N`,
 *    the same pattern gate-0-baseline.mjs already reads) names a failure
 *    count regardless of what coverage did — a test failure is a test
 *    failure whether or not coverage also happened to fall short.
 *  - c8's own "ERROR: Coverage for lines (X%) does not meet global
 *    threshold (Y%)" line only prints once the underlying command itself
 *    exited 0 and coverage alone fell short of `--lines=<threshold>`.
 *  - Neither line present, but the command still exited non-zero: the
 *    command itself did not run to completion (a missing file, a crashed
 *    process, a tool not installed) — genuinely unknown, and must not be
 *  reported as though it were a shortfall.
 *  @param {string} output */
export function classifyTestCoverageOutcome(output) {
  const failMatch = output.match(/# fail (\d+)|ℹ fail (\d+)/);
  const failCount = failMatch ? Number(failMatch[1] || failMatch[2]) : 0;
  if (failCount > 0) {
    return {
      kind: "test-failure",
      detail: `${failCount} unit test(s) failed`,
    };
  }
  const shortfall = output.match(
    /ERROR: Coverage for lines \(([\d.]+)%\) does not meet global threshold \(([\d.]+)%\)/,
  );
  if (shortfall) {
    return {
      kind: "coverage-shortfall",
      detail: `coverage is ${shortfall[1]}%, below the ${shortfall[2]}% floor`,
    };
  }
  return {
    kind: "broken-command",
    detail:
      "the command exited non-zero without a test-runner summary or a coverage report — it did not run to completion",
  };
}

/** Classify `diff-cover`'s own output for gate 6 check 8, "changed-line
 *  coverage" (gate-6-pull-request.md, "coverage and untrusted runs": the
 *  overall floor and the changed-line floor are two different numbers,
 *  computed two different ways, and both must be wired as blocking). The
 *  same three-outcome problem classifyTestCoverageOutcome above solves for
 *  c8: a genuine shortfall against `--fail-under` and a command that did
 *  not run to completion (the Cobertura report missing, the tool crashing)
 *  both exit non-zero, and the exit code alone cannot tell them apart —
 *  only diff-cover's own "Failure: Coverage (X%) is below the threshold
 *  (Y%)" line distinguishes a real shortfall from a broken run.
 *  @param {string} output */
export function classifyDiffCoverOutcome(output) {
  const shortfall = output.match(
    /Failure: Coverage \(([\d.]+)%\) is below the threshold \(([\d.]+)%\)/,
  );
  if (shortfall) {
    return {
      kind: "shortfall",
      detail: `changed-line coverage is ${shortfall[1]}%, below the ${shortfall[2]}% floor`,
    };
  }
  return {
    kind: "broken-command",
    detail:
      "diff-cover exited non-zero without a threshold-failure line — it did not run to completion (see the log above for why)",
  };
}

/** A percentage computed from zero measured items is unavailable,
 *  not a pass: on a run whose test suite crashed before executing anything,
 *  the Cobertura report it wrote has zero instrumented statements, diff-cover
 *  finds no changed line to check against it, and prints `Total: 0 lines` /
 *  `Coverage: 100%` — then exits 0, because zero missing out of zero met is
 *  a 100% ratio by the arithmetic alone. That is the exit-0 class inside the
 *  check gate 6's changed-line coverage exists to close, not a clean run:
 *  cross-gate-rules.md already says a check that could not run says so
 *  rather than asserting a cause, and a report covering nothing did not run
 *  in the sense that matters. Reads diff-cover's own `Total:` line — present
 *  whether the run passed or failed — rather than treating any zero-missing
 *  result as clean. `null` when the line never printed at all (the command
 *  did not get that far), distinct from a genuine `0`.
 *  @param {string} output */
export function diffCoverTotalLines(output) {
  const m = output.match(/^Total:\s*(\d+)\s*lines?/m);
  return m ? Number(m[1]) : null;
}

/** The figures a reader who is not a developer needs to see on the run's own
 *  page without downloading anything: the test pass/fail/total counts, and
 *  the overall lines-coverage percentage — read from the same c8 + node:test
 *  output classifyTestCoverageOutcome above already parses, so both read the
 *  one command actually ran rather than a second, divergent source. Returns
 *  `null` for a figure this output does not contain (a crashed run before
 *  either reporter printed) rather than a false zero — gate-6-pull-request.md
 *  "coverage legible without a download": a reader must see the number, not
 *  a plausible-looking placeholder standing in for a command that never
 *  finished.
 *  @param {string} output */
export function extractCoverageAndTestSummary(output) {
  const testsMatch = output.match(/# tests (\d+)|ℹ tests (\d+)/);
  const passMatch = output.match(/# pass (\d+)|ℹ pass (\d+)/);
  const failMatch = output.match(/# fail (\d+)|ℹ fail (\d+)/);
  const coverageMatch = output.match(
    /^All files\s*\|\s*[\d.]+\s*\|\s*[\d.]+\s*\|\s*[\d.]+\s*\|\s*([\d.]+)/m,
  );
  /** @param {RegExpMatchArray | null} m */
  const num = (m) => (m ? Number(m[1] || m[2]) : null);
  return {
    tests: num(testsMatch),
    pass: num(passMatch),
    fail: num(failMatch),
    linesCoveragePercent: coverageMatch ? Number(coverageMatch[1]) : null,
  };
}
