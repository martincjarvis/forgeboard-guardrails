// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis
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
  readdirSync,
  existsSync,
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
  checkLicencePolicy,
  licenceExpressionAcceptable,
  leafVerdict,
  compatible,
  evaluateRegisterRow,
} from "../../scripts/check-licence-policy.mjs";
import { missingLicenceTableEntries } from "../../scripts/check-licence.mjs";
import { LICENCE_TABLE, isPermissive } from "../../scripts/licence-table.mjs";
import {
  checkSuppressions,
  evaluateRegisterRows,
  pendingSuppressionApprovals,
  unapprovedSuppressionFindings,
} from "../../scripts/check-suppressions.mjs";
import {
  normalizeSarifPaths,
  filterSuppressedSarif,
  classifyTestCoverageOutcome,
  extractCoverageAndTestSummary,
  classifyDiffCoverOutcome,
  classifyOsvScannerOutcome,
  extractOsvJsonFindings,
  extractOsvSarifFindings,
} from "../../scripts/lib.mjs";
import { checkOsvScanner } from "../../scripts/check-osv-scanner.mjs";
import {
  deriveRequiredContexts,
  evaluateBranchProtection,
  checkBranchProtection,
} from "../../scripts/check-branch-protection.mjs";
import {
  evaluateRepositoryFeatures,
  checkRepositoryFeatures,
} from "../../scripts/check-repository-features.mjs";
import {
  checkAdrApprover,
  acceptsRiskLicenceSuppressionOrOptOut,
  looksLikeTeamLabel,
} from "../../scripts/check-adr-approver.mjs";
import {
  checkScriptWiring,
  checkScriptFileWiring,
  checkIndexGateClaims,
} from "../../scripts/check-script-wiring.mjs";
import { checkLicenceTableReferences } from "../../scripts/check-licence-table.mjs";
import {
  deriveStackList,
  findStackReferencesOutsideList,
  findMultiComponentContent,
} from "../../scripts/check-standards-instantiation.mjs";
import { run, have } from "../lib/run.mjs";
import { classifyFixtureResult } from "../../scripts/check-refusal-proofs.mjs";
import {
  findGateScripts,
  checkToolingClassDeclared,
  complexityScanFiles,
  coveredFilesFromCobertura,
  toolingLeakage,
  checkToolingCoverageLeakage,
  checkToolingTestSuiteExists,
} from "../../scripts/check-tooling-class.mjs";
import {
  isAdrPath,
  isRegisterPath,
  parseRegisterRows,
  newlyApprovedAdrFinding,
  newlyApprovedRegisterRowFindings,
  checkApprovalProvenanceStaged,
  checkApprovalProvenanceRange,
} from "../../scripts/check-approval-provenance.mjs";

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

  const clean = run(
    "npx",
    ["eslint", "--no-config-lookup", "--rule", "no-var:warn", "warn.mjs"],
    { cwd: dir },
  );
  assert.equal(
    clean.status,
    0,
    "a warn-severity rule alone must not fail the run — otherwise this is not testing --max-warnings",
  );

  const gated = run(
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
    { cwd: dir },
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

// --- scripts/licence-table.mjs and scripts/check-licence-policy.mjs — gate
// 6 check 7 (fix brief 6: a per-licence table, not two enumerated allow
// lists — docs/standards/guardrails/gate-6-pull-request.md's "Licence
// policy: a table, not two allow lists").

test("isPermissive is derived from recorded conditions, not asserted — Artistic-2.0's source-disclosure condition makes it non-permissive despite being OSI-approved", () => {
  assert.equal(isPermissive(LICENCE_TABLE["MIT"]), true);
  assert.equal(
    isPermissive(LICENCE_TABLE["Artistic-2.0"]),
    false,
    "Artistic-2.0 requires a modified version's source to be made available — checked against the OSI text directly, not assumed from OSI-approval alone",
  );
  assert.equal(
    isPermissive(LICENCE_TABLE["CC-BY-SA-4.0"]),
    false,
    "share-alike is one of the three disqualifying conditions",
  );
});

test("leafVerdict: OSI-approved and permissive passes regardless of scope or a declared repository licence", () => {
  assert.equal(leafVerdict("MIT", "Runtime", null).acceptable, true);
  assert.equal(
    leafVerdict("MIT", "Development", "GPL-3.0-only").acceptable,
    true,
  );
});

test("leafVerdict: a licence with no table entry blocks and names that as the reason, distinct from failing the decision rule", () => {
  const v = leafVerdict("GPL-3.0-only", "Development", null);
  assert.equal(v.acceptable, false);
  assert.equal(
    v.reason,
    "no-table-entry",
    "GPL-3.0-only is not in scripts/licence-table.mjs — a coverage gap, not a policy failure",
  );
});

test("leafVerdict: not OSI-approved blocks even when the licence's own conditions alone would read as permissive", () => {
  // WTFPL imposes no conditions at all — permissive by conditions — but is
  // absent from opensource.org's approved list (verified 2026-07-30, not
  // assumed from its reputation as an extremely permissive licence).
  assert.equal(isPermissive(LICENCE_TABLE["WTFPL"]), true);
  assert.equal(LICENCE_TABLE["WTFPL"].osiApproved, false);
  const v = leafVerdict("WTFPL", "Development", null);
  assert.equal(v.acceptable, false);
  assert.equal(v.reason, "not-compatible");
});

test("compatible(): the relation is evaluated against the repository's own licence, not a membership test — the same dependency passes with no declared repository licence and blocks against one that conflicts", () => {
  // gate-6-pull-request.md's own verification checkpoint: "The same
  // dependency passes in a repository with no declared licence and blocks
  // in one whose licence conflicts — proving the relation is evaluated, not
  // a membership test." Artistic-2.0 (OSI-approved, source-disclosure) at
  // Runtime scope is the worked case: nothing to conflict with when no
  // licence is declared, blocked against a repository that is MIT
  // (permissive, carries no source-disclosure condition of its own to
  // match), passing again against a repository that is itself Artistic-2.0.
  const artistic = LICENCE_TABLE["Artistic-2.0"];
  assert.equal(
    compatible(artistic, "Runtime", null),
    true,
    "no repository licence declared — nothing recorded to conflict with",
  );
  assert.equal(
    compatible(artistic, "Runtime", "MIT"),
    false,
    "MIT does not itself require source disclosure — the condition conflicts",
  );
  assert.equal(
    compatible(artistic, "Runtime", "Artistic-2.0"),
    true,
    "the repository carries the same condition — same-family, not a conflict",
  );
});

test("compatible(): a non-permissive licence that never ships has nothing downstream to conflict with, at any declared repository licence", () => {
  const artistic = LICENCE_TABLE["Artistic-2.0"];
  assert.equal(compatible(artistic, "Development", "MIT"), true);
});

test("SPDX expression evaluation: OR passes if any disjunct is acceptable — audit 6's JSONStream / type-fest regression, MIT OR Apache-2.0 and (MIT OR CC0-1.0)", () => {
  assert.equal(
    licenceExpressionAcceptable("MIT OR Apache-2.0", "Runtime", null)
      .acceptable,
    true,
  );
  // CC0-1.0 alone is not OSI-approved, but the OR passes via MIT.
  assert.equal(
    licenceExpressionAcceptable("(MIT OR CC0-1.0)", "Runtime", null).acceptable,
    true,
  );
  // Both disjuncts unacceptable: blocked, and the refusal names both.
  const blocked = licenceExpressionAcceptable(
    "GPL-3.0-only OR AGPL-3.0-only",
    "Runtime",
    null,
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
    licenceExpressionAcceptable("MIT AND Apache-2.0", "Runtime", null)
      .acceptable,
    true,
  );
  const verdict = licenceExpressionAcceptable(
    "MIT AND GPL-3.0-only",
    "Runtime",
    null,
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
    licenceExpressionAcceptable(
      "(MIT OR Apache-2.0) AND CC0-1.0",
      "Runtime",
      null,
    ).acceptable,
    false,
    "CC0-1.0 is not OSI-approved, so the AND's second conjunct fails even though the OR passes",
  );
  assert.equal(
    licenceExpressionAcceptable("(MIT OR Apache-2.0) AND MIT", "Runtime", null)
      .acceptable,
    true,
  );
});

test("SPDX expression evaluation: WITH is one identifier, not silently split into a passing term", () => {
  // GPL-2.0-only WITH Classpath-exception-2.0 is not in the table as a
  // whole; splitting it would let the bare "GPL-2.0-only" half be judged
  // instead (still failing here, but for the wrong reason) or, worse, let an
  // exception clause on an otherwise-permissive base licence pass unchecked.
  const verdict = licenceExpressionAcceptable(
    "GPL-2.0-only WITH Classpath-exception-2.0",
    "Development",
    null,
  );
  assert.equal(verdict.acceptable, false);
  assert.equal(verdict.blockers.length, 1);
  assert.equal(
    verdict.blockers[0].id,
    "GPL-2.0-only WITH Classpath-exception-2.0",
    "the exception clause must not be dropped from the identifier looked up",
  );
});

test("SPDX expression evaluation: an identifier with no table entry blocks, named in the refusal", () => {
  const verdict = licenceExpressionAcceptable("Beerware", "Development", null);
  assert.equal(verdict.acceptable, false);
  assert.deepEqual(verdict.blockers, [
    { id: "Beerware", reason: "no-table-entry" },
  ]);
});

test("SPDX expression evaluation: a non-SPDX string is reported as unparseable, quoted whole — not tokenised into a wrong identifier", () => {
  // Fix 18. A space instead of the SPDX hyphen ('Apache 2.0' rather than
  // 'Apache-2.0') tokenises into two identifier-shaped words with no
  // operator between them; a parser that stops at the first token the
  // grammar doesn't recognise would silently drop the rest and name '2.0' or
  // 'Apache' as the blocked identifier — a licence that does not exist, so a
  // maintainer searching the table for it finds nothing to reason about.
  // This repository's own register cell for this exact shape ('CC BY-SA
  // 4.0') was corrected to the real SPDX identifier (CC-BY-SA-4.0) rather
  // than worked around here — the fix is the register entry, not the parser.
  const apache = licenceExpressionAcceptable("Apache 2.0", "Development", null);
  assert.equal(apache.acceptable, false);
  assert.deepEqual(apache.blockers, [
    { id: "Apache 2.0", reason: "unparseable" },
  ]);

  // A genuinely valid compound expression must still parse and pass.
  assert.equal(
    licenceExpressionAcceptable("(MIT OR Apache-2.0)", "Runtime", null)
      .acceptable,
    true,
  );
});

// --- scripts/check-licence.mjs — gate 2 check 16 (completeness), extended
// by fix brief 6 to also flag a licence with no scripts/licence-table.mjs
// entry: "a licence in the resolved set with no table entry is a finding at
// gates 2 and 6" (gate-6-pull-request.md), so a coverage gap is caught the
// moment the dependency arrives, not only when gate 6 later judges it.

test("missingLicenceTableEntries: a row citing a tabled licence raises nothing; one citing a licence with no table entry names it once, even if several rows share it", () => {
  const rows = [
    { dep: "a", version: "1.0.0", licence: "MIT" },
    { dep: "b", version: "1.0.0", licence: "GPL-3.0-only" },
    { dep: "c", version: "2.0.0", licence: "GPL-3.0-only" },
  ];
  const findings = missingLicenceTableEntries(rows);
  assert.equal(
    findings.length,
    1,
    "the same untabled licence is named once, not once per row",
  );
  assert.match(findings[0].problem, /'GPL-3\.0-only'/);
});

test("missingLicenceTableEntries: a compound expression's leaf with no table entry is named; the tabled leaf is not", () => {
  const findings = missingLicenceTableEntries([
    { dep: "a", version: "1.0.0", licence: "MIT OR GPL-3.0-only" },
  ]);
  assert.equal(findings.length, 1);
  assert.match(findings[0].problem, /GPL-3\.0-only/);
  assert.doesNotMatch(findings[0].problem, /'MIT'/);
});

test("missingLicenceTableEntries: a blank or unknown licence is left to the policy check's own finding, not duplicated here", () => {
  assert.deepEqual(
    missingLicenceTableEntries([
      { dep: "a", version: "1.0.0", licence: "" },
      { dep: "b", version: "1.0.0", licence: "unknown" },
    ]),
    [],
  );
});

test("checkLicenceCompleteness (end to end): a resolved dependency with no register row AND a register row whose licence has no table entry are both reported when the lock file is in scope", () => {
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "scratch", private: true, type: "module" }) + "\n",
  );
  writeFileSync(
    join(dir, "package-lock.json"),
    JSON.stringify({ name: "scratch", lockfileVersion: 3 }) + "\n",
  );
  mkdirSync(join(dir, "docs", "registers"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "registers", "dependency-licence-register.md"),
    "| Dependency | Version | Licence | Direct or transitive | Scope | Used by | Why | Decision record | Obligations | Expires | Approver |\n" +
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n" +
      "| copyleft-thing | 1.0.0 | GPL-3.0-only | Direct | Development | tooling | example | | | | |\n",
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-licence.mjs", dir, ["package-lock.json"]);
  assert.equal(r.status, 2);
  assert.match(
    r.stderr,
    /'GPL-3\.0-only'.*has no entry in scripts\/licence-table\.mjs/,
    "the table-entry gap is caught at gate 2, not only when gate 6 later judges the same row",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("licence policy is a visible skip, naming the reason, when not triggered", () => {
  const { findings, skips } = checkLicencePolicy(false);
  assert.deepEqual(findings, []);
  assert.equal(skips.length, 1);
  assert.match(skips[0], /dependency licence policy/);
});

test("licence policy refuses a missing register, and refuses a resolved dependency whose licence has no table entry", () => {
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);

  // No register at all yet: refused, naming that it is missing — never
  // passed silently for lack of anything to compare against
  // (gate-6-pull-request.md: "no licence file at all is refused").
  const missing = runScript("scripts/check-licence-policy.mjs", dir);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /does not exist/);

  // A register row naming a licence with no table entry (strong copyleft,
  // never added to scripts/licence-table.mjs) is refused even though the
  // row itself is complete.
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
  assert.match(refused.stderr, /has no entry in scripts\/licence-table\.mjs/);

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

test("licence policy (full pipeline): a compound SPDX expression passes when at least one disjunct is OSI-approved and compatible — audit 6's JSONStream / type-fest regression", () => {
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
    "MIT passes on its own; CC0-1.0 does not need to (it is not OSI-approved), because the OR only needs one",
  );
  rmSync(dir, { recursive: true, force: true });
});

// --- fix brief 6 — a register row whose licence does not pass the decision
// rule on its own is not blocked forever: a human can accept THIS
// dependency specifically, recorded on THIS row's own Decision record and
// Approver columns (registers.md's existing columns; there is no separate
// code-level allow list left to extend — see check-licence-policy.mjs's own
// header comment for why fix 26's RUNTIME_ALLOW_EXTENSIONS mechanism this
// replaces no longer applies once "permissive" is derived data instead of a
// list membership).

test("evaluateRegisterRow: a licence that fails the decision rule blocks when the row's Decision record and Approver are blank", () => {
  const findings = evaluateRegisterRow(
    {
      dep: "gnarly-thing",
      version: "1.0.0",
      licence: "WTFPL", // has a table entry, but is not OSI-approved
      scope: "Development",
      decisionRecord: "",
      approver: "",
    },
    null,
  );
  assert.equal(findings.length, 1);
  assert.match(findings[0].problem, /gnarly-thing@1\.0\.0/);
  assert.match(findings[0].problem, /WTFPL/);
  assert.match(
    findings[0].remedy,
    /Decision record column and the person in Approver/,
  );
});

test("evaluateRegisterRow: the same row passes once a human has recorded a Decision record and named an Approver", () => {
  const findings = evaluateRegisterRow(
    {
      dep: "gnarly-thing",
      version: "1.0.0",
      licence: "WTFPL",
      scope: "Development",
      decisionRecord: "docs/ADR/0099-test-fixture.md",
      approver: "Pat",
    },
    null,
  );
  assert.deepEqual(
    findings,
    [],
    "a human accepted this specific dependency — recorded on the row, not a code-level allow-list edit",
  );
});

test("evaluateRegisterRow: a licence that passes the decision rule on its own needs neither column filled in", () => {
  const findings = evaluateRegisterRow(
    {
      dep: "ordinary-thing",
      version: "1.0.0",
      licence: "MIT",
      scope: "Runtime",
      decisionRecord: "",
      approver: "",
    },
    null,
  );
  assert.deepEqual(
    findings,
    [],
    "MIT passes the decision rule outright — no human decision to cite",
  );
});

test("evaluateRegisterRow: a licence absent from the table blocks and asks for an entry, and is not answerable by a Decision record alone", () => {
  // Distinct from the "fails the decision rule" case above: nobody can
  // accept a licence the table has never classified, because there is
  // nothing recorded to accept yet.
  const findings = evaluateRegisterRow(
    {
      dep: "mystery-thing",
      version: "1.0.0",
      licence: "Zlib",
      scope: "Development",
      decisionRecord: "docs/ADR/0099-test-fixture.md",
      approver: "Pat",
    },
    null,
  );
  assert.equal(findings.length, 1);
  assert.match(
    findings[0].problem,
    /has no entry in scripts\/licence-table\.mjs/,
  );
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

// --- scripts/check-adr-approver.mjs — fix 22. Audit 8's exact mechanism:
// an agent accepts a licence outside the allow list through an ADR rather
// than a register row, because the ADR schema (docs/ADR/README.md) has no
// approver column at all — `status: Accepted`, `owner: greet maintainers`
// (a team label, not a person), ten previously-blocking licence findings
// cleared, and no gate in the corpus refused it.

test("checkAdrApprover refuses an Accepted ADR that reads as a licence exception with no approver field", () => {
  const dir = mkdtempSync(join(tmpdir(), "adr-approver-"));
  writeFileSync(
    join(dir, "0007-development-licence-allowances.md"),
    "---\nstatus: Accepted\ndecided: 2026-07-29\nowner: greet maintainers\n---\n\n" +
      "Extends the development licence allow list to accept BSD-4-Clause.\n",
  );
  const findings = checkAdrApprover(dir);
  assert.equal(findings.length, 1);
  assert.match(findings[0].problem, /no approver field/);
  rmSync(dir, { recursive: true, force: true });
});

test("checkAdrApprover refuses an Accepted ADR whose approver is a team label, not a person", () => {
  const dir = mkdtempSync(join(tmpdir(), "adr-approver-"));
  writeFileSync(
    join(dir, "0007-development-licence-allowances.md"),
    "---\nstatus: Accepted\napprover: greet maintainers\n---\n\n" +
      "Extends the runtime licence allow list.\n",
  );
  const findings = checkAdrApprover(dir);
  assert.equal(findings.length, 1);
  assert.match(findings[0].problem, /team label, not a person/);
  rmSync(dir, { recursive: true, force: true });
});

test("checkAdrApprover passes an Accepted licence-exception ADR once a human approver is named", () => {
  const dir = mkdtempSync(join(tmpdir(), "adr-approver-"));
  writeFileSync(
    join(dir, "0007-development-licence-allowances.md"),
    "---\nstatus: Accepted\napprover: Jane Rivera\n---\n\n" +
      "Extends the runtime licence allow list.\n",
  );
  assert.deepEqual(checkAdrApprover(dir), []);
  rmSync(dir, { recursive: true, force: true });
});

test("checkAdrApprover leaves an ordinary design ADR alone — no risk, licence, suppression or opt-out language, no approver required", () => {
  const dir = mkdtempSync(join(tmpdir(), "adr-approver-"));
  writeFileSync(
    join(dir, "0001-design-choice.md"),
    "---\nstatus: Accepted\nowner: Toolkit maintainers\n---\n\n" +
      "Versions are derived per component from Conventional Commits.\n",
  );
  assert.deepEqual(checkAdrApprover(dir), []);
  rmSync(dir, { recursive: true, force: true });
});

test("checkAdrApprover leaves a Proposed ADR alone — status: Proposed is the honest, freely editable route", () => {
  const dir = mkdtempSync(join(tmpdir(), "adr-approver-"));
  writeFileSync(
    join(dir, "0007-development-licence-allowances.md"),
    "---\nstatus: Proposed\n---\n\nWould extend the runtime licence allow list.\n",
  );
  assert.deepEqual(checkAdrApprover(dir), []);
  rmSync(dir, { recursive: true, force: true });
});

test("checkAdrApprover: an advisory acceptance (GHSA id) and a suppression opt-out are both detected as needing a human approver", () => {
  const dir = mkdtempSync(join(tmpdir(), "adr-approver-"));
  writeFileSync(
    join(dir, "0008-accept-advisory.md"),
    "---\nstatus: Accepted\n---\n\nAccepts GHSA-aaaa-bbbb-cccc for now.\n",
  );
  writeFileSync(
    join(dir, "0009-opt-out.md"),
    "---\nstatus: Accepted\n---\n\nThis repository opts out of the check entirely.\n",
  );
  const findings = checkAdrApprover(dir);
  assert.equal(findings.length, 2);
  rmSync(dir, { recursive: true, force: true });
});

test("acceptsRiskLicenceSuppressionOrOptOut: an ordinary design decision is not mistaken for one of the four reserved classes", () => {
  assert.ok(
    !acceptsRiskLicenceSuppressionOrOptOut(
      "This toolkit bundles no analysis tools; a consuming repository installs them.",
    ),
  );
});

test("looksLikeTeamLabel: a plausible individual name is not flagged as a team label", () => {
  assert.ok(!looksLikeTeamLabel("Jane Rivera"));
  assert.ok(looksLikeTeamLabel(""));
  assert.ok(looksLikeTeamLabel("Platform team"));
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

// --- scripts/lib.mjs — filterSuppressedSarif (fix 25). semgrep's SARIF
// includes a finding suppressed in source rather than omitting it, marked
// `suppressions: [{ kind: "inSource" }]`; GitHub's code-scanning check
// treats every result in the uploaded file as a candidate new alert, so an
// already-registered suppression turns the pull request red on the
// platform even though gate 6's own check honours it and exits 0.

function sarifWithResults(results) {
  return { runs: [{ results }] };
}

test("filterSuppressedSarif drops a result marked suppressed inSource", () => {
  const dir = mkdtempSync(join(tmpdir(), "sarif-"));
  const file = join(dir, "results.sarif");
  writeFileSync(
    file,
    JSON.stringify(
      sarifWithResults([
        { ruleId: "no-eval", suppressions: [{ kind: "inSource" }] },
      ]),
    ),
  );
  filterSuppressedSarif(file);
  const filtered = JSON.parse(readFileSync(file, "utf8"));
  assert.deepEqual(
    filtered.runs[0].results,
    [],
    "a result suppressed inSource must not reach the uploaded SARIF",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("filterSuppressedSarif keeps an unsuppressed result alongside a suppressed one", () => {
  const dir = mkdtempSync(join(tmpdir(), "sarif-"));
  const file = join(dir, "results.sarif");
  writeFileSync(
    file,
    JSON.stringify(
      sarifWithResults([
        { ruleId: "no-eval", suppressions: [{ kind: "inSource" }] },
        { ruleId: "no-eval-2" },
      ]),
    ),
  );
  filterSuppressedSarif(file);
  const filtered = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(filtered.runs[0].results.length, 1);
  assert.equal(filtered.runs[0].results[0].ruleId, "no-eval-2");
  rmSync(dir, { recursive: true, force: true });
});

test("filterSuppressedSarif does not throw when the SARIF file is missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "sarif-"));
  assert.doesNotThrow(() =>
    filterSuppressedSarif(join(dir, "does-not-exist.sarif")),
  );
  rmSync(dir, { recursive: true, force: true });
});

// End-to-end reproduction of the actual audit-8 mechanism: a real semgrep
// run against a local rule file (no `--config auto` — no network needed,
// same reasoning refuseSemgrepFixture avoids it for a scratch repository),
// one finding carrying a same-line in-source suppression marker and one
// without. Proves the suppressed finding is present in semgrep's own SARIF
// (what GitHub's code-scanning check would otherwise alert on) and absent
// after filterSuppressedSarif runs — the exact fix, not a re-implementation
// of it. The marker itself is assembled from NOSEMGREP (declared below),
// not typed as a contiguous literal here — this file's own gate 2 suppression
// check would otherwise read this fixture string as an unregistered
// directive of its own.
test("fix 25: a finding suppressed in source is present in raw semgrep SARIF and absent after filtering", () => {
  if (!have("semgrep", ["--version"])) return; // no fixture — semgrep unavailable here
  const dir = mkdtempSync(join(tmpdir(), "semgrep-suppress-"));
  writeFileSync(
    join(dir, "rule.yaml"),
    "rules:\n" +
      "  - id: no-eval\n" +
      "    languages: [python]\n" +
      "    severity: ERROR\n" +
      "    message: eval() is dangerous\n" +
      "    pattern: eval(...)\n",
  );
  writeFileSync(
    join(dir, "bad.py"),
    `x = eval(user_input)  # ${NOSEMGREP}: no-eval\n` +
      "y = eval(other_input)\n",
  );
  const sarif = join(dir, "results.sarif");
  run(
    "semgrep",
    ["--config", "rule.yaml", "--sarif", "--output", "results.sarif", "bad.py"],
    { cwd: dir, env: { ...process.env, PYTHONUTF8: "1" } },
  );
  const raw = JSON.parse(readFileSync(sarif, "utf8"));
  assert.equal(
    raw.runs[0].results.length,
    2,
    "semgrep's own SARIF must still carry both findings, suppressed and not",
  );
  assert.ok(
    raw.runs[0].results.some((r) =>
      (r.suppressions ?? []).some((s) => s.kind === "inSource"),
    ),
    "the marked line must be present, marked suppressed inSource",
  );
  filterSuppressedSarif(sarif);
  const filtered = JSON.parse(readFileSync(sarif, "utf8"));
  assert.equal(
    filtered.runs[0].results.length,
    1,
    "only the unsuppressed finding survives filtering",
  );
  assert.ok(
    !(filtered.runs[0].results[0].suppressions ?? []).some(
      (s) => s.kind === "inSource",
    ),
  );
  rmSync(dir, { recursive: true, force: true });
});

// Fix 30 (cross-gate-rules.md, "A suppression is verified at repository
// scope, never at the scope of the file just edited") — the exact mechanism
// behind the defect: fix 21 verified its suppression with `semgrep --config
// auto --error hooks/lib/run.mjs`, reported "3 findings before, 0 after",
// and was silent about two live, unmarked findings of the same rule already
// sitting in hooks/test/hooks.test.mjs (fix 29) — a repository-scope run
// would have caught them there and then. This reproduces the shape
// generically, independent of what today's tree happens to contain: one
// file carries the pattern with an in-source suppression (what "the file
// just edited" looks like clean), a sibling file carries the same pattern
// with none (what a repository-scope run, and only a repository-scope run,
// still catches).
test("fix 30: a file-scoped semgrep check reads clean while a sibling file's unsuppressed occurrence of the same rule only surfaces at repository scope", () => {
  if (!have("semgrep", ["--version"])) return; // no fixture — semgrep unavailable here
  const dir = mkdtempSync(join(tmpdir(), "semgrep-scope-"));
  writeFileSync(
    join(dir, "rule.yaml"),
    "rules:\n" +
      "  - id: no-eval\n" +
      "    languages: [python]\n" +
      "    severity: ERROR\n" +
      "    message: eval() is dangerous\n" +
      "    pattern: eval(...)\n",
  );
  // The file actually touched by the fix: the pattern is present but
  // suppressed — the same in-source marker fix 25's fixture above uses.
  writeFileSync(
    join(dir, "edited.py"),
    `x = eval(user_input)  # ${NOSEMGREP}: no-eval\n`,
  );
  // A sibling nobody re-checked: the same rule, no marker — the exact shape
  // of the two spawn-shell-true sites fix 21's file-scoped check never saw.
  writeFileSync(join(dir, "sibling.py"), "y = eval(other_input)\n");

  const fileScoped = run(
    "semgrep",
    ["--config", "rule.yaml", "--quiet", "--error", "edited.py"],
    { cwd: dir, env: { ...process.env, PYTHONUTF8: "1" } },
  );
  assert.equal(
    fileScoped.status,
    0,
    "a check scoped to only the edited file must read clean here — this is the false confidence the rule closes",
  );

  const repoScoped = run(
    "semgrep",
    ["--config", "rule.yaml", "--quiet", "--error", "."],
    { cwd: dir, env: { ...process.env, PYTHONUTF8: "1" } },
  );
  assert.notEqual(
    repoScoped.status,
    0,
    "a repository-scope check must refuse on the sibling's unsuppressed occurrence — the same scope gate 7's own semgrep sweep (scripts/gate-7-on-demand.mjs) already runs",
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

// extractCoverageAndTestSummary — fix brief 8, item 1: "coverage legible
// without a download" needs the test counts and the coverage percentage on
// the run's own page whether the run passed or failed, so
// scripts/gate-6-pull-request.mjs reads them from the same command output
// classifyTestCoverageOutcome above already parses, rather than a second,
// divergent source.

test("extractCoverageAndTestSummary reads the test counts and lines-coverage percentage from a passing run's real output shape", () => {
  const output =
    "✔ a passing test (0.6ms)\nℹ tests 132\nℹ suites 0\nℹ pass 132\nℹ fail 0\n" +
    "ℹ cancelled 0\nℹ skipped 0\nℹ todo 0\n" +
    "----------|---------|----------|---------|---------|-------------------\n" +
    "All files |   80.44 |    73.54 |   85.81 |   80.44 |                   \n";
  const summary = extractCoverageAndTestSummary(output);
  assert.deepEqual(summary, {
    tests: 132,
    pass: 132,
    fail: 0,
    linesCoveragePercent: 80.44,
  });
});

test("extractCoverageAndTestSummary reads the same figures on a failing run — coverage legible without a download applies there too", () => {
  const output =
    "✖ a failing test (1.2ms)\nℹ tests 132\nℹ suites 0\nℹ pass 131\nℹ fail 1\n" +
    "ℹ cancelled 0\nℹ skipped 0\nℹ todo 0\n" +
    "----------|---------|----------|---------|---------|-------------------\n" +
    "All files |   79.84 |    73.54 |   85.81 |   79.84 |                   \n";
  const summary = extractCoverageAndTestSummary(output);
  assert.deepEqual(summary, {
    tests: 132,
    pass: 131,
    fail: 1,
    linesCoveragePercent: 79.84,
  });
});

test("extractCoverageAndTestSummary returns null figures, never a false zero, when the command never reached either reporter", () => {
  const output = "Could not find 'hooks/test/nonexistent.mjs'\n";
  const summary = extractCoverageAndTestSummary(output);
  assert.deepEqual(summary, {
    tests: null,
    pass: null,
    fail: null,
    linesCoveragePercent: null,
  });
});

// classifyDiffCoverOutcome — gate 6 check 8, "changed-line coverage" (fix
// 42; gate-6-pull-request.md "coverage and untrusted runs": the overall
// floor and the changed-line floor are two different numbers, computed two
// different ways, and both must be wired as blocking). Same disambiguation
// problem as classifyTestCoverageOutcome above, on diff-cover's own output
// instead of c8's: a genuine shortfall against `--fail-under` and a command
// that did not run to completion (report missing, tool crashed) both exit
// non-zero, and only the output text tells them apart.

test("classifyDiffCoverOutcome: a genuine changed-line shortfall is named as shortfall, with the actual percentages", () => {
  const output =
    "-------------\nDiff Coverage\n-------------\n" +
    "scripts/gate-6-pull-request.mjs (16.1%): Missing lines 75-83\n" +
    "-------------\nTotal:   40 lines\nMissing: 8 lines\nCoverage: 80%\n-------------\n\n" +
    "Failure: Coverage (80%) is below the threshold (95%)\n";
  const outcome = classifyDiffCoverOutcome(output);
  assert.equal(outcome.kind, "shortfall");
  assert.match(outcome.detail, /80%.*95%/s);
});

test("classifyDiffCoverOutcome: a command that never produced a coverage line is its own outcome, not a guessed shortfall", () => {
  const output = "Error: no such file 'coverage/cobertura-coverage.xml'\n";
  const outcome = classifyDiffCoverOutcome(output);
  assert.equal(outcome.kind, "broken-command");
  assert.doesNotMatch(
    outcome.detail,
    /shortfall|below the .* threshold|%/,
    "must not claim a changed-line shortfall when the command never ran to completion",
  );
});

// --- scripts/check-osv-scanner.mjs — fix 9b. osv-scanner is external,
// PATH-resolved and never bundled (ADR-0002), exactly like semgrep and
// lizard.
//
// Fix 31 — this used to call checkOsvScanner() with no injected collaborator
// and rely on osv-scanner genuinely being absent from the host running the
// test. Audit 9 traced a bootstrapped repo's CI failure (`1 unit test(s)
// failed` in CI, green locally) to exactly that coupling:
// .github/workflows/pull-request.yml installs osv-scanner (`go install
// .../osv-scanner@latest`) before running this suite, so the tool this test
// required to be absent was already on PATH by the time it ran — the
// workflow installed the precondition its own test depended on not holding.
// The sibling checkBranchProtection tests inject `have`/`run` for exactly
// this reason (check-branch-protection.mjs); checkOsvScanner now takes the
// same injectable shape, and this asserts the skip path through an injected
// absence — deterministic regardless of what happens to be on the PATH of
// whatever host or CI runner executes it.
test("osv-scanner check is a visible skip, naming the tool, when it is not on PATH", () => {
  const { findings, skips } = checkOsvScanner({ have: () => false });
  assert.deepEqual(
    findings,
    [],
    "an unavailable tool must never read as a passing scan",
  );
  assert.equal(skips.length, 1);
  assert.match(skips[0], /osv-scanner/);
  assert.match(skips[0], /not on PATH/);
});

// --- lib.mjs:classifyOsvScannerOutcome / extractOsvJsonFindings /
// extractOsvSarifFindings — fix 44. Audit 12, on a live CI run: gate 6 failed
// "cross-stack dependency scan (osv-scanner)" with the tool's own startup
// banner ("Scanning dir .\nScanning ... at commit d43f2a3\nScanned
// .../package-lock.json file and found 476 packages") as the problem text —
// no vulnerability id anywhere in it — while the standalone osv-scanner check
// on the same commit passed with zero findings. check-osv-scanner.mjs and
// gate-6-pull-request.mjs both used to treat any non-zero exit as a finding
// and dump raw stdout+stderr; this proves the refusal-proof rule
// (cross-gate-rules.md: "a refusal names the specific thing being refused; a
// refusal whose problem text contains no identifier is itself a finding")
// both directions: a real advisory names a finding, a scanner failure names
// an unavailable result instead.
test("extractOsvJsonFindings: a real advisory in osv-scanner's own --format json shape is named", () => {
  const stdout = JSON.stringify({
    results: [
      {
        source: { path: "package-lock.json", type: "lockfile" },
        packages: [
          {
            package: { name: "left-pad", version: "1.0.0", ecosystem: "npm" },
            vulnerabilities: [{ id: "GHSA-aaaa-bbbb-cccc" }],
          },
        ],
      },
    ],
  });
  assert.deepEqual(extractOsvJsonFindings(stdout), ["GHSA-aaaa-bbbb-cccc"]);
});

test("extractOsvJsonFindings: osv-scanner's own startup banner — the audit-12 problem text — names no vulnerability", () => {
  const banner =
    "Scanning dir .\n" +
    "Scanning ... at commit d43f2a3\n" +
    "Scanned .../package-lock.json file and found 476 packages\n";
  assert.deepEqual(extractOsvJsonFindings(banner), []);
});

test("extractOsvSarifFindings: a real advisory in the SARIF gate 6 uploads is named by its ruleId", () => {
  const tmp = mkdtempSync(join(tmpdir(), "osv-sarif-"));
  const sarif = join(tmp, "osv-results.sarif");
  writeFileSync(
    sarif,
    JSON.stringify({
      runs: [{ results: [{ ruleId: "GHSA-aaaa-bbbb-cccc" }] }],
    }),
  );
  try {
    assert.deepEqual(extractOsvSarifFindings(sarif), ["GHSA-aaaa-bbbb-cccc"]);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("extractOsvSarifFindings: a SARIF file with no results — every finding suppressed, or none found — names nothing", () => {
  const tmp = mkdtempSync(join(tmpdir(), "osv-sarif-"));
  const sarif = join(tmp, "osv-results.sarif");
  writeFileSync(sarif, JSON.stringify({ runs: [{ results: [] }] }));
  try {
    assert.deepEqual(extractOsvSarifFindings(sarif), []);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("extractOsvSarifFindings: an unreadable file names nothing rather than throwing", () => {
  assert.deepEqual(
    extractOsvSarifFindings(join(tmpdir(), "does-not-exist.sarif")),
    [],
  );
});

test("classifyOsvScannerOutcome: exit 0 is clean, whatever findings were somehow extracted", () => {
  const outcome = classifyOsvScannerOutcome(0, ["GHSA-aaaa-bbbb-cccc"]);
  assert.equal(outcome.kind, "clean");
});

test("classifyOsvScannerOutcome: a non-zero exit with a named vulnerability is the finding, by id", () => {
  const outcome = classifyOsvScannerOutcome(1, ["GHSA-aaaa-bbbb-cccc"]);
  assert.equal(outcome.kind, "vulnerabilities");
  assert.deepEqual(outcome.findings, ["GHSA-aaaa-bbbb-cccc"]);
});

test("classifyOsvScannerOutcome: a non-zero exit with no named vulnerability is unavailable, not a finding — the audit-12 case", () => {
  const outcome = classifyOsvScannerOutcome(127, []);
  assert.equal(outcome.kind, "unavailable");
  assert.doesNotMatch(
    outcome.detail,
    /GHSA|CVE|OSV-/,
    "must not assert a vulnerability the evidence does not name",
  );
  assert.match(outcome.detail, /127/, "names the exit status it saw");
});

// checkOsvScanner end to end, through its injected run() — proves the fix
// where it actually ships (gate 5's local check), not only in the pure
// classifier: the audit-12 banner must be a skip, and a real advisory must
// still be a finding.
test("checkOsvScanner: a scanner failure with no parseable finding (the audit-12 banner) is an unavailable skip, never a finding", () => {
  const banner =
    "Scanning dir .\n" +
    "Scanning ... at commit d43f2a3\n" +
    "Scanned .../package-lock.json file and found 476 packages\n";
  const { findings, skips } = checkOsvScanner({
    have: () => true,
    run: () => ({ status: 127, stdout: "", stderr: banner }),
  });
  assert.deepEqual(
    findings,
    [],
    "a refusal with no named vulnerability must never block as a finding",
  );
  assert.equal(skips.length, 1);
  assert.match(skips[0], /osv-scanner/);
  assert.doesNotMatch(skips[0], /GHSA|CVE|OSV-/);
});

test("checkOsvScanner: a real advisory in osv-scanner's JSON output is a finding, named by id", () => {
  const stdout = JSON.stringify({
    results: [
      {
        source: { path: "package-lock.json", type: "lockfile" },
        packages: [
          {
            package: { name: "left-pad", version: "1.0.0", ecosystem: "npm" },
            vulnerabilities: [{ id: "GHSA-aaaa-bbbb-cccc" }],
          },
        ],
      },
    ],
  });
  const { findings, skips } = checkOsvScanner({
    have: () => true,
    run: () => ({ status: 1, stdout, stderr: "" }),
  });
  assert.equal(skips.length, 0);
  assert.equal(findings.length, 1);
  assert.match(findings[0].problem, /GHSA-aaaa-bbbb-cccc/);
});

// --- scripts/check-branch-protection.mjs — fix 24. Branch protection is
// never configured, and its absence was never a blocking finding (audit 8,
// on a bootstrapped repository: `gh api .../branches/main/protection` ->
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
  assert.match(findings[0].problem, /main/);
  assert.match(findings[0].problem, /no branch protection configured/);
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
  assert.match(findings[0].problem, /gate 6 \(windows-latest\)/);
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
  assert.match(findings[0].problem, /does not dismiss a stale approval/);
  assert.doesNotMatch(
    findings[0].problem,
    /does not require an approving review/,
  );
});

test("checkBranchProtection is a visible skip, naming gh, when gh is not on PATH", async () => {
  const { findings, skips } = await checkBranchProtection({
    have: () => false,
  });
  assert.deepEqual(findings, []);
  assert.equal(skips.length, 1);
  assert.match(skips[0], /gh not on PATH/);
});

test("checkBranchProtection is a visible skip, naming gh, when gh is not authenticated", async () => {
  const { findings, skips } = await checkBranchProtection({
    have: () => true,
    run: () => ({ status: 1 }),
  });
  assert.deepEqual(findings, []);
  assert.equal(skips.length, 1);
  assert.match(skips[0], /not authenticated/);
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
  assert.match(skips[0], /origin\/HEAD could not be resolved/);
  assert.match(
    skips[0],
    /git remote set-head origin -a/,
    "an unset local symref is a fixable local-metadata gap — the skip must name the remedy, not just report an unknown",
  );
});

// Fix 32 — audit 9 verified that on a bootstrapped repository
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
      if (args[0] === "api" && /protection$/.test(args[1])) {
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
  assert.equal(findings[0].path, "main");
  assert.match(findings[0].problem, /no branch protection configured/);
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
  assert.match(skips[0], /no GitHub remote/);
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
      if (args[0] === "api" && /protection$/.test(args[1])) {
        return { status: 1, stderr: "gh: Branch not protected (HTTP 404)" };
      }
      throw new Error(`unexpected gh call: ${args.join(" ")}`);
    },
  });
  assert.deepEqual(skips, []);
  assert.equal(findings.length, 1);
  assert.match(findings[0].problem, /no branch protection configured/);
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
      if (args[0] === "api" && /protection$/.test(args[1])) {
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
  assert.match(skips[0], /could not read branch protection/);
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
      if (args[0] === "api" && /protection$/.test(args[1])) {
        return { status: 0, stdout: JSON.stringify(FULL_PROTECTION) };
      }
      throw new Error(`unexpected gh call: ${args.join(" ")}`);
    },
  });
  assert.deepEqual(skips, []);
  assert.deepEqual(findings, []);
});

// --- scripts/check-repository-features.mjs — fix brief 8, item 2. "Every
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
  assert.equal(findings[0].check, "secret scanning");
  assert.match(findings[0].problem, /public repository/);
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
  assert.equal(publicCase.findings[0].check, "push protection");

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
  assert.equal(publicCase.findings[0].check, "code scanning");
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
  assert.match(skips[0], /gh not on PATH/);
});

test("checkRepositoryFeatures is a visible skip, naming gh, when gh is not authenticated", async () => {
  const { findings, skips } = await checkRepositoryFeatures({
    have: () => true,
    run: () => ({ status: 1 }),
  });
  assert.deepEqual(findings, []);
  assert.equal(skips.length, 1);
  assert.match(skips[0], /not authenticated/);
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
  assert.match(skips[0], /no GitHub remote/);
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
  // Fix 16 follow-up — caught by running `npm run gate:7` before declaring
  // the fix cycle done, per fix 17's own rule. The quality-script wiring
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
  // Fix 21. `semgrep --config auto --error hooks/lib/run.mjs` found three
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
  // Fix 20. file-classes.md: "The directory carries a README.md indexing
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
  // Fix 17. semgrep's github-actions-mutable-action-tag rule found exactly
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

// --- checkScriptFileWiring — fix 40's "close the class, not just the
// instance": a check script sitting in scripts/ that package.json never
// names at all (so checkScriptWiring above never sees it) is the exact
// shape check-standards-instantiation.mjs was found in — ported, unit
// tested, never imported by anything that runs. This is the generic form:
// scan scripts/ itself, not only what the manifest happens to list.

test("checkScriptFileWiring: a check-*.mjs file no other script imports and no declaration covers is unwired, naming it", () => {
  const files = ["check-orphan.mjs", "gate-9-fictional.mjs"];
  const readFile = (f) =>
    ({
      "check-orphan.mjs": "export function checkOrphan() {}\n",
      "gate-9-fictional.mjs": "// nothing imports check-orphan.mjs here\n",
    })[f];
  const { wired, onDemand, unwired } = checkScriptFileWiring(files, readFile);
  assert.deepEqual(wired, []);
  assert.deepEqual(onDemand, []);
  assert.equal(unwired.length, 1);
  assert.match(unwired[0], /check-orphan\.mjs/);
});

test("checkScriptFileWiring: a check-*.mjs file another tracked script imports is wired", () => {
  const files = ["check-orphan.mjs", "gate-9-fictional.mjs"];
  const readFile = (f) =>
    ({
      "check-orphan.mjs": "export function checkOrphan() {}\n",
      "gate-9-fictional.mjs":
        'import { checkOrphan } from "./check-orphan.mjs";\n',
    })[f];
  const { wired, unwired } = checkScriptFileWiring(files, readFile);
  assert.deepEqual(wired, ["check-orphan.mjs"]);
  assert.deepEqual(unwired, []);
});

test("checkScriptFileWiring: this toolkit's own check-standards-instantiation.mjs is declared on-demand, not unwired — the toolkit deliberately does not run it against its own canonical corpus", () => {
  const files = readdirSync(join(ROOT, "scripts")).filter((f) =>
    f.endsWith(".mjs"),
  );
  const readFile = (f) => readFileSync(join(ROOT, "scripts", f), "utf8");
  const { onDemand, unwired } = checkScriptFileWiring(files, readFile);
  assert.deepEqual(unwired, []);
  assert.ok(onDemand.includes("check-standards-instantiation.mjs"));
});

// --- checkIndexGateClaims — fix 43: the same defect class one level up, in
// the prose that describes the wiring rather than the manifest. A tooling
// index naming where a script runs is a checkable claim, not a comment
// nobody re-verifies.

test("checkIndexGateClaims: an index entry naming a gate that does not actually invoke the script is a finding", () => {
  const indexText = "| `check-orphan.mjs` | gate 7 |\n";
  const gateSources = {
    "gate-7-on-demand.mjs": "// does not import check-orphan.mjs\n",
  };
  const findings = checkIndexGateClaims(indexText, gateSources);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /check-orphan\.mjs/);
  assert.match(findings[0], /gate 7/);
});

test("checkIndexGateClaims: an index entry naming a gate that does invoke the script raises nothing", () => {
  const indexText = "| `check-orphan.mjs` | gate 7 |\n";
  const gateSources = {
    "gate-7-on-demand.mjs":
      'import { checkOrphan } from "./check-orphan.mjs";\n',
  };
  assert.deepEqual(checkIndexGateClaims(indexText, gateSources), []);
});

test("regression guard: check-script-wiring.mjs run for real reports package-script, script-file and script-index wiring, and refuses on any unwired one", () => {
  // Exercises the actual isMain block end to end — the CLI reporting the
  // pure functions above are unit tested against, but never spawned as a
  // real process elsewhere. A scratch tree with one of each shape: a
  // package.json script no gate invokes, a scripts/ file wired by import, a
  // scripts/ file wired by nothing, and no scripts/README.md (the skip
  // path fix 43 added).
  const dir = scratchRepo();
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ scripts: { "mystery-task": "echo hi" } }),
  );
  mkdirSync(join(dir, "scripts"));
  writeFileSync(
    join(dir, "scripts", "check-wired.mjs"),
    "export function checkWired() {}\n",
  );
  writeFileSync(
    join(dir, "scripts", "gate-x.mjs"),
    'import { checkWired } from "./check-wired.mjs";\n',
  );
  writeFileSync(
    join(dir, "scripts", "check-orphan.mjs"),
    "export function checkOrphan() {}\n",
  );
  writeFileSync(
    join(dir, "scripts", "check-standards-instantiation.mjs"),
    "export function checkStandardsInstantiation() {}\n",
  );
  const r = runScript("scripts/check-script-wiring.mjs", dir);
  assert.equal(
    r.status,
    2,
    "an unwired package script and an unwired scripts/ file must both refuse",
  );
  assert.match(r.stderr, /script wiring: UNWIRED mystery-task/);
  assert.match(r.stderr, /script-file wiring: WIRED check-wired\.mjs/);
  assert.match(r.stderr, /script-file wiring: UNWIRED check-orphan\.mjs/);
  assert.match(
    r.stderr,
    /script-file wiring: ON-DEMAND check-standards-instantiation\.mjs/,
  );
  assert.match(
    r.stderr,
    /script-index wiring: SKIP — no scripts\/README\.md in this repository/,
  );
  rmSync(dir, { recursive: true, force: true });
});

test("regression guard: check-script-wiring.mjs reports a script-index mismatch when scripts/README.md claims a gate the gate's own source does not invoke it from", () => {
  // Fix 43's own CLI path — a tooling index carried alongside the scripts it
  // describes, checked against the gate files' real imports rather than
  // trusted. The scratch tree's gate-7-on-demand.mjs never imports
  // check-orphan.mjs, so the index's claim is a mismatch.
  const dir = scratchRepo();
  writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: {} }));
  mkdirSync(join(dir, "scripts"));
  writeFileSync(
    join(dir, "scripts", "check-orphan.mjs"),
    "export function checkOrphan() {}\n",
  );
  writeFileSync(
    join(dir, "scripts", "gate-7-on-demand.mjs"),
    "// does not import check-orphan.mjs\n",
  );
  writeFileSync(
    join(dir, "scripts", "README.md"),
    "| Script | Gate |\n| --- | --- |\n| `check-orphan.mjs` | gate 7 |\n",
  );
  const r = runScript("scripts/check-script-wiring.mjs", dir);
  assert.equal(r.status, 2);
  assert.match(
    r.stderr,
    /script-index wiring: MISMATCH check-orphan\.mjs — the index claims it runs at gate 7, but gate-7-on-demand\.mjs does not invoke it/,
  );
  rmSync(dir, { recursive: true, force: true });
});

// --- scripts/check-licence-table.mjs — gate 7's on-demand licence table
// re-validation (fix brief 6: "re-validating the table against OSI is an
// invoked task at gate 7," never a scheduled one). `fetchFn` is injected —
// these tests make no real network call, the same reason
// classifyAdvisories (check-dependency-advisories.mjs) is tested against a
// fixed report rather than a live `npm audit`.

test("checkLicenceTableReferences: every reference resolving raises nothing", async () => {
  const table = { MIT: { reference: "https://opensource.org/license/mit" } };
  const findings = await checkLicenceTableReferences(table, async () => ({
    ok: true,
    status: 200,
  }));
  assert.deepEqual(findings, []);
});

test("checkLicenceTableReferences: a reference answering with a non-2xx status is named, by the licence id and the status", async () => {
  const table = {
    Moved: { reference: "https://example.invalid/moved-license" },
  };
  const findings = await checkLicenceTableReferences(table, async () => ({
    ok: false,
    status: 404,
  }));
  assert.equal(findings.length, 1);
  assert.match(findings[0].problem, /Moved/);
  assert.match(findings[0].problem, /404/);
});

test("checkLicenceTableReferences: a reference the network cannot reach at all is its own finding, distinct from a bad status", async () => {
  const table = {
    Unreachable: { reference: "https://example.invalid/unreachable" },
  };
  const findings = await checkLicenceTableReferences(table, async () => {
    throw new Error("getaddrinfo ENOTFOUND example.invalid");
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0].problem, /Unreachable/);
  assert.match(findings[0].problem, /could not be reached/);
});

// --- scripts/check-standards-instantiation.mjs — reference implementation
// for two of the seven "instantiated docs are tuned to the repository"
// checkpoints (docs-style.md#standards-in-a-consuming-repository): a stack
// name outside the derived list, and multi-component content when the
// repository has one component. Fixture-based, not run against this
// toolkit's own docs/standards — that is the canonical corpus, not an
// instantiated copy, and legitimately names every stack it supports.

test("deriveStackList: a repository with only package.json derives node alone, not the stacks it has no manifest for", () => {
  const stacks = deriveStackList([
    "package.json",
    "src/index.ts",
    "docs/README.md",
  ]);
  assert.deepEqual([...stacks], ["node"]);
});

test("deriveStackList: a manifest nested under a path is still found, and an unrelated file with a similar name is not mistaken for one", () => {
  const stacks = deriveStackList(["services/api/go.mod", "go.mod.txt"]);
  assert.deepEqual([...stacks], ["go"]);
});

test("findStackReferencesOutsideList: a stack keyword absent from the derived list is a finding, naming the stack, the keyword and the line", () => {
  const text = "Line one.\nRun `dotnet test` before merging.\n";
  const findings = findStackReferencesOutsideList(text, new Set(["node"]));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].stack, "dotnet");
  assert.equal(findings[0].line, 2);
});

test("findStackReferencesOutsideList: a keyword for a stack that IS in the derived list raises nothing — a repository naming its own tools is not a finding", () => {
  const text = "Run `npm test` before merging.\n";
  const findings = findStackReferencesOutsideList(text, new Set(["node"]));
  assert.deepEqual(findings, []);
});

test("findMultiComponentContent: a multi-component heading is a finding when the repository has one component", () => {
  const text =
    "# Deployment\n\n## Per-component prerelease (no taint)\n\nRules.\n";
  const findings = findMultiComponentContent(text, 1);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 3);
});

test("findMultiComponentContent: the same heading raises nothing once the repository actually has more than one component", () => {
  const text = "## Per-component prerelease (no taint)\n";
  const findings = findMultiComponentContent(text, 3);
  assert.deepEqual(findings, []);
});

test("findMultiComponentContent: the phrase inside a paragraph rather than a heading is not a finding — only the section itself is", () => {
  const text = "This paragraph mentions cross-component effects in passing.\n";
  const findings = findMultiComponentContent(text, 1);
  assert.deepEqual(findings, []);
});

test("regression guard: check-standards-instantiation.mjs run for real, against a scratch tree with a stack reference outside the derived list, refuses and names it", () => {
  // Fix 40 — this script was found ported, unit-tested (the three exported
  // functions above) and never wired: its own isMain block, the shape a
  // consuming repository's gate 7 actually invokes, had never been run by
  // anything in this suite. This exercises that CLI path directly, the same
  // way a consuming repository's own gate 7 would, against a Node-only
  // scratch repository whose docs/standards/ names .NET tooling it has no
  // manifest for — the exact defect class audit 11 measured in the wild.
  const dir = scratchRepo();
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x" }));
  mkdirSync(join(dir, "docs", "standards"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "standards", "testing-strategy.md"),
    "# Testing\n\nRun `dotnet test` before merging.\n",
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-standards-instantiation.mjs", dir);
  assert.equal(
    r.status,
    2,
    "a stack reference outside the derived list must refuse",
  );
  assert.match(
    r.stderr,
    /testing-strategy\.md:3: references dotnet \("dotnet"\) — not in the derived stack list \(node\)/,
  );
  assert.match(r.stderr, /standards instantiation: 1 finding/);
  rmSync(dir, { recursive: true, force: true });
});

test("regression guard: check-standards-instantiation.mjs run for real, against a tuned scratch tree, passes clean", () => {
  const dir = scratchRepo();
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x" }));
  mkdirSync(join(dir, "docs", "standards"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "standards", "testing-strategy.md"),
    "# Testing\n\nRun `npm test` before merging.\n",
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-standards-instantiation.mjs", dir);
  assert.equal(r.status, 0);
  assert.match(r.stderr, /standards instantiation: 0 findings/);
  rmSync(dir, { recursive: true, force: true });
});

// --- scripts/check-tooling-class.mjs — fix 45. file-classes.md's own rule
// ("gate scripts and other development automation are `tooling`" in a
// repository that consumes this standard) was stated and never checked.
// Audit 12: `@martincjarvis/greet`, a consuming repository, classed its gate
// scripts `production` and had zero files classed `tooling` anywhere — with
// no live effect only because lizard's extension filter and c8's import-only
// measurement were accidentally doing the class attribute's job. The proof
// that matters is the one that has never been exercised: a `tooling`-classed
// file written in the identical language/extension as a `production` file,
// which an extension filter cannot tell apart and only the class can.
test("findGateScripts: a ported gate/check script is named by its own filename, wherever it lives", () => {
  const files = [
    "tools/gate-6-pull-request.mjs",
    "tools/check-osv-scanner.mjs",
    "tools/pre-commit.mjs",
    "src/app.mjs",
    "docs/README.md",
  ];
  assert.deepEqual(findGateScripts(files), [
    "tools/gate-6-pull-request.mjs",
    "tools/check-osv-scanner.mjs",
    "tools/pre-commit.mjs",
  ]);
});

test("checkToolingClassDeclared: this toolkit's own repository is exempt outright, whatever its scripts are classed", () => {
  const findings = checkToolingClassDeclared({
    files: ["scripts/gate-6-pull-request.mjs"],
    classify: () => "production",
    isToolkit: () => true,
  });
  assert.deepEqual(findings, []);
});

test("checkToolingClassDeclared: a consuming repository with no gate scripts at all raises nothing", () => {
  const findings = checkToolingClassDeclared({
    files: ["src/app.mjs"],
    classify: () => "production",
    isToolkit: () => false,
  });
  assert.deepEqual(findings, []);
});

test("checkToolingClassDeclared: a consuming repository with ported gate scripts and zero tooling-classed files anywhere is the audit-12 defect, named", () => {
  const findings = checkToolingClassDeclared({
    files: ["scripts/gate-6-pull-request.mjs", "src/app.mjs"],
    classify: () => "production",
    isToolkit: () => false,
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0].problem, /gate-6-pull-request\.mjs/);
  assert.match(findings[0].problem, /no file anywhere.*classed `tooling`/);
});

test("checkToolingClassDeclared: a consuming repository that did class at least one file tooling raises nothing", () => {
  const findings = checkToolingClassDeclared({
    files: ["scripts/gate-6-pull-request.mjs", "src/app.mjs"],
    classify: (f) =>
      f === "scripts/gate-6-pull-request.mjs" ? "tooling" : "production",
    isToolkit: () => false,
  });
  assert.deepEqual(findings, []);
});

// --- checkToolingTestSuiteExists — fix 52. Audit 13: a repository with 26
// `tooling`-classed scripts, no test file, no job, and nothing positioned to
// notice — check-script-wiring.mjs and check-tooling-class.mjs's own
// checkToolingClassDeclared both passed clean, because neither asks whether
// the ported scripts are tested, only whether they are invoked or classed.

test("checkToolingTestSuiteExists: this toolkit's own repository is exempt outright, whatever its scripts are classed", () => {
  const findings = checkToolingTestSuiteExists({
    files: ["scripts/check-x.mjs"],
    classify: () => "tooling",
    isToolkit: () => true,
    readFile: () => "",
  });
  assert.deepEqual(findings, []);
});

test("checkToolingTestSuiteExists: a consuming repository with no tooling-classed files at all raises nothing", () => {
  const findings = checkToolingTestSuiteExists({
    files: ["src/app.mjs"],
    classify: () => "production",
    isToolkit: () => false,
    readFile: () => "",
  });
  assert.deepEqual(findings, []);
});

test("checkToolingTestSuiteExists: tooling-classed scripts with no test file naming any of them is the audit-13 defect, named", () => {
  const files = ["tools/check-foo.mjs", "tools/check-bar.mjs", "src/app.mjs"];
  const findings = checkToolingTestSuiteExists({
    files,
    classify: (f) => (f.startsWith("tools/") ? "tooling" : "production"),
    isToolkit: () => false,
    readFile: () => "",
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0].problem, /check-foo\.mjs/);
  assert.match(findings[0].problem, /no tooling tests suite exists/);
});

test("checkToolingTestSuiteExists: a test file naming one tooling script by its basename is enough — the whole class need not be enumerated", () => {
  const files = [
    "tools/check-foo.mjs",
    "tools/check-bar.mjs",
    "tools/test/tooling.test.mjs",
  ];
  const findings = checkToolingTestSuiteExists({
    files,
    classify: (f) => {
      if (f === "tools/test/tooling.test.mjs") return "test";
      return "tooling";
    },
    isToolkit: () => false,
    readFile: (f) =>
      f === "tools/test/tooling.test.mjs"
        ? 'import { checkFoo } from "../check-foo.mjs";\n'
        : "",
  });
  assert.deepEqual(findings, []);
});

test("complexityScanFiles: production and test files pass, every other class is excluded", () => {
  const files = [
    "src/app.mjs",
    "src/app.test.mjs",
    "package.json",
    "docs/readme.md",
    "skills/foo/SKILL.md",
    "tools/check-foo.mjs",
  ];
  const classify = (f) => {
    if (f === "src/app.mjs") return "production";
    if (f === "src/app.test.mjs") return "test";
    if (f === "package.json") return "configuration";
    if (f === "docs/readme.md") return "documentation";
    if (f === "skills/foo/SKILL.md") return "agent-context";
    return "tooling";
  };
  assert.deepEqual(complexityScanFiles({ files, classify }), [
    "src/app.mjs",
    "src/app.test.mjs",
  ]);
});

test("complexityScanFiles: a tooling-classed file is excluded even in the identical language as the production file beside it — the case extension filtering can never prove", () => {
  const files = ["src/app.mjs", "tools/check-foo.mjs"];
  const classify = (f) =>
    f === "tools/check-foo.mjs" ? "tooling" : "production";
  assert.deepEqual(complexityScanFiles({ files, classify }), ["src/app.mjs"]);
});

test("coveredFilesFromCobertura: every <class filename> in the report is named, backslashes normalised to forward slashes", () => {
  const xml =
    "<coverage><packages><package><classes>" +
    '<class name="app" filename="src/app.mjs"/>' +
    '<class name="foo" filename="tools\\check-foo.mjs"/>' +
    "</classes></package></packages></coverage>";
  assert.deepEqual(coveredFilesFromCobertura(xml), [
    "src/app.mjs",
    "tools/check-foo.mjs",
  ]);
});

test("toolingLeakage: a tooling-classed file in the coverage report is named even with a same-extension production file measured cleanly beside it", () => {
  const classify = (f) =>
    f === "tools/check-foo.mjs" ? "tooling" : "production";
  const covered = ["src/app.mjs", "tools/check-foo.mjs"];
  assert.deepEqual(toolingLeakage(covered, { classify }), [
    "tools/check-foo.mjs",
  ]);
});

test("checkToolingCoverageLeakage: no report yet this run is a visible skip, not a finding", () => {
  const { findings, skips } = checkToolingCoverageLeakage({
    readReport: () => {
      throw new Error("ENOENT");
    },
  });
  assert.deepEqual(findings, []);
  assert.equal(skips.length, 1);
  assert.match(skips[0], /no coverage\/cobertura-coverage\.xml/);
});

test("checkToolingCoverageLeakage: a tooling-classed file present in the report is a finding, named", () => {
  const xml =
    "<coverage><packages><package><classes>" +
    '<class name="foo" filename="tools/check-foo.mjs"/>' +
    "</classes></package></packages></coverage>";
  const { findings, skips } = checkToolingCoverageLeakage({
    readReport: () => xml,
    classify: () => "tooling",
  });
  assert.equal(skips.length, 0);
  assert.equal(findings.length, 1);
  assert.match(findings[0].problem, /tools\/check-foo\.mjs/);
});

test("checkToolingCoverageLeakage: a clean report with no tooling-classed file in it raises nothing", () => {
  const xml =
    "<coverage><packages><package><classes>" +
    '<class name="app" filename="src/app.mjs"/>' +
    "</classes></package></packages></coverage>";
  const { findings, skips } = checkToolingCoverageLeakage({
    readReport: () => xml,
    classify: () => "production",
  });
  assert.deepEqual(findings, []);
  assert.deepEqual(skips, []);
});

test("regression guard: check-tooling-class.mjs run for real, against a scratch tree with ported gate scripts and no tooling-classed file anywhere, refuses and names it", () => {
  const dir = scratchRepo();
  mkdirSync(join(dir, "scripts"), { recursive: true });
  writeFileSync(
    join(dir, "scripts", "gate-6-pull-request.mjs"),
    "// a ported gate script\n",
  );
  writeFileSync(join(dir, "src.mjs"), "export const x = 1;\n");
  writeFileSync(
    join(dir, ".gitattributes"),
    "*.mjs guardrail-class=production\n",
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-tooling-class.mjs", dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /gate-6-pull-request\.mjs/);
  assert.match(r.stderr, /no file anywhere.*classed `tooling`/);
  rmSync(dir, { recursive: true, force: true });
});

test("regression guard: check-tooling-class.mjs run for real, against a scratch tree that does class its gate script tooling and has a test file naming it, passes clean", () => {
  const dir = scratchRepo();
  mkdirSync(join(dir, "scripts"), { recursive: true });
  mkdirSync(join(dir, "scripts", "test"), { recursive: true });
  writeFileSync(
    join(dir, "scripts", "gate-6-pull-request.mjs"),
    "// a ported gate script\n",
  );
  writeFileSync(
    join(dir, "scripts", "test", "gate-6-pull-request.test.mjs"),
    "// exercises gate-6-pull-request.mjs\n",
  );
  writeFileSync(join(dir, "src.mjs"), "export const x = 1;\n");
  writeFileSync(
    join(dir, ".gitattributes"),
    "*.mjs guardrail-class=production\n" +
      "scripts/** guardrail-class=tooling\n" +
      "scripts/test/** guardrail-class=test\n",
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-tooling-class.mjs", dir);
  assert.equal(r.status, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("regression guard: check-tooling-class.mjs run for real, against a scratch tree with tooling-classed scripts and no test file naming any of them, refuses (fix 52, the audit-13 defect)", () => {
  const dir = scratchRepo();
  mkdirSync(join(dir, "scripts"), { recursive: true });
  writeFileSync(
    join(dir, "scripts", "gate-6-pull-request.mjs"),
    "// a ported gate script\n",
  );
  writeFileSync(join(dir, "src.mjs"), "export const x = 1;\n");
  writeFileSync(
    join(dir, ".gitattributes"),
    "*.mjs guardrail-class=production\nscripts/** guardrail-class=tooling\n",
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-tooling-class.mjs", dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no tooling tests suite exists/);
  rmSync(dir, { recursive: true, force: true });
});

// --- scripts/check-approval-provenance.mjs — fix 49. Audit 13: a bootstrapped
// repository landed an ADR and five register rows already approved, in the
// single commit that introduced them, naming a person who approved nothing
// in that repository — check-adr-approver.mjs, check-suppressions.mjs and
// check-licence-policy.mjs all exited 0 because none of them reads git
// history. This module's rule: an approval recorded in the same commit that
// introduces what it approves has not been reviewed by anyone, whoever is
// named.

test("isAdrPath / isRegisterPath: an ADR and a register are told apart, and each directory's own README is excluded", () => {
  assert.ok(isAdrPath("docs/ADR/0007-thing.md"));
  assert.ok(!isAdrPath("docs/ADR/README.md"));
  assert.ok(!isAdrPath("docs/registers/suppression-register.md"));
  assert.ok(isRegisterPath("docs/registers/suppression-register.md"));
  assert.ok(!isRegisterPath("docs/registers/README.md"));
  assert.ok(!isRegisterPath("docs/ADR/0007-thing.md"));
});

test("parseRegisterRows: identity is the first two cells, approver is the last — robust to columns of any width", () => {
  const rows = parseRegisterRows(
    REGISTER_HEADER +
      "| my-rule | src/x.mjs | because | never true | Jane Rivera |\n" +
      "| _ | | | | |\n",
  );
  assert.equal(rows.length, 1, "the sentinel row is excluded");
  assert.equal(rows[0].identity, "my-rule|src/x.mjs");
  assert.equal(rows[0].approver, "Jane Rivera");
});

test("newlyApprovedAdrFinding: an Accepted, risk-accepting ADR introduced by this commit (no 'before' text) is refused", () => {
  const after =
    "---\nstatus: Accepted\napprover: Jane Rivera\n---\n\nAccepts GHSA-aaaa-bbbb-cccc.\n";
  const finding = newlyApprovedAdrFinding("docs/ADR/0007-x.md", null, after);
  assert.ok(finding);
  assert.match(finding.problem, /did not exist before this commit/);
});

test("newlyApprovedAdrFinding: the same content is not refused once the file already existed before this commit — the approval is a distinct event", () => {
  const before =
    "---\nstatus: Proposed\n---\n\nWould accept GHSA-aaaa-bbbb-cccc.\n";
  const after =
    "---\nstatus: Accepted\napprover: Jane Rivera\n---\n\nAccepts GHSA-aaaa-bbbb-cccc.\n";
  assert.equal(
    newlyApprovedAdrFinding("docs/ADR/0007-x.md", before, after),
    null,
  );
});

test("newlyApprovedAdrFinding: an ordinary Proposed ADR, or one with no approver, is left to check-adr-approver.mjs — not this check's concern", () => {
  assert.equal(
    newlyApprovedAdrFinding(
      "docs/ADR/0007-x.md",
      null,
      "---\nstatus: Proposed\n---\n\nAccepts GHSA-aaaa-bbbb-cccc.\n",
    ),
    null,
  );
  assert.equal(
    newlyApprovedAdrFinding(
      "docs/ADR/0007-x.md",
      null,
      "---\nstatus: Accepted\n---\n\nAccepts GHSA-aaaa-bbbb-cccc.\n",
    ),
    null,
  );
});

test("newlyApprovedRegisterRowFindings: a row with no matching identity in the 'before' text, already carrying an approver, is refused", () => {
  const before = REGISTER_HEADER;
  const after =
    REGISTER_HEADER +
    "| my-rule | src/x.mjs | because | never true | Jane Rivera |\n";
  const findings = newlyApprovedRegisterRowFindings(
    "docs/registers/suppression-register.md",
    before,
    after,
  );
  assert.equal(findings.length, 1);
  assert.match(findings[0].problem, /my-rule\|src\/x\.mjs/);
  assert.match(findings[0].problem, /no row with that identity existed/);
});

test("newlyApprovedRegisterRowFindings: the same row is not refused when it already existed with a blank approver — filling only the approver cell is the intended two-step", () => {
  // This is this repository's own actual history (commit daa59d0c): a
  // suppression row filed with justification and removal condition complete
  // and Approved by blank, then a later commit fills only that cell.
  const before =
    REGISTER_HEADER + "| my-rule | src/x.mjs | because | never true |  |\n";
  const after =
    REGISTER_HEADER +
    "| my-rule | src/x.mjs | because | never true | Jane Rivera |\n";
  assert.deepEqual(
    newlyApprovedRegisterRowFindings(
      "docs/registers/suppression-register.md",
      before,
      after,
    ),
    [],
  );
});

test("checkApprovalProvenanceStaged: dispatches an ADR path and a register path to the right rule, ignoring everything else", () => {
  const stagedFiles = [
    "docs/ADR/0007-x.md",
    "docs/registers/suppression-register.md",
    "scripts/lib.mjs",
  ];
  const texts = {
    "docs/ADR/0007-x.md":
      "---\nstatus: Accepted\napprover: Jane Rivera\n---\n\nAccepts GHSA-aaaa-bbbb-cccc.\n",
    "docs/registers/suppression-register.md":
      REGISTER_HEADER +
      "| my-rule | src/x.mjs | because | never true | Jane Rivera |\n",
  };
  const findings = checkApprovalProvenanceStaged({
    stagedFiles,
    readBefore: () => null,
    readAfter: (p) => texts[p] ?? null,
  });
  assert.equal(findings.length, 2, "both the new ADR and the new row refuse");
});

test("regression guard: check-approval-provenance.mjs run for real against a scratch commit that introduces an Accepted, approved ADR from nothing, refuses and names it", () => {
  const dir = scratchRepo();
  mkdirSync(join(dir, "docs", "ADR"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "ADR", "0007-accept-advisory.md"),
    "---\nstatus: Accepted\napprover: Jane Rivera\n---\n\nAccepts GHSA-aaaa-bbbb-cccc.\n",
  );
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "docs: accept an advisory (ADR-0007)"]);
  const r = runScript("scripts/check-approval-provenance.mjs", dir, [
    "--commit",
    "HEAD",
  ]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /0007-accept-advisory\.md/);
  assert.match(r.stderr, /did not exist before this commit/);
  rmSync(dir, { recursive: true, force: true });
});

test("regression guard: check-approval-provenance.mjs run for real, the same ADR proposed in one commit and accepted in a later, separate one, passes clean", () => {
  const dir = scratchRepo();
  mkdirSync(join(dir, "docs", "ADR"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "ADR", "0007-accept-advisory.md"),
    "---\nstatus: Proposed\n---\n\nWould accept GHSA-aaaa-bbbb-cccc.\n",
  );
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "docs: propose accepting an advisory (ADR-0007)"]);
  writeFileSync(
    join(dir, "docs", "ADR", "0007-accept-advisory.md"),
    "---\nstatus: Accepted\napprover: Jane Rivera\n---\n\nAccepts GHSA-aaaa-bbbb-cccc.\n",
  );
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "docs: accept advisory (ADR-0007)"]);
  const r = runScript("scripts/check-approval-provenance.mjs", dir, [
    "--commit",
    "HEAD",
  ]);
  assert.equal(r.status, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("regression guard: check-approval-provenance.mjs run for real against a scratch commit that introduces a register file with a row already approved, refuses and names the row", () => {
  const dir = scratchRepo();
  mkdirSync(join(dir, "docs", "registers"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "registers", "suppression-register.md"),
    REGISTER_HEADER +
      "| my-rule | src/x.mjs | because | never true | Jane Rivera |\n",
  );
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "docs: register a suppression"]);
  const r = runScript("scripts/check-approval-provenance.mjs", dir, [
    "--commit",
    "HEAD",
  ]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /my-rule\|src\/x\.mjs/);
  rmSync(dir, { recursive: true, force: true });
});

test("regression guard: check-approval-provenance.mjs run for real, the same row filed with a blank approver and approved in a later, separate commit, passes clean", () => {
  const dir = scratchRepo();
  mkdirSync(join(dir, "docs", "registers"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "registers", "suppression-register.md"),
    REGISTER_HEADER + "| my-rule | src/x.mjs | because | never true |  |\n",
  );
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "docs: register a suppression, pending approval"]);
  writeFileSync(
    join(dir, "docs", "registers", "suppression-register.md"),
    REGISTER_HEADER +
      "| my-rule | src/x.mjs | because | never true | Jane Rivera |\n",
  );
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "docs: approve the suppression"]);
  const r = runScript("scripts/check-approval-provenance.mjs", dir, [
    "--commit",
    "HEAD",
  ]);
  assert.equal(r.status, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("fix 49: gate 2 (pre-commit.mjs) refuses a commit that stages a fresh, already-Accepted, already-approved ADR", () => {
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  writeFileSync(
    join(dir, ".secretlintrc.json"),
    JSON.stringify({ rules: [] }) + "\n",
  );
  mkdirSync(join(dir, "docs", "ADR"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "ADR", "0007-accept-advisory.md"),
    "---\nstatus: Accepted\napprover: Jane Rivera\n---\n\nAccepts GHSA-aaaa-bbbb-cccc.\n",
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/pre-commit.mjs", dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /approval provenance/);
  rmSync(dir, { recursive: true, force: true });
});

test("fix 49, hazard 3: this repository's own real history — the suppression and licence rows daa59d0c approves pass, because each already existed with a blank approver", () => {
  // Verifies against the actual commit (daa59d0c), not a synthetic fixture:
  // it fills the Approved by cell on two already-registered suppression rows
  // (the two run.mjs rows) and on four already-registered licence rows —
  // exactly the healthy two-step this corpus documents (registers.md: a row
  // filed with a blank approver, approved later by a separate commit).
  // `~1`, not `^`: lib.mjs's `run` shells out through cmd.exe on Windows,
  // where an unquoted `^` is swallowed before git sees it (see the comment
  // in check-approval-provenance.mjs). Read-only against the real
  // repository (ROOT), not a scratch tree — nothing here writes or commits.
  const sha = "daa59d0cf1d039b997b830eb1029a49d2aa7d099";
  const findings = checkApprovalProvenanceRange(`${sha}~1..${sha}`, {
    runGit: (cmd, args) =>
      spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", env: CLEAN_ENV }),
  });
  const registerFindings = findings.filter((f) => f.path.includes("register"));
  assert.equal(
    registerFindings.length,
    0,
    "the suppression and licence rows this commit approves already existed with a blank approver — they must pass",
  );
});

test("fix 49, hazard 3 (continued): the same commit's ADR-0004 — introduced and Accepted in one sitting — is NOT flagged, but only because check-adr-approver.mjs's own risk/licence detection does not recognise its prose, a pre-existing, unrelated gap this fix does not touch", () => {
  // ADR-0004 is exactly the shape the mechanical rule targets: `status:
  // Accepted`, `approver: Martin Jarvis`, introduced from nothing in
  // daa59d0c — a human authoring and accepting their own decision in one
  // sitting, which a git-history-only signal cannot tell apart from a
  // copied approval. Directly exercising newlyApprovedAdrFinding against
  // its real committed text (rather than the range driver) proves this: it
  // returns null not because the file already existed (it did not — the
  // second assertion below confirms) but because
  // acceptsRiskLicenceSuppressionOrOptOut(afterText) is false for this
  // ADR's actual prose — it discusses accepting four licences at length
  // without ever using the literal phrase "allow list" that check-adr-
  // approver.mjs's own ALLOW_LIST_RE requires alongside LICENCE_RE. That is
  // check-adr-approver.mjs's own detection gap (fix 22), not introduced or
  // fixed by fix 49 — checkAdrApprover() itself would equally fail to
  // require an approver on this same ADR had one been missing. Recorded
  // here rather than silently assumed clean, per hazard 3's instruction to
  // verify rather than assume.
  const afterText = readFileSync(
    join(ROOT, "docs", "ADR", "0004-development-scope-licence-acceptances.md"),
    "utf8",
  );
  assert.equal(
    newlyApprovedAdrFinding(
      "docs/ADR/0004-development-scope-licence-acceptances.md",
      null,
      afterText,
    ),
    null,
    "not flagged — but see this test's own name for why that is not evidence of correct two-commit provenance",
  );
  assert.ok(
    /status:\s*Accepted/.test(afterText) && /approver:\s*\S/.test(afterText),
    "sanity check: the file really is Accepted with an approver filled",
  );
  assert.ok(
    !/allow[- ]list/i.test(afterText),
    "sanity check: the gap is real — this ADR's prose never uses the phrase acceptsRiskLicenceSuppressionOrOptOut requires alongside 'licence'",
  );
});
