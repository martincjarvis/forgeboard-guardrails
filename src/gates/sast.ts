import { runExternalBin } from "../exec/runExternalBin.ts";

/**
 * The rule pack every consuming repo's SAST gate runs.
 *
 * Deliberately not `auto`: `auto` re-resolves rules from the semgrep registry on
 * every single commit, which costs a network round-trip against the 30s pre-commit
 * budget, makes the same commit pass today and fail next week, and fails closed on
 * a plane. A named pack is fetched once and cached under ~/.semgrep.
 *
 * Residual risk, recorded in ADR-0011: a named pack is still *versioned upstream*,
 * so it is pinned-by-name rather than pinned-by-content. Fully offline determinism
 * needs a vendored rules file, deferred to A3.
 */
export const SEMGREP_RULESET = "p/default";

export function runSast(files: string[], cwd: string): { pass: boolean; output: string } {
  if (files.length === 0) return { pass: true, output: "" };
  return runExternalBin(
    "semgrep",
    [`--config=${SEMGREP_RULESET}`, "--error", "--quiet", "--metrics=off", ...files],
    cwd
  );
}
