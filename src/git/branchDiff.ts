import { execFileSync } from "node:child_process";

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function tryMergeBase(cwd: string, ref: string): string | null {
  try {
    return git(cwd, ["merge-base", ref, "HEAD"]).trim();
  } catch {
    return null;
  }
}

/**
 * The commit the current branch diverged from the default branch. Prefer
 * origin/<default> (what the remote has); fall back to the local default branch
 * for fixture repos with no remote; null when neither resolves — no base to gate
 * against (e.g. HEAD is the default branch, or an unrelated history).
 */
export function resolveBase(cwd: string, defaultBranch: string): string | null {
  const base =
    tryMergeBase(cwd, `origin/${defaultBranch}`) ??
    tryMergeBase(cwd, defaultBranch);
  // On the default branch, merge-base(default, HEAD) === HEAD: nothing to gate.
  if (!base) return null;
  const head = git(cwd, ["rev-parse", "HEAD"]).trim();
  return base === head ? null : base;
}

export function branchDiff(
  cwd: string,
  defaultBranch: string,
): { base: string | null; added: number; deleted: number; files: string[] } {
  const base = resolveBase(cwd, defaultBranch);
  if (!base) return { base: null, added: 0, deleted: 0, files: [] };

  const raw = git(cwd, ["diff", "--numstat", `${base}..HEAD`]);
  let added = 0;
  let deleted = 0;
  const files: string[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const [a, d, ...pathParts] = line.split("\t");
    const path = pathParts.join("\t");
    // Binary files report "-" for both counts: 0 lines, but still listed. Rename
    // notation ("old => new") and quoted paths (core.quotepath) are not specially
    // parsed — neither is required by the A2-b ACs, and the line totals that drive
    // the PR-size check stay accurate regardless.
    added += a === "-" ? 0 : Number(a);
    deleted += d === "-" ? 0 : Number(d);
    files.push(path);
  }
  return { base, added, deleted, files };
}
