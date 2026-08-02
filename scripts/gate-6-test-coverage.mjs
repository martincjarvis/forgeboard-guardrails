// The build/test/coverage verification leg of gate 6, extracted from
// gate-6-pull-request.mjs as its own subject seam: one command produces the
// JUnit and Cobertura artefacts, enforces the flat coverage floor, then a
// follow-up `diff-cover` invocation measures the lines this range actually
// touched against that report — the two coverage figures are produced
// together and reported together. gate-6-pull-request.mjs imports and
// re-exports `runBuildTestCoverage`; its public surface is unchanged.
import { existsSync } from "node:fs";
import {
  run,
  have,
  extractCoverageAndTestSummary,
  classifyTestCoverageOutcome,
  classifyDiffCoverOutcome,
  diffCoverTotalLines,
} from "./lib.mjs";

/** @typedef {{ check: string, path?: string, problem?: string, remedy?: string }} Finding */
/** @typedef {{ tests: number|null, pass: number|null, fail: number|null, linesCoveragePercent: number|null } | null} CoverageTestSummary */
/** @typedef {{ findings: Finding[], skips: string[], coverageTestSummary: CoverageTestSummary, changedLineCoveragePercent: number | null }} BuildTestCoverageResult */

/** Check 8 (gate 6) — changed-line coverage, reported on its own.
 *  A different question from the flat floor the build/lint/test block
 *  answers: a repository comfortably over its overall floor can add an
 *  entirely uncovered function and stay there. Its own function because it
 *  is a different gate's check, reading the report the block before it
 *  wrote.
 *  @param {string} base
 *  @returns {{ findings: Finding[], skips: string[], changedLineCoveragePercent: number | null }} */
export function runChangedLineCoverage(base) {
  /** @type {Finding[]} */
  const findings = [];
  /** @type {string[]} */
  const skips = [];
  /** @type {number | null} */
  let changedLineCoveragePercent = null;
  /** @param {string} check @param {string|undefined} path @param {string} problem @param {string} remedy */
  const fail = (check, path, problem, remedy) =>
    findings.push({ check, path, problem, remedy });
  /** @param {string} t */
  const skip = (t) => skips.push(t);

  // Check 8 (gate 6) — changed-line coverage (gate-6-pull-request.md
  // "coverage and untrusted runs"). A different number from the flat floor
  // above, computed a different way: a repository comfortably over its
  // overall floor can add an entirely uncovered function and stay there, so
  // this reads the Cobertura report the block above just wrote **and** the
  // diff against the range's base, and fails independently of the overall
  // figure. `diff-cover` is the Node-ecosystem tool the standard names — a
  // new dependency, and ADR-0002's own line ("analysis tools are dev
  // dependencies of whoever runs them") permits that; it is pinned in
  // package.json like every other analysis tool here, not fetched from the
  // network at run time.
  const COBERTURA_REPORT = "coverage/cobertura-coverage.xml";
  if (!existsSync(COBERTURA_REPORT)) {
    // The build/lint/test block above already reported why — a broken command
    // never reached either reporter — so this is a skip, not a second finding
    // for the same root cause.
    skip(
      "changed-line coverage — no coverage report produced by the run above; see the coverage/unit-tests finding for why",
    );
  } else if (have("npx", ["--no-install", "diff-cover", "--version"])) {
    const dc = run("npx", [
      "--no-install",
      "diff-cover",
      COBERTURA_REPORT,
      "--compare-branch",
      base,
      "--fail-under",
      "80",
    ]);
    const dcOut = (dc.stdout || "") + (dc.stderr || "");
    process.stderr.write(dcOut);
    // A Cobertura report with zero instrumented statements (an
    // earlier step's test run crashed before writing real coverage) makes
    // diff-cover print `Total: 0 lines` and `Coverage: 100%`, exiting 0: a
    // percentage from an empty denominator, not a pass. Checked before the
    // exit-code branch below, and regardless of it, so this case cannot be
    // read as a clean 100%.
    const dcTotal = diffCoverTotalLines(dcOut);
    if (dcTotal === 0) {
      changedLineCoveragePercent = null;
      skip(
        "changed-line coverage — the report covers zero instrumented statements (Total: 0 lines); a percentage from an empty denominator is not a pass — see the coverage/unit-tests finding above for why nothing was measured",
      );
    } else {
      const dcPercent = /^Coverage: ([\d.]+)%/m.exec(dcOut);
      changedLineCoveragePercent = dcPercent ? Number(dcPercent[1]) : null;
      if (dc.status !== 0) {
        const outcome = classifyDiffCoverOutcome(dcOut);
        fail(
          "changed-line coverage",
          undefined,
          outcome.detail,
          "add tests for the uncovered lines diff-cover named above",
        );
      }
    }
  } else {
    skip(
      "changed-line coverage — diff-cover not installed; run `npm install` to pull the dev dependency",
    );
  }

  return { findings, skips, changedLineCoveragePercent };
}

/** Runs the whole-repository build, lint and test suite (checks 12 & 13,
 *  gate 2, plus gate 6 check 4 and gate 5 check 1), then the changed-line
 *  coverage check (gate 6 check 8). gate-6-pull-request.md's own point:
 *  "the local gates skip untouched components for speed; this gate does
 *  not, so the optimisation never becomes an unverified claim." `base` is
 *  the already-resolved pull-request base, passed to `diff-cover` as
 *  `--compare-branch`. Returns the two coverage figures alongside the
 *  findings/skips so the report leg can render them on this run's own page
 *  whether it passed or failed.
 *  @param {{ base: string }} args
 *  @returns {BuildTestCoverageResult} */
export function runBuildTestCoverage({ base }) {
  /** @type {Finding[]} */
  const findings = [];
  /** @type {string[]} */
  const skips = [];
  /** @param {string} check @param {string | undefined} path @param {string} problem @param {string} remedy */
  const fail = (check, path, problem, remedy) =>
    findings.push({ check, path, problem, remedy });
  /** @param {string} s */
  const skip = (s) => skips.push(s);

  const build = run("npm", ["run", "build"]);
  if (build.status !== 0) {
    fail(
      "build (tsc)",
      undefined,
      (build.stdout || "") + (build.stderr || ""),
      "fix the type/analysis error above; a warning is a failure",
    );
  }
  // Check 11 (gate 2) — per-path lint. Whole-repository, not range-scoped,
  // for the same reason build and test just above are: this gate does not
  // take the local gates' skip-untouched-component shortcut.
  const lint = run("npm", ["run", "lint"]);
  if (lint.status !== 0) {
    fail(
      "lint (eslint)",
      undefined,
      (lint.stdout || "") + (lint.stderr || ""),
      "fix the lint violation; a warning is a failure",
    );
  }
  const test = run("npx", [
    "c8",
    "--check-coverage",
    "--lines=80",
    "--reporter=text",
    "--reporter=cobertura",
    "node",
    "--test",
    "--test-reporter=spec",
    "--test-reporter-destination=stdout",
    "--test-reporter=junit",
    "--test-reporter-destination=test-results.xml",
    "hooks/test/hooks.test.mjs",
  ]);
  const testOut = (test.stdout || "") + (test.stderr || "");
  process.stderr.write(testOut);
  // Read regardless of pass/fail — a reader on a failing run needs the same
  // figures a passing one shows, not a placeholder that only appears when
  // everything already went right.
  // Read regardless of pass or fail: a reader on a failing run needs the same
  // figures a passing one shows.
  /** @type {CoverageTestSummary} */
  const coverageTestSummary = extractCoverageAndTestSummary(testOut);
  if (test.status !== 0) {
    // Name which of the two this actually was, rather than a
    // compound "either...or" finding that cannot name its own cause
    // (gate-5-push.md: "A broken coverage command blocks the push without
    // claiming a shortfall").
    const outcome = classifyTestCoverageOutcome(testOut);
    if (outcome.kind === "test-failure") {
      fail(
        "unit tests",
        undefined,
        outcome.detail,
        "fix the failing test(s); the output above names each one",
      );
    } else if (outcome.kind === "coverage-shortfall") {
      fail(
        "coverage",
        undefined,
        outcome.detail,
        "add tests for the uncovered lines the report above names",
      );
    } else {
      fail(
        "unit tests / coverage",
        undefined,
        outcome.detail,
        "read the output above for why the command itself could not run",
      );
    }
  }
  // Gate 5 check 2 — integration tests. None configured for any component
  // yet (gate-5-push.mjs states the same visible skip locally).
  skip(
    "integration tests — none configured for any component yet; gate 5 has nothing to run",
  );

  const changed = runChangedLineCoverage(base);
  findings.push(...changed.findings);
  skips.push(...changed.skips);
  const changedLineCoveragePercent = changed.changedLineCoveragePercent;

  return { findings, skips, coverageTestSummary, changedLineCoveragePercent };
}
