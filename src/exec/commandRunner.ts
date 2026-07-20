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
