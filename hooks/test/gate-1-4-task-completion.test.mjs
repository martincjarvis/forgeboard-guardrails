// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis Uncited uncited
// Split from hooks.test.mjs (fix 79) — subject group: gate-1-4-task-completion.
// Loaded by hooks/test/hooks.test.mjs; not invoked directly by the test runner.
import { test } from "node:test";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
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
import { parseNumstatZ } from "../gate-4-task-completion.mjs";
import {
  HOOKS,
  ROOT,
  CLEAN_ENV,
  git,
  scratchRepo,
  runHook,
  runScript,
  lines,
  complexFunction,
} from "./support.mjs";

test("gate 1 ignores a file that does not exist", () => {
  const dir = scratchRepo();
  const r = runHook(
    "gate-1-edit.mjs",
    dir,
    JSON.stringify({ tool_input: { file_path: "nope.txt" } }),
  );
  assert.equal(r.status, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("gate 1 does not scan an untracked file", () => {
  const dir = scratchRepo();
  writeFileSync(join(dir, "scratch.txt"), "scratch\n");
  const r = runHook(
    "gate-1-edit.mjs",
    dir,
    JSON.stringify({ tool_input: { file_path: "scratch.txt" } }),
  );
  assert.equal(r.status, 0);
  assert.doesNotMatch(
    r.stderr,
    /not scanned/,
    "an untracked file is out of scope, not unscanned",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("gate 1 reports an absent scanner rather than passing quietly", () => {
  const dir = scratchRepo();
  const r = runHook(
    "gate-1-edit.mjs",
    dir,
    JSON.stringify({ tool_input: { file_path: "README.md" } }),
  );
  assert.equal(r.status, 0, "an absent tool does not fail the edit");
  // Whether this fires depends on whether secretlint resolves here. When it does
  // not, the hook must say so — silence would be the failure this standard names.
  if (r.stderr.length > 0) assert.match(r.stderr, /not scanned|unavailable/);
  rmSync(dir, { recursive: true, force: true });
});

test("gate 4 reports the thresholds it derived", () => {
  // cross-gate rules: every run states the thresholds in force and where each
  // came from. A derived value nobody can see is worse than a wrong file.
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  writeFileSync(join(dir, "small.ts"), lines(20));
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "feat: small"]);
  const r = runHook("gate-4-task-completion.mjs", dir);
  assert.equal(r.status, 0);
  assert.match(r.stderr, /thresholds change-warn=400 change-error=800/);
  assert.match(r.stderr, /git check-attr/);
  rmSync(dir, { recursive: true, force: true });
});

test("gate 4 passes a small branch", () => {
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  writeFileSync(join(dir, "small.ts"), lines(20));
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "feat: small"]);
  assert.equal(runHook("gate-4-task-completion.mjs", dir).status, 0);
  rmSync(dir, { recursive: true, force: true });
});

// --- Fix 71. Root cause: scripts/gate-6-pull-request.mjs resolves its own
// base via GITHUB_BASE_REF first (always set on a real `pull_request` CI
// run), falling back to resolveBase() only for a manual run — but it used
// to spawn this hook as a subprocess with no base argument at all, so the
// hook always re-derived its own base via a bare resolveBase() call. That
// call needs `origin/HEAD`, a symref GitHub Actions' `actions/checkout`
// never sets (no `git remote set-head origin -a` step in the workflow), so
// on every real CI run of gate 6 this hook's own resolveBase() failed and
// it silently skipped — while gate 6 itself, seconds apart in the same
// checkout, resolved its base successfully via GITHUB_BASE_REF and
// proceeded. The two tests below prove the fix at the hook's own interface:
// an explicit base argument is used when given, and the pre-existing local
// behaviour (Stop hook, hooks.json, called with no argument) is unchanged.

test("gate 4 uses an explicit base argument instead of resolveBase() when one is given (fix 71)", () => {
  const dir = scratchRepo();
  // Break resolveBase() the same single-failure way line 722's test does —
  // origin/main still resolves, origin/HEAD does not — so a pass here can
  // only be explained by the explicit argument, never by a lucky derivation.
  git(dir, ["symbolic-ref", "-d", "refs/remotes/origin/HEAD"]);
  git(dir, ["checkout", "-qb", "feature"]);
  for (let i = 0; i < 5; i++)
    writeFileSync(join(dir, `part${i}.ts`), lines(200));
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "feat: large"]);
  const r = spawnSync(
    process.execPath,
    [join(HOOKS, "gate-4-task-completion.mjs"), "origin/main"],
    { cwd: dir, encoding: "utf8", env: CLEAN_ENV },
  );
  assert.equal(
    r.status,
    2,
    "an explicit base must be measured against, not skipped for lack of a derivable one",
  );
  assert.match(r.stderr, /change size/);
  assert.doesNotMatch(
    r.stderr,
    /origin\/HEAD could not be resolved/,
    "an explicit base was given; resolveBase() must not even be consulted",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("gate 4 still skips visibly, with no explicit base given, when origin/HEAD is unresolvable (unchanged local/Stop-hook behaviour)", () => {
  const dir = scratchRepo();
  git(dir, ["symbolic-ref", "-d", "refs/remotes/origin/HEAD"]);
  git(dir, ["checkout", "-qb", "feature"]);
  writeFileSync(join(dir, "small.ts"), lines(20));
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "feat: small"]);
  const r = runHook("gate-4-task-completion.mjs", dir);
  assert.equal(r.status, 0);
  assert.match(r.stderr, /origin\/HEAD could not be resolved/);
  rmSync(dir, { recursive: true, force: true });
});

test("regression guard: scripts/gate-6-pull-request.mjs passes its own resolved base to the gate-4 subprocess by argument, rather than letting it re-derive independently (fix 71)", () => {
  // A wiring check, the same shape check-script-wiring.mjs already uses for
  // "does the claimed call site actually say what it claims" — re-reads the
  // real source rather than trusting a comment, so a future edit that drops
  // the argument again is caught here rather than only in production.
  const text = readFileSync(
    join(ROOT, "scripts", "gate-6-pull-request.mjs"),
    "utf8",
  );
  assert.match(
    text,
    /run\(\s*"node"\s*,\s*\[\s*"hooks\/gate-4-task-completion\.mjs"\s*,\s*base\s*\]\s*\)/,
    "gate 6 must invoke the gate-4 subprocess with the base it already resolved, not with no argument",
  );
});

test("gate 4 blocks a branch over the change-size error threshold", () => {
  // No .gitattributes here, so the .ts files are unclassified — which is the
  // fail-safe class production (file-classes.md) — and production counts toward
  // change size. This case therefore also proves the unclassified-is-production
  // default: if unclassified fell out of change size, the gate would wrongly pass.
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  // Five files of 200 lines: over the 800-line change-size threshold, with no
  // single file over the 400-line length limit, so only change size can fire.
  for (let i = 0; i < 5; i++)
    writeFileSync(join(dir, `part${i}.ts`), lines(200));
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "feat: large"]);
  const r = runHook("gate-4-task-completion.mjs", dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /change size/);
  assert.doesNotMatch(
    r.stderr,
    /split it into smaller units/,
    "no file is over the length limit",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("the override marker clears change size", () => {
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  for (let i = 0; i < 5; i++)
    writeFileSync(join(dir, `part${i}.ts`), lines(200));
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "feat: large"]);
  git(dir, [
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    "chore: accepted [large-pr]",
  ]);
  assert.equal(runHook("gate-4-task-completion.mjs", dir).status, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("the override marker does not clear file length", () => {
  // thresholds.md: the marker reaches change size only, "not the length or
  // complexity limits". A branch may legitimately be large; a single file may
  // not legitimately be that long.
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  writeFileSync(join(dir, "big.ts"), lines(900));
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "feat: one long file"]);
  git(dir, [
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    "chore: accepted [large-pr]",
  ]);
  const r = runHook("gate-4-task-completion.mjs", dir);
  assert.equal(r.status, 2, "the marker clears change size, never file length");
  assert.match(r.stderr, /split it into smaller units/);
  assert.doesNotMatch(
    r.stderr,
    /change size/,
    "change size was cleared by the marker",
  );
  rmSync(dir, { recursive: true, force: true });
});

// --- Fix 74. gate-4-task-completion.mjs's own OVERRIDE check (above) only
// ever asked whether the [large-pr] string appears anywhere in the branch's
// commit log — satisfied by any author, with no reason and no approver, and
// unaffected by which commit carries it. check-change-size-override.mjs is
// the server-side check that makes the override answerable only by a human:
// the marker must be backed by an approved row in the change-size override
// register, identified by branch. These tests exercise that module's pure
// functions directly, plus one real, end-to-end reproduction of audit 18's
// own shape below.

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

test("findChangeSizeOverrideFindings blocks a marker with no register row at all — audit 18's own case", () => {
  // The exact shape audit 18 found: [large-pr] present, in a commit distinct
  // from the oversized diff (that distinction is not modelled here — it does
  // not matter to this check, which is the point: "which commit" was never
  // the missing property). No row exists anywhere for this branch.
  const findings = findChangeSizeOverrideFindings({
    logText: "chore: bootstrap\n\nchore: accepted [large-pr]\n",
    registerText: "",
    branch: "feature/bootstrap",
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0].problem, /no.*row for branch 'feature\/bootstrap'/);
  assert.equal(findings[0].path, CHANGE_SIZE_OVERRIDE_REGISTER_PATH);
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
  assert.match(findings[0].problem, /own name could/);
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

test("regression guard: check-change-size-override.mjs run for real, against a scratch branch shaped exactly like audit 18's — marker in a later, distinct commit from the oversized diff, no register row — refuses", () => {
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature/bootstrap"]);
  for (let i = 0; i < 5; i++)
    writeFileSync(join(dir, `part${i}.ts`), lines(200));
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "chore: bootstrap greet against the standards"]);
  // The marker, in its own later commit — the exact separation audit 18's
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

// Fix 84 — the marker becomes unwritable-by-agent the same structural way the
// approver cell already is: mechanical, not a fourth prose statement. These
// three tests are exactly checkpoints 1-3 of that fix.
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

test("regression guard: check-change-size-override.mjs --message run for real, refuses a commit whose own message introduces [large-pr] with no approved row (fix 84, checkpoint 1)", () => {
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

test("regression guard: check-change-size-override.mjs --message run for real, passes once the register already carries a human-approved row for this branch (fix 84, checkpoint 2)", () => {
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

test("regression guard: check-change-size-override.mjs --message does not block filing a blank-approver row — the proposal path stays open (fix 84, checkpoint 3)", () => {
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

test("gate 4 does not count files classed as test or documentation toward change size", () => {
  // Classification is derived from .gitattributes through guardrail-class
  // (file-classes.md, ADR-0003), so the scratch repo must declare the classes
  // the real repository does — a path regex is no longer what decides this.
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  writeFileSync(
    join(dir, ".gitattributes"),
    "tests/** guardrail-class=test\n*.md guardrail-class=documentation\n",
  );
  mkdirSync(join(dir, "tests"), { recursive: true });
  writeFileSync(join(dir, "tests", "huge.test.ts"), lines(2000));
  writeFileSync(join(dir, "NOTES.md"), lines(2000));
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "test: plenty"]);
  const r = runHook("gate-4-task-completion.mjs", dir);
  assert.equal(
    r.status,
    0,
    "test and documentation files do not count toward change size",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("a file classed as test via guardrail-class does not count toward change size", () => {
  // Decisive proof: a 1000-line file that would blow past the 800-line error
  // threshold is allowed because it is classed as test, not because it is small.
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  writeFileSync(join(dir, ".gitattributes"), "spec/** guardrail-class=test\n");
  mkdirSync(join(dir, "spec"), { recursive: true });
  writeFileSync(join(dir, "spec", "big.spec.ts"), lines(1000));
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "test: big spec file"]);
  assert.equal(runHook("gate-4-task-completion.mjs", dir).status, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("a file classed as configuration counts toward change size but has no length limit", () => {
  // file-classes.md: configuration counts toward change size but has no length
  // limit. A single 900-line config file is long but legitimate; its lines still
  // count, and here 900 crosses the change-size error threshold on its own.
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  writeFileSync(
    join(dir, ".gitattributes"),
    "*.config guardrail-class=configuration\n",
  );
  writeFileSync(join(dir, "big.config"), lines(900));
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "build: large config"]);
  const r = runHook("gate-4-task-completion.mjs", dir);
  assert.equal(r.status, 2, "configuration counts toward change size");
  assert.match(r.stderr, /change size/);
  assert.doesNotMatch(
    r.stderr,
    /split it into smaller units/,
    "configuration has no length limit",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("a file classed as tooling counts toward change size but has no length limit", () => {
  // file-classes.md: "Configuration and tooling count toward change size but
  // carry no length limit" — tooling is Yes in the class table's "Counted in
  // change size" column, the same as configuration above. A single 900-line
  // tooling file crosses the change-size error threshold on its own.
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  writeFileSync(
    join(dir, ".gitattributes"),
    "tools/** guardrail-class=tooling\n",
  );
  mkdirSync(join(dir, "tools"), { recursive: true });
  writeFileSync(join(dir, "tools", "big.mjs"), lines(900));
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "build: large tooling script"]);
  const r = runHook("gate-4-task-completion.mjs", dir);
  assert.equal(r.status, 2, "tooling counts toward change size");
  assert.match(r.stderr, /change size/);
  assert.doesNotMatch(
    r.stderr,
    /split it into smaller units/,
    "tooling has no length limit",
  );
  rmSync(dir, { recursive: true, force: true });
});

// --- Fix 73. A generated file has no remedy: nobody can meaningfully split
// or shrink a lock file, and any hand edit to one is discarded by the next
// `npm install`. file-classes.md: "A generated file counts toward neither
// change size nor the length limit" — declared through its own
// `guardrail-generated` attribute, a separate boolean git already resolves
// (`git check-attr guardrail-generated -- <path>`), never a sixth
// guardrail-class. The file's own `guardrail-class` is untouched by any of
// these — file-classes.md's own checkpoint: "keeps its guardrail-class for
// every other check."

test("a file marked guardrail-generated does not count toward change size", () => {
  // A configuration-classed lock file — the worked example — well past the
  // change-size error threshold on its own, discounted entirely once marked.
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  writeFileSync(
    join(dir, ".gitattributes"),
    "*.lock guardrail-class=configuration\n" + "big.lock guardrail-generated\n",
  );
  writeFileSync(join(dir, "big.lock"), lines(900));
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "chore: regenerate the lock file"]);
  const r = runHook("gate-4-task-completion.mjs", dir);
  assert.equal(
    r.status,
    0,
    "a generated file contributes nothing to change size",
  );
  assert.doesNotMatch(r.stderr, /change size/);
  rmSync(dir, { recursive: true, force: true });
});

test("a hand-written configuration file of the same size still counts toward change size — the distinction is the marker, not the extension", () => {
  // Decisive contrast with the case above: same class, same size, same
  // extension even — the only difference is the absence of the
  // guardrail-generated attribute, and that alone is what change size reads.
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  writeFileSync(
    join(dir, ".gitattributes"),
    "*.lock guardrail-class=configuration\n",
  );
  writeFileSync(join(dir, "big.lock"), lines(900));
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "chore: hand-edit a large lock-shaped file"]);
  const r = runHook("gate-4-task-completion.mjs", dir);
  assert.equal(
    r.status,
    2,
    "an unmarked file counts toward change size regardless of its name",
  );
  assert.match(r.stderr, /change size/);
  rmSync(dir, { recursive: true, force: true });
});

test("a code-generated production file (*.g.cs) is discounted from change size the same as a lock file", () => {
  // Fix 73's own point: generated code, not only a lock file, carries the
  // same "no remedy" property. Unclassified .cs falls out to production
  // (file-classes.md's fail-safe default), so this also proves the
  // discount applies independently of guardrail-class.
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  writeFileSync(join(dir, ".gitattributes"), "*.g.cs guardrail-generated\n");
  writeFileSync(join(dir, "Widget.g.cs"), lines(900));
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "chore: regenerate the designer file"]);
  const r = runHook("gate-4-task-completion.mjs", dir);
  assert.equal(r.status, 0, "generated production code is discounted too");
  assert.doesNotMatch(r.stderr, /change size/);
  rmSync(dir, { recursive: true, force: true });
});

test("a generated production file is also exempt from the length limit, not only change size", () => {
  // file-classes.md: "A generated file counts toward neither change size nor
  // the length limit." A single generated file below the change-size error
  // threshold isolates the length-limit half of the claim.
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  writeFileSync(join(dir, ".gitattributes"), "*.g.cs guardrail-generated\n");
  writeFileSync(join(dir, "Widget.g.cs"), lines(500));
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "chore: regenerate one designer file"]);
  const r = runHook("gate-4-task-completion.mjs", dir);
  assert.equal(r.status, 0, "a generated file is exempt from the length limit");
  assert.doesNotMatch(r.stderr, /split it into smaller units/);
  rmSync(dir, { recursive: true, force: true });
});

test("guardrail-generated absent (unspecified) is not treated as generated — the fail-safe direction", () => {
  // Negative fixture, per the brief: git check-attr reports every path,
  // `unspecified` for one no .gitattributes pattern ever names. Only `set`
  // may discount a file; absence must count it, the same fail-safe direction
  // classOf() already takes for guardrail-class.
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  // No .gitattributes at all: guardrail-generated is unspecified for every
  // path, and the file is unclassified production by the existing default.
  writeFileSync(join(dir, "big.lock"), lines(900));
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "chore: add an unclassified large file"]);
  const r = runHook("gate-4-task-completion.mjs", dir);
  assert.equal(
    r.status,
    2,
    "no .gitattributes declares guardrail-generated, so nothing is discounted",
  );
  assert.match(r.stderr, /change size/);
  rmSync(dir, { recursive: true, force: true });
});

test("gate 4 blocks a production file with a function over the complexity error threshold", () => {
  // gate-4-task-completion.md row 4, thresholds.md: complexity error is 15.
  // 16 chained branches gives McCabe complexity 17 — over the error band.
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  writeFileSync(join(dir, "complex.mjs"), complexFunction("tooComplex", 16));
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "feat: a very branchy function"]);
  const r = runHook("gate-4-task-completion.mjs", dir);
  assert.equal(r.status, 2, "a production function over the error band blocks");
  assert.match(r.stderr, /cyclomatic complexity is 17/);
  rmSync(dir, { recursive: true, force: true });
});

test("gate 4 pushes back (does not block) a production function in the complexity warn band", () => {
  // 11 branches gives complexity 12 — inside the 10-14 warn band.
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  writeFileSync(join(dir, "warnish.mjs"), complexFunction("warnish", 11));
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "feat: a moderately branchy function"]);
  const r = runHook("gate-4-task-completion.mjs", dir);
  assert.equal(
    r.status,
    0,
    "the warn band pushes back (prints) but does not block",
  );
  assert.match(r.stderr, /cyclomatic complexity is 12/);
  rmSync(dir, { recursive: true, force: true });
});

test("gate 4 warns but does not block a test file over the complexity error threshold", () => {
  // file-classes.md / "push back is not a warning": complexity pushes back
  // for production files; a test file only ever warns, never blocks —
  // proven decisively here with a function well past the error band (17).
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  writeFileSync(join(dir, ".gitattributes"), "spec/** guardrail-class=test\n");
  mkdirSync(join(dir, "spec"), { recursive: true });
  writeFileSync(
    join(dir, "spec", "complex.spec.mjs"),
    complexFunction("tooComplex", 16),
  );
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "test: a very branchy test helper"]);
  const r = runHook("gate-4-task-completion.mjs", dir);
  assert.equal(r.status, 0, "a test file never blocks on complexity");
  assert.match(r.stderr, /cyclomatic complexity is 17/);
  rmSync(dir, { recursive: true, force: true });
});

// A renamed directory's --numstat third column is `{old => new}/file`, which
// check-attr cannot resolve — it returns unspecified, which file classes read
// as production. `-z` emits old and new paths as separate fields instead.
test("parseNumstatZ: a renamed file yields its new path, not the brace form", () => {
  // Exactly what `git diff -z --numstat` writes for a directory rename.
  const renamed = "1\t1\t\0scripts/a.mjs\0.guardrails/a.mjs\0";
  assert.deepEqual(parseNumstatZ(renamed), [["1", "1", ".guardrails/a.mjs"]]);
});

test("parseNumstatZ: ordinary rows, and a binary row, are unchanged", () => {
  const plain = "3\t4\tsrc/a.mjs\0" + "-\t-\tassets/logo.png\0";
  assert.deepEqual(parseNumstatZ(plain), [
    ["3", "4", "src/a.mjs"],
    ["-", "-", "assets/logo.png"],
  ]);
});

test("parseNumstatZ: a rename among ordinary rows does not shift the ones after it", () => {
  const mixed =
    "1\t0\tdocs/a.md\0" +
    "2\t2\t\0scripts/b.mjs\0.guardrails/b.mjs\0" +
    "5\t1\tsrc/c.mjs\0";
  assert.deepEqual(parseNumstatZ(mixed), [
    ["1", "0", "docs/a.md"],
    ["2", "2", ".guardrails/b.mjs"],
    ["5", "1", "src/c.mjs"],
  ]);
});
