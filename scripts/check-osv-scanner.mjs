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
// something); this host has no installation to verify it against, which is
// exactly the state this check is written to handle visibly rather than
// silently.
import { have, run, report } from "./lib.mjs";
import { pathToFileURL } from "node:url";

/** { findings, skips }. No scanTriggered gate — gate 5 runs once per push
 *  over the whole repository already (gate-5-push.md), the same
 *  unconditional shape as the coverage check beside it, not the
 *  change-triggered shape gates 2/6's lock-file-scoped checks use. */
export function checkOsvScanner() {
  const skips = [];
  const findings = [];
  if (!have("osv-scanner", ["--version"])) {
    skips.push(
      "cross-stack dependency scan — osv-scanner not on PATH; install it to enable this check (docs/standards/guardrails/registers.md)",
    );
    return { findings, skips };
  }
  const scan = run("osv-scanner", ["--format", "json", "-r", "."]);
  if (scan.status !== 0) {
    findings.push({
      check: "cross-stack dependency scan (osv-scanner)",
      path: "",
      problem: (scan.stdout || "") + (scan.stderr || ""),
      remedy:
        "upgrade the flagged dependency, or record why the advisory does not apply",
    });
  }
  return { findings, skips };
}

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const { findings, skips } = checkOsvScanner();
  report("gate 5", findings, skips);
}
