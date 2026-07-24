import { execFileSync } from "node:child_process";

function isZero(sha: string): boolean {
  return /^0+$/.test(sha);
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

/** Files touched by a single pushed ref, or [] when there is nothing to test. */
function filesForRef(
  cwd: string,
  localSha: string,
  remoteSha: string,
  defaultBranch: string,
): string[] {
  if (isZero(localSha)) return []; // branch deletion — nothing to gate

  let base: string;
  if (isZero(remoteSha)) {
    // New branch on the remote: diff against the merge-base with the default
    // branch. Prefer origin/<default> (what the remote actually has); fall back
    // to the local default branch for fixture repos with no remote.
    const ref =
      tryMergeBase(cwd, `origin/${defaultBranch}`, localSha) ??
      tryMergeBase(cwd, defaultBranch, localSha);
    if (!ref) return diffTree(cwd, localSha); // no base at all: whole tree
    base = ref;
  } else {
    base = remoteSha;
  }

  return git(cwd, ["diff", "--name-only", "-z", `${base}..${localSha}`])
    .split("\0")
    .filter(Boolean);
}

function tryMergeBase(cwd: string, ref: string, sha: string): string | null {
  try {
    return git(cwd, ["merge-base", ref, sha]).trim();
  } catch {
    return null;
  }
}

function diffTree(cwd: string, sha: string): string[] {
  return git(cwd, [
    "diff-tree",
    "--no-commit-id",
    "--name-only",
    "-r",
    "-z",
    sha,
  ])
    .split("\0")
    .filter(Boolean);
}

/**
 * Union of files changed by every pushed ref. `stdinRefLines` is git's pre-push
 * stdin verbatim: one "<local ref> <local sha> <remote ref> <remote sha>" line
 * per ref. Empty input (no ref updates) yields [].
 */
export function changedFilesForPush(
  cwd: string,
  stdinRefLines: string,
  defaultBranch: string,
): string[] {
  const files = new Set<string>();
  for (const raw of stdinRefLines.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const [, localSha, , remoteSha] = line.split(/\s+/);
    if (!localSha || !remoteSha) continue;
    for (const f of filesForRef(cwd, localSha, remoteSha, defaultBranch)) {
      files.add(f);
    }
  }
  return [...files];
}
