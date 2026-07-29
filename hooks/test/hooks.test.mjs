// The hooks are the only code in this repository, and they run on every edit on
// somebody's machine. Their logic — thresholds, the override marker, which files
// count — is exactly the kind that fails quietly, so it leaves a runnable check
// behind. Run with: node --test hooks/test/hooks.test.mjs
//
// Each case builds a throwaway git repository, because the behaviour under test
// is a function of git state and cannot be exercised without one.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HOOKS = join(dirname(fileURLToPath(import.meta.url)), "..");

// A hook runs inside git, which exports GIT_DIR / GIT_INDEX_FILE / GIT_WORK_TREE
// into the environment; anything spawned with those inherited resolves THIS
// repository instead of the throwaway one its cwd points at. Left in place, a
// `git add -A` in the scratch directory commits against the real index and
// deletes the corpus — which is exactly what happened once. Strip them so the
// scratch repository the test builds is the one the commands act on.
//
// This applies to the gates under test as much as to the test's own git calls:
// a gate spawned with GIT_DIR set would measure the real repository and report
// on a branch nobody asked about.
const CLEAN_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")),
);

function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: CLEAN_ENV });
  if (r.status !== 0 && !args.includes("--allow-empty")) {
    throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  }
  return r;
}

/** A repository with one commit on main, and origin/main pointing at it. */
function scratchRepo() {
  const dir = mkdtempSync(join(tmpdir(), "gate-"));
  git(dir, ["init", "-q", "-b", "main", "."]);
  git(dir, ["config", "user.email", "t@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
  writeFileSync(join(dir, "README.md"), "base\n");
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "chore: base"]);
  git(dir, ["update-ref", "refs/remotes/origin/main", "main"]);
  return dir;
}

function runHook(name, cwd, stdin = "") {
  return spawnSync(process.execPath, [join(HOOKS, name)], {
    cwd,
    input: stdin,
    encoding: "utf8",
    env: CLEAN_ENV,
  });
}

// The repository root, one level up from hooks/ — where scripts/ (the git-hook
// orchestrator and its checks) lives, as opposed to hooks/ (the agent hooks
// above). Repo-root-relative so a script resolves its cwd-relative git calls
// against the scratch repository, exactly as it would run from .husky.
const ROOT = join(HOOKS, "..");

function runScript(relPath, cwd, args = []) {
  return spawnSync(process.execPath, [join(ROOT, relPath), ...args], {
    cwd,
    encoding: "utf8",
    env: CLEAN_ENV,
  });
}

function lines(n, text = "x") {
  return `${text}\n`.repeat(n);
}

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

// --- scripts/ — gate 2, the commit-time checks (docs/standards/guardrails/
// gate-2-commit.md). These build the same throwaway repository, but exercise
// scripts/*.mjs rather than hooks/*.mjs.

test("machine-id check reads the staged blob, not a working copy edited after `git add`", () => {
  // gate-2-commit.md, check 2: a file edited after staging must still be
  // judged on what is in the index. Stage a violation, then edit the working
  // copy to remove it WITHOUT re-staging — the commit still contains the
  // violation, and a check reading disk here would wrongly clear it.
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  writeFileSync(join(dir, "notes.txt"), "C:\\Users\\martin\\notes.txt\n");
  git(dir, ["add", "-A"]);
  writeFileSync(join(dir, "notes.txt"), "clean, no machine id here\n");
  const r = runScript("scripts/check-machine-id.mjs", dir, ["notes.txt"]);
  assert.equal(
    r.status,
    2,
    "the staged blob still names a user; the working copy is not what is committed",
  );
  assert.match(r.stderr, /machine-identifying content/);
  rmSync(dir, { recursive: true, force: true });
});

test("machine-id check flags a real single-backslash Windows home path", () => {
  // The Windows pattern required two backslashes before `Users` and one after
  // — a real path (one and one) never matched. `martin` is not on the
  // placeholder list (unlike the generic `someone`/`user`/`example` names),
  // so this is a straight regex test.
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  writeFileSync(join(dir, "notes.txt"), "C:\\Users\\martin\\notes.txt\n");
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-machine-id.mjs", dir, ["notes.txt"]);
  assert.equal(r.status, 2, "a real Windows home path must be flagged");
  assert.match(r.stderr, /Windows home path/);
  rmSync(dir, { recursive: true, force: true });
});

test("gate 2 checks 12/13 read the staged tree, not a working-tree fix that was never re-staged", () => {
  // gate-2-commit.md, checks 12/13: a compiler or test runner reads the real
  // working tree, so it must be isolated to match the index first. Proven
  // failing without the fix: stage a broken file, overwrite the working copy
  // back to something valid WITHOUT re-staging — the build then reads the
  // fixed-up working copy and the commit is wrongly allowed.
  const dir = scratchRepo();
  // Pin line-ending handling for this test: a global core.autocrlf=true (the
  // common Windows default) makes git rewrite LF to CRLF on any checkout-like
  // write, including a stash pop — turning the isolation's restore step into
  // a spurious merge conflict that has nothing to do with the behaviour under
  // test. The real repository pins the same thing via `.gitattributes`
  // (`text=auto eol=lf`); this scratch repo has none, so it is set directly.
  git(dir, ["config", "core.autocrlf", "false"]);
  // A package.json + build script committed on main, before the branch under
  // test — so this commit never touches package.json itself, and dependency
  // lock sync (check 3) has nothing to say about it.
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "scratch",
      private: true,
      scripts: { build: "node build.mjs" },
    }) + "\n",
  );
  writeFileSync(
    join(dir, "build.mjs"),
    'import { readFileSync } from "node:fs";\n' +
      'const c = readFileSync("scripts/flag.mjs", "utf8");\n' +
      'process.exit(c.includes("BROKEN") ? 1 : 0);\n',
  );
  // An empty rule set, so check 6 (secret scan) — which this test does not
  // exercise — resolves cleanly rather than reaching for secretlint's default
  // preset, which is not resolvable from a scratch directory with no
  // node_modules of its own.
  writeFileSync(
    join(dir, ".secretlintrc.json"),
    JSON.stringify({ rules: [] }) + "\n",
  );
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "chore: scratch build script"]);

  git(dir, ["checkout", "-qb", "feature"]);
  mkdirSync(join(dir, "scripts"), { recursive: true });
  writeFileSync(
    join(dir, "scripts", "flag.mjs"),
    "export const flag = 'BROKEN';\n",
  );
  git(dir, ["add", "-A"]);
  // Overwrite the working copy back to valid content WITHOUT re-staging: the
  // index still holds BROKEN, which is what is actually about to be committed.
  writeFileSync(
    join(dir, "scripts", "flag.mjs"),
    "export const flag = 'OK';\n",
  );

  const r = runScript("scripts/pre-commit.mjs", dir);
  assert.equal(
    r.status,
    2,
    "the build must run against the staged BROKEN content, not the unstaged fix",
  );
  assert.match(r.stderr, /build \(tsc\)|staged-content isolation/);

  // Survivability: the working-tree fix the developer made (but never staged)
  // must still be there afterward — isolation restores, it does not discard.
  assert.equal(
    readFileSync(join(dir, "scripts", "flag.mjs"), "utf8"),
    "export const flag = 'OK';\n",
    "the unstaged working-tree edit must survive the isolated run",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("protected-branch check refuses on the derived default branch, allows a feature branch", () => {
  // gate-2-commit.md, check 1: the protected branch name is derived from
  // origin/HEAD (here, resolveBase's origin/main fallback — scratchRepo sets
  // refs/remotes/origin/main but no symbolic origin/HEAD, exactly like a bare
  // remote without one), never configured. Exercised as its own module
  // (scripts/check-protected-branch.mjs), not the full pre-commit.mjs
  // pipeline, so the result depends only on this check — not on whichever
  // external tools (secretlint, etc.) happen to resolve from a throwaway
  // repository with no node_modules of its own.
  const dir = scratchRepo();
  const onMain = runScript("scripts/check-protected-branch.mjs", dir);
  assert.equal(
    onMain.status,
    2,
    "a commit staged directly on the protected branch must be refused",
  );
  assert.match(onMain.stderr, /protected branch/);

  git(dir, ["checkout", "-qb", "feature"]);
  const onFeature = runScript("scripts/check-protected-branch.mjs", dir);
  assert.equal(
    onFeature.status,
    0,
    "the same repository on a feature branch is not refused",
  );
  rmSync(dir, { recursive: true, force: true });
});
