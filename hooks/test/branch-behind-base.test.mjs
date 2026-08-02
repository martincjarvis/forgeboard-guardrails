// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis Uncited uncited
// Split from hooks.test.mjs — subject group: branch-behind-base.
// Loaded by hooks/test/hooks.test.mjs; not invoked directly by the test runner.
import { test } from "node:test";
import { writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { checkBranchBehindBase } from "../../scripts/check-branch-behind-base.mjs";
import assert from "node:assert/strict";
import { git, scratchRepo, runScript } from "./support.mjs";

// --- scripts/check-branch-behind-base.mjs — gate-5-push.md check 4:
// branch protection's own `strict: true` already refuses a stale merge
// (gate-6-pull-request.md: "A pull request behind its base cannot merge
// until it is updated"); nothing checked it before the push existed. Unit
// tests below exercise the classification through injected `git`/
// `resolveBase` collaborators — the same injectable shape checkOsvScanner
// and checkBranchProtection already take, for the same reason: a
// test must not depend on this host's own network reaching a real remote.
// The regression guards further down run the real module against a scratch
// repository with real branches and a real remote-tracking ref (hazard: "Fix
// 67's tests need real branches and a real remote-tracking ref").

test("checkBranchBehindBase: an unresolvable base is a visible skip naming the remedy, not a finding", () => {
  const { findings, skips } = checkBranchBehindBase({
    resolveBase: () => null,
    git: () => {
      throw new Error("must not shell out once the base cannot be resolved");
    },
  });
  assert.deepEqual(findings, []);
  assert.equal(skips.length, 1);
  const skip = skips[0];
  assert.ok(skip, "expected one skip");
  assert.match(skip, /branch behind base/);
  assert.match(skip, /origin\/HEAD could not be resolved/);
  assert.match(skip, /git remote set-head/);
});

test("checkBranchBehindBase: HEAD behind its base is a finding naming the distance and the rebase remedy", () => {
  const { findings, skips } = checkBranchBehindBase({
    resolveBase: () => "origin/main",
    git: (args) => {
      if (args[0] === "fetch") return { status: 0 };
      if (args[0] === "rev-list") return { status: 0, stdout: "3\n" };
      throw new Error(`unexpected git ${args.join(" ")}`);
    },
  });
  assert.equal(skips.length, 0);
  assert.equal(findings.length, 1);
  const finding = findings[0];
  assert.ok(finding, "expected one finding");
  assert.equal(finding.check, "branch behind base");
  assert.match(finding.problem, /3 commit\(s\) behind origin\/main/);
  assert.doesNotMatch(
    finding.problem,
    /stale/,
    "a successful fetch must not be reported as a possibly-stale comparison",
  );
  assert.match(finding.remedy, /git rebase origin\/main/);
});

test("checkBranchBehindBase: level with the base is clean — zero commits behind is not a finding", () => {
  const { findings, skips } = checkBranchBehindBase({
    resolveBase: () => "origin/main",
    git: (args) => {
      if (args[0] === "fetch") return { status: 0 };
      if (args[0] === "rev-list") return { status: 0, stdout: "0\n" };
      throw new Error(`unexpected git ${args.join(" ")}`);
    },
  });
  assert.deepEqual(findings, []);
  assert.deepEqual(skips, []);
});

test("checkBranchBehindBase: a fetch failure does not refuse the push by itself — the comparison still runs, labelled possibly stale", () => {
  const { findings, skips } = checkBranchBehindBase({
    resolveBase: () => "origin/main",
    git: (args) => {
      if (args[0] === "fetch") return { status: 1, stderr: "no network" };
      if (args[0] === "rev-list") return { status: 0, stdout: "2\n" };
      throw new Error(`unexpected git ${args.join(" ")}`);
    },
  });
  assert.equal(skips.length, 0);
  assert.equal(findings.length, 1);
  const finding = findings[0];
  assert.ok(finding, "expected one finding");
  assert.match(finding.problem, /2 commit\(s\) behind origin\/main/);
  assert.match(
    finding.problem,
    /stale/,
    "a failed fetch must be disclosed rather than presenting the comparison as current",
  );
});

test("checkBranchBehindBase: a fetch failure with nothing behind is still clean — offline is not refused on its own", () => {
  const { findings, skips } = checkBranchBehindBase({
    resolveBase: () => "origin/main",
    git: (args) => {
      if (args[0] === "fetch") return { status: 1, stderr: "no network" };
      if (args[0] === "rev-list") return { status: 0, stdout: "0\n" };
      throw new Error(`unexpected git ${args.join(" ")}`);
    },
  });
  assert.deepEqual(findings, []);
  assert.deepEqual(skips, []);
});

test("checkBranchBehindBase: rev-list itself failing is a visible skip, not a finding", () => {
  const { findings, skips } = checkBranchBehindBase({
    resolveBase: () => "origin/main",
    git: (args) => {
      if (args[0] === "fetch") return { status: 0 };
      if (args[0] === "rev-list")
        return { status: 128, stdout: "", stderr: "fatal: bad revision" };
      throw new Error(`unexpected git ${args.join(" ")}`);
    },
  });
  assert.deepEqual(findings, []);
  assert.equal(skips.length, 1);
  const skip = skips[0];
  assert.ok(skip, "expected one skip");
  assert.match(skip, /branch behind base/);
  assert.match(skip, /bad revision/);
});

test("checkBranchBehindBase: a zero exit carrying no count is a visible skip — an unreadable count must not read as level with the base", () => {
  const { findings, skips } = checkBranchBehindBase({
    resolveBase: () => "origin/main",
    // What git returns when the process could not be spawned at all: no
    // stdout to read, and nothing in the status to say the count is missing.
    git: (args) => {
      if (args[0] === "fetch") return { status: 0 };
      if (args[0] === "rev-list") return { status: 0 };
      throw new Error(`unexpected git ${args.join(" ")}`);
    },
  });
  assert.deepEqual(findings, []);
  assert.equal(skips.length, 1);
  const skip = skips[0];
  assert.ok(skip, "expected one skip");
  assert.match(skip, /branch behind base/);
  assert.match(skip, /no readable commit count/);
});

test('checkBranchBehindBase: a zero exit with blank output is the same skip — `Number("")` is 0, and 0 would pass', () => {
  const { findings, skips } = checkBranchBehindBase({
    resolveBase: () => "origin/main",
    git: (args) => {
      if (args[0] === "fetch") return { status: 0 };
      if (args[0] === "rev-list") return { status: 0, stdout: "\n" };
      throw new Error(`unexpected git ${args.join(" ")}`);
    },
  });
  assert.deepEqual(findings, []);
  assert.equal(skips.length, 1);
  const skip = skips[0];
  assert.ok(skip, "expected one skip");
  assert.match(skip, /no readable commit count/);
});

// Regression guards: the real module (default git/resolveBase), run against
// a scratch repository with real commits and a real remote-tracking ref —
// not the injected fakes above. scratchRepo() fabricates
// refs/remotes/origin/main and refs/remotes/origin/HEAD the same way a real
// `git clone` writes them, but configures no real `origin` remote, so the
// module's own `git fetch origin` genuinely fails here — proving the
// possibly-stale path end to end at the same time as the two required
// directions (gate-5-push.md: "a branch behind its base refused, a branch
// level with it passing").

test("regression guard: check-branch-behind-base.mjs run for real, a feature branch behind its fabricated origin/main is refused, naming the distance and the remedy", () => {
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  // A commit lands on the base after the feature branch forked from it —
  // moving the fabricated origin/main ref is what a real `git fetch` would
  // have done, had a real remote been configured.
  git(dir, ["checkout", "-q", "main"]);
  writeFileSync(join(dir, "later.txt"), "later\n");
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "chore: lands on base after branching"]);
  git(dir, ["update-ref", "refs/remotes/origin/main", "main"]);
  git(dir, ["checkout", "-q", "feature"]);

  const r = runScript("scripts/check-branch-behind-base.mjs", dir);
  assert.equal(r.status, 2, "a branch behind its base must be refused");
  assert.match(r.stderr, /branch behind base/);
  assert.match(r.stderr, /1 commit\(s\) behind origin\/main/);
  assert.match(r.stderr, /git rebase origin\/main/);
  rmSync(dir, { recursive: true, force: true });
});

test("regression guard: check-branch-behind-base.mjs run for real, a feature branch level with its base passes", () => {
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);

  const r = runScript("scripts/check-branch-behind-base.mjs", dir);
  assert.equal(r.status, 0, "a branch level with its base must not be refused");
  assert.doesNotMatch(r.stderr, /branch behind base/);
  rmSync(dir, { recursive: true, force: true });
});
