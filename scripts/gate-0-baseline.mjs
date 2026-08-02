#!/usr/bin/env node
// Gate 0 — Baseline. Run before a unit of work starts (`npm run gate:0`), so a
// failure that appears later belongs to the change rather than to what was
// inherited. Rebase is checked, not performed: the gate reports whether the
// workspace is behind and names the command, rather than rewriting the branch.
//
// Exit 0 — the baseline holds, work may start. Exit 2 — a red baseline stops the
// work and is reported, never worked through.
//
// `--quick` runs only the millisecond, local signals — behind base (against the
// last-known origin/HEAD, no fetch), clean tree, node_modules present — and skips
// the build and the full suite, printing a note that points at `npm run gate:0`
// for them. It exists for the session-start hook, which must surface the
// baseline cheaply: the failures an agent actually hit (behind base, dirty tree,
// a fresh worktree with no node_modules) cost milliseconds, while a build and a
// two-minute suite get the hook disabled. Full mode (no flag) is unchanged.
import { existsSync } from "node:fs";
import { run, git, resolveBase, report } from "./lib.mjs";

const quick = process.argv.includes("--quick");

const findings = [];
const skips = [];
/** @type {Record<string, number | string>} */
const counts = {};

// Report the derivation: the default branch each check below diffs against.
// origin/HEAD is the only source (no hardcoded fallback) — an unresolvable
// origin/HEAD skips the rebase check visibly rather than guessing a name.
const base = resolveBase();
if (base) {
  process.stderr.write(`gate 0: base is ${base}\n`);
} else {
  process.stderr.write("gate 0: base could not be resolved (origin/HEAD)\n");
}

// Check 1 — rebased onto base. Full mode fetches first so the comparison is
// current; quick mode compares against the last-known origin/HEAD only — a fetch
// is not millisecond, and "behind as of the last fetch" is the cheap signal that
// catches the common case. Either way, rebase is reported, never performed.
if (!base) {
  skips.push("rebase check — origin/HEAD could not be resolved, check skipped");
} else if (quick) {
  const behind = git(["rev-list", "--count", `HEAD..${base}`]);
  if (behind.status === 0 && Number(behind.stdout.trim()) > 0) {
    findings.push({
      check: "rebased onto base",
      problem: `workspace is ${behind.stdout.trim()} commit(s) behind ${base} (as of the last fetch; quick mode does not fetch)`,
      remedy: `run \`git rebase ${base}\` before starting work`,
    });
  }
} else {
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

// Check 3 — dependencies present, at the versions the lock file names. Quick
// mode checks only that node_modules exists — the failure an agent actually hit
// (a fresh worktree with nothing installed) — rather than running `npm ci`,
// which is the full baseline's job.
if (quick) {
  if (!existsSync("node_modules")) {
    findings.push({
      check: "dependencies present",
      problem:
        "node_modules is absent — a fresh worktree with nothing installed is exactly the baseline failure this check exists to surface",
      remedy:
        "run `npm install` (or `npm run gate:0` for the full `npm ci` baseline)",
    });
  }
} else {
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
}

if (quick) {
  // The build and the full suite are the expensive half of the baseline. They
  // are reported as a named skip here so a reader of the hook's output knows they
  // did not run, with the command that does run them — never a silent absence.
  skips.push(
    "clean build and green test suite — quick mode; run `npm run gate:0` for the full baseline",
  );
} else {
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
  for (const [k, re] of /** @type {[string, RegExp][]} */ ([
    ["pass", /# pass (\d+)|ℹ pass (\d+)/],
    ["fail", /# fail (\d+)|ℹ fail (\d+)/],
    ["skipped", /# skipped (\d+)|ℹ skipped (\d+)/],
  ])) {
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
}

report("gate 0", findings, skips);
