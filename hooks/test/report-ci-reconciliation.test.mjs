// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis Uncited uncited
// Split from approval-provenance-and-pr-body.test.mjs — subject group: report-ci-reconciliation.
// Loaded by hooks/test/hooks.test.mjs; not invoked directly by the test runner.
import { test } from "node:test";
import {
  extractGateFailLabels,
  findUnreconciledCiFindings,
  checkReportCiReconciliation,
} from "../../scripts/check-report-ci-reconciliation.mjs";
import assert from "node:assert/strict";

// --- Fix 76. "Verbatim" was the local run's output, and CI disagreed. Audit
// 18's own reproduction: the report quoted 12 lines of the local gate-6 run,
// osv-scanner correctly skipped there, and the report's own header claimed
// this was gate 6's output "copied ... verbatim". CI's job log, on the same
// commit, actually failed the check with six CVEs the report never
// mentioned. extractGateFailLabels reads a gate's own FAIL lines straight
// from a job log (fix 64's own instrument, never the capped annotations
// API); findUnreconciledCiFindings is the reconciliation itself.

test("extractGateFailLabels reads a gate's own FAIL lines, scoped to the named gate", () => {
  const log = [
    "gate 6: base origin/main, range origin/main...HEAD",
    "gate 6: FAIL cross-stack dependency scan (osv-scanner)",
    "        CVE-2026-2327, CVE-2026-59869",
    "gate 6: FAIL lint (eslint)",
    "gate 7: FAIL something unrelated",
  ].join("\n");
  assert.deepEqual(extractGateFailLabels(log, "gate 6"), [
    "cross-stack dependency scan (osv-scanner)",
    "lint (eslint)",
  ]);
  assert.deepEqual(extractGateFailLabels(log, "gate 7"), [
    "something unrelated",
  ]);
});

test("extractGateFailLabels finds nothing in a clean log", () => {
  assert.deepEqual(
    extractGateFailLabels("gate 6: base origin/main, range x\n", "gate 6"),
    [],
  );
});

// --- Fix 90. Audit 22: GATE_FAIL_RE never saw a real job log. Every real
// GitHub Actions log line is timestamp-prefixed, and the timestamp's own
// colons sat inside the character class the old regex required up to
// ": FAIL" — 0 labels extracted from 9 real `gate 6: FAIL` lines, on both
// the REST API job-log format (bare ISO-8601 prefix) and `gh run view
// --log` (job name, then step name, tab-separated, ahead of that same
// timestamp). REAL_JOB_LOG below is captured, unmodified output — not a
// hand-written string — from
// martincjarvis/guardrails-bootstrap-eval run 30691149682, job
// "gate 6 (ubuntu-latest)", fetched via
// `gh api repos/.../actions/jobs/<id>/logs`.

const REAL_JOB_LOG = [
  "2026-08-01T08:10:39.3338772Z gate 6: SKIP integration tests — none configured for any component yet; gate 5 has nothing to run",
  "2026-08-01T08:10:39.3340390Z gate 6: SKIP gate 4 — agent-context length: skills/guardrail-audit/SKILL.md is 240 lines (> 200 warn band)",
  "2026-08-01T08:10:39.3342096Z gate 6: SKIP gate 4 — agent-context length: skills/repository-bootstrap/SKILL.md is 467 lines (> 200 warn band)",
  "2026-08-01T08:10:39.3344402Z gate 6: FAIL dependency licence policy (docs/registers/dependency-licence-register.md)",
  "2026-08-01T08:10:39.3347271Z         @azu/style-format@1.0.1 carries licence 'WTFPL' (scope Development) — 'WTFPL' is not both OSI-approved and compatible with this repository's own licence, so accepting it is a human decision",
  "2026-08-01T08:10:39.3350113Z         record a human decision accepting it — name the record in this row's Decision record column and the person in Approver — or replace the dependency",
  "2026-08-01T08:10:39.3351719Z gate 6: FAIL dependency licence policy (docs/registers/dependency-licence-register.md)",
  "2026-08-01T08:10:39.3354937Z         @cspell/dict-en-common-misspellings@2.1.13 carries licence 'CC-BY-SA-4.0' (scope Development) — 'CC-BY-SA-4.0' is not both OSI-approved and compatible with this repository's own licence, so accepting it is a human decision",
  "2026-08-01T08:10:39.3358115Z         record a human decision accepting it — name the record in this row's Decision record column and the person in Approver — or replace the dependency",
  "2026-08-01T08:10:39.3359641Z gate 6: FAIL dependency licence policy (docs/registers/dependency-licence-register.md)",
  "2026-08-01T08:10:39.3362376Z         spdx-license-ids@3.0.23 carries licence 'CC0-1.0' (scope Development) — 'CC0-1.0' is not both OSI-approved and compatible with this repository's own licence, so accepting it is a human decision",
  "2026-08-01T08:10:39.3365539Z         record a human decision accepting it — name the record in this row's Decision record column and the person in Approver — or replace the dependency",
  "2026-08-01T08:10:39.3366301Z gate 6: FAIL dependency advisory scan (js-yaml)",
  "2026-08-01T08:10:39.3366914Z         js-yaml carries a high advisory (dev dependency): ghsa-pm4m-ph32-ghv5",
  "2026-08-01T08:10:39.3367765Z         upgrade the dependency, or accept it in an Accepted ADR naming the advisory id",
  "2026-08-01T08:10:39.3368810Z gate 6: FAIL dependency advisory scan (markdownlint-cli2)",
  "2026-08-01T08:10:39.3369833Z         markdownlint-cli2 carries a high advisory (dev dependency)",
  "2026-08-01T08:10:39.3370534Z         upgrade the dependency, or accept it in an Accepted ADR naming the advisory id",
  "2026-08-01T08:10:39.3371103Z gate 6: FAIL cross-stack dependency scan (osv-scanner)",
  "2026-08-01T08:10:39.3371491Z         GHSA-pm4m-ph32-ghv5",
  "2026-08-01T08:10:39.3372063Z         upgrade the flagged dependency, or record why the advisory does not apply",
  "2026-08-01T08:10:39.3372837Z gate 6: FAIL suppression register — approver (docs/registers/suppression-register.md)",
  "2026-08-01T08:10:39.3374763Z         'javascript.lang.security.audit.spawn-shell-true.spawn-shell-true' (hooks/lib/run.mjs) has no approver — every other column is complete, but a human must accept a suppression before it merges",
  "2026-08-01T08:10:39.3376094Z         name a human in the register row's Approved by column, or remove the suppression and fix the finding instead",
  "2026-08-01T08:10:39.3376915Z gate 6: FAIL suppression register — approver (docs/registers/suppression-register.md)",
  "2026-08-01T08:10:39.3378712Z         'javascript.lang.security.detect-child-process.detect-child-process' (hooks/lib/run.mjs) has no approver — every other column is complete, but a human must accept a suppression before it merges",
  "2026-08-01T08:10:39.3380264Z         name a human in the register row's Approved by column, or remove the suppression and fix the finding instead",
  "2026-08-01T08:10:39.3380918Z gate 6: FAIL gate 4 — change size / file length",
  "2026-08-01T08:10:39.3381830Z         gate 4: thresholds change-warn=400 change-error=800 file-length-error=400 (standard defaults; file class via git check-attr)",
].join("\n");

const REAL_JOB_LOG_FAIL_LABELS = [
  "dependency licence policy (docs/registers/dependency-licence-register.md)",
  "dependency licence policy (docs/registers/dependency-licence-register.md)",
  "dependency licence policy (docs/registers/dependency-licence-register.md)",
  "dependency advisory scan (js-yaml)",
  "dependency advisory scan (markdownlint-cli2)",
  "cross-stack dependency scan (osv-scanner)",
  "suppression register — approver (docs/registers/suppression-register.md)",
  "suppression register — approver (docs/registers/suppression-register.md)",
  "gate 4 — change size / file length",
];

test("extractGateFailLabels reads all 9 gate 6: FAIL labels from a real, unmodified job log — audit 22's own reproduction, where the pre-fix regex read 0", () => {
  assert.deepEqual(
    extractGateFailLabels(REAL_JOB_LOG, "gate 6"),
    REAL_JOB_LOG_FAIL_LABELS,
  );
});

test("extractGateFailLabels reads the same labels through `gh run view --log`'s extra job/step tab columns ahead of the timestamp", () => {
  const ghLogFormat = REAL_JOB_LOG.split("\n")
    .map(
      (line) =>
        `gate 6 (ubuntu-latest)\tGate 6 — re-run the gates 2-5 surface over the pull request range\t${line}`,
    )
    .join("\n");
  assert.deepEqual(
    extractGateFailLabels(ghLogFormat, "gate 6"),
    REAL_JOB_LOG_FAIL_LABELS,
  );
});

test("findUnreconciledCiFindings: the adversarial case — a report that says nothing at all, against a real job log with 9 real findings, is 9 findings, not 0", () => {
  const findings = findUnreconciledCiFindings(
    "This report says absolutely nothing about any gate finding.",
    REAL_JOB_LOG,
  );
  assert.equal(
    findings.length,
    REAL_JOB_LOG_FAIL_LABELS.length,
    "a check that reads 0 findings against a real log with 9 real FAIL lines cannot fail, and is not a check",
  );
});

test("findUnreconciledCiFindings reproduces audit 18's own case: a report with zero osv-scanner mentions, CI reporting a FAIL for it", () => {
  const reportText = [
    "## What remains open (copied from gate 6's own output)",
    "",
    "```",
    "gate 6: base origin/main, range origin/main...HEAD",
    "gate 6: FAIL lint (eslint)",
    "```",
  ].join("\n");
  const ciLog = [
    "gate 6: FAIL cross-stack dependency scan (osv-scanner)",
    "        CVE-2026-2327, CVE-2026-59869, CVE-2026-48988, CVE-2026-53550, CVE-2025-64718, CVE-2026-14257",
  ].join("\n");
  const findings = findUnreconciledCiFindings(reportText, ciLog);
  assert.equal(findings.length, 1);
  assert.match(
    findings[0].problem,
    /cross-stack dependency scan \(osv-scanner\)/,
  );
});

test("findUnreconciledCiFindings raises nothing once the report names the CI finding, wherever in the report it appears", () => {
  const reportText = [
    "## CI-only findings (fix 66)",
    "",
    "- cross-stack dependency scan (osv-scanner) — category 3: could not run locally, osv-scanner not installed; six CVEs found in CI, addressed in a follow-up commit.",
  ].join("\n");
  const ciLog = "gate 6: FAIL cross-stack dependency scan (osv-scanner)\n";
  assert.deepEqual(findUnreconciledCiFindings(reportText, ciLog), []);
});

test("findUnreconciledCiFindings raises nothing for a clean CI log, whatever the report says", () => {
  assert.deepEqual(
    findUnreconciledCiFindings("anything at all", "gate 6: base x\n"),
    [],
  );
});

test("checkReportCiReconciliation reads both files by path, injected for testing", () => {
  const files = {
    "report.md": "no mention of anything here",
    "ci.log": "gate 6: FAIL lint (eslint)\n",
  };
  const findings = checkReportCiReconciliation("report.md", "ci.log", {
    readFile: (p) => files[p],
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0].problem, /lint \(eslint\)/);
});
