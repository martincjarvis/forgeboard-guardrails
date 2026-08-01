// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis Uncited uncited
// Split from hooks.test.mjs (fix 79) — subject group: links-and-suppressions.
// Loaded by hooks/test/hooks.test.mjs; not invoked directly by the test runner.
import { test } from "node:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  checkSuppressions,
  evaluateRegisterRows,
  pendingSuppressionApprovals,
  unapprovedSuppressionFindings,
} from "../../scripts/check-suppressions.mjs";
import { slugify, anchorsOf } from "../../scripts/check-links.mjs";
import assert from "node:assert/strict";
import {
  git,
  scratchRepo,
  runScript,
  REGISTER_HEADER,
  ESLINT_DISABLE,
  NOSEMGREP,
  SECRETLINT_DISABLE,
} from "./support.mjs";

// --- scripts/check-links.mjs — resolveTarget's branches (link/anchor
// integrity, docs/standards/guardrails/gate-2-commit.md check 17). No test
// covered this module at all before refactoring resolveTarget below CCN 15,
// so these are added first, exercising it through the public checkLinks/CLI
// surface rather than the unexported helper itself.

test("link check: a link to a file that exists passes; one to nothing is refused", () => {
  const dir = scratchRepo();
  writeFileSync(join(dir, "target.md"), "# Target\n");
  writeFileSync(
    join(dir, "source.md"),
    "[ok](target.md) and [broken](nope.md)\n",
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-links.mjs", dir, ["source.md"]);
  assert.equal(r.status, 2, "one of the two links is broken");
  assert.match(r.stderr, /links to nothing: nope\.md/);
  assert.doesNotMatch(r.stderr, /links to nothing: target\.md/);
  rmSync(dir, { recursive: true, force: true });
});

test("link check: an anchor that exists in the target passes; one that does not is refused", () => {
  const dir = scratchRepo();
  writeFileSync(join(dir, "target.md"), "# Target\n\n## Real Heading\n");
  writeFileSync(
    join(dir, "source.md"),
    "[good](target.md#real-heading) and [bad](target.md#missing-heading)\n",
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-links.mjs", dir, ["source.md"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /anchor does not exist: #missing-heading/);
  assert.doesNotMatch(r.stderr, /anchor does not exist: #real-heading/);
  rmSync(dir, { recursive: true, force: true });
});

test("link check: an anchor-only link resolves against its own file", () => {
  const dir = scratchRepo();
  writeFileSync(
    join(dir, "source.md"),
    "# Source\n\n## A Section\n\n[jump](#a-section) and [missing](#nowhere)\n",
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-links.mjs", dir, ["source.md"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /anchor does not exist: #nowhere/);
  assert.doesNotMatch(r.stderr, /anchor does not exist: #a-section/);
  rmSync(dir, { recursive: true, force: true });
});

test("link check: a bare directory link resolves via its README, and a query string is stripped before resolving", () => {
  const dir = scratchRepo();
  mkdirSync(join(dir, "sub"), { recursive: true });
  writeFileSync(join(dir, "sub", "README.md"), "# Sub\n");
  writeFileSync(
    join(dir, "source.md"),
    "[dir](sub) and [q](sub/README.md?x=1)\n",
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-links.mjs", dir, ["source.md"]);
  assert.equal(
    r.status,
    0,
    "GitHub's directory-to-README resolution and query stripping both pass",
  );
  rmSync(dir, { recursive: true, force: true });
});

// --- scripts/check-suppressions.mjs — checkSuppressions's branches (gate 2
// check 15, docs/standards/guardrails/registers.md). No test covered this
// module at all before refactoring checkSuppressions below CCN 15, so these
// are added first.
test("suppression check: a registered marker passes; an unregistered one is refused", () => {
  const dir = scratchRepo();
  mkdirSync(join(dir, "docs", "registers"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "registers", "suppression-register.md"),
    REGISTER_HEADER +
      "| no-console | ok.mjs | needed for the CLI banner | drop once the banner is removed | Someone |\n",
  );
  writeFileSync(
    join(dir, "ok.mjs"),
    `// ${ESLINT_DISABLE}-next-line no-console\nconsole.log('hi');\n`,
  );
  writeFileSync(
    join(dir, "bad.mjs"),
    `// ${ESLINT_DISABLE}-next-line no-console\nconsole.log('hi');\n`,
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-suppressions.mjs", dir, [
    "ok.mjs",
    "bad.mjs",
  ]);
  assert.equal(r.status, 2, "bad.mjs's suppression has no register row");
  assert.match(r.stderr, /bad\.mjs:1/);
  assert.match(r.stderr, /has no register row/);
  assert.doesNotMatch(r.stderr, /ok\.mjs/, "ok.mjs's row covers it");
  rmSync(dir, { recursive: true, force: true });
});

test("fix 33: a marker naming two rules checks each independently — a registered one passes, an unregistered one is refused by name", () => {
  // bypass-and-exceptions.md, restated by fix 36: multiple rules on one line
  // are legal (two analysers, or one rule firing twice); what is forbidden
  // is a marker naming NO rule. The old behaviour — refusing the whole
  // marker as "broadened" the moment it named more than one rule — is
  // exactly the count-based misreading fix 36 corrects.
  const dir = scratchRepo();
  mkdirSync(join(dir, "docs", "registers"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "registers", "suppression-register.md"),
    REGISTER_HEADER +
      "| rule-a | two.mjs | needed here | drop once rule-a is fixed | Someone |\n",
  );
  writeFileSync(
    join(dir, "two.mjs"),
    `// ${ESLINT_DISABLE}-next-line rule-a, rule-b\n`,
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-suppressions.mjs", dir, ["two.mjs"]);
  assert.equal(r.status, 2, "rule-b has no register row");
  assert.match(r.stderr, /two\.mjs:1/);
  assert.match(r.stderr, /`rule-b` has no register row/);
  assert.doesNotMatch(
    r.stderr,
    /`rule-a` has no register row/,
    "rule-a's row covers it",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("fix 36: an unregistered rule at a multi-rule site names the count in the finding, so a reviewer sees the escalation without counting rows", () => {
  const dir = scratchRepo();
  writeFileSync(
    join(dir, "two.mjs"),
    `// ${ESLINT_DISABLE}-next-line rule-a, rule-b\n`,
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-suppressions.mjs", dir, ["two.mjs"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /\(2 rules suppressed at this site\)/);
  rmSync(dir, { recursive: true, force: true });
});

test("fix 33: a marker naming no rule at all is refused as a blanket suppression", () => {
  const dir = scratchRepo();
  writeFileSync(join(dir, "blanket.mjs"), `// ${ESLINT_DISABLE}-next-line\n`);
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-suppressions.mjs", dir, ["blanket.mjs"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /names no rule/);
  rmSync(dir, { recursive: true, force: true });
});

test("fix 33: hooks/lib/run.mjs's real two-rule no-semgrep-style marker — both rules are extracted and independently matched; removing one row is refused naming that rule", () => {
  // Reproduces the live defect named in fix brief 7: the old regex, matching
  // the "no" + "semgrep" directive followed by `(?::\s*([A-Za-z0-9._-]+))?`,
  // has no comma in its character class, so on a comma-separated marker it
  // silently stops capturing at the
  // first rule and never sees the second — the second rule then passes with
  // no register row ever being checked for it, not merely "trusted": a
  // finding is never even considered. This constructs the exact line shape
  // from hooks/lib/run.mjs:48 with only the FIRST rule registered, so a
  // fixed parser must refuse the commit naming the second rule by name; the
  // broken regex would have reported zero findings here.
  const dir = scratchRepo();
  mkdirSync(join(dir, "docs", "registers"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "registers", "suppression-register.md"),
    REGISTER_HEADER +
      "| javascript.lang.security.audit.spawn-shell-true.spawn-shell-true | run.mjs | Windows .cmd shim needs a shell | Node ships a shell-free way to run .cmd | Someone |\n",
  );
  writeFileSync(
    join(dir, "run.mjs"),
    `// ${NOSEMGREP}: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true,javascript.lang.security.detect-child-process.detect-child-process\n`,
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-suppressions.mjs", dir, ["run.mjs"]);
  assert.equal(
    r.status,
    2,
    "detect-child-process has no register row and must be refused, not silently skipped",
  );
  assert.match(
    r.stderr,
    /`javascript\.lang\.security\.detect-child-process\.detect-child-process` has no register row/,
  );
  assert.doesNotMatch(
    r.stderr,
    /spawn-shell-true` has no register row/,
    "spawn-shell-true's row covers it",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("fix 34: a register row with a blank justification or removal condition blocks, even though the marker-to-row lookup by code+scope succeeds", () => {
  const dir = scratchRepo();
  mkdirSync(join(dir, "docs", "registers"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "registers", "suppression-register.md"),
    REGISTER_HEADER + "| no-console | ok.mjs |  |  |  |\n",
  );
  writeFileSync(
    join(dir, "ok.mjs"),
    `// ${ESLINT_DISABLE}-next-line no-console\nconsole.log('hi');\n`,
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-suppressions.mjs", dir, ["ok.mjs"]);
  assert.equal(
    r.status,
    2,
    "the row satisfies the code+scope lookup but is otherwise empty",
  );
  assert.match(r.stderr, /Justification/);
  assert.match(r.stderr, /Removable when/);
  rmSync(dir, { recursive: true, force: true });
});

test("fix 34: an approver that reads as a team label, not a person, blocks — sharing check-adr-approver.mjs's judgement", () => {
  const dir = scratchRepo();
  mkdirSync(join(dir, "docs", "registers"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "registers", "suppression-register.md"),
    REGISTER_HEADER +
      "| no-console | ok.mjs | needed for the CLI banner | drop once the banner is removed | the maintainers |\n",
  );
  writeFileSync(
    join(dir, "ok.mjs"),
    `// ${ESLINT_DISABLE}-next-line no-console\nconsole.log('hi');\n`,
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-suppressions.mjs", dir, ["ok.mjs"]);
  assert.equal(
    r.status,
    2,
    "a team label is not a human approver, whether written by a person or an agent",
  );
  assert.match(r.stderr, /team label, not a person/);
  rmSync(dir, { recursive: true, force: true });
});

// --- fix 34/35 — evaluateRegisterRows / pendingSuppressionApprovals /
// unapprovedSuppressionFindings: the pure classification, tested directly
// against constructed rows the same way check-licence-policy.mjs's
// evaluateRegisterRow is (no register file on disk needed).

test("evaluateRegisterRows: a blank approver alone is a pending approval, not a block, once every other column is complete", () => {
  const rows = [
    {
      code: "no-console",
      scope: "ok.mjs",
      justification: "needed for the CLI banner",
      removalCondition: "drop once the banner is removed",
      approver: "",
    },
  ];
  const { blocking, pendingApproval } = evaluateRegisterRows(rows);
  assert.deepEqual(blocking, []);
  assert.equal(pendingApproval.length, 1);
  assert.equal(pendingApproval[0].code, "no-console");
});

test("evaluateRegisterRows: a missing justification and a 'never' removal condition each block outright, even with a named approver", () => {
  const rows = [
    {
      code: "a",
      scope: "x.mjs",
      justification: "",
      removalCondition: "someday",
      approver: "Pat",
    },
    {
      code: "b",
      scope: "y.mjs",
      justification: "needed",
      removalCondition: "never",
      approver: "Pat",
    },
  ];
  const { blocking, pendingApproval } = evaluateRegisterRows(rows);
  assert.equal(blocking.length, 2);
  assert.match(blocking[0].problem, /Justification/);
  assert.match(blocking[1].problem, /never/);
  assert.deepEqual(pendingApproval, []);
});

test("pendingSuppressionApprovals / unapprovedSuppressionFindings: gate 2's push-back data and gate 6's block finding read the same pending rows, shaped differently — not one check behind a mode flag", () => {
  const rows = [
    {
      code: "no-console",
      scope: "ok.mjs",
      justification: "needed",
      removalCondition: "someday",
      approver: "",
    },
  ];
  const pending = pendingSuppressionApprovals(rows);
  assert.equal(pending.length, 1, "gate 2 sees the row as pending approval");
  const blocked = unapprovedSuppressionFindings(rows);
  assert.equal(blocked.length, 1, "gate 6 turns the same row into a finding");
  assert.equal(blocked[0].check, "suppression register — approver");
  assert.match(blocked[0].problem, /no-console.*no approver/);
});

test("fix 35: gate 2 (pre-commit.mjs) allows a commit whose suppression register row is complete except for the approver — a push back, not a block", () => {
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  // Sidesteps an unrelated environment issue: an `npx --no-install
  // secretlint` resolved from a stray global npx cache (rather than this
  // scratch repo's own, nonexistent, node_modules) fails to load its rule
  // plugins with no local config present — the same fixture the existing
  // "gate 2 wires a lint check independently of the build" test above uses.
  writeFileSync(
    join(dir, ".secretlintrc.json"),
    JSON.stringify({ rules: [] }) + "\n",
  );
  mkdirSync(join(dir, "docs", "registers"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "registers", "suppression-register.md"),
    REGISTER_HEADER +
      "| no-console | ok.mjs | needed for the CLI banner | drop once the banner is removed |  |\n",
  );
  writeFileSync(
    join(dir, "ok.mjs"),
    `// ${ESLINT_DISABLE}-next-line no-console\nconsole.log('hi');\n`,
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/pre-commit.mjs", dir);
  assert.equal(
    r.status,
    0,
    "a blank approver alone must not block the commit at gate 2 — that is gate 6's job",
  );
  assert.match(r.stderr, /PUSH BACK/);
  assert.match(r.stderr, /no-console/);
  rmSync(dir, { recursive: true, force: true });
});

test("suppression check: a non-production, non-test file is not scanned", () => {
  const dir = scratchRepo();
  writeFileSync(
    join(dir, ".gitattributes"),
    "*.md guardrail-class=documentation\n",
  );
  writeFileSync(
    join(dir, "notes.md"),
    `Mentions ${ESLINT_DISABLE} no-console in prose, not code.\n`,
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-suppressions.mjs", dir, ["notes.md"]);
  assert.equal(r.status, 0, "documentation is not a scanned class");
  rmSync(dir, { recursive: true, force: true });
});

test("suppression check: the register file itself is never scanned as a suppression", () => {
  const dir = scratchRepo();
  mkdirSync(join(dir, "docs", "registers"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "registers", "suppression-register.md"),
    REGISTER_HEADER +
      `What belongs here: ${ESLINT_DISABLE}, ${NOSEMGREP}, ${SECRETLINT_DISABLE}.\n`,
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-suppressions.mjs", dir, [
    "docs/registers/suppression-register.md",
  ]);
  assert.equal(
    r.status,
    0,
    "the register naming marker syntax in its own prose is not itself a suppression",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("suppression check excludes its own source from the scan", () => {
  // Run against the real repository (this test process's own cwd), because
  // self-exclusion compares against THIS module's own real path — a scratch
  // copy would not be the file the check is guarding against. Without the
  // guard, check-suppressions.mjs would flag itself: MARKERS' own regex
  // literals contain each marker's name as literal source text (the same
  // reason the constants above are built by concatenation, not written
  // directly).
  const findings = checkSuppressions(["scripts/check-suppressions.mjs"]);
  assert.deepEqual(findings, []);
});

// Every gate in this corpus is titled `Gate N — Name`, so the em-dash slug is
// the common case rather than a corner one.
test("slugify: a heading with an em dash keeps both hyphens, as GitHub does", () => {
  assert.equal(
    slugify("Fix it, restructure it, or suppress it — in that order"),
    "fix-it-restructure-it-or-suppress-it--in-that-order",
  );
  assert.equal(
    slugify("Gate 2 — Commit"),
    "gate-2--commit",
    "the corpus titles every gate this way, so this is not a corner case",
  );
  assert.equal(
    slugify("Ordinary heading with no punctuation"),
    "ordinary-heading-with-no-punctuation",
    "the common case is unchanged",
  );
});

test("anchorsOf: exposes the double-hyphen anchor a link to an em-dash heading needs", () => {
  const anchors = anchorsOf("## Gate 2 — Commit\n\ntext\n");
  assert.ok(
    anchors.has("gate-2--commit"),
    `expected gate-2--commit, got ${[...anchors].join(", ")}`,
  );
});
