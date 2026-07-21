import { runPrettierFormat } from "./prettierFormat.ts";
import { runMarkdownLint } from "./markdownLint.ts";
import { runSecretScan } from "./secretScan.ts";
import { runSpellCheck } from "./spellCheck.ts";
import { runSast } from "./sast.ts";
import { GateFailure } from "../errors/GateFailure.ts";

/**
 * The built-in file-scoped gates, in the order the design spec §102 fixes: universal
 * formatter first (so later gates read formatted bytes), then docs lint, secret scan,
 * spelling, and SAST.
 *
 * Runs in-process as a lint-staged task function. Throws GateFailure on the first
 * rejection — lint-staged turns a rejected task into a failed run, which the hook
 * reports as a blocked commit.
 */
export async function runFileGates(files: string[], cwd: string): Promise<void> {
  if (files.length === 0) return;
  const markdownFiles = files.filter((f) => f.endsWith(".md"));

  await runPrettierFormat(files, cwd);
  failIf(runMarkdownLint(markdownFiles, cwd), "markdown-lint");
  failIf(runSecretScan(files, cwd), "secret-scan");
  failIf(runSpellCheck(files, cwd), "spell-check");
  failIf(runSastGate(files, cwd), "sast");
}

/**
 * Translates an absent semgrep into a normal failing gate result.
 *
 * semgrep is the one built-in resolved from an external, pip-distributed binary
 * (ADR-0011), so `runSast` throws a named "not found" error when it is missing.
 * Routing that through GateFailure gives the user the actionable "install semgrep"
 * message and a blocked commit instead of an unhandled crash. `runSast` keeps its
 * throw contract for its own unit test.
 */
function runSastGate(files: string[], cwd: string): { pass: boolean; output: string } {
  try {
    return runSast(files, cwd);
  } catch (error) {
    return { pass: false, output: error instanceof Error ? error.message : String(error) };
  }
}

function failIf(result: { pass: boolean; output: string }, gate: string): void {
  if (!result.pass) {
    throw new GateFailure(gate, "fix the reported issue and re-commit.", result.output);
  }
}
