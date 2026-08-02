// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis Uncited uncited unpushed Unpushed
// Split from hooks.test.mjs — subject group: change-size-override-register.
// Loaded by hooks/test/hooks.test.mjs; not invoked directly by the test runner.
import { test } from "node:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  usesOverrideMarker,
  approvedOverrideRowsForBranch,
  findChangeSizeOverrideFindings,
  checkChangeSizeOverride,
  checkChangeSizeOverrideMessage,
  REGISTER_PATH as CHANGE_SIZE_OVERRIDE_REGISTER_PATH,
} from "../../scripts/check-change-size-override.mjs";
import assert from "node:assert/strict";
import { git, scratchRepo, runScript, lines } from "./support.mjs";

// --- gate-4-task-completion.mjs's own OVERRIDE check only ever asked
// whether the [large-pr] string appears anywhere in the branch's
// commit log — satisfied by any author, with no reason and no approver, and
// unaffected by which commit carries it. check-change-size-override.mjs is
// the server-side check that makes the override answerable only by a human:
// the marker must be backed by an approved row in the change-size override
// register, identified by branch. These tests exercise that module's pure
// functions directly, plus one real, end-to-end reproduction of
// the demonstrated shape below.

test("usesOverrideMarker is true only when the marker string is present", () => {
  assert.equal(usesOverrideMarker("chore: accepted [large-pr]\n"), true);
  assert.equal(usesOverrideMarker("chore: a normal commit\n"), false);
  assert.equal(usesOverrideMarker(""), false);
  assert.equal(usesOverrideMarker(undefined), false);
});

test("findChangeSizeOverrideFindings reports nothing when the branch never used the marker", () => {
  // No marker, no register row anywhere — a completely ordinary branch must
  // not be asked about a register it never touched.
  assert.deepEqual(
    findChangeSizeOverrideFindings({
      logText: "chore: a normal commit\n",
      registerText: "",
      branch: "feature/ordinary",
    }),
    [],
  );
});

test("findChangeSizeOverrideFindings blocks a marker with no register row at all — the demonstrated case", () => {
  // The exact shape found: [large-pr] present, in a commit distinct
  // from the oversized diff (that distinction is not modelled here — it does
  // not matter to this check, which is the point: "which commit" was never
  // the missing property). No row exists anywhere for this branch.
  const findings = findChangeSizeOverrideFindings({
    logText: "chore: bootstrap\n\nchore: accepted [large-pr]\n",
    registerText: "",
    branch: "feature/bootstrap",
  });
  assert.equal(findings.length, 1);
  const finding = findings[0];
  assert.ok(finding, "expected one finding");
  assert.match(finding.problem, /no.*row for branch 'feature\/bootstrap'/);
  assert.equal(finding.path, CHANGE_SIZE_OVERRIDE_REGISTER_PATH);
});

test("findChangeSizeOverrideFindings blocks a row with a blank approver — not yet a resolved decision", () => {
  const registerText = [
    "| Branch | Counted lines | Composition | Justification | Removable when | Approved by |",
    "| --- | --- | --- | --- | --- | --- |",
    "| feature/bootstrap | 14959 | ported tooling | needed for parity |  split next time | |",
  ].join("\n");
  const findings = findChangeSizeOverrideFindings({
    logText: "chore: accepted [large-pr]\n",
    registerText,
    branch: "feature/bootstrap",
  });
  assert.equal(
    findings.length,
    1,
    "a row missing only its approver is not a resolved override",
  );
});

test("findChangeSizeOverrideFindings blocks an approver that reads as a team label, not a person", () => {
  const registerText = [
    "| Branch | Counted lines | Composition | Justification | Removable when | Approved by |",
    "| --- | --- | --- | --- | --- | --- |",
    "| feature/bootstrap | 14959 | ported tooling | needed for parity | split next time | Platform team |",
  ].join("\n");
  const findings = findChangeSizeOverrideFindings({
    logText: "chore: accepted [large-pr]\n",
    registerText,
    branch: "feature/bootstrap",
  });
  assert.equal(findings.length, 1);
});

test("findChangeSizeOverrideFindings passes once a human-approved row for this branch exists", () => {
  const registerText = [
    "| Branch | Counted lines | Composition | Justification | Removable when | Approved by |",
    "| --- | --- | --- | --- | --- | --- |",
    "| feature/bootstrap | 14959 | ported tooling | needed for parity | split next time | Martin Jarvis |",
  ].join("\n");
  assert.deepEqual(
    findChangeSizeOverrideFindings({
      logText: "chore: accepted [large-pr]\n",
      registerText,
      branch: "feature/bootstrap",
    }),
    [],
  );
});

test("findChangeSizeOverrideFindings does not let a row approved for a different branch cover this one", () => {
  // Decisive: an approved row exists in the register, but for someone else's
  // branch. A stale acceptance elsewhere must not silently authorise this one.
  const registerText = [
    "| Branch | Counted lines | Composition | Justification | Removable when | Approved by |",
    "| --- | --- | --- | --- | --- | --- |",
    "| feature/other | 900 | vendored data | one-off import | n/a | Martin Jarvis |",
  ].join("\n");
  const findings = findChangeSizeOverrideFindings({
    logText: "chore: accepted [large-pr]\n",
    registerText,
    branch: "feature/bootstrap",
  });
  assert.equal(findings.length, 1);
});

test("findChangeSizeOverrideFindings reports the branch itself as unresolved rather than silently passing", () => {
  const findings = findChangeSizeOverrideFindings({
    logText: "chore: accepted [large-pr]\n",
    registerText: "",
    branch: "",
  });
  assert.equal(findings.length, 1);
  const finding = findings[0];
  assert.ok(finding, "expected one finding");
  assert.match(finding.problem, /own name could/);
});

test("approvedOverrideRowsForBranch matches by branch, case-insensitively, ignoring the counted-lines cell", () => {
  const registerText = [
    "| Branch | Counted lines | Composition | Justification | Removable when | Approved by |",
    "| --- | --- | --- | --- | --- | --- |",
    "| Feature/Bootstrap | 14959 | ported tooling | needed for parity | split next time | Martin Jarvis |",
  ].join("\n");
  assert.equal(
    approvedOverrideRowsForBranch(registerText, "feature/bootstrap").length,
    1,
  );
  assert.equal(
    approvedOverrideRowsForBranch(registerText, "feature/unrelated").length,
    0,
  );
});

test("approvedOverrideRowsForBranch matches a Branch cell written as a code span, which is how the register writes it", () => {
  // The fixture above writes the branch bare; the real register writes
  // `| \`rebuild\` |`, as its own header and every worked example do. Compared
  // raw, the backticks meant the identity never matched the branch a gate
  // hands in, so an approved row read as absent and the override could not be
  // claimed on any branch.
  const registerText = [
    "| Branch | Filed | Counted lines | Composition | Justification | Removable when | Approved by |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    "| `rebuild` | 2026-08-01 | 2464 | typing pass | repository-wide setting | merges | Martin Jarvis |",
  ].join("\n");
  assert.equal(
    approvedOverrideRowsForBranch(registerText, "rebuild").length,
    1,
  );
  assert.equal(
    approvedOverrideRowsForBranch(registerText, "other").length,
    0,
    "a different branch must still not match",
  );
});

test("checkChangeSizeOverride wires the log read, the register read and the branch together — injected, no real repository needed", () => {
  const registerText = [
    "| Branch | Counted lines | Composition | Justification | Removable when | Approved by |",
    "| --- | --- | --- | --- | --- | --- |",
    "| feature/bootstrap | 14959 | ported tooling | needed for parity | split next time | Martin Jarvis |",
  ].join("\n");
  /** @type {(cmd: string, args: readonly string[]) => import("node:child_process").SpawnSyncReturns<string>} */
  const fakeLog = () => ({
    status: 0,
    stdout: "chore: accepted [large-pr]\n",
    stderr: "",
    pid: 0,
    output: [],
    signal: null,
  });
  const passing = checkChangeSizeOverride("origin/main..HEAD", {
    branch: "feature/bootstrap",
    runGit: fakeLog,
    readFile: (p) =>
      p === CHANGE_SIZE_OVERRIDE_REGISTER_PATH ? registerText : "",
  });
  assert.deepEqual(passing, []);

  const blocked = checkChangeSizeOverride("origin/main..HEAD", {
    branch: "feature/unrelated",
    runGit: fakeLog,
    readFile: (p) =>
      p === CHANGE_SIZE_OVERRIDE_REGISTER_PATH ? registerText : "",
  });
  assert.equal(blocked.length, 1);
});

test("regression guard: check-change-size-override.mjs run for real, against a scratch branch shaped exactly like the demonstrated case — marker in a later, distinct commit from the oversized diff, no register row — refuses", () => {
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature/bootstrap"]);
  for (let i = 0; i < 5; i++)
    writeFileSync(join(dir, `part${i}.ts`), lines(200));
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "chore: bootstrap greet against the standards"]);
  // The marker, in its own later commit — the exact separation the
  // branch already had, and which a naive "different commit" rule would have
  // accepted.
  git(dir, [
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    "chore: tune ported corpus [large-pr]",
  ]);
  const r = runScript("scripts/check-change-size-override.mjs", dir, [
    "origin/main..HEAD",
  ]);
  assert.equal(
    r.status,
    2,
    "the marker sat in its own commit already — that alone must not clear it",
  );
  assert.match(r.stderr, /change size override/);
  rmSync(dir, { recursive: true, force: true });
});

test("regression guard: check-change-size-override.mjs run for real, passes once the register carries a human-approved row for this branch", () => {
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature/bootstrap"]);
  for (let i = 0; i < 5; i++)
    writeFileSync(join(dir, `part${i}.ts`), lines(200));
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "chore: bootstrap greet against the standards"]);
  git(dir, [
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    "chore: tune ported corpus [large-pr]",
  ]);
  mkdirSync(join(dir, "docs", "registers"), { recursive: true });
  writeFileSync(
    join(dir, CHANGE_SIZE_OVERRIDE_REGISTER_PATH),
    [
      "| Branch | Counted lines | Composition | Justification | Removable when | Approved by |",
      "| --- | --- | --- | --- | --- | --- |",
      "| feature/bootstrap | 1000 | ported tooling | needed for parity | split next time | Martin Jarvis |",
      "",
    ].join("\n"),
  );
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "docs: record the change-size override"]);
  const r = runScript("scripts/check-change-size-override.mjs", dir, [
    "origin/main..HEAD",
  ]);
  assert.equal(r.status, 0);
  rmSync(dir, { recursive: true, force: true });
});

// --- The marker becomes unwritable-by-agent the same structural way the
// approver cell already is: mechanical, not a fourth prose statement. These
// three tests are exactly checkpoints 1-3 of that change.
const CHANGE_SIZE_OVERRIDE_REGISTER_HEADER =
  "| Branch | Counted lines | Composition | Justification | Removable when | Approved by |\n" +
  "| --- | --- | --- | --- | --- | --- |\n";
test("checkChangeSizeOverrideMessage wires a single drafted message, the register read and the branch together — injected, no real repository needed", () => {
  const registerText = [
    "| Branch | Counted lines | Composition | Justification | Removable when | Approved by |",
    "| --- | --- | --- | --- | --- | --- |",
    "| feature/bootstrap | 14959 | ported tooling | needed for parity | split next time | Martin Jarvis |",
  ].join("\n");
  const passing = checkChangeSizeOverrideMessage("chore: accepted [large-pr]", {
    branch: "feature/bootstrap",
    readFile: (p) =>
      p === CHANGE_SIZE_OVERRIDE_REGISTER_PATH ? registerText : "",
  });
  assert.deepEqual(passing, []);

  const blocked = checkChangeSizeOverrideMessage("chore: accepted [large-pr]", {
    branch: "feature/unrelated",
    readFile: (p) =>
      p === CHANGE_SIZE_OVERRIDE_REGISTER_PATH ? registerText : "",
  });
  assert.equal(blocked.length, 1);

  // A message that never mentions the marker at all — filing the register
  // row itself, say — trips nothing regardless of the register's state.
  const untouched = checkChangeSizeOverrideMessage(
    "docs: record the change-size override",
    {
      branch: "feature/unrelated",
      readFile: () => "",
    },
  );
  assert.deepEqual(untouched, []);
});

test("regression guard: check-change-size-override.mjs --message run for real, refuses a commit whose own message introduces [large-pr] with no approved row (checkpoint 1)", () => {
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature/bootstrap"]);
  mkdirSync(join(dir, "docs", "registers"), { recursive: true });
  writeFileSync(
    join(dir, CHANGE_SIZE_OVERRIDE_REGISTER_PATH),
    CHANGE_SIZE_OVERRIDE_REGISTER_HEADER,
  );
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "docs: create the change-size override register"]);

  const msgFile = join(dir, "MSG");
  writeFileSync(msgFile, "chore: tune ported corpus [large-pr]\n");
  const r = runScript("scripts/check-change-size-override.mjs", dir, [
    "--message",
    msgFile,
  ]);
  assert.equal(
    r.status,
    2,
    "a commit whose own message carries the marker with no register row for this branch must be refused",
  );
  assert.match(r.stderr, /change size override/);
  rmSync(dir, { recursive: true, force: true });
});

test("regression guard: check-change-size-override.mjs --message run for real, passes once the register already carries a human-approved row for this branch (checkpoint 2)", () => {
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature/bootstrap"]);
  mkdirSync(join(dir, "docs", "registers"), { recursive: true });
  writeFileSync(
    join(dir, CHANGE_SIZE_OVERRIDE_REGISTER_PATH),
    CHANGE_SIZE_OVERRIDE_REGISTER_HEADER +
      "| feature/bootstrap | 1000 | ported tooling | needed for parity | split next time | Martin Jarvis |\n",
  );
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "docs: record the change-size override"]);

  const msgFile = join(dir, "MSG");
  writeFileSync(msgFile, "chore: tune ported corpus [large-pr]\n");
  const r = runScript("scripts/check-change-size-override.mjs", dir, [
    "--message",
    msgFile,
  ]);
  assert.equal(
    r.status,
    0,
    "the same commit is accepted once an approved row already exists for the branch",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("regression guard: check-change-size-override.mjs --message does not block filing a blank-approver row — the proposal path stays open (checkpoint 3)", () => {
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature/bootstrap"]);
  mkdirSync(join(dir, "docs", "registers"), { recursive: true });
  writeFileSync(
    join(dir, CHANGE_SIZE_OVERRIDE_REGISTER_PATH),
    CHANGE_SIZE_OVERRIDE_REGISTER_HEADER +
      "| feature/bootstrap | 1000 | ported tooling | needed for parity | split next time | |\n",
  );
  git(dir, ["add", "-A"]);

  const msgFile = join(dir, "MSG");
  writeFileSync(
    msgFile,
    "docs: record the change-size override, awaiting approval\n",
  );
  const r = runScript("scripts/check-change-size-override.mjs", dir, [
    "--message",
    msgFile,
  ]);
  assert.equal(
    r.status,
    0,
    "a commit that only files the row, with no [large-pr] in its own message, must not be refused",
  );
  rmSync(dir, { recursive: true, force: true });
});
