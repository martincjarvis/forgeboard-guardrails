// Security-scan output and SARIF processing, split out of lib.mjs by subject
// (ADR-0009). Covers osv-scanner and semgrep outcome classification, the
// finding extractors for their JSON / SARIF shapes, and the SARIF transforms
// gate 6 applies before upload. Every export is re-exported from lib.mjs, so
// consumers keep importing it from there unchanged.
import { readFileSync, writeFileSync } from "node:fs";

/** GitHub's code-scanning ingestion treats a SARIF `artifactLocation.uri`
 *  with backslashes as naming a different file from the same path written
 *  with forward slashes. pull-request.yml runs the identical semgrep scan on
 *  two matrix legs; on Linux it already emits `hooks/lib/run.mjs`, but the
 *  Windows leg emits `hooks\lib\run.mjs` — GitHub's ingestion never
 *  reconciles the two, so the same finding double-counts, cannot anchor to
 *  the changed lines it should annotate, and cannot be dismissed once for
 *  both legs. Every artifact URI in the file is normalised to forward
 *  slashes before the workflow uploads it — a no-op on Linux, where the
 *  paths already are forward slashes. A missing or unreadable file is left
 *  alone; the caller's own status check reports that separately.
 *  @param {string} path */
export function normalizeSarifPaths(path) {
  let sarif;
  try {
    sarif = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return;
  }
  for (const run_ of sarif.runs ?? []) {
    for (const result of run_.results ?? []) {
      for (const loc of result.locations ?? []) {
        const artifact = loc.physicalLocation?.artifactLocation;
        if (artifact && typeof artifact.uri === "string") {
          artifact.uri = artifact.uri.replace(/\\/g, "/");
        }
      }
    }
  }
  writeFileSync(path, JSON.stringify(sarif));
}

/** semgrep's SARIF output includes a finding suppressed in source
 *  (an inline marker comment) rather than omitting it, marking it
 *  `suppressions: [{ kind: "inSource" }]` so a consumer can choose to hide
 *  it. gate-6-pull-request.mjs's own check honours the suppression and
 *  exits 0 — the register row is what accepted it. GitHub's code-scanning
 *  check is built from the identical uploaded SARIF and has no such
 *  awareness: it treats every result in the file as a candidate new alert
 *  and fails the pull request on a finding this repository already
 *  accepted. Dropping these results before upload is not less honest than
 *  uploading them — the suppression is already recorded in
 *  docs/registers/suppression-register.md, which is the audit trail a
 *  reviewer actually reads; the SARIF file's job on the platform is to
 *  surface what is NOT already accounted for. A missing or unreadable file
 *  is left alone, the same as normalizeSarifPaths above — the caller's own
 *  status check reports that separately.
 *  @param {string} path */
export function filterSuppressedSarif(path) {
  /** @type {{ runs?: { results?: { suppressions?: { kind?: string }[] }[] }[] }} */
  let sarif;
  try {
    sarif = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return;
  }
  for (const run_ of sarif.runs ?? []) {
    run_.results = (run_.results ?? []).filter(
      (result) =>
        !(result.suppressions ?? []).some((s) => s.kind === "inSource"),
    );
  }
  writeFileSync(path, JSON.stringify(sarif));
}

/** osv-scanner (cross-gate-rules.md, "never claim more than was
 *  checked"): a non-zero exit means either "vulnerabilities found" or "the
 *  scan itself did not complete" (a missing lockfile, an unsupported
 *  ecosystem, a network failure, a version mismatch) — the same shape
 *  classifyTestCoverageOutcome and classifyDiffCoverOutcome above already
 *  solve for their own tools, generalised to cross-gate-rules.md's own
 *  wording: "a refusal names the specific thing being refused; a refusal
 *  whose problem text contains no identifier is itself a finding." That
 *  exact case was found live: a CI run failed gate 6 with osv-scanner's own
 *  startup banner as the problem text and no vulnerability id anywhere in
 *  it, while the standalone osv-scanner check on the same commit passed
 *  clean — the exit code alone cannot tell "found something" from "could not
 *  finish", only the tool's own structured output can (osv-scanner's
 *  `--format json`, or the SARIF this repository already produces for gate
 *  6's upload — extractOsvJsonFindings / extractOsvSarifFindings below turn
 *  either into the same flat id list this classifies).
 *  Zero findings on a non-zero exit is `unavailable`, not a pass and not a
 *  finding: the caller reports it as a skip naming what went wrong, the same
 *  as osv-scanner not being on PATH at all.
 *  @param {number | null} status @param {string[]} findings
 *  @returns {{ kind: "clean", findings: string[] } | { kind: "vulnerabilities", findings: string[] } | { kind: "unavailable", detail: string }} */
export function classifyOsvScannerOutcome(status, findings) {
  if (status === 0) return { kind: "clean", findings: [] };
  if (findings.length > 0) return { kind: "vulnerabilities", findings };
  return {
    kind: "unavailable",
    detail:
      `osv-scanner exited with status ${status} but named no vulnerability — ` +
      "the scan itself did not complete (a missing lockfile, an unsupported " +
      "ecosystem, a network failure, a version mismatch); rerun locally to see why",
  };
}

/** Vulnerability ids out of osv-scanner's own `--format json` shape
 *  (`results[].packages[].vulnerabilities[].id`, per its documented output).
 *  Unparseable or empty stdout yields no findings — the caller's non-zero
 *  exit plus an empty list is what classifyOsvScannerOutcome reads as
 *  `unavailable` rather than `clean`.
 *  @param {string} stdout */
export function extractOsvJsonFindings(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  const findings = [];
  for (const result of parsed?.results ?? []) {
    for (const pkg of result?.packages ?? []) {
      for (const vuln of pkg?.vulnerabilities ?? []) {
        if (vuln?.id) findings.push(vuln.id);
      }
    }
  }
  return findings;
}

/** The same extraction as extractOsvJsonFindings, from the SARIF file gate 6
 *  already writes and uploads (`runs[].results[].ruleId`) — read after
 *  normalizeSarifPaths/filterSuppressedSarif so a finding already accepted
 *  by an in-source suppression is not read back as blocking here either. A
 *  missing or unreadable file yields no findings, same as unparseable JSON.
 *  @param {string} sarifPath */
export function extractOsvSarifFindings(sarifPath) {
  let sarif;
  try {
    sarif = JSON.parse(readFileSync(sarifPath, "utf8"));
  } catch {
    return [];
  }
  const findings = [];
  for (const run_ of sarif?.runs ?? []) {
    for (const result of run_?.results ?? []) {
      if (result?.ruleId) findings.push(result.ruleId);
    }
  }
  return findings;
}

/** The rule set a `semgrep --config auto` run actually resolved, read from the
 *  SARIF semgrep itself writes (`runs[].tool.driver.rules[].id` — the SARIF
 *  spec's full driver rule list, which semgrep populates with every rule the
 *  registry returned for the run, including rules that found nothing). That is
 *  the rule set this run resolved, emitted by semgrep rather than parsed out of
 *  human-readable output. `--config auto` resolves rules from the registry at
 *  run time, so the same scan can resolve a different set tomorrow with no
 *  commit in this repository; recording it next to the findings makes that
 *  drift visible after the fact. Returns the id list (empty when the SARIF
 *  carries none), never null — a caller that could not read the SARIF at all
 *  passes that fact through semgrepRuleRecord's `unavailable` state.
 *  @param {any} [sarif] */
export function resolvedSemgrepRules(sarif) {
  /** @type {string[]} */
  const rules = [];
  for (const run_ of sarif?.runs ?? []) {
    for (const rule of run_?.tool?.driver?.rules ?? []) {
      if (rule?.id) rules.push(rule.id);
    }
  }
  return rules;
}

/** The record of a semgrep rule-resolution run, in three states that must not
 *  read as each other: `resolved` (semgrep ran and its rule list was read),
 *  `skipped` (semgrep did not run — not on PATH — distinct from a clean run),
 *  and `unavailable` (semgrep ran but its rule set could not be read). The
 *  three-way split is the "do not let unavailable read as passed" rule
 *  (cross-gate-rules.md) applied to rule recording: a missing tool is not a
 *  clean resolved set, and a run that produced no readable rule list is not a
 *  resolved set of zero either. Pure so the skip/resolved distinction is
 *  testable without shelling out.
 *
 *  @param {{ ran?: boolean, rules?: string[] | null, reason?: string }} input */
export function semgrepRuleRecord({ ran, rules, reason } = {}) {
  if (!ran) {
    return { outcome: "skipped", reason: reason ?? "semgrep did not run" };
  }
  if (!rules) {
    return {
      outcome: "unavailable",
      reason:
        reason ?? "semgrep ran but its resolved rule set could not be read",
    };
  }
  return { outcome: "resolved", ruleCount: rules.length, rules };
}
