#!/usr/bin/env node
// cspell:ignore nloc symref bypassable unpushed
// Gate 6 — Pull request pipeline, local-check surface. Re-runs the gates 2-5
// checks against the pull request's range, on a clean checkout that has no
// staged index — see docs/standards/guardrails/gate-6-pull-request.md, "check
// 3 adapts each local check to the pull request's range": `git diff --cached`
// becomes `git diff origin/<base>...HEAD`, and `git show :<path>` becomes
// `<path>` read straight from the checkout, which already holds what the
// branch would commit.
//
// Invoked by .github/workflows/pull-request.yml. Runs by hand as
// `node scripts/gate-6-pull-request.mjs [base-branch]` from a normal clone —
// resolveBase() supplies the base the same way the local gates do when no
// argument is given.
//
// Unlike pre-commit.mjs, which stops at the first failure for a fast local
// loop, this collects every finding before reporting: a CI re-run is
// expensive, so the pull request author wants the whole list in one push, the
// same reasoning gate 4 already applies locally
// (gate-4-task-completion.md: "collects every finding before reporting").
//
// This is the reference gate-6 workflow the corpus asks every consuming
// repository to port (gate-6-pull-request.md's own verification checklist);
// see .github/workflows/pull-request.yml for how it is wired to a pull
// request event, and skills/repository-bootstrap/SKILL.md for where an
// implementer is pointed at it.
//
// The per-concern legs run from their own modules — dependency-tree checks
// (gate-6-dependency-checks.mjs), per-file content checks
// (gate-6-content-checks.mjs), the SARIF scanners (gate-6-scans.mjs), the
// build/test/coverage leg (gate-6-test-coverage.mjs) and the reporting leg
// (gate-6-report.mjs) — each a subject seam split out to keep this entry
// point under the file-length band (ADR-0009). This file owns the base/range
// resolution, the inline whole-repository checks that have no separate
// concern of their own, and the gate-4 task-completion measures; it imports
// and re-exports each leg so any importer of this script is unaffected.
import { existsSync } from "node:fs";
import {
  git,
  run,
  have,
  isText,
  changedFiles,
  resolveBase,
  deriveComponent,
  classOf,
} from "./lib.mjs";
import { checkLinks } from "./check-links.mjs";
import {
  checkSuppressions,
  unapprovedSuppressionFindings,
} from "./check-suppressions.mjs";
import { checkCommitRange } from "./check-scope.mjs";
import { checkAdrApprover } from "./check-adr-approver.mjs";
import { checkApprovalProvenanceRange } from "./check-approval-provenance.mjs";
import { checkChangeSizeOverride } from "./check-change-size-override.mjs";
import { runDependencyChecks } from "./gate-6-dependency-checks.mjs";
import { runContentChecks } from "./gate-6-content-checks.mjs";
import { runScans } from "./gate-6-scans.mjs";
import { runBuildTestCoverage } from "./gate-6-test-coverage.mjs";
import { writeGate6Report } from "./gate-6-report.mjs";

// Re-exported so any importer of this script keeps resolving the helpers that
// moved into the per-concern modules above unchanged — the public surface of
// this entry point did not change, only where each concern lives (mirrors the
// licence-table.mjs / hooks/lib/unpushed.mjs splits).
export {
  runDependencyChecks,
  runContentChecks,
  runScans,
  runBuildTestCoverage,
  writeGate6Report,
};

/** @type {{check: string, path?: string, problem?: string, remedy?: string}[]} */
const findings = [];
const skips = [];
/** @param {string} check @param {string | undefined} path @param {string} problem @param {string} remedy */
const fail = (check, path, problem, remedy) =>
  findings.push({ check, path, problem, remedy });
/** @param {string} s */
const skip = (s) => skips.push(s);

// --- Resolve the base and the range ---------------------------------------
// `GITHUB_BASE_REF` is the pull request's base branch name in a `pull_request`
// workflow event; a manual run falls back to resolveBase(), the same
// origin/HEAD derivation gate 0 and the local gate 2 hook already use, so a
// renamed default branch does not need this script edited to match.
const baseArg = process.argv[2] || process.env.GITHUB_BASE_REF || null;
const base = baseArg ? `origin/${baseArg}` : resolveBase();
if (base && git(["rev-parse", "--verify", "--quiet", base]).status !== 0) {
  // A shallow or single-branch checkout may not have the base ref yet.
  git([
    "fetch",
    "--no-tags",
    "--quiet",
    "origin",
    base.replace(/^origin\//, ""),
  ]);
}
if (!base || git(["rev-parse", "--verify", "--quiet", base]).status !== 0) {
  console.error(
    "gate 6: cannot resolve the base branch — nothing to compare the pull request against",
  );
  process.exit(1);
}
const range = `${base}...HEAD`; // three-dot: merge-base to HEAD, gate-6's own form
const logRange = `${base}..HEAD`; // two-dot: every commit the branch actually added
process.stderr.write(`gate 6: base ${base}, range ${range}\n`);

/** @type {string[]} */
const changed = changedFiles(range);
const changedText = changed.filter(isText);
process.stderr.write(`gate 6: ${changed.length} file(s) changed in range\n`);

// --- Dependency-tree checks (gate 6 checks 3, 16, 7, 6, 11, and release-age
// register staleness). depsAt reads the base ref's manifest rather than a
// staged blob; see gate-6-dependency-checks.mjs for the checkout adaptation
// and the change-triggered shape these checks share.
{
  const r = runDependencyChecks({ base, changed });
  findings.push(...r.findings);
  skips.push(...r.skips);
}

// --- Per-file content checks (gate 2 checks 10, 9, 6): file size,
// machine-identifying content, and the secret scan over the changed text.
{
  const r = runContentChecks({ changed, changedText });
  findings.push(...r.findings);
  skips.push(...r.skips);
}

// --- Cross-language and cross-stack SARIF scanners (semgrep, osv-scanner).
// Network-bound at the local gates; re-run here server-side with a SARIF
// upload — see gate-6-scans.mjs.
{
  const r = runScans({ changedText });
  findings.push(...r.findings);
  skips.push(...r.skips);
}

// --- Check 17 (gate 2) — link and anchor integrity --------------------------
// Reads the whole documentation corpus already (checkLinks.mjs: "a file move
// leaves the broken link in a file nobody staged"); no range adaptation
// needed, same call as pre-commit.mjs.
for (const f of checkLinks()) findings.push(f);

// --- Repo-wide markdown structural lint — the server-side half of gate 5's
// check 5. Per-file prose rules run at gate 2 over the staged subset; the
// cross-file sweep belongs where the complete tree exists, the same reason
// checkLinks runs here rather than at gate 2. Gate 5 already sweeps the whole
// tree pre-push, but pre-push is local and bypassable with --no-verify; this
// is the enforcement a green merge actually rests on, on every pull request.
// Without it the structural rules were the exit-0 class in a new form: the
// check existed, was well tested, and nothing on the server ever ran it. The
// glob is passed at this call site, not held in .markdownlint-cli2.jsonc, for
// the same reason gate 5 states: a globs entry there combines with
// lint-staged's staged-path arguments and widens every commit to the whole
// tree (docs/specs/2026-08-01-markdown-gate-scope-design.md).
{
  const md = run("npx", ["--no-install", "markdownlint-cli2", "**/*.md"]);
  if (md.status !== 0) {
    fail(
      "markdown lint",
      undefined,
      (md.stdout || "") + (md.stderr || ""),
      "fix the structural violation above; run `npm run lint:md` locally",
    );
  }
}

// --- Check 15 (gate 2) — suppression register completeness ------------------
// Also whole-repository already (pre-commit.mjs calls it with no argument);
// same call here.
for (const f of checkSuppressions()) findings.push(f);

// --- Gate 6's own half of the approver split. Gate 2 lets a row
// missing only its approver through as a push back; here there is no author
// present to push back to, so the same rows fail the merge outright
// (guardrail-standards.md: "Where no author is present, the check looks for
// that record and fails without it").
for (const f of unapprovedSuppressionFindings()) findings.push(f);

// --- ADR approver, over the whole ADR corpus ------------------------
// Same repository-wide call as pre-commit.mjs; an ADR accepting a risk,
// licence, suppression or opt-out is a standing decision, not scoped to
// this pull request's own range.
for (const f of checkAdrApprover()) findings.push(f);

// --- Approval provenance, once per commit in the range -------------
// Server-side re-validation of the same gate-2 check above, over every
// commit the pull request actually added (checkCommitRange's own reasoning
// in check-scope.mjs: "adapts per commit... not once against the branch
// tip") — comparing the range's two endpoints as a single diff would treat
// two separate, legitimate commits (a row filed, then approved later) as
// one suspicious change, which is exactly the pattern this check must not
// refuse.
for (const f of checkApprovalProvenanceRange(logRange)) findings.push(f);

// --- Gate 3 — commit message, once per commit in the range ------------------
// gate-6-pull-request.md: "commit-message structure and scope agreement run
// once per commit in `git log origin/<base>..HEAD`, not once against the
// branch tip." checkCommitRange resolves each commit's own touched paths via
// `git diff-tree`, the range-scoped stand-in for the staged list a checkout
// does not have.
{
  const component = deriveComponent();
  for (const f of checkCommitRange(logRange, component)) findings.push(f);
}

// --- Checks 12 & 13 (gate 2) + gate 6 check 4 — whole-repository build and
// test, unconditionally. gate-6-pull-request.md's own point: "the local
// gates skip untouched components for speed; this gate does not, so the
// optimisation never becomes an unverified claim." One command also produces
// the two evidence artefacts gate 6 names: JUnit (row 10) and Cobertura
// coverage with its floor enforced (row 11, and gate 5 check 1). The same
// leg measures changed-line coverage (gate 6 check 8) against the Cobertura
// report it just wrote — see gate-6-test-coverage.mjs.
const coverage = runBuildTestCoverage({ base });
findings.push(...coverage.findings);
skips.push(...coverage.skips);

// --- Gate 4 — task completion, over the same range --------------------------
// Change size and file length are already implemented range-scoped — hooks/
// gate-4-task-completion.mjs is the distributed hook, invoked as a
// subprocess rather than reimplemented, because it already measures
// `${base}...HEAD` against the same file classes this script uses
// everywhere else.
//
// Pass this script's own already-resolved `base` explicitly,
// rather than let the subprocess re-derive it via resolveBase(). Before
// this fix the two calls could resolve differently in the same checkout:
// this script's own `base` (line 84) reads GITHUB_BASE_REF first, which a
// `pull_request` CI run always has; the subprocess had no such input and
// called raw resolveBase(), which needs `origin/HEAD` — a symref GitHub
// Actions' `actions/checkout` never sets (no `git remote set-head origin
// -a` step), so it failed on every CI run of this workflow, unconditionally.
// The result was a change of any size passing gate 6 with gate 4's own
// check silently absent from both the local and the CI surface. Threading
// the resolved value through removes the second derivation entirely rather
// than trying to make it agree with the first.
{
  const g4 = run("node", ["hooks/gate-4-task-completion.mjs", base]);
  process.stderr.write((g4.stdout || "") + (g4.stderr || ""));
  if (g4.status !== 0) {
    fail(
      "gate 4 — change size / file length",
      undefined,
      (g4.stdout || "") + (g4.stderr || ""),
      "split the change, or report the size and ask a human to accept the override",
    );
  }
}

// --- [large-pr] is a human decision, checked here rather than
// trusted from the marker's bare presence. Gate 4 above still clears the
// local, author-present block on the string alone (an agent may propose the
// override by reporting it, never apply it — the report is what reaches the
// human); this is the unattended half, the same split registers.md already
// draws between gate 2's push back and gate 6's block for a row missing only
// its approver. See scripts/check-change-size-override.mjs for the "who, not
// which commit" reasoning.
for (const f of checkChangeSizeOverride(logRange)) findings.push(f);

// Complexity, function length and parameter count (gate-4-task-completion.md
// row 4) are gap-fill measures with no stack analyser configured for this
// repository (no ESLint here — thresholds.md: "take the analyser's
// recommended rule set... only where the stack has no native opinion").
// lizard is what gate 7 already uses as the general-purpose backstop, at the
// same thresholds; reused directly here rather than invented twice, scoped to
// this range's changed production and test files rather than the whole
// repository.
//
// The consequence is not reused unchanged, and that difference is stated
// rather than left implicit (cross-gate-rules.md: "a check reused across
// gates carries its severity model with it"): gate 7 is report-only for this
// scan; gate 6 hard-blocks. That was correct to state once ADR-0009 named
// it — a hard-blocking file-length/complexity gate on changed code is the
// right default for a pull request pipeline — but it also means a lizard
// parser artefact (function-span merging on a large-enough file; see gate 7's
// own comment on `lizard -C 15 -L 100 -a 7`) has no report-only tier to land
// in here the way it does at gate 7. Keep any ported file this scope
// includes away from the size where that recurs (ADR-0009).
{
  const codeFiles = changed.filter((f) => {
    if (!existsSync(f)) return false;
    const cls = classOf(f);
    return cls === "production" || cls === "test";
  });
  if (codeFiles.length && have("lizard", ["--version"])) {
    const lz = run("lizard", [
      "-C",
      "15",
      "-L",
      "100",
      "-a",
      "7",
      ...codeFiles,
    ]);
    const lzOut = (lz.stdout || "") + (lz.stderr || "");
    process.stderr.write(lzOut);
    if (lz.status !== 0) {
      // Path is empty, not the joined file list, for the same reason as the
      // secret scan and semgrep findings above: lizard's own table already
      // names the file and line range per function. Only the "Warnings"
      // table goes into the finding — the full per-function listing already
      // went to stderr above, and repeating it in a native annotation is
      // noise the reviewer did not ask for.
      const table =
        /!!!! Warnings[\s\S]*?(?=\r?\n=+\r?\nTotal nloc)/.exec(lzOut)?.[0] ??
        "lizard exited non-zero; see the log above for which function";
      fail(
        "gate 4 — complexity (lizard, gap-fill)",
        "",
        table,
        "split the long or complex function; the thresholds are the gap-fill defaults",
      );
    }
  } else if (!codeFiles.length) {
    skip("gate 4 — complexity: no production or test file changed in range");
  } else {
    skip("gate 4 — complexity: lizard not on PATH");
  }

  // Agent-context length (gate-4-task-completion.md row 3): warn 200, error
  // 500 lines, applied to changed files classed agent-context (skills/**).
  const agentFiles = changed.filter(
    (f) => existsSync(f) && classOf(f) === "agent-context",
  );
  for (const f of agentFiles) {
    const lines = run("git", ["show", `HEAD:${f}`]).stdout.split("\n").length;
    if (lines > 500) {
      fail(
        "gate 4 — agent-context length",
        f,
        `${f} is ${lines} lines (> 500 error limit)`,
        "split detail into a referenced file, one level deep, with a stated load trigger",
      );
    } else if (lines > 200) {
      skip(
        `gate 4 — agent-context length: ${f} is ${lines} lines (> 200 warn band)`,
      );
    }
  }
}

// --- Report -----------------------------------------------------------------
writeGate6Report({
  findings,
  skips,
  coverageTestSummary: coverage.coverageTestSummary,
  changedLineCoveragePercent: coverage.changedLineCoveragePercent,
  range,
  changed,
});
