import { runPrettierFormat } from "../gates/prettierFormat.ts";
import { runMarkdownLint } from "../gates/markdownLint.ts";
import { runSecretScan } from "../gates/secretScan.ts";
import { runSpellCheck } from "../gates/spellCheck.ts";
import { runSast } from "../gates/sast.ts";
import { GateFailure } from "../errors/GateFailure.ts";
import { writeFileSync } from "node:fs";
import { loadConfig } from "../config/load.ts";
import { runComponentGates, type ComponentGateResult } from "../gates/componentCommands.ts";
import { runRepoLevelTests } from "../gates/repoLevelTests.ts";
import type { CommandSequenceResult } from "../exec/commandRunner.ts";

/**
 * Runs the built-in file-scoped gates over an explicit file list, in the order the
 * design spec §102 fixes: universal formatter first (so later gates read formatted
 * bytes), then docs lint, then secret scan, spelling, and SAST.
 *
 * Invoked as a subprocess by the staged pipeline because lint-staged runs commands.
 * All five live in one command so a commit pays one process launch, not five.
 */
export async function runFileGates(files: string[], cwd: string): Promise<number> {
  if (files.length === 0) return 0;
  const markdownFiles = files.filter((f) => f.endsWith(".md"));

  try {
    await runPrettierFormat(files, cwd);
    failIf(runMarkdownLint(markdownFiles, cwd), "markdown-lint");
    failIf(runSecretScan(files, cwd), "secret-scan");
    failIf(runSpellCheck(files, cwd), "spell-check");
    failIf(runSastGate(files, cwd), "sast");
    return 0;
  } catch (error) {
    if (error instanceof GateFailure) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
}

/**
 * Translates an absent semgrep into a normal failing gate result.
 *
 * semgrep is the one built-in resolved from an external, pip-distributed binary
 * (ADR-0011), so `runSast` throws a named "not found" error when it is missing.
 * Routing that through the standard GateFailure path gives the user the actionable
 * "install semgrep" message and a clean exit 1 instead of an unhandled crash.
 * `runSast` keeps its throw contract for its own unit test.
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

export async function runGateCommand(args: string[], cwd: string): Promise<number> {
  const name = args[0];
  const separator = args.indexOf("--");
  const items = separator === -1 ? [] : args.slice(separator + 1);

  if (name === "file-gates") {
    return runFileGates(items, cwd);
  }
  if (name === "components") {
    const outFlag = args.indexOf("--out");
    if (outFlag === -1) {
      console.error("gate components requires --out <path>");
      return 1;
    }
    return runComponentGatesCommand(items, args[outFlag + 1], cwd);
  }
  console.error(`Unknown gate: ${name}`);
  return 1;
}

/**
 * Everything the pre-commit hook needs from the component/repo gates after they have
 * run in a subprocess. lintStaged() returns only a boolean, so the unit-test output
 * the status contract parses its counts from would otherwise be lost.
 */
export interface ComponentGateReport {
  components: ComponentGateResult[];
  repo: CommandSequenceResult[];
}

export function runComponentGatesCommand(componentNames: string[], outPath: string, cwd: string): number {
  const config = loadConfig(cwd);
  const components = runComponentGates(config, componentNames, cwd);
  const repo = runRepoLevelTests(config, cwd);

  // Written before the failure check so a rejected commit still leaves a readable
  // report — the failure event the hook records needs it too.
  const report: ComponentGateReport = { components, repo };
  writeFileSync(outPath, JSON.stringify(report));

  try {
    for (const result of components) {
      if (!result.build.pass) {
        throw new GateFailure(`${result.component}.build`, "fix the build error and re-commit.", "build failed");
      }
      if (!result.unitTest.pass) {
        const failedStep = result.unitTest.steps.at(-1);
        throw new GateFailure(
          `${result.component}.unitTest`,
          "fix the failing step and re-commit.",
          `step ${(failedStep?.index ?? 0) + 1}/${failedStep?.total ?? 1} failed: "${failedStep?.command}"`
        );
      }
    }
    for (const result of repo) {
      if (!result.pass) {
        throw new GateFailure("repo-level-test", "fix the failing repo-level check and re-commit.", "repo-level test failed");
      }
    }
    return 0;
  } catch (error) {
    if (error instanceof GateFailure) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
}
