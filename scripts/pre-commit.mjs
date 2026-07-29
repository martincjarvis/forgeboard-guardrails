#!/usr/bin/env node
// Gate 2 — commit, repository-level checks. Runs after lint-staged, which has
// already done the file-scoped work (format, prose lint, spelling) on the staged
// subset and re-staged the reformatted bytes. This orchestrator holds the rest:
// lock sync, file size, machine-identifying content, secret scan, link and
// anchor integrity, the suppression register, and the changed-component build
// and unit tests. Checks run cheapest first and stop at the first failure, per
// gate 2's contract.
//
// Exit 0 commits. Exit 2 refuses, naming the check, the path and the remedy.
import { existsSync } from "node:fs";
import {
  stagedFiles,
  classOf,
  isText,
  have,
  run,
  git,
  report,
} from "./lib.mjs";
import { checkLinks } from "./check-links.mjs";
import { checkSuppressions } from "./check-suppressions.mjs";
import { checkMachineId } from "./check-machine-id.mjs";
import { checkProtectedBranch } from "./check-protected-branch.mjs";
import { checkLicenceCompleteness } from "./check-licence.mjs";

const findings = [];
const skips = [];
const note = (s) => skips.push(s);

// Check 1 — protected branch. Runs first, per gate 2's fixed order (2.1).
{
  const branch = checkProtectedBranch();
  findings.push(...branch.findings);
  skips.push(...branch.skips);
}
if (findings.length) report("gate 2", findings, skips);

const staged = stagedFiles();
if (staged.length === 0) {
  // Nothing staged: the file-scoped gate had nothing to do either. Still run the
  // repository-wide checks (links, register) so a merge can't inherit a break.
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

// Check 17 — link and anchor integrity, over the WHOLE corpus.
{
  const found = checkLinks();
  if (found.length) report("gate 2", found, skips);
}

// Check 15 — suppression register completeness.
{
  const found = checkSuppressions();
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
const touchedCode = staged.some(
  (f) => f.startsWith("hooks/") || f.startsWith("scripts/"),
);
if (touchedCode) {
  const build = run("npm", ["run", "build"]);
  if (build.status !== 0) {
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
}
if (staged.some((f) => f.startsWith("hooks/"))) {
  const tests = run("node", ["--test", "hooks/test/hooks.test.mjs"]);
  if (tests.status !== 0) {
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
} else {
  note("unit tests — hooks/ not changed, no component to test");
}

report("gate 2", findings, skips);
