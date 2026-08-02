// cspell:ignore unpushed Unpushed symref
// One fact about a branch's push state, as a line of gate-4 output: how many
// commits on the branch are not on its remote. A note for review, never a
// refusal — and never a push. Extracted from gate-4-task-completion.mjs as
// its own subject seam (a review note is a distinct concern from the size
// and complexity measures), keeping that file under the file-length band.
import { git } from "./run.mjs";

/** One fact about a branch's push state, as a line of gate-4 output: how many
 *  commits on the branch are not on its remote. A note for review, never a
 *  refusal — and never a push. Pushing was the obvious proposal and was
 *  rejected: it would act on the agent's own claim of completion (the claim
 *  this workflow does not trust — the agent commits, a reviewer verifies by
 *  measurement, then pushes), it is outward-facing and irreversible, and gate
 *  4 taking gate 5's action collapses two gates. The unavailable cases — no
 *  remote, no upstream — are a skip with a reason, never a silent zero, so
 *  "cannot tell" does not read as "nothing to push".
 *
 *  Pure so the skip/zero/count branches are testable without a repository;
 *  `readUnpushed` (below) is the production wrapper that calls git.
 *  @param {{ branch: string, hasRemote: boolean, upstream: string | null, ahead: number | null }} state
 *  @returns {string} */
export function describeUnpushed({ branch, hasRemote, upstream, ahead }) {
  if (!branch || branch === "HEAD") {
    return "SKIP unpushed commits — detached HEAD, no branch to compare";
  }
  if (!hasRemote) {
    return "SKIP unpushed commits — no remote configured, nothing to compare to";
  }
  if (!upstream) {
    return `SKIP unpushed commits — branch '${branch}' has no upstream tracking branch (set one with \`git push -u\`)`;
  }
  if (ahead === null || !Number.isFinite(ahead)) {
    return `SKIP unpushed commits — could not count commits ahead of upstream '${upstream}'`;
  }
  const verb = ahead === 1 ? "commit is" : "commits are";
  return `${ahead} ${verb} on '${branch}' not on the remote ('${upstream}'). A note for review — this hook does not push.`;
}

/** Read the branch's push state from git and return the gate-4 note line. */
export function readUnpushed() {
  const branchR = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const branch = branchR.status === 0 ? branchR.stdout.trim() : "";
  const remotesR = git(["remote"]);
  const hasRemote = remotesR.status === 0 && remotesR.stdout.trim().length > 0;
  // `@{upstream}` reaches git literally — run.mjs's `git` spawns without a
  // shell, so neither `@` nor the braces are interpreted by cmd.exe.
  const upR = git(["rev-parse", "--abbrev-ref", "@{upstream}"]);
  const upstream =
    upR.status === 0 && upR.stdout.trim() ? upR.stdout.trim() : null;
  let ahead = null;
  if (upstream) {
    const aheadR = git(["rev-list", "--count", "@{upstream}..HEAD"]);
    if (aheadR.status === 0) ahead = Number(aheadR.stdout.trim());
  }
  return describeUnpushed({ branch, hasRemote, upstream, ahead });
}
