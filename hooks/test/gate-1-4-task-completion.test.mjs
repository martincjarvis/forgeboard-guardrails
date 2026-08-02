// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis Uncited uncited unpushed Unpushed
// Split from hooks.test.mjs — subject group: gate-1-4-task-completion.
// Loaded by hooks/test/hooks.test.mjs; not invoked directly by the test runner.
import { test } from "node:test";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { parseNumstatZ, describeUnpushed } from "../gate-4-task-completion.mjs";
import assert from "node:assert/strict";
import {
  HOOKS,
  ROOT,
  CLEAN_ENV,
  git,
  scratchRepo,
  runHook,
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

// --- Root cause: scripts/gate-6-pull-request.mjs resolves its own
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

test("gate 4 uses an explicit base argument instead of resolveBase() when one is given", () => {
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

test("regression guard: scripts/gate-6-pull-request.mjs passes its own resolved base to the gate-4 subprocess by argument, rather than letting it re-derive independently", () => {
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

// gate 4 reports unpushed commits as a note for review (never a push, never a
// silent zero on the unavailable cases). describeUnpushed is the pure half;
// the unavailable cases are a skip with a reason, distinct from a real zero.
test("describeUnpushed: unavailable cases are a skip with a reason, never a silent zero", () => {
  assert.match(
    describeUnpushed({
      branch: "HEAD",
      hasRemote: true,
      upstream: null,
      ahead: null,
    }),
    /SKIP unpushed commits — detached HEAD/,
  );
  assert.match(
    describeUnpushed({
      branch: "feat/x",
      hasRemote: false,
      upstream: null,
      ahead: null,
    }),
    /SKIP unpushed commits — no remote configured/,
  );
  assert.match(
    describeUnpushed({
      branch: "feat/x",
      hasRemote: true,
      upstream: null,
      ahead: null,
    }),
    /SKIP unpushed commits — branch 'feat\/x' has no upstream/,
  );
  assert.match(
    describeUnpushed({
      branch: "feat/x",
      hasRemote: true,
      upstream: "origin/feat/x",
      ahead: null,
    }),
    /SKIP unpushed commits — could not count/,
  );
});

test("describeUnpushed: a real count is a note for review, singular and plural, and never says it pushes", () => {
  const zero = describeUnpushed({
    branch: "feat/x",
    hasRemote: true,
    upstream: "origin/feat/x",
    ahead: 0,
  });
  assert.ok(
    !zero.startsWith("SKIP"),
    "a real zero is available, not an unavailable skip",
  );
  assert.match(zero, /0 commits are on 'feat\/x' not on the remote/);
  const one = describeUnpushed({
    branch: "feat/x",
    hasRemote: true,
    upstream: "origin/feat/x",
    ahead: 1,
  });
  assert.match(one, /1 commit is on 'feat\/x'/);
  const three = describeUnpushed({
    branch: "feat/x",
    hasRemote: true,
    upstream: "origin/feat/x",
    ahead: 3,
  });
  assert.match(three, /3 commits are on 'feat\/x'/);
  for (const note of [zero, one, three]) {
    assert.match(note, /does not push/);
  }
});
