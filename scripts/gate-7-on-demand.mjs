#!/usr/bin/env node
// Gate 7 — On demand. The whole-repository sweep: run before trusting any of
// the incremental gates, or when adopting the toolkit. Reports rather than
// blocks — the caller decides the consequence — so this script exits 0 and
// prints a clear banner either way. (The server-side gate 6 is the authority.)
//
// Run with `npm run gate:7`. The sweep is composed from per-concern modules —
// gate-7-security.mjs, gate-7-size.mjs, gate-7-policy.mjs — each returning the
// findings and skips its seam produced, pushed here in the original sweep
// order; the documentation link-integrity check runs inline between size and
// policy, and the merged report is printed at the end.
import { formatFindingBody } from "./lib.mjs";
import { checkLinks } from "./check-links.mjs";
import { runSecurityChecks } from "./gate-7-security.mjs";
import { runSizeChecks } from "./gate-7-size.mjs";
import { runPolicyChecks } from "./gate-7-policy.mjs";

/** @type {{ check: string, path?: string, problem?: string, remedy?: string }[]} */
const findings = [];
const skips = [];

const security = await runSecurityChecks();
findings.push(...security.findings);
skips.push(...security.skips);

const size = runSizeChecks();
findings.push(...size.findings);
skips.push(...size.skips);

// --- Documentation: link and anchor integrity ---
for (const f of checkLinks()) findings.push(f);

const policy = await runPolicyChecks();
findings.push(...policy.findings);
skips.push(...policy.skips);

// Report. Gate 7 reports; the caller decides. It does not block.
for (const s of skips) process.stderr.write(`gate 7: SKIP ${s}\n`);
for (const f of findings) {
  const where = f.path ? ` (${f.path})` : "";
  process.stderr.write(`gate 7: FINDING ${f.check}${where}\n`);
  for (const line of formatFindingBody(f.problem)) {
    process.stderr.write(`          ${line}\n`);
  }
}
const banner = findings.length
  ? `gate 7: ${findings.length} finding(s), ${skips.length} skip(s) — reports only, caller decides`
  : `gate 7: clean — ${skips.length} skip(s)`;
process.stderr.write(`${banner}\n`);
process.exit(0);
