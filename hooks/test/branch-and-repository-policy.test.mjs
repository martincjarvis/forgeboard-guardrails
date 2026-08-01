// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis Uncited uncited
// Split from hooks.test.mjs — subject group: branch-and-repository-policy.
// Loaded by hooks/test/hooks.test.mjs; not invoked directly by the test runner.
import { test } from "node:test";
import {
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { checkSuppressions } from "../../scripts/check-suppressions.mjs";
import { checkBranchBehindBase } from "../../scripts/check-branch-behind-base.mjs";
import {
  deriveRequiredContexts,
  evaluateBranchProtection,
  checkBranchProtection,
} from "../../scripts/check-branch-protection.mjs";
import {
  evaluateRepositoryFeatures,
  checkRepositoryFeatures,
} from "../../scripts/check-repository-features.mjs";
import { checkScriptWiring } from "../../scripts/check-script-wiring.mjs";
import assert from "node:assert/strict";
import { ROOT, git, scratchRepo, runScript, NOSEMGREP } from "./support.mjs";

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

// --- scripts/check-repository-features.mjs. "Every
// check the platform already provides is enabled rather than rebuilt"
// (cross-gate-rules.md) was unactionable until this enumerated which
// features that meant and how to tell "off" from "not offered on this
// plan." evaluateRepositoryFeatures is pure and tested directly, the same
// split evaluateBranchProtection uses above; checkRepositoryFeatures is
// tested through its injectable have/run for the skip paths only — the
// live gh orchestration mirrors checkBranchProtection's own, already
// proven there.

test("evaluateRepositoryFeatures: Dependabot alerts and security updates off is a finding on every visibility — they are free everywhere", () => {
  const { findings, skips } = evaluateRepositoryFeatures({
    visibility: "private",
    dependabotAlerts: "disabled",
    dependabotSecurityUpdates: "disabled",
  });
  const problems = findings.map((f) => f.check);
  assert.ok(problems.includes("Dependabot alerts"));
  assert.ok(problems.includes("Dependabot security updates"));
  assert.deepEqual(
    skips.filter((s) => /^Dependabot/.test(s)),
    [],
  );
});

test("evaluateRepositoryFeatures: dependency graph and code coverage are always reported as informational skips, never a finding — no toggle exists for either", () => {
  const { findings, skips } = evaluateRepositoryFeatures({});
  assert.deepEqual(findings, []);
  assert.ok(skips.some((s) => /dependency graph/.test(s)));
  assert.ok(skips.some((s) => /code coverage \(Code Quality\)/.test(s)));
});

test("evaluateRepositoryFeatures: secret scanning disabled on a public repository is a finding — it is free on every plan there", () => {
  const { findings, skips } = evaluateRepositoryFeatures({
    visibility: "public",
    secretScanning: "disabled",
  });
  assert.equal(findings.length, 1);
  const finding = findings[0];
  assert.ok(finding, "expected one finding");
  assert.equal(finding.check, "secret scanning");
  assert.match(finding.problem, /public repository/);
  assert.deepEqual(
    skips.filter((s) => /^secret scanning/.test(s)),
    [],
  );
});

test("evaluateRepositoryFeatures: secret scanning disabled on a private repository is a skip, not a finding — a read-only probe cannot tell 'off' from 'not purchasable on this plan'", () => {
  const { findings, skips } = evaluateRepositoryFeatures({
    visibility: "private",
    secretScanning: "disabled",
  });
  assert.deepEqual(
    findings,
    [],
    "a private repository on a plan without GitHub Secret Protection must never carry a permanent, unfixable finding for this",
  );
  const line = skips.find((s) => /^secret scanning/.test(s));
  assert.ok(line);
  assert.match(line, /does not distinguish/);
});

test("evaluateRepositoryFeatures: push protection follows the same public/private split as secret scanning, independently of it", () => {
  const publicCase = evaluateRepositoryFeatures({
    visibility: "public",
    pushProtection: "disabled",
  });
  assert.equal(publicCase.findings.length, 1);
  const publicFinding = publicCase.findings[0];
  assert.ok(publicFinding, "expected a public-case finding");
  assert.equal(publicFinding.check, "push protection");

  const privateCase = evaluateRepositoryFeatures({
    visibility: "private",
    pushProtection: "disabled",
  });
  assert.deepEqual(privateCase.findings, []);
});

test("evaluateRepositoryFeatures: code scanning 'disabled' (its own endpoint read successfully) is a finding on any visibility — the endpoint itself already proved it is available here", () => {
  const publicCase = evaluateRepositoryFeatures({
    visibility: "public",
    codeScanning: "disabled",
  });
  const privateCase = evaluateRepositoryFeatures({
    visibility: "private",
    codeScanning: "disabled",
  });
  assert.equal(publicCase.findings.length, 1);
  assert.equal(privateCase.findings.length, 1);
  const publicFinding = publicCase.findings[0];
  assert.ok(publicFinding, "expected a public-case finding");
  assert.equal(publicFinding.check, "code scanning");
});

test("evaluateRepositoryFeatures: code scanning reported unavailable (its own endpoint failed) is a skip naming the platform's own message, never a finding", () => {
  const { findings, skips } = evaluateRepositoryFeatures({
    visibility: "private",
    codeScanning: {
      unavailable:
        "Code scanning is not enabled for this repository. Please enable code scanning in the repository settings.",
    },
  });
  assert.deepEqual(findings, []);
  const line = skips.find((s) => /^code scanning/.test(s));
  assert.ok(line, "a skip line naming code scanning is present");
  assert.match(line, /Code scanning is not enabled for this repository/);
});

test("evaluateRepositoryFeatures: an unreadable status is a skip, never silently read as either enabled or disabled", () => {
  const { findings, skips } = evaluateRepositoryFeatures({
    visibility: "public",
    dependabotAlerts: null,
    dependabotSecurityUpdates: null,
  });
  assert.deepEqual(findings, []);
  assert.ok(skips.some((s) => /Dependabot alerts.*could not read/.test(s)));
  assert.ok(
    skips.some((s) => /Dependabot security updates.*could not read/.test(s)),
  );
});

test("checkRepositoryFeatures is a visible skip, naming gh, when gh is not on PATH", async () => {
  const { findings, skips } = await checkRepositoryFeatures({
    have: () => false,
  });
  assert.deepEqual(findings, []);
  assert.equal(skips.length, 1);
  const skip = skips[0];
  assert.ok(skip, "expected one skip");
  assert.match(skip, /gh not on PATH/);
});

test("checkRepositoryFeatures is a visible skip, naming gh, when gh is not authenticated", async () => {
  const { findings, skips } = await checkRepositoryFeatures({
    have: () => true,
    run: () => ({ status: 1 }),
  });
  assert.deepEqual(findings, []);
  assert.equal(skips.length, 1);
  const skip = skips[0];
  assert.ok(skip, "expected one skip");
  assert.match(skip, /not authenticated/);
});

test("checkRepositoryFeatures is a visible skip when gh cannot resolve a GitHub repository (no GitHub remote)", async () => {
  const { findings, skips } = await checkRepositoryFeatures({
    have: () => true,
    run: (cmd, args) => {
      if (args[0] === "api" && args[1] === "user") return { status: 0 };
      if (args[0] === "api" && args[1] === "repos/:owner/:repo") {
        return { status: 1, stderr: "gh: Not Found (HTTP 404)" };
      }
      throw new Error(`unexpected gh call: ${args.join(" ")}`);
    },
  });
  assert.deepEqual(findings, []);
  assert.equal(skips.length, 1);
  const skip = skips[0];
  assert.ok(skip, "expected one skip");
  assert.match(skip, /no GitHub remote/);
});

test("checkRepositoryFeatures reads a live private repository end to end: Dependabot alerts on, everything else read as an ambiguous skip", async () => {
  const { findings, skips } = await checkRepositoryFeatures({
    have: () => true,
    run: (cmd, args) => {
      if (args[0] === "api" && args[1] === "user") return { status: 0 };
      if (args[0] === "api" && args[1] === "repos/:owner/:repo") {
        return {
          status: 0,
          stdout: JSON.stringify({
            visibility: "private",
            security_and_analysis: {
              secret_scanning: { status: "disabled" },
              secret_scanning_push_protection: { status: "disabled" },
            },
          }),
        };
      }
      if (args[1] === "repos/:owner/:repo/vulnerability-alerts") {
        return { status: 0 }; // 204 — enabled
      }
      if (args[1] === "repos/:owner/:repo/automated-security-fixes") {
        return { status: 0, stdout: JSON.stringify({ enabled: true }) };
      }
      if (args[1] === "repos/:owner/:repo/code-scanning/default-setup") {
        return {
          status: 1,
          stderr:
            "gh: Code scanning is not enabled for this repository. Please enable code scanning in the repository settings. (HTTP 403)",
        };
      }
      throw new Error(`unexpected gh call: ${args.join(" ")}`);
    },
  });
  assert.deepEqual(
    findings,
    [],
    "a private repository with no Advanced Security purchase must read clean, not carry permanent findings for features it cannot enable",
  );
  assert.ok(skips.some((s) => /Dependabot alerts — enabled/.test(s)));
  assert.ok(skips.some((s) => /Dependabot security updates — enabled/.test(s)));
  assert.ok(
    skips.some((s) => /^secret scanning.*does not distinguish/.test(s)),
  );
  assert.ok(
    skips.some((s) =>
      /^code scanning — unavailable.*not enabled for this repository/.test(s),
    ),
  );
});

test("regression guard: gate 7 reports, rather than crashes, when package.json is absent", () => {
  // A follow-up — caught by running `npm run gate:7` before declaring
  // the fix cycle done. The quality-script wiring
  // audit read package.json unconditionally; check-refusal-proofs.mjs's own
  // semgrep fixture builds a scratch repository with no package.json (it
  // exists only to isolate the semgrep step), so gate 7 threw before it
  // ever reached semgrep — the refusal-proof audit reported the semgrep
  // check as "does not refuse" for a reason that had nothing to do with
  // semgrep. .gitattributes is created here for the same reason the real
  // fixture creates one: gate 7's workspace-capability check already reads
  // it unconditionally, and this test is about the package.json read, not
  // that pre-existing one.
  const dir = scratchRepo();
  writeFileSync(join(dir, ".gitattributes"), "* text=auto eol=lf\n");
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/gate-7-on-demand.mjs", dir);
  assert.equal(
    r.status,
    0,
    "gate 7 reports and never blocks — it must not exit non-zero, let alone crash",
  );
  assert.match(
    r.stderr,
    /quality-script wiring.*package\.json missing or unparseable/,
  );
});

test("regression guard: hooks/lib/run.mjs's spawn-shell-true and detect-child-process findings carry a suppression marker, and each is registered", () => {
  // `semgrep --config auto --error hooks/lib/run.mjs` found three
  // live, unsuppressed findings (one spawn-shell-true, two
  // detect-child-process) with no inline suppression marker and no register
  // row. Closed by registering, not by rewriting the code to dodge the
  // pattern: spawn-shell-true is a genuine OS constraint on Windows,
  // verified directly — even a fully resolved .cmd path still returns
  // EINVAL without a shell, and detect-child-process is inherent to being a
  // generic process-spawning helper.
  //
  // Asserting only "no unregistered marker finding" would pass just as well
  // on the original, unfixed file — it has no marker at all, so there is
  // nothing for checkSuppressions to call unregistered. This first checks
  // the markers actually exist, then that each is registered — the real
  // gate 2 check, not a re-implementation of it, over the real staged file.
  // NOSEMGREP is built by concatenation (declared above): a literal marker
  // string here would flag this test file's own source, the same reason
  // ESLINT_DISABLE and SECRETLINT_DISABLE above it are built the same way.
  const content = readFileSync(join(ROOT, "hooks", "lib", "run.mjs"), "utf8");
  assert.match(
    content,
    new RegExp(`${NOSEMGREP}:.*spawn-shell-true`),
    "the spawn-shell-true finding has no suppression marker",
  );
  assert.match(
    content,
    new RegExp(`${NOSEMGREP}:.*detect-child-process`),
    "the detect-child-process finding has no suppression marker",
  );
  const findings = checkSuppressions(["hooks/lib/run.mjs"]);
  assert.deepEqual(findings, []);
});

test("regression guard: hooks/ carries a README.md indexing every file in it and in hooks/lib", () => {
  // file-classes.md: "The directory carries a README.md indexing
  // every script — what it is for, and why it exists." scripts/ has one;
  // hooks/ did not, in this toolkit or in anything bootstrapped from it. A
  // README that exists but silently falls behind a new hook is the same gap
  // by a slower route, so this checks every current file is actually named
  // in it rather than only that the file exists.
  const readmePath = join(ROOT, "hooks", "README.md");
  assert.ok(existsSync(readmePath), "hooks/README.md is missing");
  const readme = readFileSync(readmePath, "utf8");
  const hooksDir = join(ROOT, "hooks");
  const topLevel = readdirSync(hooksDir).filter((f) => f.endsWith(".mjs"));
  const libFiles = readdirSync(join(hooksDir, "lib")).filter((f) =>
    f.endsWith(".mjs"),
  );
  assert.ok(topLevel.length > 0 && libFiles.length > 0);
  for (const file of [...topLevel, ...libFiles]) {
    assert.match(
      readme,
      new RegExp(file.replace(/\./g, "\\.")),
      `hooks/README.md does not mention ${file}`,
    );
  }
});

test("regression guard: every GitHub Actions `uses:` in every workflow is pinned to a commit SHA, not a mutable tag", () => {
  // semgrep's github-actions-mutable-action-tag rule found exactly
  // this: a workflow written with `uses: actions/checkout@v4` — a tag GitHub
  // itself, or a compromised action's own maintainer, can move to point at
  // different code without this file ever changing. A pinned commit SHA is
  // immutable; a version tag is not.
  const workflowsDir = join(ROOT, ".github", "workflows");
  const files = readdirSync(workflowsDir).filter((f) => f.endsWith(".yml"));
  assert.ok(files.length > 0, "expected at least one workflow file to check");
  const usesRe = /uses:\s*([^\s#]+)@([^\s#]+)/g;
  let checked = 0;
  for (const file of files) {
    const content = readFileSync(join(workflowsDir, file), "utf8");
    for (const [, action, ref] of content.matchAll(usesRe)) {
      assert.ok(ref, "expected a ref");
      checked += 1;
      assert.match(
        ref,
        /^[0-9a-f]{40}$/,
        `${file}: "${action}@${ref}" is not pinned to a 40-character commit SHA`,
      );
    }
  }
  assert.ok(
    checked > 0,
    "expected at least one `uses:` line across the workflows",
  );
});

test("quality-script wiring: every script in this repository's own package.json is accounted for — wired or declared on-demand, nothing unwired", () => {
  // Runs against the real manifest and the real gate/hook source, not
  // a fixture — the whole point is that THIS repository's own scripts are
  // fully accounted for right now. `spell` is wired here specifically
  // because cspell was extended to the code glob; before that this
  // same assertion would have put `spell` in `unwired`.
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  /** @param {string} file */
  const readFile = (file) => readFileSync(join(ROOT, file), "utf8");
  const { wired, onDemand, unwired } = checkScriptWiring(pkg.scripts, readFile);
  assert.deepEqual(unwired, []);
  assert.ok(wired.includes("lint"));
  assert.ok(wired.includes("spell"));
  assert.ok(onDemand.includes("gate:7"));
  // Every script in the manifest lands in exactly one bucket — none silently
  // dropped.
  assert.equal(wired.length + onDemand.length, Object.keys(pkg.scripts).length);
});

test("quality-script wiring: a script with no gate wiring and no on-demand declaration is reported unwired, naming it", () => {
  // A synthetic manifest entry standing in for the exact defect this
  // closes: a script added to package.json that nothing invokes and nobody
  // declared on-demand. checkScriptWiring must not silently pass it.
  const { wired, onDemand, unwired } = checkScriptWiring({
    typecheck: "tsc --noEmit --strict",
  });
  assert.deepEqual(wired, []);
  assert.deepEqual(onDemand, []);
  assert.equal(unwired.length, 1);
  const entry = unwired[0];
  assert.ok(entry, "expected an unwired entry");
  assert.match(entry, /typecheck/);
  assert.match(entry, /no gate.*invokes it/);
});

test("quality-script wiring: a WIRING claim that no longer matches the file's actual content is reported unwired, not trusted blind", () => {
  // Self-verification, not a hardcoded assertion: if `lint`'s declared
  // evidence (the eslint invocation in pre-commit.mjs) drifts away — the
  // flag is renamed, the call is removed — this must catch that rather than
  // keep reporting `lint` as wired forever because a table once said so.
  const { wired, unwired } = checkScriptWiring(
    { lint: "eslint --max-warnings 0 hooks scripts" },
    () => "this file no longer invokes eslint at all",
  );
  assert.deepEqual(wired, []);
  assert.equal(unwired.length, 1);
  const entry = unwired[0];
  assert.ok(entry, "expected an unwired entry");
  assert.match(entry, /lint/);
  assert.match(entry, /drifted/);
});
