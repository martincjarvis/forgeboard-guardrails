// cspell:ignore govulncheck
// Fix 9b — osv-scanner, the cross-stack dependency analyser (docs/standards/
// guardrails/cross-gate-rules.md: "A general-purpose analyser runs across
// every stack, including one with its own specialised analyser, rather than
// being excluded from it"). Treated exactly as semgrep and lizard are
// (ADR-0002): external, resolved from PATH, never bundled. It does not
// replace a stack's own scanner — govulncheck, cargo-audit and friends stay
// where they are faster or more precise for their own stack; this is the
// general-purpose backstop that runs regardless, the same way lizard backs
// up a stack's own complexity analyser.
//
// Placement (placing-a-new-check.md): it queries the OSV database, which
// rules gates 1 and 2 out (network-bound, and those gates fire on every edit
// or commit). Gate 5 (pre-push) is the earliest gate left whose inputs
// suffice. Gate 6 re-runs it server-side with a SARIF upload, the way
// cross-gate-rules.md requires of anything blocking.
//
// osv-scanner will not be installed on most consumers' first run — that is
// the point fix 9b exists to prove: the skip path is what most people hit
// first, so it must report visibly, name the tool, and never pass silently.
// The invocation below follows osv-scanner's own documented CLI
// (`osv-scanner --format <json|sarif> -r <path>` recursively scans a
// directory tree against the OSV database and exits non-zero when it finds
// something).
//
// Fix 31 — `have`/`run` are injectable (the same shape checkBranchProtection
// takes, check-branch-protection.mjs), defaulting to the real PATH-resolved
// ones. The skip-path test asserts the skip through an injected absence
// rather than this host's own PATH: audit 9 traced a bootstrapped repo's CI
// failure to exactly the opposite — a test that depended on osv-scanner
// genuinely being absent from the host it happened to run on, which broke
// the moment a workflow step installed it first. A test whose result depends
// on what happens to be installed is not a test of this function.
import {
  have,
  run,
  report,
  classifyOsvScannerOutcome,
  extractOsvJsonFindings,
} from "./lib.mjs";
import { pathToFileURL } from "node:url";

/** { findings, skips }. No scanTriggered gate — gate 5 runs once per push
 *  over the whole repository already (gate-5-push.md), the same
 *  unconditional shape as the coverage check beside it, not the
 *  change-triggered shape gates 2/6's lock-file-scoped checks use.
 *  @param {{
 *    have?: (command: string, args?: readonly string[]) => boolean,
 *    run?: (command: string, args: readonly string[], options?: object) => {status: number|null, stdout?: string, stderr?: string},
 *  }} [deps]
 */
export function checkOsvScanner({
  have: haveFn = have,
  run: runFn = run,
} = {}) {
  const skips = [];
  const findings = [];
  if (!haveFn("osv-scanner", ["--version"])) {
    skips.push(
      "cross-stack dependency scan — osv-scanner not on PATH; install it to enable this check (docs/standards/guardrails/registers.md)",
    );
    return { findings, skips };
  }
  const scan = runFn("osv-scanner", ["--format", "json", "-r", "."]);
  // Fix 44 — the exit code alone cannot distinguish "vulnerabilities found"
  // from "the scan itself did not complete"; only osv-scanner's own
  // structured JSON output can (classifyOsvScannerOutcome, lib.mjs).
  const outcome = classifyOsvScannerOutcome(
    scan.status,
    extractOsvJsonFindings(scan.stdout || ""),
  );
  if (outcome.kind === "vulnerabilities") {
    findings.push({
      check: "cross-stack dependency scan (osv-scanner)",
      path: "",
      problem: outcome.findings.join(", "),
      remedy:
        "upgrade the flagged dependency, or record why the advisory does not apply",
    });
  } else if (outcome.kind === "unavailable") {
    skips.push(`cross-stack dependency scan (osv-scanner) — ${outcome.detail}`);
  }
  return { findings, skips };
}

const argv1 = process.argv[1];
const isMain = argv1 && import.meta.url === pathToFileURL(argv1).href;
if (isMain) {
  const { findings, skips } = checkOsvScanner();
  report("gate 5", findings, skips);
}
