#!/usr/bin/env node
// Gate 0 — Baseline. Run before a unit of work starts (`npm run gate:0`), so a
// failure that appears later belongs to the change rather than to what was
// inherited. Rebase is checked, not performed: the gate reports whether the
// workspace is behind and names the command, rather than rewriting the branch.
//
// Exit 0 — the baseline holds, work may start. Exit 2 — a red baseline stops the
// work and is reported, never worked through.
import { run, git, report } from "./lib.mjs";

const findings = [];
const skips = [];
const counts = {};

// Report the derivations: the default branch and the commands each check uses.
const baseHead = git(["rev-parse", "--abbrev-ref", "origin/HEAD"]);
const base = baseHead.status === 0 ? baseHead.stdout.trim() : "origin/main";
process.stderr.write(`gate 0: base is ${base}\n`);

// Check 1 — rebased onto base. Fetch first; if the fetch cannot run, the rebase
// state is unknown and that is reported rather than assumed clean.
const fetched = git(["fetch", "--quiet", "--all"]);
if (fetched.status !== 0) {
  skips.push("rebase check — `git fetch` failed, cannot compare to the base");
} else {
  const behind = git(["rev-list", "--count", `HEAD..${base}`]);
  if (behind.status === 0 && Number(behind.stdout.trim()) > 0) {
    findings.push({
      check: "rebased onto base",
      problem: `workspace is ${behind.stdout.trim()} commit(s) behind ${base}`,
      remedy: `run \`git rebase ${base}\` before starting work`,
    });
  }
}

// Check 2 — clean tree. Uncommitted changes the author did not make muddy the
// baseline.
const status = git(["status", "--porcelain"]);
if (status.status === 0 && status.stdout.trim().length > 0) {
  findings.push({
    check: "clean tree",
    problem: "uncommitted changes are present",
    remedy: "commit, stash, or discard them before starting",
  });
}

// Check 3 — dependencies present, at the versions the lock file names.
const ci = run("npm", ["ci", "--no-fund", "--no-audit"]);
if (ci.status !== 0) {
  findings.push({
    check: "dependencies present",
    problem:
      "`npm ci` failed — the manifest and lock file disagree, or the install broke",
    remedy:
      "align package.json and package-lock.json with a deliberate install",
  });
}

// Check 4 — clean build. A warning is a failure (zero-warning line).
const build = run("npm", ["run", "build"]);
if (build.status !== 0) {
  findings.push({
    check: "clean build",
    problem: "`npm run build` (tsc) reported errors",
    remedy: "resolve every type/analysis error before starting",
  });
}

// Check 5 — green test suite, with counts quoted rather than summarised.
const tests = run("node", ["--test", "hooks/test/hooks.test.mjs"]);
const out = (tests.stdout || "") + (tests.stderr || "");
for (const [k, re] of [
  ["pass", /# pass (\d+)|ℹ pass (\d+)/],
  ["fail", /# fail (\d+)|ℹ fail (\d+)/],
  ["skipped", /# skipped (\d+)|ℹ skipped (\d+)/],
]) {
  const m = out.match(re);
  counts[k] = m ? Number(m[1] || m[2]) : "?";
}
process.stderr.write(
  `gate 0: tests pass=${counts.pass} fail=${counts.fail} skipped=${counts.skipped}\n`,
);
if (tests.status !== 0) {
  findings.push({
    check: "green test suite",
    problem: `the test suite failed (pass=${counts.pass} fail=${counts.fail})`,
    remedy: "a red baseline stops the work; fix the failing test first",
  });
}

report("gate 0", findings, skips);
