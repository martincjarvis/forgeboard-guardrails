import { execFileSync } from "node:child_process";
import { loadConfig } from "../config/load.ts";
import { filterCodeFiles } from "../gates/codeFiles.ts";
import {
  checkFileLengths,
  DEFAULT_MAX_FILE_LINES,
} from "../gates/fileLength.ts";
import { runComplexityGate } from "../gates/complexity.ts";
import { GateFailure } from "../errors/GateFailure.ts";

/**
 * Whole-repo scan for CI. Sources tracked files from `git ls-files` (so .gitignored
 * generated output never enters the list), applies the same code-file filter as the
 * task-complete hook, then runs the file-length and (opt-in) complexity gates. Hard
 * gate: exit 2 on any violation, no PR-size check and no override escape.
 */
export async function runScan(cwd: string): Promise<number> {
  const config = loadConfig(cwd);
  const tracked = execFileSync("git", ["ls-files"], { cwd, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  const codeFiles = await filterCodeFiles(tracked, cwd, config);

  const problems: string[] = [];

  const maxLines = config.agentHooks?.maxFileLines ?? DEFAULT_MAX_FILE_LINES;
  for (const { file, lines } of checkFileLengths(codeFiles, cwd, maxLines)) {
    problems.push(`File ${file} is ${lines} lines (> ${maxLines}).`);
  }

  try {
    runComplexityGate(codeFiles, cwd, config);
  } catch (error) {
    if (error instanceof GateFailure) problems.push(error.message);
    else throw error;
  }

  for (const p of problems) console.error(p);
  return problems.length > 0 ? 2 : 0;
}
