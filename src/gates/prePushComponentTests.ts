import {
  runCommandSequence,
  type CommandSequenceResult,
} from "../exec/commandRunner.ts";
import { GateFailure } from "../errors/GateFailure.ts";
import { describeFailure } from "../status/testOutputParsers.ts";
import type { GuardrailsConfig } from "../config/types.ts";

export interface ComponentTestResult {
  component: string;
  integration: CommandSequenceResult;
  e2e: CommandSequenceResult;
}

/**
 * Runs each changed component's integration then e2e commands (already-declared
 * ComponentConfig fields). An unset field is an empty sequence, which passes.
 * Throws GateFailure on the first failing command so the push is blocked with a
 * named, actionable message.
 */
export function runPrePushComponentTests(
  config: GuardrailsConfig,
  changedComponents: string[],
  cwd: string,
): ComponentTestResult[] {
  const results: ComponentTestResult[] = [];
  for (const name of changedComponents) {
    const component = config.components[name];

    const integration = runCommandSequence(component?.integrationTest, cwd);
    if (!integration.pass) {
      throw failure("integration-test", name, integration);
    }

    const e2e = runCommandSequence(component?.e2eTest, cwd);
    if (!e2e.pass) {
      throw failure("e2e-test", name, e2e);
    }

    results.push({ component: name, integration, e2e });
  }
  return results;
}

function failure(
  gate: string,
  component: string,
  result: CommandSequenceResult,
): GateFailure {
  const failed = result.steps.find((s) => !s.pass);
  return new GateFailure(
    gate,
    `fix the failing ${gate} for component "${component}", then push again`,
    describeFailure(
      failed?.output ?? "",
      `${gate} failed for ${component} with no output: ${failed?.command ?? "(unknown)"}`,
    ),
  );
}
