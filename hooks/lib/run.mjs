// Cross-platform process helpers for the gate hooks.
//
// npm ships its executables as `.cmd` shims on Windows, and Node (since the
// CVE-2024-27980 fix) refuses to spawn a `.cmd`/`.bat` without a shell — it
// returns EINVAL. So on Windows a shell is required to run npx and the tool
// bins, and only there; POSIX resolves the bare name and needs no shell. The
// difference is handled once here so the hooks read the same on every platform.
// The args are built by the gates themselves, never taken from untrusted input,
// which is the assumption the shell option rests on.
import { spawnSync } from "node:child_process";

const isWindows = process.platform === "win32";

// Behaviour-preserving JSDoc annotations: they exist so the repository's native
// analyser (tsc, the build step) can type-check these helpers without the
// object-literal widening that otherwise treats `encoding: "utf8"` as `string`.
// Configuring a tool is not writing one (cross-gate rules); nothing here changes
// what the functions do.
/**
 * @param {string} command
 * @param {readonly string[]} args
 * @param {import("node:child_process").SpawnSyncOptions} [options]
 * @returns {import("node:child_process").SpawnSyncReturns<string>}
 */
export function run(command, args, options = {}) {
  const base =
    /** @type {import("node:child_process").SpawnSyncOptionsWithStringEncoding} */ ({
      encoding: "utf8",
      shell: false,
      ...options,
    });
  if (isWindows) {
    // A shell is mandatory for the `.cmd` shims npm ships (npx, the tool bins)
    // since Node's CVE-2024-27980 fix; and running the bare command through
    // cmd.exe lets PATHEXT resolve .cmd/.exe/.bat uniformly, so npx, semgrep
    // and any other PATH tool all work the same way. Without it a tool reports
    // unavailable when it is installed — the silent green a gate must never give.
    return spawnSync(command, args, { ...base, shell: true });
  }
  return spawnSync(command, args, base);
}

// git sets GIT_DIR / GIT_INDEX_FILE / GIT_WORK_TREE and a few more in the
// environment when it runs a hook. A child git spawned with those inherited
// resolves THIS repository instead of the one its cwd points at — which breaks
// anything that builds a throwaway repository (the hook tests) and can confuse a
// pre-commit check re-reading the index. Stripping them makes a child git always
// resolve its repository from its cwd.
const GIT_REDIRECT_VARS = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_QUARANTINE_PATH",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_REPLACE_REF_BASE",
  "GIT_PREFIX",
];
export function cleanGitEnv(env = process.env) {
  const e = { ...env };
  for (const k of GIT_REDIRECT_VARS) delete e[k];
  return e;
}

/**
 * @param {readonly string[]} args
 * @returns {import("node:child_process").SpawnSyncReturns<string>}
 */
export function git(args) {
  return spawnSync(
    "git",
    args,
    /** @type {import("node:child_process").SpawnSyncOptionsWithStringEncoding} */ ({
      encoding: "utf8",
      shell: false,
      env: cleanGitEnv(),
    }),
  );
}

export function have(command, args = ["--version"]) {
  const probe = run(command, args, { stdio: "ignore" });
  return !probe.error && probe.status === 0;
}

/** Locate the default branch's remote tip, as a rev to diff against. Derived,
 *  not declared: `origin/HEAD` is git's own record of which branch is
 *  default, written by `git clone` or `git remote set-head`. There is no
 *  hardcoded fallback name — a shallow or partial clone, or a stale symref,
 *  can leave `origin/HEAD` unresolvable while `origin/main` still exists,
 *  and guessing "main" in that case would use an unverified name as though
 *  it had been derived. Returns null when it cannot be resolved; every
 *  caller must then skip visibly rather than proceed with a name nobody
 *  derived (cross-gate-rules.md: "A check that could not run says so, rather
 *  than passing or asserting a cause"). The single source of this
 *  derivation — scripts/lib.mjs re-exports it rather than repeating it, and
 *  gate-4-task-completion.mjs (the distributed hook) imports it directly. */
export function resolveBase() {
  const head = git(["rev-parse", "--abbrev-ref", "origin/HEAD"]);
  if (head.status !== 0) return null;
  const candidate = head.stdout.trim();
  return git(["rev-parse", "--verify", "--quiet", candidate]).status === 0
    ? candidate
    : null;
}

export async function readEvent() {
  if (process.stdin.isTTY) return {};
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    return {};
  }
}
