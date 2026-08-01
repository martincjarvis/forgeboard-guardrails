#!/usr/bin/env node
// Gate 2 — commit, repository-level checks. Runs after lint-staged, which has
// already done the file-scoped work (format, prose lint, spelling) on the staged
// subset and re-staged the reformatted bytes. This orchestrator holds the rest:
// lock sync, file size, machine-identifying content, secret scan, the
// suppression register, and the changed-component build and unit tests. Checks
// run cheapest first and stop at the first failure, per gate 2's contract.
//
// Exit 0 commits. Exit 2 refuses, naming the check, the path and the remedy.
import {
  stagedFiles,
  isText,
  have,
  run,
  git,
  report,
  withStagedWorkingTree,
} from "./lib.mjs";
import {
  checkSuppressions,
  pendingSuppressionApprovals,
} from "./check-suppressions.mjs";
import { checkMachineId } from "./check-machine-id.mjs";
import { checkProtectedBranch } from "./check-protected-branch.mjs";
import { checkLicenceCompleteness } from "./check-licence.mjs";
import { checkAdrApprover } from "./check-adr-approver.mjs";
import { checkApprovalProvenanceStaged } from "./check-approval-provenance.mjs";

const findings = [];
const skips = [];
/** @param {string} s */
const note = (s) => skips.push(s);

// Check 1 — protected branch. Runs first, per gate 2's fixed order (2.1).
{
  const branch = checkProtectedBranch();
  findings.push(...branch.findings);
  skips.push(...branch.skips);
}
if (findings.length) report("gate 2", findings, skips);

/** @type {string[]} */
const staged = stagedFiles();
if (staged.length === 0) {
  // Nothing staged: the file-scoped gate had nothing to do either. Still run the
  // repository-wide checks (register) so a merge can't inherit a break.
  note("no staged files; repository-wide checks still run");
}

// Check 3 — dependency lock sync. The lock file tracks dependencies, so this
// fires only when the dependency set in the manifest actually changed — a script
// or metadata edit to package.json is not a dependency change and does not need a
// new lock. A dependency change without its lock blocks; a lock without a
// manifest change pushes back (no author present to answer, so block).
const DEP_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
  "bundleDependencies",
  "overrides",
  "resolutions",
];
/** @param {string} ref */
function depsAt(ref) {
  const r = git(["show", ref]);
  if (r.status !== 0) return "";
  try {
    const p = JSON.parse(r.stdout);
    return JSON.stringify(
      Object.fromEntries(DEP_FIELDS.filter((f) => p[f]).map((f) => [f, p[f]])),
    );
  } catch {
    return "";
  }
}
const manifestStaged = staged.some((f) => f === "package.json");
const lockStaged = staged.some((f) => f === "package-lock.json");
const depsChanged = depsAt("HEAD:package.json") !== depsAt(":package.json");
if (depsChanged && !lockStaged) {
  findings.push({
    check: "dependency lock sync",
    path: "package.json",
    problem:
      "a dependency in package.json changed but package-lock.json is not staged",
    remedy: "stage the lock file so the dependency set is the one declared",
  });
}
if (lockStaged && !manifestStaged) {
  findings.push({
    check: "dependency lock sync",
    path: "package-lock.json",
    problem: "package-lock.json moved with no manifest change",
    remedy: "state the upgrade in the message, or include the manifest change",
  });
}
if (findings.length) report("gate 2", findings, skips);

// Check 10 — file size, from the staged blob bytes. Warn band pushes back; the
// error band blocks. Bytes do not vary by file class.
const SIZE_WARN = 1_000_000;
const SIZE_ERROR = 5_000_000;
for (const f of staged) {
  const s = git(["cat-file", "-s", `:${f}`]);
  if (s.status !== 0) continue;
  const bytes = Number(s.stdout.trim());
  if (bytes >= SIZE_ERROR) {
    findings.push({
      check: "file size (error)",
      path: f,
      problem: `${f} is ${bytes} bytes (>= ${SIZE_ERROR} error limit)`,
      remedy: "store large objects via large-file storage, or remove the file",
    });
  } else if (bytes >= SIZE_WARN) {
    findings.push({
      check: "file size (warn)",
      path: f,
      problem: `${f} is ${bytes} bytes (>= ${SIZE_WARN} warn limit)`,
      remedy: "store large objects via large-file storage, or record why here",
    });
  }
}
if (findings.length) report("gate 2", findings, skips);

// Check 9 — machine-identifying content, on staged text files.
{
  const stagedText = staged.filter(isText);
  if (stagedText.length) {
    const found = checkMachineId(stagedText);
    if (found.length) report("gate 2", found, skips);
  }
}

// Check 6 — secret scan, on staged text files. Reports unavailable if absent.
{
  const stagedText = staged.filter(isText);
  if (stagedText.length) {
    if (have("npx", ["--no-install", "secretlint", "--version"])) {
      const scan = run("npx", ["--no-install", "secretlint", ...stagedText]);
      if (scan.status !== 0) {
        report(
          "gate 2",
          [
            {
              check: "secret scan",
              path: stagedText.join(", "),
              problem: (scan.stdout || "") + (scan.stderr || ""),
              remedy:
                "remove the credential, or revoke and rotate if already pushed",
            },
          ],
          skips,
        );
      }
    } else {
      note("secret scan — secretlint not installed, staged files not scanned");
    }
  }
}

// Check 8 — cross-language analysis (semgrep) is network-bound (`--config auto`
// fetches the registry), which makes it wrong for a per-commit gate. It runs at
// gate 7 instead; here it is a visible skip with the reason.
note("cross-language analysis (semgrep) — runs at gate 7, not per-commit");

// Check 15 — suppression register completeness.
{
  const found = checkSuppressions();
  if (found.length) report("gate 2", found, skips);
}

// Fix 35 — gate 2's own half of the approver split. A register row missing
// only its approver is allowed to commit — a push back
// (guardrail-standards.md's verdict table), not a block — but is stated in
// the output so it is not silently forgotten. Gate 6 blocks the merge on the
// same rows; there is no author present there to push back to.
for (const row of pendingSuppressionApprovals()) {
  process.stderr.write(
    `gate 2: PUSH BACK suppression register — '${row.code}' (${row.scope}) has no approver; ` +
      "every other column is complete. Options: fix the underlying finding and drop the " +
      "suppression, or get a human to approve it. Unanswered, gate 6 refuses the merge.\n",
  );
}

// Fix 22 — an Accepted ADR that reads as accepting a risk, a licence, a
// suppression or an opt-out names a human approver, the same requirement a
// register row's Approver column already carries. Repository-wide, like the
// two checks just above — an ADR's own file may not be staged on the
// commit that references it.
{
  const found = checkAdrApprover();
  if (found.length) report("gate 2", found, skips);
}

// Fix 49 — approval is an event, not a field. A staged ADR or register row
// that already carries a filled approver, and did not exist at HEAD before
// this commit, arrives pre-approved rather than reviewed — the same defect
// class as check 22 above, caught by reading history rather than only the
// present text.
{
  const found = checkApprovalProvenanceStaged({
    stagedFiles: staged,
    /** @param {string} p */
    readBefore: (p) => {
      const r = git(["show", `HEAD:${p}`]);
      return r.status === 0 ? r.stdout : null;
    },
    /** @param {string} p */
    readAfter: (p) => {
      const r = git(["show", `:${p}`]);
      return r.status === 0 ? r.stdout : null;
    },
  });
  if (found.length) report("gate 2", found, skips);
}

// Check 16 — dependency licence register completeness. Change-triggered on
// the same lockStaged computed above (change-triggered-checks.md); a visible
// skip when the lock file is not part of this commit.
{
  const { findings: found, skips: sk } = checkLicenceCompleteness(lockStaged);
  skips.push(...sk);
  if (found.length) report("gate 2", found, skips);
}

// Checks 12 and 13 — build and unit tests, only for the changed component. The
// production code is hooks/ and scripts/; if either moved, build (tsc) runs, and
// if hooks/ moved the unit tests run too.
//
// Both invoke a compiler or a test runner, which need the real working tree —
// not a per-file read like checks 9/15/16/17 above. The working tree can
// already differ from the index by the time this runs (a file edited after
// `git add`), so both run under withStagedWorkingTree's hide-and-restore
// isolation (gate-2-commit.md): stash whatever is unstaged, run against a
// tree that matches the index, then restore — recoverable with `git stash
// pop` if the process is killed mid-run.
const touchedCode = staged.some(
  (f) => f.startsWith("hooks/") || f.startsWith("scripts/"),
);
const touchedHooks = staged.some((f) => f.startsWith("hooks/"));

// Check 11 — per-path lint (eslint.config.mjs; gate-2-commit.md: "A lint or
// type-check failure is refused independently of the build — the type
// checker is not the linter"). Scoped to the staged files eslint.config.mjs
// itself covers, not the whole repository, and run in the same isolated tree
// as the build below since it reads staged content from disk, not the git
// index.
const lintFiles = staged.filter(
  (f) =>
    (f.startsWith("hooks/") || f.startsWith("scripts/")) && f.endsWith(".mjs"),
);

if (touchedCode || touchedHooks || lintFiles.length) {
  const outcome = withStagedWorkingTree(() => {
    const result = {};
    if (touchedCode) result.build = run("npm", ["run", "build"]);
    if (touchedHooks) {
      result.tests = run("node", ["--test", "hooks/test/hooks.test.mjs"]);
    }
    if (lintFiles.length) {
      result.lint = run("npx", ["eslint", "--max-warnings", "0", ...lintFiles]);
    }
    return result;
  });
  if ("isolationFailed" in outcome) {
    report(
      "gate 2",
      [
        {
          check: "staged-content isolation",
          problem: outcome.problem,
          remedy:
            "run `git stash list`; if a `gate-2: isolate staged tree` entry remains, `git stash pop` to restore your working tree, then retry the commit",
        },
      ],
      skips,
    );
  }
  const build = outcome.build;
  const tests = outcome.tests;
  const lint = outcome.lint;
  if (touchedCode && build && build.status !== 0) {
    report(
      "gate 2",
      [
        {
          check: "build (tsc)",
          problem: (build.stdout || "") + (build.stderr || ""),
          remedy: "fix the type/analysis error above; a warning is a failure",
        },
      ],
      skips,
    );
  }
  if (touchedHooks && tests && tests.status !== 0) {
    report(
      "gate 2",
      [
        {
          check: "unit tests",
          problem: (tests.stdout || "") + (tests.stderr || ""),
          remedy: "fix the failing test; hooks/ moved on this commit",
        },
      ],
      skips,
    );
  }
  if (lintFiles.length && lint && lint.status !== 0) {
    report(
      "gate 2",
      [
        {
          check: "lint (eslint)",
          problem: (lint.stdout || "") + (lint.stderr || ""),
          remedy: "fix the lint violation; a warning is a failure",
        },
      ],
      skips,
    );
  }
}
if (!touchedHooks) {
  note("unit tests — hooks/ not changed, no component to test");
}
if (!lintFiles.length) {
  note("lint (eslint) — no staged hooks/ or scripts/ file to lint");
}

report("gate 2", findings, skips);
