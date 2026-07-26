import { runCommandSequence } from "../exec/commandRunner.ts";
import { GateFailure } from "../errors/GateFailure.ts";
import { describeFailure } from "../status/testOutputParsers.ts";
import type { GuardrailsConfig } from "../config/types.ts";

/**
 * Repo-wide coverage gate. Runs the configured `coverage` command(s); the command
 * owns the coverage threshold and must exit non-zero when coverage is too low.
 * Unset `coverage` is a visible skip, not a failure — coverage tooling is opt-in
 * per repo.
 *
 * A non-zero exit is **not** proof of a shortfall: a command that cannot run exits
 * non-zero too, and nothing here can tell the two apart. The failure names both
 * possibilities rather than guessing, and carries the command's own output — both
 * streams — so the developer can see which it was.
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
      // Deliberately does not assert which of the two it was. A non-zero exit is
      // equally a shortfall and a command that could not run, and the gate cannot
      // tell them apart — telling someone to raise coverage when their command has
      // a typo in it sends them looking in the wrong place.
      "read the output above: either coverage is below the configured floor, or the coverage command itself failed",
      describeFailure(
        failed?.output ?? "",
        `the coverage command exited non-zero and produced no output: ${failed?.command ?? "(unknown)"}`,
      ),
    );
  }
}
