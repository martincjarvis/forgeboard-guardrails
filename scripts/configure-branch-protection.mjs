#!/usr/bin/env node
// Fix 24 — the mechanism half. gate-6-pull-request.md states the merge
// policy (16-24: required status checks, required review, no self-approval,
// stale-approval dismissal, conversation resolution, no admin override, no
// force push, no deletion, required history shape) and supplies no way to
// configure it — "no committed script can set host configuration" is why it
// recurred every audit in this series. This script is that script.
//
// Idempotent: it PUTs the full intended state every run (branch protection's
// own API replaces, not merges), so running it twice changes nothing the
// second time, and running it after a workflow gains a job picks up the new
// required check on the next run. Safe to re-run from repository-bootstrap
// (skills/repository-bootstrap/SKILL.md) or by hand.
//
// Run with `node scripts/configure-branch-protection.mjs`. See
// docs/standards/guardrails/branch-protection.md for what each field means
// and scripts/check-branch-protection.mjs for the gate 7 / CI check that
// makes its absence a finding rather than a silent pass.
import { readFileSync } from "node:fs";
import { have, run, resolveBase } from "./lib.mjs";
import {
  deriveRequiredContexts,
  evaluateBranchProtection,
} from "./check-branch-protection.mjs";

function skip(msg) {
  process.stderr.write(`configure-branch-protection: SKIP ${msg}\n`);
  process.exit(0);
}
function fail(msg) {
  process.stderr.write(`configure-branch-protection: ${msg}\n`);
  process.exit(1);
}

// A visible skip when gh is absent or unauthenticated — never a silent
// no-op, and never a guess at what to configure without it.
if (!have("gh", ["--version"])) {
  skip("gh not on PATH; install the GitHub CLI to configure branch protection");
}
if (run("gh", ["api", "user"], { stdio: "ignore" }).status !== 0) {
  skip(
    "gh is not authenticated (`gh auth login`); cannot configure branch protection",
  );
}

// Derived, not hardcoded (fix 24's own requirement): the branch from
// origin/HEAD, the same derivation every other gate in this toolkit uses.
const base = resolveBase();
if (!base) {
  fail(
    "origin/HEAD could not be resolved — nothing to derive the default branch from; run this from a real clone, not a repository with no remote",
  );
}
const branch = base.replace(/^origin\//, "");

const repoView = run("gh", ["repo", "view", "--json", "nameWithOwner"]);
if (repoView.status !== 0) {
  skip(
    "gh could not resolve a GitHub repository from this checkout (no GitHub remote?)",
  );
}

let workflowText;
try {
  workflowText = readFileSync(".github/workflows/pull-request.yml", "utf8");
} catch {
  fail(
    ".github/workflows/pull-request.yml not found — nothing to derive required status checks from; port that workflow first (skills/repository-bootstrap/SKILL.md step 7)",
  );
}
const contexts = deriveRequiredContexts(workflowText);
if (!contexts.length) {
  fail(
    "derived zero required-status-check contexts from .github/workflows/pull-request.yml — refusing to configure protection with an empty required list rather than silently protecting nothing",
  );
}

process.stderr.write(
  `configure-branch-protection: applying to ${branch} — required check(s): ${contexts.join(", ")}\n`,
);

// One full-replace PUT of the intended state (gate-6-pull-request.md
// policies 16-24): required status checks by exact context name, branch
// must be up to date, no admin override, one required approval with stale
// approvals dismissed, conversations resolved, no force push, no deletion,
// linear history only. `restrictions: null` is required by the API even
// when nothing narrower than "anyone with push access" is wanted.
const payload = {
  required_status_checks: {
    strict: true,
    checks: contexts.map((context) => ({ context })),
  },
  enforce_admins: true,
  required_pull_request_reviews: {
    required_approving_review_count: 1,
    dismiss_stale_reviews: true,
  },
  restrictions: null,
  required_linear_history: true,
  allow_force_pushes: false,
  allow_deletions: false,
  required_conversation_resolution: true,
};

const put = run(
  "gh",
  [
    "api",
    "--method",
    "PUT",
    `repos/:owner/:repo/branches/${branch}/protection`,
    "--input",
    "-",
  ],
  { input: JSON.stringify(payload) },
);
if (put.status !== 0) {
  fail(
    `gh api PUT failed — nothing applied, or a partial write; re-run once the cause below is fixed:\n${(put.stdout || "") + (put.stderr || "")}`,
  );
}

// Never a silent success: re-read what the platform actually now has and
// verify every field this script tried to set actually stuck. A partial
// application (a plan restriction silently dropping one field, say) must be
// reported, not assumed from the PUT's own 200.
const verify = run("gh", [
  "api",
  `repos/:owner/:repo/branches/${branch}/protection`,
]);
if (verify.status !== 0) {
  fail(
    "applied, but could not re-read branch protection afterward to verify it stuck — treat this as unconfigured until confirmed by hand",
  );
}
let applied;
try {
  applied = JSON.parse(verify.stdout);
} catch {
  fail(
    "applied, but the re-read after applying did not return parseable JSON — verify by hand with `gh api repos/:owner/:repo/branches/<branch>/protection`",
  );
}
const gaps = evaluateBranchProtection(applied, branch, contexts);
if (gaps.length) {
  process.stderr.write(
    "configure-branch-protection: applied, but verification found it did not fully take:\n",
  );
  for (const g of gaps) process.stderr.write(`  - ${g.problem}\n`);
  process.exit(2);
}
process.stderr.write(
  `configure-branch-protection: verified — ${branch} is protected with ${contexts.length} required check(s), no admin override, required review, stale-approval dismissal, conversation resolution, linear history, no force push, no deletion\n`,
);
