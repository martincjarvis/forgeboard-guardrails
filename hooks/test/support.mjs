// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis Uncited uncited LOCALAPPDATA windir
// Shared helpers for the split hooks.test.mjs suite (fix 79) — the throwaway
// git-repository builders and process wrappers every subject-area file uses.
import { mkdtempSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const HOOKS = join(dirname(fileURLToPath(import.meta.url)), "..");

// A hook runs inside git, which exports GIT_DIR / GIT_INDEX_FILE / GIT_WORK_TREE
// into the environment; anything spawned with those inherited resolves THIS
// repository instead of the throwaway one its cwd points at. Left in place, a
// `git add -A` in the scratch directory commits against the real index and
// deletes the corpus — which is exactly what happened once.
//
// Fix 82: a deny-list of GIT_* alone still let GITHUB_HEAD_REF through. A real
// `pull_request` job exports it for the whole job; a scratch-repo subprocess
// that inherits it resolves check-change-size-override.mjs's branch from the
// job's variable instead of deriving it from the repo the test built, finds no
// register row for that name, and refuses a case the test set up to pass. The
// deny-list moved byte-for-byte through the fix-79 split and has been latent
// since fix 74 introduced GITHUB_HEAD_REF resolution — the same shape
// hooks/lib/run.mjs's own comment already names for GIT_*: "a hook-spawned
// process inherits ... and resolves the wrong repository."
//
// A deny-list only ever excludes the variable someone thought to name; the
// next ambient variable a CI host sets (GITHUB_BASE_REF, GITHUB_ACTIONS,
// GITHUB_EVENT_NAME, GITHUB_STEP_SUMMARY, CI, RUNNER_* ...) fails the same way
// on its own schedule. So this is an allow-list instead: only the platform
// plumbing a spawned git/node/tool process actually needs to run at all —
// locate its own executable, find a home and temp directory, and, on Windows,
// the system paths a `.cmd` shim's shell needs — crosses into the child.
// Anything test- or environment-specific a subprocess should react to
// (GITHUB_HEAD_REF included) has to be added back explicitly by the test that
// wants it, the same way individual tests already add PYTHONUTF8 for semgrep
// rather than relying on it being ambient.
const INHERITED_ENV_KEYS = [
  "PATH",
  "HOME",
  "USERPROFILE",
  "TEMP",
  "TMP",
  "APPDATA",
  "LOCALAPPDATA",
  "SystemRoot",
  "windir",
  "PATHEXT",
  "ComSpec",
];

export const CLEAN_ENV = Object.fromEntries(
  INHERITED_ENV_KEYS.filter((k) => process.env[k] !== undefined).map((k) => [
    k,
    process.env[k],
  ]),
);

/** @param {string} cwd @param {string[]} args */
export function git(cwd, args) {
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
export function scratchRepo() {
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

/** @param {string} name @param {string} cwd @param {string} [stdin] */
export function runHook(name, cwd, stdin = "") {
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
export const ROOT = join(HOOKS, "..");

/** @param {string} relPath @param {string} cwd @param {string[]} [args] */
export function runScript(relPath, cwd, args = []) {
  return spawnSync(process.execPath, [join(ROOT, relPath), ...args], {
    cwd,
    encoding: "utf8",
    env: CLEAN_ENV,
  });
}

/** @param {number} n @param {string} [text] */
export function lines(n, text = "x") {
  return `${text}\n`.repeat(n);
}

/** A function whose cyclomatic complexity is `branches + 1` — one `else if`
 *  chain link per branch, McCabe's own count.
 *  @param {string} name @param {number} branches */
export function complexFunction(name, branches) {
  const arms = Array.from(
    { length: branches },
    (_, i) => `  ${i === 0 ? "if" : "else if"} (a === ${i}) { return ${i}; }`,
  ).join("\n");
  return `export function ${name}(a) {\n${arms}\n  return -1;\n}\n`;
}

export const REGISTER_HEADER =
  "| Code | Scope | Justification | Removable when | Approved by |\n" +
  "| ---- | ----- | ------------- | -------------- | ----------- |\n";

// Every marker name below is built by concatenation, not written as a
// literal: this test file is itself classed `test` and scanned by the very
// check under test, so a literal marker substring here would flag this
// file's own source rather than only the scratch fixtures each test writes.
export const ESLINT_DISABLE = "eslint" + "-disable";
export const NOSEMGREP = "no" + "semgrep";
export const SECRETLINT_DISABLE = "secretlint" + "-disable";
