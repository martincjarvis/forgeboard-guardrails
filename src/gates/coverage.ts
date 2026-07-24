import { runCommandSequence } from "../exec/commandRunner.ts";
import { GateFailure } from "../errors/GateFailure.ts";
import type { GuardrailsConfig } from "../config/types.ts";

/**
 * Repo-wide coverage gate. Runs the configured `coverage` command(s); the command
 * owns the coverage threshold and must exit non-zero when coverage is too low, so
 * a non-zero exit here is a shortfall. Unset `coverage` is a visible skip, not a
 * failure — coverage tooling is opt-in per repo.
 */
export function runCoverageGate(config: GuardrailsConfig, cwd: string): void {
  if (config.coverage === undefined) {
    console.log('coverage gate skipped: no "coverage" command configured');
    return;
  }
  const result = runCommandSequence(config.coverage, cwd);
  if (!result.pass) {
    const failed = result.steps.find((s) => !s.pass);
    throw new GateFailure(
      "coverage",
      "raise coverage to the configured threshold, then push again",
      failed?.output?.trim() || "coverage command failed",
    );
  }
}
