// Check 1 — protected branch (gate 2, 2.1). Refuses a commit that targets the
// protected branch directly — the first check gate 2 runs, before anything
// else (docs/standards/guardrails/gate-2-commit.md).
//
// The name is derived, not declared: it resolves from origin/HEAD via
// resolveBase (lib.mjs) — the same remote-tracking ref gate 0 reads to decide
// what to rebase onto. A name held in repository-specific configuration would
// drift silently the day the default branch is renamed on the remote.
//
// Runs locally regardless of whether the server-side branch-protection
// equivalent can currently be configured — that authority being unreachable
// (a private repository on a plan without it, say) is a reason to record the
// gap, not to drop the local refusal.
import { git, resolveBase, report } from "./lib.mjs";
import { pathToFileURL } from "node:url";

/** { findings, skips }. A skip means origin/HEAD could not be resolved at
 *  all (no remote configured) — there is nothing to compare against, so the
 *  check says so rather than guessing. */
export function checkProtectedBranch() {
  const findings = [];
  const skips = [];
  const base = resolveBase();
  if (!base) {
    skips.push(
      "protected branch — origin/HEAD could not be resolved, check skipped",
    );
    return { findings, skips };
  }
  const protectedBranch = base.replace(/^origin\//, "");
  const current = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (current.status === 0 && current.stdout.trim() === protectedBranch) {
    findings.push({
      check: "protected branch",
      path: protectedBranch,
      problem: `the commit targets ${protectedBranch} directly`,
      remedy: `branch off ${protectedBranch}, commit there, and open a pull request instead`,
    });
  }
  return { findings, skips };
}

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const { findings, skips } = checkProtectedBranch();
  report("gate 2", findings, skips);
}
