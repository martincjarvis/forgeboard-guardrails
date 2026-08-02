// cspell:ignore symref
// The "make the absence of branch protection blocking" half of the fix —
// scripts/configure-branch-protection.mjs supplies the mechanism, and
// docs/standards/guardrails/branch-protection.md is the standard both
// implement. Runs at gate 7 (on demand, local `gh`) and in CI
// (.github/workflows/branch-protection-audit.yml, a PAT secret). Three
// states: unconfigured protection is a FINDING (not a silent pass), `gh`
// missing or unauthenticated is a visible SKIP, and full agreement is a pass.
import { readFileSync } from "node:fs";
import { have, run, resolveBase, report } from "./lib.mjs";
import { pathToFileURL } from "node:url";

/** @typedef {(command: string, args: readonly string[], options?: object) => { status: number | null, stdout?: string, stderr?: string }} RunFn */
/** @typedef {{ id: string, name: string | null, matrix: Record<string, string[]> }} Job */
/** @typedef {{
 *   required_status_checks?: { checks?: { context: string }[], contexts?: string[], strict?: boolean },
 *   required_pull_request_reviews: { required_approving_review_count?: number, dismiss_stale_reviews?: boolean } | null,
 *   enforce_admins?: { enabled?: boolean },
 *   required_conversation_resolution?: { enabled?: boolean },
 *   allow_force_pushes?: { enabled?: boolean },
 *   allow_deletions?: { enabled?: boolean },
 *   required_linear_history?: { enabled?: boolean },
 * }} BranchProtection */

/** @param {string} line @returns {number} */
function indentOf(line) {
  return line.length - line.trimStart().length;
}

/** A job-body line's contribution to the job being built: its `name:` at the
 *  job's own top-level indent (never a step's), and any flat
 *  `key: [a, b, c]` matrix axis. Mutates `job` in place.
 *  @param {Job} job
 *  @param {string} line
 *  @param {number} indent
 *  @param {number} bodyIndent */
function applyJobBodyLine(job, line, indent, bodyIndent) {
  if (indent === bodyIndent) {
    const nameMatch = /^name:\s*(.+)$/.exec(line);
    const jobName = nameMatch?.[1];
    if (jobName) job.name = jobName.trim();
  }
  const listMatch = /^([A-Za-z0-9_-]+):\s*\[(.+)\]\s*$/.exec(line);
  if (listMatch) {
    const key = listMatch[1];
    const val = listMatch[2];
    if (key !== undefined && val !== undefined)
      job.matrix[key] = val.split(",").map((s) => s.trim());
  }
}

/** `lines[i] ?? ""` — defensive over an already-in-bounds index.
 *  @param {string[]} lines @param {number} i @returns {string} */
function rawLine(lines, i) {
  return lines[i] ?? "";
}

/** Parses `jobs:` into [{ id, name, matrix }], reading only the job's own
 *  top-level keys (indent === the job body's own indent) so a step's
 *  `name:`, indented deeper under `steps:`, is never mistaken for the job's.
 *  @param {string} workflowText */
function parseWorkflowJobs(workflowText) {
  const lines = (workflowText ?? "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "" && !l.trim().startsWith("#"));
  const jobsAt = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (jobsAt === -1 || jobsAt + 1 >= lines.length) return [];

  const jobIdIndent = indentOf(rawLine(lines, jobsAt + 1));
  const jobs = [];
  let job = null;
  let bodyIndent = null;

  for (let i = jobsAt + 1; i < lines.length; i++) {
    const line = rawLine(lines, i).trim();
    const indent = indentOf(rawLine(lines, i));
    if (indent < jobIdIndent) break; // left the jobs: block

    if (indent === jobIdIndent) {
      const idMatch = /^([A-Za-z0-9_-]+):\s*$/.exec(line);
      if (idMatch) {
        if (job) jobs.push(job);
        job = { id: idMatch[1] ?? "", name: null, matrix: {} };
        bodyIndent = null;
      }
      continue;
    }
    if (!job) continue;
    if (bodyIndent === null) bodyIndent = indent;
    applyJobBodyLine(job, line, indent, bodyIndent);
  }
  if (job) jobs.push(job);
  return jobs;
}

/** One job's reported context string(s): its own name (or job id, GitHub's
 *  own fallback) expanded once per matrix value when the name interpolates
 *  the single axis this parser supports (see the ponytail note above).
 *  @param {Job} job */
function contextsForJob(job) {
  const label = job.name || job.id;
  const varMatch = /\$\{\{\s*matrix\.([A-Za-z0-9_-]+)\s*\}\}/.exec(label);
  const axis = varMatch?.[1];
  const values = axis ? job.matrix[axis] : null;
  if (!values) return [label];
  return values.map((v) =>
    label.replace(/\$\{\{\s*matrix\.[A-Za-z0-9_-]+\s*\}\}/, v),
  );
}

// ponytail: single-axis `matrix.<key>: [a, b, ...]` support only — enough
// for this toolkit's own pull-request.yml and the common one-dimensional
// case (matrix.os, matrix.node-version). A job whose name interpolates two
// matrix axes, or a matrix built from `include`/`exclude` rather than a
// flat list, is not expanded correctly; upgrade this if a workflow needs
// it rather than reaching for a YAML-parsing dependency to parse a
// handful of files this toolkit itself writes (ADR-0002's no-bundled-
// tooling line applies the same reasoning here: write it directly for a
// job this small, add the dependency when a real workflow needs more).
/** The required-status-check context string(s) a workflow's job(s) report to
 *  GitHub, derived from the job's `name:` and any matrix it expands over —
 *  not hand-typed: a matrix job's reported name (`gate 6 (ubuntu-latest)`)
 *  must match branch protection's required list character for character.
 *  @param {string} workflowText */
export function deriveRequiredContexts(workflowText) {
  return parseWorkflowJobs(workflowText).flatMap(contextsForJob);
}

const RUN_SCRIPT = "run `node scripts/configure-branch-protection.mjs`";

/** @param {BranchProtection} protection @returns {Set<string>} */
function requiredContextSet(protection) {
  return new Set([
    ...(protection.required_status_checks?.checks ?? []).map((c) => c.context),
    ...(protection.required_status_checks?.contexts ?? []),
  ]);
}

/** @param {BranchProtection["required_pull_request_reviews"]} reviews
 *  @returns {{ required: boolean, dismissesStale: boolean }} */
function reviewState(reviews) {
  return {
    required:
      Boolean(reviews) && (reviews?.required_approving_review_count ?? 0) >= 1,
    dismissesStale: Boolean(reviews?.dismiss_stale_reviews),
  };
}

/** @param {BranchProtection} protection */
function protectionFlags(protection) {
  return {
    strict: Boolean(protection.required_status_checks?.strict),
    enforceAdmins: Boolean(protection.enforce_admins?.enabled),
    conversationResolution: Boolean(
      protection.required_conversation_resolution?.enabled,
    ),
    forcePushes: Boolean(protection.allow_force_pushes?.enabled),
    deletions: Boolean(protection.allow_deletions?.enabled),
    linearHistory: Boolean(protection.required_linear_history?.enabled),
  };
}

/** Every policy 16-24 gap (gate-6-pull-request.md, "6.3 Merge policy") as
 *  `{ isGap, problem }` records against an already-fetched protection object.
 *  @param {BranchProtection} protection
 *  @param {string} branch
 *  @param {string[]} requiredContexts
 *  @returns {{isGap: boolean, problem: string}[]} */
function policyGaps(protection, branch, requiredContexts) {
  const configured = requiredContextSet(protection);
  const missing = requiredContexts.filter((c) => !configured.has(c));
  const reviews = reviewState(protection.required_pull_request_reviews);
  const flags = protectionFlags(protection);

  return [
    {
      isGap: missing.length > 0,
      problem: `required status check(s) not in the protected branch's required list: ${missing.join(", ")}`,
    },
    {
      isGap: !flags.strict,
      problem: `${branch} does not require a pull request to be up to date with the base before merging`,
    },
    {
      isGap: !flags.enforceAdmins,
      problem: `administrators can merge past a failing required check on ${branch} (no admin override should exist)`,
    },
    {
      isGap: !reviews.required,
      problem: `${branch} does not require an approving review before merge`,
    },
    {
      isGap: reviews.required && !reviews.dismissesStale,
      problem: `${branch} does not dismiss a stale approval on a new push`,
    },
    {
      isGap: !flags.conversationResolution,
      problem: `${branch} does not require review conversations to be resolved`,
    },
    {
      isGap: flags.forcePushes,
      problem: `force pushes are allowed on ${branch}`,
    },
    {
      isGap: flags.deletions,
      problem: `${branch} can be deleted`,
    },
    {
      isGap: !flags.linearHistory,
      problem: `${branch} does not require a linear history (a merge commit can still land)`,
    },
  ];
}

/** Pure verdict: every gap between what `requiredContexts` says gate 6
 *  runs and what `protection` (API JSON, or null for unconfigured) says the
 *  platform enforces.
 *  @param {BranchProtection | null} protection
 *  @param {string} branch
 *  @param {string[]} requiredContexts */
export function evaluateBranchProtection(protection, branch, requiredContexts) {
  if (!protection) {
    return [
      {
        check: "branch protection",
        path: branch,
        problem: `${branch} has no branch protection configured — a red required status check, or gate 6 failing outright, blocks nothing`,
        remedy: RUN_SCRIPT,
      },
    ];
  }
  return policyGaps(protection, branch, requiredContexts)
    .filter((gap) => gap.isGap)
    .map((gap) => ({
      check: "branch protection",
      path: branch,
      problem: gap.problem,
      remedy: RUN_SCRIPT,
    }));
}

/** True when `gh` resolves an authenticated identity. `gh auth status` is the
 *  wrong probe — it exits non-zero if ANY keyring account is stale, even when
 *  the active one is fine; `gh api user` is what this check depends on.
 *  @param {RunFn} runFn */
function ghAuthenticated(runFn) {
  return runFn("gh", ["api", "user"], { stdio: "ignore" }).status === 0;
}

// Hoisted for the same reason as check-suppressions.mjs's DELIMITER_RUN: a
// regex literal inline in a function body defeats lizard's JS span detection,
// which then reports the enclosing function running to the end of the file.
const ORIGIN_PREFIX = /^origin\//;

/** An unset local `origin/HEAD` symref (a shallow clone, or a checkout that
 *  never ran `git remote set-head origin -a`) is a fixable local-metadata
 *  gap, not a genuine unknown. The local resolveBaseFn() is tried first;
 *  only when it cannot name a branch does this fall back to `gh api
 *  repos/:owner/:repo`'s authoritative `default_branch`. Returns
 *  `{ ok:false, reason }` only when neither source names the branch; a 403
 *  or missing remote is a genuine "cannot tell" handled by callers.
 *  @param {() => string | null} resolveBaseFn
 *  @param {RunFn} runFn
 *  @returns {{ ok: true, name: string } | { ok: false, reason: string }} */
function resolveBranch(resolveBaseFn, runFn) {
  const base = resolveBaseFn();
  if (base) return { ok: true, name: base.replace(ORIGIN_PREFIX, "") };

  const defaultBranch = runFn("gh", [
    "api",
    "repos/:owner/:repo",
    "--jq",
    ".default_branch",
  ]);
  const name =
    defaultBranch.status === 0 ? (defaultBranch.stdout || "").trim() : "";
  if (name) return { ok: true, name };

  return {
    ok: false,
    reason:
      "origin/HEAD could not be resolved locally, and gh could not resolve the repository's default branch either; run `git remote set-head origin -a` to fix the local symref",
  };
}

/** Reads live branch protection via `gh api`, classified into the three
 *  shapes the caller needs: `{ ok: true, protection }` (200 parsed, or null
 *  for the 404 / genuinely unconfigured case), or `{ ok: false, reason }`
 *  for anything this token could not resolve at all (403, unparseable body).
 *  @param {RunFn} runFn
 *  @param {string} branch */
function fetchProtection(runFn, branch) {
  const get = runFn("gh", [
    "api",
    `repos/:owner/:repo/branches/${branch}/protection`,
  ]);
  if (get.status === 0) {
    try {
      return { ok: true, protection: JSON.parse(get.stdout ?? "") };
    } catch {
      return {
        ok: false,
        reason: "gh api returned unparseable JSON for branch protection",
      };
    }
  }
  if (/404/.test(get.stderr || "")) return { ok: true, protection: null };
  // Not "unconfigured" — could not tell at all (403, or a private repo on a
  // plan without branch protection).
  return {
    ok: false,
    reason: `gh api could not read branch protection (${(get.stderr || "").trim().split("\n")[0]}); a token with repository admin read is required (or the repository is private on a plan without branch protection — see docs/standards/guardrails/branch-protection.md)`,
  };
}

/** { findings, skips }. Impure: resolves the branch, the required contexts
 *  from this repository's own pull-request.yml, and the live protection
 *  state via `gh api`, then hands both to evaluateBranchProtection above.
 *  Every early return is a SKIP naming why — gh missing, unauthenticated,
 *  no GitHub remote, no workflow to derive contexts from, or a token that
 *  cannot read branch protection — never a finding standing in for "could
 *  not tell."
 *
 *  @param {{
 *    have?: (command: string, args?: readonly string[]) => boolean,
 *    run?: (command: string, args: readonly string[], options?: object) => {status: number|null, stdout?: string, stderr?: string},
 *    resolveBase?: () => string | null,
 *    readFile?: (path: string) => string,
 *  }} [deps]
 */
export async function checkBranchProtection({
  have: haveFn = have,
  run: runFn = run,
  resolveBase: resolveBaseFn = resolveBase,
  readFile = (p) => readFileSync(p, "utf8"),
} = {}) {
  /** @type {string[]} */
  const skips = [];
  if (!haveFn("gh", ["--version"])) {
    skips.push(
      "branch protection audit — gh not on PATH; install the GitHub CLI to enable this check",
    );
    return { findings: [], skips };
  }
  if (!ghAuthenticated(runFn)) {
    skips.push(
      "branch protection audit — gh is not authenticated (`gh auth login`); check skipped",
    );
    return { findings: [], skips };
  }
  const repoView = runFn("gh", ["repo", "view", "--json", "nameWithOwner"]);
  if (repoView.status !== 0) {
    skips.push(
      "branch protection audit — gh could not resolve a GitHub repository from this checkout (no GitHub remote?); check skipped",
    );
    return { findings: [], skips };
  }

  const resolved = resolveBranch(resolveBaseFn, runFn);
  if (!resolved.ok) {
    skips.push(`branch protection audit — ${resolved.reason}`);
    return { findings: [], skips };
  }
  const branch = resolved.name;

  let workflowText;
  try {
    workflowText = readFile(".github/workflows/pull-request.yml");
  } catch {
    skips.push(
      "branch protection audit — .github/workflows/pull-request.yml not found; no required checks to derive",
    );
    return { findings: [], skips };
  }
  const requiredContexts = deriveRequiredContexts(workflowText);

  const fetched = fetchProtection(runFn, branch);
  if (!fetched.ok) {
    skips.push(`branch protection audit — ${fetched.reason}`);
    return { findings: [], skips };
  }

  return {
    findings: evaluateBranchProtection(
      fetched.protection,
      branch,
      requiredContexts,
    ),
    skips,
  };
}

const argv1 = process.argv[1];
const isMain = argv1 && import.meta.url === pathToFileURL(argv1).href;
if (isMain) {
  const { findings, skips } = await checkBranchProtection();
  report("gate 7", findings, skips);
}
