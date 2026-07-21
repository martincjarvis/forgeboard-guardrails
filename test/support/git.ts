import { execFileSync } from "node:child_process";

/**
 * Commits what is staged, bypassing hooks.
 *
 * Scenario tests invoke `runPreCommitHook` directly so they can assert on its exit
 * code; `--no-verify` stops the installed shim from running the same gates a second
 * time underneath the commit.
 */
export function commitStaged(dir: string, message: string): void {
  execFileSync("git", ["commit", "-m", message, "--no-verify"], { cwd: dir });
}

/** Contents of a path in the index — what a commit right now would record. */
export function readStagedFile(dir: string, path: string): string {
  return execFileSync("git", ["show", `:${path}`], { cwd: dir, encoding: "utf8" });
}

/** Contents of a path in HEAD — what was actually committed. */
export function readCommittedFile(dir: string, path: string): string {
  return execFileSync("git", ["show", `HEAD:${path}`], { cwd: dir, encoding: "utf8" });
}

/**
 * Porcelain status of tracked files only.
 *
 * The fixture scaffold installs config files and the guardrails skill *after* its
 * bootstrap commit, so untracked entries are always present and would drown any real
 * signal — `--untracked-files=no` keeps the assertion about what the gates did.
 */
export function trackedStatus(dir: string): string {
  return execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], {
    cwd: dir,
    encoding: "utf8"
  }).trim();
}
