import { runCommandSequence, type CommandSequenceResult } from "../exec/commandRunner.ts";
import type { GuardrailsConfig } from "../config/types.ts";

export interface ComponentGateResult {
  component: string;
  build: CommandSequenceResult;
  unitTest: CommandSequenceResult;
}

export function runComponentGates(
  config: GuardrailsConfig,
  changedComponents: string[],
  cwd: string
): ComponentGateResult[] {
  return changedComponents.map((name) => {
    const component = config.components[name];
    return {
      component: name,
      build: runCommandSequence(component.build, cwd),
      unitTest: runCommandSequence(component.unitTest, cwd)
    };
  });
}
