// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis Uncited uncited
// Split from hooks.test.mjs (fix 79) — subject group: gate-2-commit.
// Loaded by hooks/test/hooks.test.mjs; not invoked directly by the test runner.
import { test } from "node:test";
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
import { join } from "node:path";
import { run } from "../lib/run.mjs";
import assert from "node:assert/strict";
import { ROOT, CLEAN_ENV, git, scratchRepo, runScript } from "./support.mjs";

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
  // CLEAN_ENV is an allow-list (fix 82) that never carries GITHUB_BASE_REF,
  // so this already exercises resolveBase()'s own null path rather than the
  // pull_request-event argument path — no per-test filtering needed.
  const r = spawnSync(
    process.execPath,
    [join(ROOT, "scripts/gate-6-pull-request.mjs")],
    { cwd: dir, encoding: "utf8", env: CLEAN_ENV },
  );
  assert.notEqual(
    r.status,
    0,
    "gate 6 must not proceed when it cannot resolve a base to diff against",
  );
  assert.match(r.stderr, /cannot resolve the base branch/);
  rmSync(dir, { recursive: true, force: true });
});

test("markdownlint commit scope: lint-staged lints the staged file alone, and a per-file violation in it is still refused", () => {
  // docs/specs/2026-08-01-markdown-gate-scope-design.md. .markdownlint-cli2.jsonc
  // used to set "globs": ["**/*.md"]; markdownlint-cli2 combines configured
  // globs with the path arguments lint-staged passes, so one staged argument
  // lints the whole tree and an unrelated draft anywhere refused every commit.
  // With globs removed (the sweep glob moved to gate 5's call site), the
  // per-file argument lint-staged passes lints exactly that file — and a
  // per-file rule broken in it is still refused. The exit-0 class — a scoping
  // change that quietly stops catching anything — is what this closes against.
  const dir = mkdtempSync(join(tmpdir(), "markdown-scope-"));
  // The configs lint-staged loads at commit time: the rules file and the CLI
  // config (globs now absent, so the file set is whatever lint-staged passes).
  writeFileSync(
    join(dir, ".markdownlint.jsonc"),
    readFileSync(join(ROOT, ".markdownlint.jsonc"), "utf8"),
  );
  writeFileSync(
    join(dir, ".markdownlint-cli2.jsonc"),
    readFileSync(join(ROOT, ".markdownlint-cli2.jsonc"), "utf8"),
  );
  // A well-formed file (the one that would be staged) and a malformed sibling
  // (the unrelated draft that used to widen every commit to the whole tree).
  writeFileSync(join(dir, "staged.md"), "# Staged\n\nWell-formed prose.\n");
  writeFileSync(
    join(dir, "draft.md"),
    "no top-level heading — a structural per-file violation\n",
  );
  // The exact invocation lint-staged makes: the command .lintstagedrc.json
  // names, with the staged path appended (what lint-staged does per key).
  const config = JSON.parse(
    readFileSync(join(ROOT, ".lintstagedrc.json"), "utf8"),
  );
  const mdCmd = config["*.{md,mdx}"].find(
    /** @param {string} c */ (c) => c.includes("markdownlint-cli2"),
  );
  assert.ok(
    mdCmd,
    "lint-staged wires markdownlint-cli2 over the staged markdown subset",
  );
  const md = join(ROOT, "node_modules", ".bin", "markdownlint-cli2");

  // Scope: one argument lints one file — the malformed sibling does not widen
  // the check to the whole tree (the defect the split fixes).
  const scoped = run(md, ["staged.md"], { cwd: dir, env: CLEAN_ENV });
  assert.equal(scoped.status, 0, "the clean staged file must pass on its own");
  assert.match(
    (scoped.stderr || "") + (scoped.stdout || ""),
    /Linting: 1 file\b/,
    "with the sweep glob at gate 5, one argument lints one file, not the whole tree",
  );

  // Still catches: a per-file rule broken in the staged file is refused.
  const broken = run(md, ["draft.md"], { cwd: dir, env: CLEAN_ENV });
  assert.notEqual(
    broken.status,
    0,
    "a staged file that breaks a per-file rule must still be refused at commit",
  );
  rmSync(dir, { recursive: true, force: true });
});
