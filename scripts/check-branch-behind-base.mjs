// cspell:ignore symref
// Fix 67 — pre-push refuses a branch behind its base. Branch protection sets
// `strict: true` and gate-6-pull-request.md already requires "A pull request
// behind its base cannot merge until it is updated" — nothing checked it
// before the push existed, so the merge got refused only after a pipeline
// run had already been spent on it and a reviewer was already looking at a
// pull request whose result was about to change.
//
// This is not a correctness check — the merge would have been refused
// anyway (gate-5-push.md: "Check 4 is not about correctness"). It is about
// not spending a run finding that out: the cost of being wrong is one
// rebase, the cost of skipping it is a wasted pipeline. Refuses rather than
// warns (cross-gate-rules.md: "no gate emits a warning it does not treat as
// a failure") — a push back would be defensible for most things this corpus
// checks, but there is no author to push back to who benefits from being
// told rather than stopped: the rebase is required either way, only later
// and after paying for a run that could not have passed.
//
// Base is derived — resolveBase() (lib.mjs), never a hardcoded "main" — the
// same derivation gate 0's own identical rebase check already uses
// (gate-0-baseline.mjs). An unresolvable base is a visible skip naming the
// remedy (fix 32's pattern: check-protected-branch.mjs), not a silent pass.
//
// Fetches first so the comparison is against a current ref, not a stale
// one — gate 0's own check does the same before its identical rev-list.
// Where the fetch itself fails (no network, an unreachable remote) the
// comparison still runs against whatever `origin/<base>` already resolves
// to locally; the result names that the comparison may be stale rather than
// either refusing to compare at all or presenting a stale comparison as a
// settled one. Pushing while offline is not this check's business to
// refuse — misrepresenting what it compared against would be.
import { git, resolveBase, report } from "./lib.mjs";
import { pathToFileURL } from "node:url";

/** { findings, skips }.
 *  @param {{
 *    git?: (args: readonly string[]) => {status: number|null, stdout?: string, stderr?: string},
 *    resolveBase?: () => string | null,
 *  }} [deps]
 */
export function checkBranchBehindBase({
  git: gitFn = git,
  resolveBase: resolveBaseFn = resolveBase,
} = {}) {
  const findings = [];
  const skips = [];

  const base = resolveBaseFn();
  if (!base) {
    skips.push(
      "branch behind base — origin/HEAD could not be resolved; run `git remote set-head origin -a` to fix the local symref",
    );
    return { findings, skips };
  }

  const fetched = gitFn(["fetch", "--quiet", "origin"]);
  const stale = fetched.status !== 0;

  const count = gitFn(["rev-list", "--count", `HEAD..${base}`]);
  if (count.status !== 0) {
    skips.push(
      `branch behind base — could not compare HEAD to ${base}: ${
        (count.stderr || "").trim() || "git rev-list failed"
      }`,
    );
    return { findings, skips };
  }

  const behind = Number(count.stdout.trim());
  if (behind > 0) {
    findings.push({
      check: "branch behind base",
      problem:
        `HEAD is ${behind} commit(s) behind ${base}` +
        (stale
          ? " (comparison may be stale — `git fetch` did not complete)"
          : ""),
      remedy: `git fetch origin && git rebase ${base}`,
    });
  }
  return { findings, skips };
}

const isMain =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const { findings, skips } = checkBranchBehindBase();
  report("gate 5", findings, skips);
}
