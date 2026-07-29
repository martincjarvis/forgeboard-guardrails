// Shared helpers for the gate scripts. The process helpers come from the same
// cross-platform module the agent hooks use, so Windows resolving `npx` to
// `npx.cmd` is handled in one place and these scripts stay shell-free.
import { existsSync, readFileSync } from "node:fs";
import { git, run, have, cleanGitEnv } from "../hooks/lib/run.mjs";

export { git, run, have, cleanGitEnv };

// Note: git exports GIT_DIR / GIT_INDEX_FILE / GIT_WORK_TREE (and a few more)
// into the environment when it runs a hook, so a child git spawned with those
// inherited would resolve THIS repository rather than the one its cwd points at
// — breaking the hook tests' throwaway repositories and confusing a pre-commit
// check that re-reads the index. cleanGitEnv (above, from run.mjs) strips them
// so a child git always resolves its repository from its cwd.

/** Files in the index for this commit (added/copied/modified/renamed). */
export function stagedFiles() {
  const r = git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
  if (r.status !== 0) return [];
  return splitLines(r.stdout);
}

/** Every file git tracks. */
export function trackedFiles() {
  const r = git(["ls-files"]);
  return r.status === 0 ? splitLines(r.stdout) : [];
}

/** The guardrail-class of one path, derived from .gitattributes (ADR-0003). An
 *  unclassified file is production — the fail-safe direction (file-classes.md). */
export function classOf(file) {
  const r = git(["check-attr", "guardrail-class", "--", file]);
  if (r.status !== 0) return "production";
  const m = r.stdout.match(/guardrail-class:\s*(\S+)/);
  return !m || m[1] === "unspecified" ? "production" : m[1];
}

/** The single component this repository ships, derived from the plugin manifest
 *  (ADR-0001, ADR-0003). Its paths are the conventional plugin directories that
 *  exist here; everything else is repository-wide and releases nothing. */
export function deriveComponent() {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(".claude-plugin/plugin.json", "utf8"));
  } catch {
    return null;
  }
  const name = manifest?.name;
  if (!name) return null;
  const pluginDirs = [
    "hooks",
    "skills",
    "commands",
    "agents",
    ".claude-plugin",
  ];
  const paths = pluginDirs.filter((d) => existsSync(d));
  return { name, paths };
}

/** Does a changed path fall under the component (its shipped directories)? */
export function touchesComponent(file, paths) {
  return paths.some((p) => file === p || file.startsWith(p + "/"));
}

const BINARY =
  /\.(png|jpg|jpeg|gif|ico|webp|pdf|zip|gz|tar|woff2?|ttf|eot|mp4|mov|exe|dll|so|dylib|pyc|wasm|lock)$/i;

/** A gate scans text files; binaries are skipped for content checks. */
export function isText(file) {
  return !BINARY.test(file);
}

/** Print a diagnosis (cross-gate rule: name the check, the path, the remedy). */
export function report(gate, findings, skips = []) {
  for (const s of skips) process.stderr.write(`${gate}: SKIP ${s}\n`);
  for (const f of findings) {
    const where = f.path ? ` (${f.path})` : "";
    process.stderr.write(`${gate}: FAIL ${f.check}${where}\n`);
    if (f.problem) process.stderr.write(`        ${f.problem}\n`);
    if (f.remedy) process.stderr.write(`        ${f.remedy}\n`);
  }
  process.exit(findings.length > 0 ? 2 : 0);
}

export function splitLines(s) {
  return s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Read a path's staged content — the git-index blob, via `git show :<path>` —
 *  rather than the working tree. During a commit the working tree can already
 *  differ from what is staged (a file edited after `git add`), and a check
 *  that reads disk there judges content that is not what is being committed
 *  (gate-2-commit.md: staged-content isolation, and the checks in 2.3 that
 *  read file content — 9, 15, 17 — the same as the file-scoped ones in 2.2).
 *  Falls back to the working tree when there is no index entry: an untracked
 *  path, or a whole-repository sweep run outside a commit (gate 7), where
 *  there is no staged/unstaged distinction to protect and the working tree is
 *  the thing actually being swept. */
export function readStaged(file) {
  const r = git(["show", `:${file}`]);
  return r.status === 0 ? r.stdout : readFileSync(file, "utf8");
}

/** Locate the default branch's remote tip, as a rev to diff against. */
export function resolveBase() {
  const head = git(["rev-parse", "--abbrev-ref", "origin/HEAD"]);
  const candidate = head.status === 0 ? head.stdout.trim() : "origin/main";
  return git(["rev-parse", "--verify", "--quiet", candidate]).status === 0
    ? candidate
    : null;
}
