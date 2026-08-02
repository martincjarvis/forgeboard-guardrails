// The reporting/reconciliation leg of gate 6, extracted from
// gate-6-pull-request.mjs as its own subject seam: GitHub-native error
// annotations, the step-summary block (with the coverage figures produced by
// gate-6-test-coverage.mjs rendered on this run's own page), and the final
// `report()` call that sets the exit code. gate-6-pull-request.mjs imports
// and re-exports `writeGate6Report`; its public surface is unchanged.
import { appendFileSync } from "node:fs";
import { report } from "./lib.mjs";

/** @typedef {{ check: string, path?: string, problem?: string, remedy?: string }} Finding */
/** @typedef {{ tests: number|null, pass: number|null, fail: number|null, linesCoveragePercent: number|null } | null} CoverageTestSummary */

/** Writes the gate-6 report surface for this run: GitHub-native `::error`
 *  annotations on the changed lines of the pull request (no extra action or
 *  artefact download needed for the checks this script owns directly — the
 *  SARIF upload step in the workflow covers semgrep the same native way),
 *  the `$GITHUB_STEP_SUMMARY` block with the coverage figures legible without
 *  a download, and the final `report("gate 6", ...)` that sets the exit
 *  code. `null` (the command crashed before either reporter printed) is shown
 *  as its own line rather than silently omitted, which would read the same
 *  as zero.
 *  @param {{ findings: Finding[], skips: string[], coverageTestSummary: CoverageTestSummary, changedLineCoveragePercent: number | null, range: string, changed: string[] }} args */
export function writeGate6Report({
  findings,
  skips,
  coverageTestSummary,
  changedLineCoveragePercent,
  range,
  changed,
}) {
  const onActions = process.env.GITHUB_ACTIONS === "true";
  /** @param {Finding} f */
  function annotate(f) {
    if (!onActions) return;
    const m = /^(.*):(\d+)$/.exec(f.path || "");
    const loc = m
      ? `file=${m[1]},line=${m[2]}`
      : f.path
        ? `file=${f.path}`
        : "";
    const msg = `${f.check}: ${((f.problem || "").toString().split("\n")[0] ?? "").slice(0, 400)}`;
    console.log(loc ? `::error ${loc}::${msg}` : `::error::${msg}`);
  }

  for (const f of findings) annotate(f);

  function coverageTestLines() {
    if (!coverageTestSummary) {
      return [
        "**Coverage and tests:** the test/coverage command did not produce a " +
          "readable summary — see the job log for why it did not run to completion.",
      ];
    }
    const {
      tests,
      pass,
      fail: failCount,
      linesCoveragePercent,
    } = coverageTestSummary;
    const testPart =
      tests === null || tests === undefined
        ? "test counts unavailable"
        : `${pass ?? "?"}/${tests} test(s) passed${failCount ? ` (${failCount} failed)` : ""}`;
    const coveragePart =
      linesCoveragePercent === null || linesCoveragePercent === undefined
        ? "line coverage unavailable"
        : `${linesCoveragePercent}% line coverage (overall floor)`;
    // Check 8's own figure, distinct from the overall floor above — evidence
    // row 11's "delta against the base" (gate-6-pull-request.md "coverage
    // legible without a download").
    const changedLinePart =
      changedLineCoveragePercent === null ||
      changedLineCoveragePercent === undefined
        ? "changed-line coverage unavailable"
        : `${changedLineCoveragePercent}% changed-line coverage`;
    return [
      `**Coverage and tests:** ${testPart} · ${coveragePart} · ${changedLinePart}`,
    ];
  }

  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) {
    const lines = [
      "## Gate 6 — pull request checks",
      "",
      `Range: \`${range}\` — ${changed.length} file(s) changed.`,
      "",
      ...coverageTestLines(),
      "",
      findings.length
        ? `**${findings.length} finding(s):**`
        : "**No findings.**",
      ...findings.map(
        (f) =>
          `- \`${f.check}\`${f.path ? ` (${f.path})` : ""}: ${f.problem ?? ""}`,
      ),
      "",
      skips.length ? `**${skips.length} skipped check(s):**` : "",
      ...skips.map((s) => `- ${s}`),
      "",
    ];
    try {
      appendFileSync(summaryFile, lines.join("\n") + "\n");
    } catch {
      /* best effort — evidence still went to stderr/annotations above */
    }
  }

  report("gate 6", findings, skips);
}
