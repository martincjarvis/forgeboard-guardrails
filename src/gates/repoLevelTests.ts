import {
  runCommandSequence,
  type CommandSequenceResult,
} from "../exec/commandRunner.ts";
import type { GuardrailsConfig } from "../config/types.ts";

export function runRepoLevelTests(
  config: GuardrailsConfig,
  cwd: string,
): CommandSequenceResult[] {
  return Object.values(config.repo ?? {}).map((command) =>
    runCommandSequence(command, cwd),
  );
}
