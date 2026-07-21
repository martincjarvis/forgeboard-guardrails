import { execSync } from "node:child_process";

export interface CommandStepResult {
  command: string;
  index: number;
  total: number;
  pass: boolean;
  output: string;
}

export interface CommandSequenceResult {
  pass: boolean;
  steps: CommandStepResult[];
}

/**
 * Runs a sequence of shell command strings, fail-fast, capturing per-step output.
 *
 * Commands run through a shell (`execSync`) by design: they are the consuming repo's
 * own declared build/test/lint commands (`dotnet test ...`, `az bicep build`, a repo's
 * npm script), which are arbitrary shell strings and often rely on shell features. The
 * command strings are trusted repo-author configuration, not untrusted external input —
 * whoever can edit `.forgeboard/guardrails.config.json` already controls the repo — so
 * there is no privilege boundary crossed here. Do not "harden" this into an argv-array
 * exec: that would break the documented command-sequence feature.
 */
export function runCommandSequence(commands: string | string[] | undefined, cwd: string): CommandSequenceResult {
  if (commands === undefined) {
    return { pass: true, steps: [] };
  }

  const list = Array.isArray(commands) ? commands : [commands];
  const steps: CommandStepResult[] = [];

  for (let index = 0; index < list.length; index++) {
    const command = list[index];
    try {
      const output = execSync(command, { cwd, encoding: "utf8", stdio: "pipe" });
      steps.push({ command, index, total: list.length, pass: true, output });
    } catch (error: unknown) {
      const output = error instanceof Error && "stdout" in error ? String((error as { stdout?: unknown }).stdout ?? "") : "";
      steps.push({ command, index, total: list.length, pass: false, output });
      return { pass: false, steps };
    }
  }

  return { pass: true, steps };
}
