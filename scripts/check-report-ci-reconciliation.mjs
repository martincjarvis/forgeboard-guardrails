// Fix 76 — "verbatim" was the local run's output, and CI disagreed.
//
// Audit 18, on a commit whose subject was "record gate 6 output verbatim in
// the bootstrap report": the report's quoted block had 12 lines and zero
// osv-scanner mentions — the *local* run's output, where osv-scanner
// correctly skipped (not on PATH). CI, on that same commit, reported:
//
//   gate 6: FAIL cross-stack dependency scan (osv-scanner)
//           CVE-2026-2327, CVE-2026-59869, CVE-2026-48988, CVE-2026-53550, CVE-2025-64718, CVE-2026-14257
//
// Six real CVEs the report never mentioned, while its own header claimed
// "what remains open (copied from gate 6's own output)" — true of the local
// run, false against the live state. Fixes 65 and 69 govern the moment a
// pull request is *opened*; nothing governs the moment CI *disagrees with
// the local run* — which is exactly when fix 66's four gap categories were
// supposed to apply. This module is that trigger: it reads a gate's own
// FAIL lines straight out of a CI job log — the instrument cross-gate-rules.md
// (#a-reports-gate-output-is-provisional-until-ci-has-produced-its-own) already
// requires ("read a gate's own output — the job log, the command's own
// transcript — not a platform's summary of it"), never the annotations API,
// which caps at 10 and truncates silently — and flags any line the report
// text never mentions.
//
// Deliberately a citation-shaped check, the same restraint
// check-pr-body-artefacts.mjs already states for itself: this does not
// judge whether the report's categorisation of a CI-only finding is right,
// or whether its prose is honest — only whether the finding's own label, as
// CI printed it, appears anywhere in the report at all. A label present
// only in the report's own quoted "verbatim" block still counts — this
// module does not care which section reconciled it, only that a human
// reading the report is not left believing CI agreed with something it did
// not.
//
// A step after, not a precondition: this cannot run before the pipeline
// that produces the blocking verdict has completed, so it is never wired
// into gate 6 itself — it verifies the *report*, once CI's log exists, and
// is run by hand (or as a CI step reading its own prior job's log) before
// the pull request is presented as ready. See gate-6-pull-request.md's
// "Running it by hand" and skills/repository-bootstrap/SKILL.md's fix-66
// paragraph for where it is invoked.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { report } from "./lib.mjs";

const GATE_FAIL_RE = /^([\w .()-]+?): FAIL (.+)$/;

// Fix 90 — a real job log is never the bare "<gate>: FAIL <label>" text
// GATE_FAIL_RE expects. Two real shapes, both observed against the same run:
//
//   REST API job log (`gh api .../logs`, and what a workflow step reads from
//   its own log): every line is timestamp-prefixed —
//     2026-08-01T08:10:39.3344402Z gate 6: FAIL dependency licence policy (…)
//
//   `gh run view --log`: two more tab-separated columns first, job name then
//   step name, before that same timestamp —
//     gate 6 (ubuntu-latest)\tGate 6 — re-run …\t2026-08-01T08:10:39.33…Z gate 6: FAIL …
//
// The timestamp's own colons sit inside the `[\w .()-]` class GATE_FAIL_RE
// requires up to ": FAIL", so the regex never reaches the real marker —
// audit 22 measured 0 labels extracted from 9 real FAIL lines. Strip
// whichever job/step columns are present (rightmost tab), then the ISO-8601
// timestamp, before matching.
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s*/;

function stripLogLinePrefix(rawLine) {
  const lastTab = rawLine.lastIndexOf("\t");
  const withoutColumns = lastTab === -1 ? rawLine : rawLine.slice(lastTab + 1);
  return withoutColumns.replace(ISO_TIMESTAMP_RE, "");
}

/** Every `<gate>: FAIL <label>` line in `logText` — the exact shape
 *  `report()` (this file's own sibling, used by every gate script here)
 *  writes to stderr for a real finding, one line per finding, `label`
 *  carrying the check name and, where the finding names a path, its `(path)`
 *  suffix already folded in by `report()` itself. Scoped to `gate` (default
 *  "gate 6" — the authoritative gate this fix exists for) so a job log
 *  covering more than one gate does not cross-attribute a line. */
export function extractGateFailLabels(logText, gate = "gate 6") {
  const labels = [];
  for (const rawLine of (logText || "").split(/\r?\n/)) {
    const line = stripLogLinePrefix(rawLine).trim();
    const m = GATE_FAIL_RE.exec(line);
    if (!m) continue;
    if (m[1].trim() !== gate) continue;
    labels.push(m[2].trim());
  }
  return labels;
}

/** Every CI FAIL label with no mention anywhere in `reportText` — a
 *  case-insensitive substring test, the same structural (not prose-honesty)
 *  restraint `citesReservedArtefact` already states for the sibling PR-body
 *  check. A report that genuinely reconciled the finding names it somewhere,
 *  in whichever section fix 66 puts it. */
export function findUnreconciledCiFindings(
  reportText,
  logText,
  gate = "gate 6",
) {
  const haystack = (reportText || "").toLowerCase();
  return extractGateFailLabels(logText, gate)
    .filter((label) => !haystack.includes(label.toLowerCase()))
    .map((label) => ({
      check: "report / CI reconciliation",
      path: "",
      problem:
        `${gate} FAIL "${label}" appears in the CI job log but nowhere in the report — ` +
        "an override is not a fix, and a skip is not a pass: a finding CI produced that the " +
        "report does not mention is not reconciled, whatever the report's own header claims",
      remedy:
        "record this finding in the report, categorised against cross-gate-rules.md's four " +
        "gap kinds, before presenting the pull request as ready",
    }));
}

/** Production entry point: reads both files from disk. `readFile` is
 *  injectable for testing, the same shape every other check here takes. */
export function checkReportCiReconciliation(
  reportPath,
  logPath,
  { gate = "gate 6", readFile = (p) => readFileSync(p, "utf8") } = {},
) {
  return findUnreconciledCiFindings(
    readFile(reportPath),
    readFile(logPath),
    gate,
  );
}

const isMain =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = process.argv.slice(2);
  const reportPath = args[0];
  const logPath = args[1];
  const gateIdx = args.indexOf("--gate");
  const gate = gateIdx !== -1 ? args[gateIdx + 1] : "gate 6";
  if (!reportPath || !logPath) {
    process.stderr.write(
      "usage: node scripts/check-report-ci-reconciliation.mjs <report.md> <ci-job-log.txt> [--gate 'gate 6']\n",
    );
    process.exit(1);
  }
  report(
    "report / CI reconciliation",
    checkReportCiReconciliation(reportPath, logPath, { gate }),
  );
}
