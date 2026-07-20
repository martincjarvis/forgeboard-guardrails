import { minimatch } from "minimatch";
import { runCommandSequence } from "../exec/commandRunner.ts";
import type { GuardrailsConfig } from "../config/types.ts";

export function buildLintStagedPlan(
  config: GuardrailsConfig,
  changedComponents: string[]
): Record<string, string | string[]> {
  const plan: Record<string, string | string[]> = { ...(config.lintStaged ?? {}) };

  for (const name of changedComponents) {
    const component = config.components[name];
    for (const [glob, command] of Object.entries(component.lintStaged ?? {})) {
      plan[glob] = command;
    }
  }

  return plan;
}

export function runLintStagedPlan(
  plan: Record<string, string | string[]>,
  stagedFiles: string[],
  cwd: string
): { pass: boolean; output: string } {
  for (const [glob, commands] of Object.entries(plan)) {
    const matches = stagedFiles.filter((file) => minimatch(file, glob, { matchBase: true }));
    if (matches.length === 0) continue;

    const list = Array.isArray(commands) ? commands : [commands];
    const withFiles = list.map((command) => `${command} ${matches.join(" ")}`);
    const result = runCommandSequence(withFiles, cwd);

    if (!result.pass) {
      const failedStep = result.steps.at(-1);
      return { pass: false, output: `glob "${glob}": ${failedStep?.output ?? ""}` };
    }
  }

  return { pass: true, output: "" };
}
