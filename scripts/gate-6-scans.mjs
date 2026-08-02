// cspell:ignore PYTHONUTF sarif semgrep
// The cross-language and cross-stack SARIF scanners, extracted from
// gate-6-pull-request.mjs as its own subject seam (gate-6-pull-request.md's
// "scanner handling"): semgrep (cross-language static analysis) and
// osv-scanner (cross-stack dependency scan) both run an external tool,
// normalise and suppression-filter a SARIF report, then decide from
// structured output rather than a raw exit code. gate-6-pull-request.mjs
// imports and re-exports `runScans`; its public surface is unchanged.
import {
  run,
  have,
  normalizeSarifPaths,
  filterSuppressedSarif,
  classifyOsvScannerOutcome,
  extractOsvSarifFindings,
} from "./lib.mjs";

/** @typedef {{ check: string, path?: string, problem?: string, remedy?: string }} Finding */

/** Runs semgrep over the changed text and osv-scanner over the whole
 *  repository (gate 6's scanner leg). Both upload a SARIF report after
 *  path normalisation and in-source-suppression filtering.
 *
 *  semgrep is deferred locally because `--config auto` is network-bound
 *  (cross-gate rules: cost tiers); a CI runner has network, so it runs for
 *  real here rather than the visible skip pre-commit.mjs prints. `--error`
 *  is required — without it semgrep exits 0 regardless of findings, which
 *  would make this a check that always passes. Scoped to the files this
 *  range changed, the same "adapt the staged scope to the range" rule as
 *  every other file-scoped check; the repository-wide sweep is gate 7's
 *  job, not this one's. PYTHONUTF8 avoids a Windows-only crash: semgrep's
 *  SARIF writer defaults to the console code page (cp1252), which cannot
 *  encode some rule messages (emoji in a rule's own text) and throws
 *  instead of writing the file. No `--quiet`: the per-finding detail goes
 *  to the SARIF file the workflow uploads, but the human summary
 *  ("Findings: N (N blocking)") is what this check's own `problem` text
 *  has to show — quiet suppresses that too, and the finding would
 *  otherwise carry no readable content of its own.
 *
 *  osv-scanner is whole-repository, not range-scoped: it reads the resolved
 *  dependency tree, not the files this range touched. Re-run here
 *  server-side, with a SARIF upload, the way cross-gate-rules.md requires
 *  of anything blocking that also runs at a local gate (gate 5).
 *  @param {{ changedText: string[] }} args
 *  @returns {{ findings: Finding[], skips: string[] }} */
export function runScans({ changedText }) {
  /** @type {Finding[]} */
  const findings = [];
  /** @type {string[]} */
  const skips = [];
  /** @param {string} check @param {string | undefined} path @param {string} problem @param {string} remedy */
  const fail = (check, path, problem, remedy) =>
    findings.push({ check, path, problem, remedy });
  /** @param {string} s */
  const skip = (s) => skips.push(s);

  if (changedText.length) {
    if (have("semgrep", ["--version"])) {
      const sarif = "semgrep-results.sarif";
      const sg = run(
        "semgrep",
        [
          "--config",
          "auto",
          "--error",
          "--sarif",
          "--output",
          sarif,
          ...changedText,
        ],
        { env: { ...process.env, PYTHONUTF8: "1" } },
      );
      const sgOut = (sg.stdout || "") + (sg.stderr || "");
      process.stderr.write(sgOut);
      normalizeSarifPaths(sarif);
      // Drop results suppressed in source before upload; see
      // filterSuppressedSarif (lib.mjs) for why the register, not the SARIF
      // file, is the audit trail for an accepted finding.
      filterSuppressedSarif(sarif);
      if (sg.status !== 0) {
        // Path is empty for the same reason as the secret scan: the
        // per-finding location lives in the SARIF file, not in a joined list
        // of every file that was scanned. The annotation and step summary get
        // semgrep's one-line "Findings: N (N blocking)" rather than its full
        // scan banner — the banner already went to stderr above for anyone
        // reading the raw log, and the SARIF upload carries the per-line detail
        // natively; repeating the whole banner in a native annotation is noise.
        // semgrep writes the summary to stderr, not stdout — search both.
        const summary =
          /Findings:.*$/m.exec(sgOut)?.[0] ??
          "semgrep exited non-zero; see the uploaded SARIF report";
        fail(
          "cross-language analysis (semgrep)",
          "",
          summary,
          "triage each finding; suppress per-rule per-path with a register row if accepted",
        );
      }
    } else {
      skip(
        "cross-language analysis (semgrep) — not on PATH; the workflow's install step should have put it there",
      );
    }
  }

  const dependency = runDependencyScan();
  findings.push(...dependency.findings);
  skips.push(...dependency.skips);

  return { findings, skips };
}

/** Check 7 (gate 6) — the cross-stack dependency scan, on its own. A
 *  different tool answering a different question from the source scan above:
 *  what the dependencies carry, not what this repository wrote.
 *  @returns {{ findings: Finding[], skips: string[] }} */
export function runDependencyScan() {
  /** @type {Finding[]} */
  const findings = [];
  /** @type {string[]} */
  const skips = [];
  /** @param {string} check @param {string | undefined} path @param {string} problem @param {string} remedy */
  const fail = (check, path, problem, remedy) =>
    findings.push({ check, path, problem, remedy });
  /** @param {string} s */
  const skip = (s) => skips.push(s);

  if (have("osv-scanner", ["--version"])) {
    const sarif = "osv-results.sarif";
    const osv = run("osv-scanner", [
      "--format",
      "sarif",
      "--output",
      sarif,
      "-r",
      ".",
    ]);
    const osvOut = (osv.stdout || "") + (osv.stderr || "");
    process.stderr.write(osvOut);
    normalizeSarifPaths(sarif);
    filterSuppressedSarif(sarif); // same in-source-suppression rule as semgrep's SARIF above
    // The exit code alone cannot distinguish "vulnerabilities found"
    // from "the scan itself did not complete" (a live CI run failed
    // this exact check with osv-scanner's own startup banner as the problem
    // text and no vulnerability id in it, while the standalone osv-scanner
    // check on the same commit passed clean). Read the SARIF file just written
    // — already the structured, suppression-filtered output — rather than the
    // exit code plus a raw text dump.
    const outcome = classifyOsvScannerOutcome(
      osv.status,
      extractOsvSarifFindings(sarif),
    );
    if (outcome.kind === "vulnerabilities") {
      fail(
        "cross-stack dependency scan (osv-scanner)",
        "",
        outcome.findings.join(", "),
        "upgrade the flagged dependency, or record why the advisory does not apply",
      );
    } else if (outcome.kind === "unavailable") {
      skip(`cross-stack dependency scan (osv-scanner) — ${outcome.detail}`);
    }
  } else {
    skip(
      "cross-stack dependency scan (osv-scanner) — not on PATH; the workflow's install step should have put it there",
    );
  }

  return { findings, skips };
}
