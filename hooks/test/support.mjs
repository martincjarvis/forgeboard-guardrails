// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis Uncited uncited
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
// deletes the corpus — which is exactly what happened once. Strip them so the
// scratch repository the test builds is the one the commands act on.
//
// This applies to the gates under test as much as to the test's own git calls:
// a gate spawned with GIT_DIR set would measure the real repository and report
// on a branch nobody asked about.
export const CLEAN_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")),
);

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

export function runScript(relPath, cwd, args = []) {
  return spawnSync(process.execPath, [join(ROOT, relPath), ...args], {
    cwd,
    encoding: "utf8",
    env: CLEAN_ENV,
  });
}

export function lines(n, text = "x") {
  return `${text}\n`.repeat(n);
}

/** A function whose cyclomatic complexity is `branches + 1` — one `else if`
 *  chain link per branch, McCabe's own count. */
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
