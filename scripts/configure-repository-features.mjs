#!/usr/bin/env node
// Fix brief 8, item 2 — the mechanism half. gate-7-on-demand.md states which
// GitHub features are free at which visibility and plan, and supplies no way
// to turn them on — the same gap branch protection had before
// scripts/configure-branch-protection.mjs existed to close it
// (docs/standards/guardrails/branch-protection.md: "no committed script can
// reach into a host's settings... so the standard had prose and nothing that
// acted on it"). This script is that script, for repository features.
//
// Dependabot alerts and security updates are enabled unconditionally — free
// on every plan and visibility, verified directly. Secret scanning, push
// protection and code scanning are attempted; GitHub's own "not available
// for this repository" (secret scanning) or a non-200 from
// code-scanning/default-setup (code scanning) is reported as a visible skip,
// never a script failure — the same discipline
// configure-branch-protection.mjs applies to a 403 on branch protection.
// Code coverage (GitHub Code Quality) has no documented API to enable from
// here; see docs/standards/guardrails/gate-6-pull-request.md#coverage-legible-without-a-download.
//
// Run with `node scripts/configure-repository-features.mjs`. See
// docs/standards/guardrails/gate-7-on-demand.md#platform-features-enabled-by-default
// for what each feature means and scripts/check-repository-features.mjs for
// the gate 7 / CI check that makes a feature left off a finding.
import { have, run } from "./lib.mjs";
import { checkRepositoryFeatures } from "./check-repository-features.mjs";

function skip(msg) {
  process.stderr.write(`configure-repository-features: SKIP ${msg}\n`);
  process.exit(0);
}
function note(msg) {
  process.stderr.write(`configure-repository-features: ${msg}\n`);
}

if (!have("gh", ["--version"])) {
  skip(
    "gh not on PATH; install the GitHub CLI to configure repository features",
  );
}
if (run("gh", ["api", "user"], { stdio: "ignore" }).status !== 0) {
  skip(
    "gh is not authenticated (`gh auth login`); cannot configure repository features",
  );
}
if (run("gh", ["repo", "view", "--json", "nameWithOwner"]).status !== 0) {
  skip(
    "gh could not resolve a GitHub repository from this checkout (no GitHub remote?)",
  );
}

// Dependabot alerts and security updates: free everywhere, enable
// unconditionally.
const alerts = run("gh", [
  "api",
  "-X",
  "PUT",
  "repos/:owner/:repo/vulnerability-alerts",
]);
note(
  alerts.status === 0
    ? "Dependabot alerts — enabled"
    : `Dependabot alerts — PUT failed: ${(alerts.stderr || "").trim().split("\n")[0]}`,
);

const secUpdates = run("gh", [
  "api",
  "-X",
  "PUT",
  "repos/:owner/:repo/automated-security-fixes",
]);
note(
  secUpdates.status === 0
    ? "Dependabot security updates — enabled"
    : `Dependabot security updates — PUT failed: ${(secUpdates.stderr || "").trim().split("\n")[0]}`,
);

// Secret scanning and push protection: one PATCH. GitHub's own 422 naming
// the plan restriction is a visible skip, not a failure — the private
// repository this script most often runs against on adoption is exactly the
// case that trips it.
const secretScan = run("gh", [
  "api",
  "-X",
  "PATCH",
  "repos/:owner/:repo",
  "-f",
  "security_and_analysis[secret_scanning][status]=enabled",
  "-f",
  "security_and_analysis[secret_scanning_push_protection][status]=enabled",
]);
if (secretScan.status === 0) {
  note("secret scanning and push protection — enabled");
} else if (/not available for this repository/i.test(secretScan.stderr || "")) {
  note(
    `secret scanning and push protection — SKIP: ${(secretScan.stderr || "").trim().split("\n")[0]}`,
  );
} else {
  note(
    `secret scanning and push protection — PATCH failed: ${(secretScan.stderr || "").trim().split("\n")[0]}`,
  );
}

// Code scanning: CodeQL's own default query suite, the same "just turn it
// on" default the web UI's "Enable" button applies.
const codeScan = run("gh", [
  "api",
  "-X",
  "PATCH",
  "repos/:owner/:repo/code-scanning/default-setup",
  "-f",
  "state=configured",
  "-f",
  "query_suite=default",
]);
if (codeScan.status === 0) {
  note("code scanning — default setup configured");
} else {
  note(
    `code scanning — SKIP: ${(codeScan.stderr || "").trim().split("\n")[0]}`,
  );
}

note(
  "code coverage (Code Quality) — no documented API; enable via GitHub Settings > Code security if the plan supports it (GitHub Team or Enterprise Cloud), or record the alternative in gate-6-pull-request.md's terms",
);

// Never claim success without checking: re-read live state through the same
// evaluator the check uses (configure-branch-protection.mjs's own practice).
const { findings, skips } = await checkRepositoryFeatures();
if (findings.length) {
  process.stderr.write(
    "configure-repository-features: applied, but the audit still finds gaps:\n",
  );
  for (const f of findings)
    process.stderr.write(`  - ${f.check}: ${f.problem}\n`);
  process.exit(2);
}
process.stderr.write(
  `configure-repository-features: verified — ${skips.length} item(s) reported, no findings\n`,
);
