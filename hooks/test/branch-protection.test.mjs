// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis Uncited uncited
// Split from hooks.test.mjs — subject group: branch-protection.
// Loaded by hooks/test/hooks.test.mjs; not invoked directly by the test runner.
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  deriveRequiredContexts,
  evaluateBranchProtection,
  checkBranchProtection,
} from "../../scripts/check-branch-protection.mjs";
import assert from "node:assert/strict";
import { ROOT, git, scratchRepo, runScript } from "./support.mjs";

// --- scripts/check-branch-protection.mjs — branch protection is
// never configured, and its absence was never a blocking finding (on
// a bootstrapped repository: `gh api .../branches/main/protection` ->
// 404, and a red gate 6 blocked nothing). deriveRequiredContexts and
// evaluateBranchProtection are pure and tested directly; checkBranchProtection
// itself is tested through its injectable collaborators (the same shape
// checkScriptWiring's injectable readFile already takes) so every SKIP path
// and the FINDING-on-unconfigured path are deterministic — no live `gh`
// session or network access needed to prove them.

test("deriveRequiredContexts expands a matrix job's name into one context per matrix value — this toolkit's own pull-request.yml", () => {
  const workflow = readFileSync(
    join(ROOT, ".github", "workflows", "pull-request.yml"),
    "utf8",
  );
  assert.deepEqual(deriveRequiredContexts(workflow), [
    "gate 6 (ubuntu-latest)",
    "gate 6 (windows-latest)",
  ]);
});

test("deriveRequiredContexts falls back to the job id when a job has no name:, the same fallback GitHub itself uses", () => {
  const workflow = "jobs:\n  build:\n    runs-on: ubuntu-latest\n";
  assert.deepEqual(deriveRequiredContexts(workflow), ["build"]);
});

test("deriveRequiredContexts: a job's own name is not confused with a step's, and a non-matrix job is not expanded", () => {
  const workflow =
    "jobs:\n" +
    "  build:\n" +
    "    name: build and test\n" +
    "    runs-on: ubuntu-latest\n" +
    "    steps:\n" +
    "      - name: checkout\n" +
    "        uses: actions/checkout@abc\n";
  assert.deepEqual(deriveRequiredContexts(workflow), ["build and test"]);
});

test("deriveRequiredContexts returns nothing for a workflow with no jobs: block", () => {
  assert.deepEqual(deriveRequiredContexts("name: empty\n"), []);
});

const FULL_PROTECTION = {
  required_status_checks: {
    strict: true,
    checks: [
      { context: "gate 6 (ubuntu-latest)" },
      { context: "gate 6 (windows-latest)" },
    ],
  },
  enforce_admins: { enabled: true },
  required_pull_request_reviews: {
    required_approving_review_count: 1,
    dismiss_stale_reviews: true,
  },
  required_conversation_resolution: { enabled: true },
  allow_force_pushes: { enabled: false },
  allow_deletions: { enabled: false },
  required_linear_history: { enabled: true },
};
const REQUIRED = ["gate 6 (ubuntu-latest)", "gate 6 (windows-latest)"];

test("evaluateBranchProtection: no protection configured at all is refused, naming the branch", () => {
  const findings = evaluateBranchProtection(null, "main", REQUIRED);
  assert.equal(findings.length, 1);
  const finding = findings[0];
  assert.ok(finding, "expected one finding");
  assert.match(finding.problem, /main/);
  assert.match(finding.problem, /no branch protection configured/);
});

test("evaluateBranchProtection: fully configured protection matching every required check has no findings", () => {
  assert.deepEqual(
    evaluateBranchProtection(FULL_PROTECTION, "main", REQUIRED),
    [],
  );
});

test("evaluateBranchProtection: a matrix leg missing from the required list is named", () => {
  const configured = {
    ...FULL_PROTECTION,
    required_status_checks: {
      strict: true,
      checks: [{ context: "gate 6 (ubuntu-latest)" }],
    },
  };
  const findings = evaluateBranchProtection(configured, "main", REQUIRED);
  assert.equal(findings.length, 1);
  const finding = findings[0];
  assert.ok(finding, "expected one finding");
  assert.match(finding.problem, /gate 6 \(windows-latest\)/);
});

test("evaluateBranchProtection: each policy 16-24 gap is its own finding — admin override, review, stale dismissal, conversation resolution, force push, deletion, linear history, up to date", () => {
  const allBroken = {
    required_status_checks: { strict: false, checks: [] },
    enforce_admins: { enabled: false },
    required_pull_request_reviews: null,
    required_conversation_resolution: { enabled: false },
    allow_force_pushes: { enabled: true },
    allow_deletions: { enabled: true },
    required_linear_history: { enabled: false },
  };
  const findings = evaluateBranchProtection(allBroken, "main", REQUIRED);
  // Every gap fires; the missing-checks gap absorbs "no approval configured"
  // and "no strict mode" as their own separate findings, so this counts by
  // problem substring rather than a fixed length that would silently pass
  // if two gaps' wording ever collided.
  const problems = findings.map((f) => f.problem).join("\n");
  assert.match(problems, /required status check\(s\) not in/);
  assert.match(problems, /up to date with the base/);
  assert.match(problems, /administrators can merge past/);
  assert.match(problems, /does not require an approving review/);
  assert.match(problems, /does not require review conversations/);
  assert.match(problems, /force pushes are allowed/);
  assert.match(problems, /can be deleted/);
  assert.match(problems, /does not require a linear history/);
});

test("evaluateBranchProtection: a required review present but not dismissing stale approvals is its own finding, distinct from 'no review at all'", () => {
  const configured = {
    ...FULL_PROTECTION,
    required_pull_request_reviews: {
      required_approving_review_count: 1,
      dismiss_stale_reviews: false,
    },
  };
  const findings = evaluateBranchProtection(configured, "main", REQUIRED);
  assert.equal(findings.length, 1);
  const finding = findings[0];
  assert.ok(finding, "expected one finding");
  assert.match(finding.problem, /does not dismiss a stale approval/);
  assert.doesNotMatch(finding.problem, /does not require an approving review/);
});

test("checkBranchProtection is a visible skip, naming gh, when gh is not on PATH", async () => {
  const { findings, skips } = await checkBranchProtection({
    have: () => false,
  });
  assert.deepEqual(findings, []);
  assert.equal(skips.length, 1);
  const skip = skips[0];
  assert.ok(skip, "expected one skip");
  assert.match(skip, /gh not on PATH/);
});

test("checkBranchProtection is a visible skip, naming gh, when gh is not authenticated", async () => {
  const { findings, skips } = await checkBranchProtection({
    have: () => true,
    run: () => ({ status: 1 }),
  });
  assert.deepEqual(findings, []);
  assert.equal(skips.length, 1);
  const skip = skips[0];
  assert.ok(skip, "expected one skip");
  assert.match(skip, /not authenticated/);
});

test("checkBranchProtection is a visible skip when origin/HEAD cannot be resolved locally and gh's own default-branch field is also unavailable", async () => {
  const { findings, skips } = await checkBranchProtection({
    have: () => true,
    run: () => ({ status: 0 }), // gh api user, repo view and the default-branch
    // probe all "succeed" with no stdout — the default-branch field genuinely
    // cannot be read, distinct from the recovery case below.
    resolveBase: () => null,
  });
  assert.deepEqual(findings, []);
  assert.equal(skips.length, 1);
  const skip = skips[0];
  assert.ok(skip, "expected one skip");
  assert.match(skip, /origin\/HEAD could not be resolved/);
  assert.match(
    skip,
    /git remote set-head origin -a/,
    "an unset local symref is a fixable local-metadata gap — the skip must name the remedy, not just report an unknown",
  );
});

// Verified on a bootstrapped repository:
// `git symbolic-ref refs/remotes/origin/HEAD` exits 128 (the local symref was
// never set) while `gh api .../branches/main/protection` -> 404 sat right
// behind it, unreached: resolveBase() failing masked a real finding as a
// skip. An unset local symref is fixable in one command
// (`git remote set-head origin -a`), unlike a 403 or a missing remote, which
// this host genuinely cannot resolve — so it must not read the same as
// those. gh's own `default_branch` field (`gh api repos/:owner/:repo`) is
// authoritative and does not depend on any local ref, so it is tried before
// giving up.
test("checkBranchProtection recovers via gh's own default-branch field when origin/HEAD cannot be resolved locally, rather than masking the real finding behind a skip", async () => {
  const { findings, skips } = await checkBranchProtection({
    have: () => true,
    resolveBase: () => null,
    readFile: () =>
      "jobs:\n  gate-6:\n    name: gate 6\n    runs-on: ubuntu-latest\n",
    run: (cmd, args) => {
      if (args[0] === "api" && args[1] === "user") return { status: 0 };
      if (args[0] === "repo") return { status: 0 };
      if (args[0] === "api" && args[1] === "repos/:owner/:repo") {
        return { status: 0, stdout: "main\n" };
      }
      if (
        args[0] === "api" &&
        args[1] !== undefined &&
        /protection$/.test(args[1])
      ) {
        return { status: 1, stderr: "gh: Branch not protected (HTTP 404)" };
      }
      throw new Error(`unexpected gh call: ${args.join(" ")}`);
    },
  });
  assert.deepEqual(
    skips,
    [],
    "recovery must not fall back to a skip once gh's default-branch field resolved the branch",
  );
  assert.equal(findings.length, 1);
  const finding = findings[0];
  assert.ok(finding, "expected one finding");
  assert.equal(finding.path, "main");
  assert.match(finding.problem, /no branch protection configured/);
});

test("checkBranchProtection is a visible skip when gh cannot resolve a GitHub repository (no GitHub remote)", async () => {
  const { findings, skips } = await checkBranchProtection({
    have: () => true,
    resolveBase: () => "origin/main",
    run: (cmd, args) => {
      if (args[0] === "api" && args[1] === "user") return { status: 0 };
      if (args[0] === "repo") return { status: 1 }; // gh repo view fails
      throw new Error(`unexpected gh call: ${args.join(" ")}`);
    },
  });
  assert.deepEqual(findings, []);
  assert.equal(skips.length, 1);
  const skip = skips[0];
  assert.ok(skip, "expected one skip");
  assert.match(skip, /no GitHub remote/);
});

test("checkBranchProtection refuses unconfigured protection (404) end to end, with the derived contexts it would have required", async () => {
  const { findings, skips } = await checkBranchProtection({
    have: () => true,
    resolveBase: () => "origin/main",
    readFile: () =>
      "jobs:\n  gate-6:\n    name: gate 6\n    runs-on: ubuntu-latest\n",
    run: (cmd, args) => {
      if (args[0] === "api" && args[1] === "user") return { status: 0 };
      if (args[0] === "repo") return { status: 0 };
      if (
        args[0] === "api" &&
        args[1] !== undefined &&
        /protection$/.test(args[1])
      ) {
        return { status: 1, stderr: "gh: Branch not protected (HTTP 404)" };
      }
      throw new Error(`unexpected gh call: ${args.join(" ")}`);
    },
  });
  assert.deepEqual(skips, []);
  assert.equal(findings.length, 1);
  const finding = findings[0];
  assert.ok(finding, "expected one finding");
  assert.match(finding.problem, /no branch protection configured/);
});

test("checkBranchProtection is a visible skip, not a finding, when gh cannot read protection at all (403 — no admin token, or GitHub Pro required)", async () => {
  const { findings, skips } = await checkBranchProtection({
    have: () => true,
    resolveBase: () => "origin/main",
    readFile: () =>
      "jobs:\n  gate-6:\n    name: gate 6\n    runs-on: ubuntu-latest\n",
    run: (cmd, args) => {
      if (args[0] === "api" && args[1] === "user") return { status: 0 };
      if (args[0] === "repo") return { status: 0 };
      if (
        args[0] === "api" &&
        args[1] !== undefined &&
        /protection$/.test(args[1])
      ) {
        return {
          status: 1,
          stderr:
            "gh: Upgrade to GitHub Pro or make this repository public to enable this feature. (HTTP 403)",
        };
      }
      throw new Error(`unexpected gh call: ${args.join(" ")}`);
    },
  });
  assert.deepEqual(
    findings,
    [],
    "a token that cannot read branch protection must not be reported as 'unconfigured' — it genuinely does not know",
  );
  assert.equal(skips.length, 1);
  const skip = skips[0];
  assert.ok(skip, "expected one skip");
  assert.match(skip, /could not read branch protection/);
});

test("checkBranchProtection passes when the live protection JSON matches the derived required checks with no gaps", async () => {
  const { findings, skips } = await checkBranchProtection({
    have: () => true,
    resolveBase: () => "origin/main",
    readFile: () =>
      "jobs:\n  gate-6:\n    name: gate 6 (${{ matrix.os }})\n    strategy:\n      matrix:\n        os: [ubuntu-latest]\n    runs-on: ${{ matrix.os }}\n",
    run: (cmd, args) => {
      if (args[0] === "api" && args[1] === "user") return { status: 0 };
      if (args[0] === "repo") return { status: 0 };
      if (
        args[0] === "api" &&
        args[1] !== undefined &&
        /protection$/.test(args[1])
      ) {
        return { status: 0, stdout: JSON.stringify(FULL_PROTECTION) };
      }
      throw new Error(`unexpected gh call: ${args.join(" ")}`);
    },
  });
  assert.deepEqual(skips, []);
  assert.deepEqual(findings, []);
});

// scripts/configure-branch-protection.mjs has no injectable seam — it is a
// top-level action script — so the one path that needs no gh at all is
// proven end to end instead, in a scratch repository whose origin/HEAD is
// missing the way a shallow or partial clone leaves it.
test("configure-branch-protection: an unresolvable origin/HEAD is a visible skip naming the remedy, never a failure and never a guessed branch", () => {
  const dir = scratchRepo();
  git(dir, ["symbolic-ref", "-d", "refs/remotes/origin/HEAD"]);

  const r = runScript("scripts/configure-branch-protection.mjs", dir);
  assert.equal(
    r.status,
    0,
    `expected a skip, got status ${r.status}: ${r.stderr}`,
  );
  assert.match(r.stderr, /SKIP/);
  assert.match(r.stderr, /origin\/HEAD could not be resolved/);
  assert.match(r.stderr, /git remote set-head origin -a/);
  assert.doesNotMatch(
    r.stderr,
    /applying to/,
    "nothing may be applied to a branch name nobody derived",
  );
});
