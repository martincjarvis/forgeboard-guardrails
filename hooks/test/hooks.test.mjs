// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother
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
  symlinkSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyAdvisories,
  acceptedAdvisoryIds,
  checkDependencyAdvisories,
} from "../../scripts/check-dependency-advisories.mjs";
import {
  classifyLicence,
  licenceAcceptable,
  checkLicencePolicy,
  licenceExpressionAcceptable,
} from "../../scripts/check-licence-policy.mjs";
import { checkSuppressions } from "../../scripts/check-suppressions.mjs";
import {
  normalizeSarifPaths,
  classifyTestCoverageOutcome,
} from "../../scripts/lib.mjs";
import { checkOsvScanner } from "../../scripts/check-osv-scanner.mjs";
import { checkScriptWiring } from "../../scripts/check-script-wiring.mjs";
import { run } from "../lib/run.mjs";
import { classifyFixtureResult } from "../../scripts/check-refusal-proofs.mjs";

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

/** A repository with one commit on main, and origin/main and a symbolic
 *  origin/HEAD pointing at it — the same two refs a real `git clone` writes,
 *  so resolveBase() resolves the base by genuine derivation, not by a
 *  fallback (lib.mjs's resolveBase has none: see the dedicated tests below
 *  for the single-failure case where origin/HEAD is missing). */
function scratchRepo() {
  const dir = mkdtempSync(join(tmpdir(), "gate-"));
  git(dir, ["init", "-q", "-b", "main", "."]);
  git(dir, ["config", "user.email", "t@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
  writeFileSync(join(dir, "README.md"), "base\n");
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "chore: base"]);
  git(dir, ["update-ref", "refs/remotes/origin/main", "main"]);
  git(dir, [
    "symbolic-ref",
    "refs/remotes/origin/HEAD",
    "refs/remotes/origin/main",
  ]);
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

/** A function whose cyclomatic complexity is `branches + 1` — one `else if`
 *  chain link per branch, McCabe's own count. */
function complexFunction(name, branches) {
  const arms = Array.from(
    { length: branches },
    (_, i) => `  ${i === 0 ? "if" : "else if"} (a === ${i}) { return ${i}; }`,
  ).join("\n");
  return `export function ${name}(a) {\n${arms}\n  return -1;\n}\n`;
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

test("gate 2 wires a lint check independently of the build: a lint-only violation tsc accepts is refused", () => {
  // gate-2-commit.md, check 11: "A lint or type-check failure is refused
  // independently of the build — the type checker is not the linter."
  // Fix 10 (audit 6): `npm run lint` used to be invoked by nothing, so this
  // check was effectively absent. An unused local variable is exactly the
  // shape tsc's checkJs (strict: false, no noUnusedLocals) does not catch,
  // so a build that runs against the same file stays green — proving the
  // finding depends on the lint check firing, not on the build.
  const dir = scratchRepo();
  git(dir, ["config", "core.autocrlf", "false"]);
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "scratch",
      private: true,
      type: "module",
      scripts: { build: "node build.mjs" },
    }) + "\n",
  );
  // A build that always passes: isolates the lint finding from the build
  // check this same block also runs, so a red result can only be the lint
  // check firing.
  writeFileSync(join(dir, "build.mjs"), "process.exit(0);\n");
  writeFileSync(
    join(dir, ".secretlintrc.json"),
    JSON.stringify({ rules: [] }) + "\n",
  );
  writeFileSync(
    join(dir, "eslint.config.mjs"),
    readFileSync(join(ROOT, "eslint.config.mjs"), "utf8"),
  );
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "chore: scratch lint fixture"]);

  git(dir, ["checkout", "-qb", "feature"]);
  mkdirSync(join(dir, "scripts"), { recursive: true });
  writeFileSync(
    join(dir, "scripts", "unused.mjs"),
    "const unused = 1;\nexport const used = 2;\n",
  );
  git(dir, ["add", "-A"]);
  // `npx eslint` resolves the toolkit's own devDependency through this
  // directory junction rather than a scratch node_modules of its own (there
  // is none) or, worse, an npm-registry install attempt. A junction, not a
  // symlink: it needs no elevated privileges on Windows. Created after
  // staging, and never added, so it is never part of the scratch commit.
  symlinkSync(
    join(ROOT, "node_modules"),
    join(dir, "node_modules"),
    "junction",
  );

  const r = runScript("scripts/pre-commit.mjs", dir);
  assert.equal(
    r.status,
    2,
    "a lint-only violation (unused var) that tsc accepts must be refused",
  );
  assert.match(r.stderr, /lint \(eslint\)/);
  assert.match(r.stderr, /no-unused-vars/);
  rmSync(dir, { recursive: true, force: true });
});

test("eslint --max-warnings 0 refuses a rule configured at its own default (warn) severity", () => {
  // cross-gate-rules.md: "No gate emits a warning it does not treat as a
  // failure" and "a rule configured at a linter's own warn severity still
  // [fails]." Fix 10's second half: --max-warnings 0 wherever eslint runs.
  // Every rule in eslint.config.mjs is already "error" (checked directly, not
  // inferred), so this proves the FLAG closes the gap, independent of
  // whether any rule happens to be misconfigured today.
  const dir = mkdtempSync(join(tmpdir(), "lint-"));
  writeFileSync(
    join(dir, "warn.mjs"),
    "export function f() {\n  var x = 1;\n  return x;\n}\n",
  );
  symlinkSync(
    join(ROOT, "node_modules"),
    join(dir, "node_modules"),
    "junction",
  );

  const clean = spawnSync(
    "npx",
    ["eslint", "--no-config-lookup", "--rule", "no-var:warn", "warn.mjs"],
    { cwd: dir, encoding: "utf8", shell: true },
  );
  assert.equal(
    clean.status,
    0,
    "a warn-severity rule alone must not fail the run — otherwise this is not testing --max-warnings",
  );

  const gated = spawnSync(
    "npx",
    [
      "eslint",
      "--no-config-lookup",
      "--rule",
      "no-var:warn",
      "--max-warnings",
      "0",
      "warn.mjs",
    ],
    { cwd: dir, encoding: "utf8", shell: true },
  );
  assert.notEqual(
    gated.status,
    0,
    "--max-warnings 0 must refuse a rule at its own warn severity",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("protected-branch check refuses on the derived default branch, allows a feature branch", () => {
  // gate-2-commit.md, check 1: the protected branch name is derived from
  // origin/HEAD (here, a real symbolic ref — scratchRepo sets it up the same
  // way `git clone` does), never configured. Exercised as its own module
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

test("resolveBase has no hardcoded fallback: an absent origin/HEAD with origin/main still present is a visible skip, not a guessed name", () => {
  // The single-failure case (lib.mjs:resolveBase, fix 14): a shallow clone,
  // partial clone, or stale symref can delete refs/remotes/origin/HEAD while
  // refs/remotes/origin/main stays behind. A hardcoded "origin/main" fallback
  // would use that guessed name as though it had been derived, and the
  // protected-branch check would silently pass on a repository it never
  // actually resolved a base for. This is the realistic case — the doubly-
  // unresolvable one (no origin/main either) is not what a partial clone
  // produces and is not what this test exercises.
  const dir = scratchRepo();
  git(dir, ["symbolic-ref", "-d", "refs/remotes/origin/HEAD"]);
  assert.equal(
    git(dir, ["rev-parse", "--verify", "--quiet", "refs/remotes/origin/main"])
      .status,
    0,
    "origin/main must still resolve — this is the single-failure case, not the doubly-unresolvable one",
  );

  const r = runScript("scripts/check-protected-branch.mjs", dir);
  assert.equal(
    r.status,
    0,
    "with no base resolvable, the check must skip rather than block or silently pass on a guessed name",
  );
  assert.match(
    r.stderr,
    /origin\/HEAD could not be resolved/,
    "the skip must name the reason, not read as a silent pass",
  );
  assert.doesNotMatch(
    r.stderr,
    /origin\/main/,
    "must not fall back to the hardcoded name and report as though it had been derived",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("gate 6 reports visibly and refuses to proceed when origin/HEAD is unresolvable and no base was given", () => {
  const dir = scratchRepo();
  git(dir, ["symbolic-ref", "-d", "refs/remotes/origin/HEAD"]);
  // GITHUB_BASE_REF must be absent for this to exercise resolveBase()'s own
  // null path rather than the pull_request-event argument path.
  const env = Object.fromEntries(
    Object.entries(CLEAN_ENV).filter(([k]) => k !== "GITHUB_BASE_REF"),
  );
  const r = spawnSync(
    process.execPath,
    [join(ROOT, "scripts/gate-6-pull-request.mjs")],
    { cwd: dir, encoding: "utf8", env },
  );
  assert.notEqual(
    r.status,
    0,
    "gate 6 must not proceed when it cannot resolve a base to diff against",
  );
  assert.match(r.stderr, /cannot resolve the base branch/);
  rmSync(dir, { recursive: true, force: true });
});

// --- scripts/check-dependency-advisories.mjs — gate 6 check 6 (docs/
// standards/guardrails/gate-6-pull-request.md, change-triggered-checks.md).
// `npm audit` is network-bound and its result changes as advisories publish,
// so these test the pure classification against a fixed, synthetic report —
// not a live `npm audit` run — the same reason check-dependency-advisories.mjs
// splits classifyAdvisories out from the impure orchestration around it.

function auditReport(entries) {
  const vulnerabilities = {};
  for (const [name, severity, urls = []] of entries) {
    vulnerabilities[name] = {
      name,
      severity,
      via: urls.map((url) => ({ url })),
    };
  }
  return { vulnerabilities };
}

test("dependency advisory scan blocks a runtime dependency at high severity", () => {
  // thresholds.md: block for runtime is "high and above". No accepted ids, no
  // runtime/dev distinction needed to reach the block band.
  const report = auditReport([["left-pad", "high"]]);
  const findings = classifyAdvisories(report, {
    runtimeNames: new Set(["left-pad"]),
  });
  assert.equal(findings.length, 1);
  assert.match(
    findings[0].problem,
    /left-pad carries a high advisory \(runtime dependency\)/,
  );
  assert.match(
    findings[0].remedy,
    /block severity has no accepted-record path/,
  );
});

test("dependency advisory scan does not push back a development-only dependency below its band", () => {
  // thresholds.md: development-only push-back is "high"; moderate is below
  // it and must not fire — the same package would push back if it were a
  // runtime dependency (push-back for runtime is "medium"/moderate).
  const report = auditReport([["left-pad", "moderate"]]);
  const findings = classifyAdvisories(report, { runtimeNames: new Set() });
  assert.equal(findings.length, 0);
});

test("dependency advisory scan pushes back a development-only dependency at high severity, unless an Accepted ADR names its advisory id", () => {
  const report = auditReport([
    ["left-pad", "high", ["https://github.com/advisories/GHSA-aaaa-bbbb-cccc"]],
  ]);
  const unaccepted = classifyAdvisories(report, { runtimeNames: new Set() });
  assert.equal(
    unaccepted.length,
    1,
    "high severity, dev-only, is the push-back band",
  );
  assert.match(unaccepted[0].problem, /ghsa-aaaa-bbbb-cccc/);

  const accepted = classifyAdvisories(report, {
    runtimeNames: new Set(),
    acceptedIds: new Set(["ghsa-aaaa-bbbb-cccc"]),
  });
  assert.equal(
    accepted.length,
    0,
    "a decision record naming the advisory id clears the push-back band",
  );
});

test("dependency advisory scan is a visible skip, naming the reason, when not triggered", () => {
  const { findings, skips } = checkDependencyAdvisories(false);
  assert.deepEqual(findings, []);
  assert.equal(skips.length, 1);
  assert.match(skips[0], /dependency advisory scan/);
  assert.match(skips[0], /no dependency change and not a scheduled run/);
});

// --- scripts/check-licence-policy.mjs — gate 6 check 7 (docs/standards/
// guardrails/gate-6-pull-request.md, "Four licence categories, not two").

test("licence policy classifies the four categories", () => {
  assert.equal(classifyLicence("MIT"), "permissive");
  assert.equal(classifyLicence("MPL-2.0"), "weak-copyleft");
  assert.equal(classifyLicence(""), "unknown");
  assert.equal(classifyLicence("UNKNOWN"), "unknown");
  assert.equal(classifyLicence("GPL-3.0-only"), "other");
});

test("licence policy: permissive passes at either scope; weak copyleft passes for development but blocks at runtime; unknown and other always block", () => {
  assert.equal(licenceAcceptable("MIT", "Runtime"), true);
  assert.equal(licenceAcceptable("MIT", "Development"), true);
  assert.equal(licenceAcceptable("MPL-2.0", "Development"), true);
  assert.equal(
    licenceAcceptable("MPL-2.0", "Runtime"),
    false,
    "weak copyleft blocks the moment it ships",
  );
  assert.equal(
    licenceAcceptable("", "Development"),
    false,
    "no licence at all is refused, never passed as unclassified-yet",
  );
  assert.equal(licenceAcceptable("GPL-3.0-only", "Development"), false);
});

test("SPDX expression evaluation: OR passes if any disjunct is acceptable at scope", () => {
  // The exact false positive audit 6 found: `JSONStream (MIT OR Apache-2.0)`
  // and type-fest's `(MIT OR CC0-1.0)`, both on the runtime allow list —
  // blocked before fix 8 because the whole string was looked up as one
  // identifier, which matches nothing.
  assert.equal(
    licenceExpressionAcceptable("MIT OR Apache-2.0", "Runtime").acceptable,
    true,
  );
  assert.equal(
    licenceExpressionAcceptable("(MIT OR CC0-1.0)", "Runtime").acceptable,
    true,
  );
  // Both disjuncts unacceptable: blocked, and the refusal names both.
  const blocked = licenceExpressionAcceptable(
    "GPL-3.0-only OR AGPL-3.0-only",
    "Runtime",
  );
  assert.equal(blocked.acceptable, false);
  assert.equal(blocked.blockers.length, 2);
  assert.deepEqual(
    blocked.blockers.map((b) => b.id),
    ["GPL-3.0-only", "AGPL-3.0-only"],
  );
});

test("SPDX expression evaluation: AND requires every conjunct to be acceptable", () => {
  assert.equal(
    licenceExpressionAcceptable("MIT AND Apache-2.0", "Runtime").acceptable,
    true,
  );
  const verdict = licenceExpressionAcceptable(
    "MIT AND GPL-3.0-only",
    "Runtime",
  );
  assert.equal(
    verdict.acceptable,
    false,
    "one unacceptable conjunct blocks the whole AND expression",
  );
  assert.deepEqual(
    verdict.blockers.map((b) => b.id),
    ["GPL-3.0-only"],
    "only the failing conjunct is named — MIT is not the reason this blocks",
  );
});

test("SPDX expression evaluation: parentheses nest, mixing AND and OR correctly", () => {
  // (MIT OR Apache-2.0) AND CC0-1.0 — the brief's own nesting example.
  assert.equal(
    licenceExpressionAcceptable("(MIT OR Apache-2.0) AND CC0-1.0", "Runtime")
      .acceptable,
    true,
  );
  // Same shape, but the AND term is unacceptable — nesting must not let the
  // OR's pass leak past the AND.
  assert.equal(
    licenceExpressionAcceptable(
      "(MIT OR Apache-2.0) AND GPL-3.0-only",
      "Runtime",
    ).acceptable,
    false,
  );
});

test("SPDX expression evaluation: WITH is one identifier, not silently split into a passing term", () => {
  // GPL-2.0-only WITH Classpath-exception-2.0 is not on either allow list as
  // a whole; splitting it would let the bare "GPL-2.0-only" half be judged
  // instead (still failing here, but for the wrong reason) or, worse, let an
  // exception clause on an otherwise-permissive base licence pass unchecked.
  const verdict = licenceExpressionAcceptable(
    "GPL-2.0-only WITH Classpath-exception-2.0",
    "Development",
  );
  assert.equal(verdict.acceptable, false);
  assert.equal(verdict.blockers.length, 1);
  assert.equal(
    verdict.blockers[0].id,
    "GPL-2.0-only WITH Classpath-exception-2.0",
    "the exception clause must not be dropped from the identifier looked up",
  );
});

test("SPDX expression evaluation: an unknown identifier blocks, named in the refusal", () => {
  const verdict = licenceExpressionAcceptable("Beerware", "Development");
  assert.equal(verdict.acceptable, false);
  assert.deepEqual(verdict.blockers, [{ id: "Beerware", category: "other" }]);
});

test("SPDX expression evaluation: a non-SPDX string is reported as unparseable, quoted whole — not tokenised into a wrong identifier", () => {
  // Fix 18. 'CC BY-SA 4.0' is not valid SPDX (the identifier is
  // CC-BY-SA-4.0); a parser that splits on whitespace and stops at the
  // first token the grammar doesn't recognise would silently drop " BY-SA
  // 4.0" and name 'CC' as the blocked identifier — a licence that does not
  // exist, so a maintainer searching the allow list for it finds nothing to
  // reason about.
  const cc = licenceExpressionAcceptable("CC BY-SA 4.0", "Development");
  assert.equal(cc.acceptable, false);
  assert.deepEqual(cc.blockers, [
    { id: "CC BY-SA 4.0", category: "unparseable" },
  ]);

  // Same failure mode: a space instead of the SPDX hyphen.
  const apache = licenceExpressionAcceptable("Apache 2.0", "Development");
  assert.equal(apache.acceptable, false);
  assert.deepEqual(apache.blockers, [
    { id: "Apache 2.0", category: "unparseable" },
  ]);

  // A genuinely valid compound expression must still parse and pass.
  assert.equal(
    licenceExpressionAcceptable("(MIT OR Apache-2.0)", "Runtime").acceptable,
    true,
  );
});

test("licence policy is a visible skip, naming the reason, when not triggered", () => {
  const { findings, skips } = checkLicencePolicy(false);
  assert.deepEqual(findings, []);
  assert.equal(skips.length, 1);
  assert.match(skips[0], /dependency licence policy/);
});

test("licence policy refuses a missing register, and refuses a resolved dependency outside the allow list", () => {
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);

  // No register at all yet: refused, naming that it is missing — never
  // passed silently for lack of anything to compare against
  // (gate-6-pull-request.md: "no licence file at all is refused").
  const missing = runScript("scripts/check-licence-policy.mjs", dir);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /does not exist/);

  // A register row naming a licence outside both allow lists (strong
  // copyleft here) is refused even though the row itself is complete.
  mkdirSync(join(dir, "docs", "registers"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "registers", "dependency-licence-register.md"),
    "| Dependency | Version | Licence | Direct or transitive | Scope | Used by | Why | Decision record | Obligations | Expires | Approver |\n" +
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n" +
      "| copyleft-thing | 1.0.0 | GPL-3.0-only | Direct | Development | tooling | example | | | | |\n",
  );
  git(dir, ["add", "-A"]);
  const refused = runScript("scripts/check-licence-policy.mjs", dir);
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /copyleft-thing@1\.0\.0/);
  assert.match(refused.stderr, /GPL-3\.0-only/);

  rmSync(dir, { recursive: true, force: true });
});

test("licence policy: an unresolved version is its own finding, and the literal 'undefined' never reaches a diagnostic", () => {
  // Fix 19. Audit 7's CI: `monocart-coverage-reports@undefined carries
  // licence 'unknown'` — a failed metadata read (the version) rendered as
  // data and folded into the same sentence as a second, distinct failure
  // (the licence).
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  mkdirSync(join(dir, "docs", "registers"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "registers", "dependency-licence-register.md"),
    "| Dependency | Version | Licence | Direct or transitive | Scope | Used by | Why | Decision record | Obligations | Expires | Approver |\n" +
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n" +
      "| monocart-coverage-reports | undefined | unknown | Direct | Development | tooling | example | | | | |\n",
  );
  git(dir, ["add", "-A"]);
  const result = runScript("scripts/check-licence-policy.mjs", dir);
  assert.equal(result.status, 2);
  // The version failure is reported as its own finding, naming the field.
  assert.match(
    result.stderr,
    /monocart-coverage-reports's version could not be resolved/,
  );
  // The literal 'undefined' from the failed read never reaches another
  // diagnostic — no finding calls the dependency "...@undefined".
  assert.doesNotMatch(result.stderr, /@undefined/);
  rmSync(dir, { recursive: true, force: true });
});

test("licence policy (full pipeline): a compound SPDX expression on the runtime allow list passes — audit 6's JSONStream / type-fest regression", () => {
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  mkdirSync(join(dir, "docs", "registers"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "registers", "dependency-licence-register.md"),
    "| Dependency | Version | Licence | Direct or transitive | Scope | Used by | Why | Decision record | Obligations | Expires | Approver |\n" +
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n" +
      "| JSONStream | 1.3.5 | MIT OR Apache-2.0 | Transitive | Runtime | tooling | example | | | | |\n" +
      "| type-fest | 4.41.0 | (MIT OR CC0-1.0) | Transitive | Runtime | tooling | example | | | | |\n",
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-licence-policy.mjs", dir);
  assert.equal(
    r.status,
    0,
    "MIT is on the runtime allow list, so both compound expressions must pass",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("acceptedAdvisoryIds reads GHSA ids only from Accepted ADRs, not Proposed ones", () => {
  const dir = mkdtempSync(join(tmpdir(), "adr-"));
  writeFileSync(
    join(dir, "0001-accepted.md"),
    "---\nstatus: Accepted\n---\n\nAccepts GHSA-aaaa-bbbb-cccc.\n",
  );
  writeFileSync(
    join(dir, "0002-proposed.md"),
    "---\nstatus: Proposed\n---\n\nWould accept GHSA-dddd-eeee-ffff.\n",
  );
  const ids = acceptedAdvisoryIds(dir);
  assert.ok(
    ids.has("ghsa-aaaa-bbbb-cccc"),
    "an Accepted ADR's advisory id is read",
  );
  assert.ok(
    !ids.has("ghsa-dddd-eeee-ffff"),
    "a Proposed ADR does not yet accept anything",
  );
  rmSync(dir, { recursive: true, force: true });
});

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

const REGISTER_HEADER =
  "| Code | Scope | Justification | Removable when | Approved by |\n" +
  "| ---- | ----- | ------------- | -------------- | ----------- |\n";

// Every marker name below is built by concatenation, not written as a
// literal: this test file is itself classed `test` and scanned by the very
// check under test, so a literal marker substring here would flag this
// file's own source rather than only the scratch fixtures each test writes.
const ESLINT_DISABLE = "eslint" + "-disable";
const NOSEMGREP = "no" + "semgrep";
const SECRETLINT_DISABLE = "secretlint" + "-disable";

test("suppression check: a registered marker passes; an unregistered one is refused", () => {
  const dir = scratchRepo();
  mkdirSync(join(dir, "docs", "registers"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "registers", "suppression-register.md"),
    REGISTER_HEADER +
      "| no-console | ok.mjs | needed for the CLI banner | never | Someone |\n",
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

test("suppression check: a marker naming more than one rule is refused as broadened", () => {
  const dir = scratchRepo();
  writeFileSync(
    join(dir, "broad.mjs"),
    `// ${ESLINT_DISABLE}-next-line rule-a, rule-b\n`,
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-suppressions.mjs", dir, ["broad.mjs"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /does not name a single rule/);
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

// --- scripts/lib.mjs — normalizeSarifPaths (.github/workflows/pull-
// request.yml's SARIF upload; the Windows matrix leg's semgrep emits
// backslash paths GitHub's ingestion treats as a different file from the
// Linux leg's forward-slash ones).

function sarifWith(uri) {
  return {
    runs: [
      {
        results: [
          {
            locations: [{ physicalLocation: { artifactLocation: { uri } } }],
          },
        ],
      },
    ],
  };
}

test("normalizeSarifPaths rewrites a backslash artifact URI to forward slashes", () => {
  const dir = mkdtempSync(join(tmpdir(), "sarif-"));
  const file = join(dir, "results.sarif");
  writeFileSync(file, JSON.stringify(sarifWith("hooks\\lib\\run.mjs")));
  normalizeSarifPaths(file);
  const rewritten = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(
    rewritten.runs[0].results[0].locations[0].physicalLocation.artifactLocation
      .uri,
    "hooks/lib/run.mjs",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("normalizeSarifPaths leaves an already-forward-slash URI (the Linux leg) unchanged", () => {
  const dir = mkdtempSync(join(tmpdir(), "sarif-"));
  const file = join(dir, "results.sarif");
  writeFileSync(file, JSON.stringify(sarifWith("hooks/lib/run.mjs")));
  normalizeSarifPaths(file);
  const rewritten = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(
    rewritten.runs[0].results[0].locations[0].physicalLocation.artifactLocation
      .uri,
    "hooks/lib/run.mjs",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("normalizeSarifPaths does not throw when the SARIF file is missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "sarif-"));
  assert.doesNotThrow(() =>
    normalizeSarifPaths(join(dir, "does-not-exist.sarif")),
  );
  rmSync(dir, { recursive: true, force: true });
});

// --- scripts/check-refusal-proofs.mjs — fix 9a, the refusal-proof contract
// (docs/standards/guardrails/cross-gate-rules.md, "Every blocking check
// proves it refuses"). Only the pure classification rule and a fast,
// file-content regression guard run here: the full registry
// (scripts/check-refusal-proofs.mjs's own CLI) shells out to semgrep, cspell
// and markdownlint-cli2 and takes upward of twenty seconds — appropriate for
// gate 7 and the weekly CI audit this is deliberately NOT wired into per
// commit (the standard's own rule), wrong for hooks/test/hooks.test.mjs,
// which runs on every commit that touches hooks/. That full run was verified
// by hand: `node scripts/check-refusal-proofs.mjs` reported all eight
// fixtured checks as `refuses` and exited 0.

test("classifyFixtureResult: the three-state contract itself", () => {
  assert.equal(
    classifyFixtureResult(true),
    "refuses",
    "a fixture the check blocked",
  );
  assert.equal(
    classifyFixtureResult(false),
    "does-not-refuse",
    "a fixture the check passed anyway — decorative, a finding",
  );
  assert.equal(
    classifyFixtureResult(null),
    "no-fixture",
    "the fixture could not be run at all — unverified, never a pass",
  );
});

test("regression guard: .lintstagedrc.json's cspell invocation uses a flag cspell actually recognises", () => {
  // The exact bug fix 9a's own audit found while writing this contract:
  // cspell's CLI is commander-based, and an unrecognised flag
  // (`--no-must-find-file`, missing the plural) prints "unknown option" and
  // still exits 0 — the check never scans anything and reads as a pass. This
  // is the third failure shape cross-gate-rules.md names by name ("the tool
  // silently examines nothing and reports success"), found in this
  // repository's own lint-staged config, not merely a hypothetical.
  //
  // Both keys are checked, not just Markdown (fix 15) — gate-2-commit.md
  // requires spelling on "the file's own vocabulary", with no file-type
  // restriction, and a checker that only ever read Markdown would answer
  // "is spelling enforced?" with a confident yes while never opening a
  // .ts/.mjs file.
  const config = JSON.parse(
    readFileSync(join(ROOT, ".lintstagedrc.json"), "utf8"),
  );
  for (const key of [
    "*.{md,mdx}",
    "*.{js,mjs,cjs,ts,tsx,json,jsonc,yml,yaml}",
  ]) {
    const spellCmd = config[key].find((c) => c.includes("cspell"));
    assert.ok(spellCmd, `${key} has no cspell invocation`);
    assert.match(spellCmd, /--no-must-find-files\b/);
    assert.doesNotMatch(
      spellCmd,
      /--no-must-find-file\b/,
      "the singular form is not a real cspell flag and is silently ignored, not enforced",
    );
  }
});

test("cspell actually reads code files, not only Markdown — a misspelling in a .mjs comment and in a user-facing string are both flagged", () => {
  // Fix 15. Runs the exact cspell invocation .lintstagedrc.json's code-glob
  // key now uses, against a scratch file, to prove the check reads .mjs
  // content rather than only ever being wired to Markdown. This is the
  // functional counterpart to the config-shape regression guard above. The
  // repository's own cspell binary is invoked directly, cwd set to the
  // fixture's own directory (a relative file argument, exactly what
  // lint-staged passes) — the same cross-platform `run()` the hooks
  // themselves use to reach a `.cmd` shim on Windows (hooks/lib/run.mjs).
  const dir = scratchRepo();
  writeFileSync(
    join(dir, "fixture.mjs"),
    "// a deliberatemisspelling in a comment\n" +
      'export const message = "a nother deliberatemisspelling in a user-facing string";\n',
  );
  const config = JSON.parse(
    readFileSync(join(ROOT, ".lintstagedrc.json"), "utf8"),
  );
  const spellCmd = config["*.{js,mjs,cjs,ts,tsx,json,jsonc,yml,yaml}"].find(
    (c) => c.includes("cspell"),
  );
  const [, ...cspellArgs] = spellCmd.split(" "); // drop the leading "cspell"
  const r = run(
    join(ROOT, "node_modules", ".bin", "cspell"),
    [...cspellArgs, "fixture.mjs"],
    { cwd: dir, env: CLEAN_ENV },
  );
  assert.notEqual(
    r.status,
    0,
    "a misspelling in a code file's comment and string must be refused, not silently passed",
  );
  assert.match((r.stdout || "") + (r.stderr || ""), /deliberatemisspelling/);
  rmSync(dir, { recursive: true, force: true });
});

// --- scripts/lib.mjs:classifyTestCoverageOutcome — fix 11. gate-5-push.md:
// "A broken coverage command blocks the push without claiming a shortfall."
// The combined `c8 --check-coverage ... node --test ...` command exits
// non-zero for three different reasons; these are real captured output
// shapes from each (node --test's own TAP/spec summary line, c8's own
// threshold message, and a command that never got that far), not
// hypothetical fixtures.

test("classifyTestCoverageOutcome: a failing unit test is named as a test failure, not folded into coverage", () => {
  const output =
    "✖ a failing test (1.2ms)\nℹ tests 1\nℹ suites 0\nℹ pass 0\nℹ fail 1\n" +
    "ℹ cancelled 0\nℹ skipped 0\nℹ todo 0\n" +
    "----------|---------|----------|---------|---------|-------------------\n" +
    "All files |       0 |        0 |       0 |       0 |                   \n";
  const outcome = classifyTestCoverageOutcome(output);
  assert.equal(outcome.kind, "test-failure");
  assert.match(outcome.detail, /1 unit test\(s\) failed/);
});

test("classifyTestCoverageOutcome: a genuine coverage shortfall is named as coverage, with the actual percentages", () => {
  const output =
    "✔ a passing test (0.6ms)\nℹ tests 1\nℹ suites 0\nℹ pass 1\nℹ fail 0\n" +
    "ℹ cancelled 0\nℹ skipped 0\nℹ todo 0\n" +
    "ERROR: Coverage for lines (67.33%) does not meet global threshold (99.9%)\n";
  const outcome = classifyTestCoverageOutcome(output);
  assert.equal(outcome.kind, "coverage-shortfall");
  assert.match(outcome.detail, /67\.33%.*99\.9%/s);
});

test("classifyTestCoverageOutcome: a command that never ran (neither summary present) is its own outcome, not a guessed shortfall", () => {
  // The real shape of `c8 ... node --test nonexistent.mjs`: neither node:test's
  // summary nor c8's threshold message ever prints, because node --test itself
  // errored out before producing either.
  const output =
    "Could not find 'hooks/test/nonexistent.mjs'\n" +
    "----------|---------|----------|---------|---------|-------------------\n" +
    "All files |       0 |        0 |       0 |       0 |                   \n";
  const outcome = classifyTestCoverageOutcome(output);
  assert.equal(outcome.kind, "broken-command");
  assert.doesNotMatch(
    outcome.detail,
    /shortfall|below the .* floor|%/,
    "must not claim a coverage shortfall when the command never ran to completion",
  );
});

// --- scripts/check-osv-scanner.mjs — fix 9b. osv-scanner is external,
// PATH-resolved and never bundled (ADR-0002), exactly like semgrep and
// lizard, and it is not installed on this host — which is the point: most
// consumers hit the skip path before they ever install the tool, so that is
// what this test exercises for real, not a mocked absence.
test("osv-scanner check is a visible skip, naming the tool, when it is not on PATH", () => {
  const { findings, skips } = checkOsvScanner();
  assert.deepEqual(
    findings,
    [],
    "an unavailable tool must never read as a passing scan",
  );
  assert.equal(skips.length, 1);
  assert.match(skips[0], /osv-scanner/);
  assert.match(skips[0], /not on PATH/);
});

test("quality-script wiring: every script in this repository's own package.json is accounted for — wired or declared on-demand, nothing unwired", () => {
  // Fix 16. Runs against the real manifest and the real gate/hook source, not
  // a fixture — the whole point is that THIS repository's own scripts are
  // fully accounted for right now. `spell` is wired here specifically
  // because fix 15 extended cspell to the code glob; before that fix this
  // same assertion would have put `spell` in `unwired`.
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
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
  // A synthetic manifest entry standing in for the exact defect fix 16
  // closes: a script added to package.json that nothing invokes and nobody
  // declared on-demand. checkScriptWiring must not silently pass it.
  const { wired, onDemand, unwired } = checkScriptWiring({
    typecheck: "tsc --noEmit --strict",
  });
  assert.deepEqual(wired, []);
  assert.deepEqual(onDemand, []);
  assert.equal(unwired.length, 1);
  assert.match(unwired[0], /typecheck/);
  assert.match(unwired[0], /no gate.*invokes it/);
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
  assert.match(unwired[0], /lint/);
  assert.match(unwired[0], /drifted/);
});
