import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { loadConfig } from "../config/load.ts";
import {
  classifyFiles,
  DEFAULT_AGENT_DOC_LIMITS,
} from "../gates/fileClassify.ts";
import {
  checkFileLengths,
  checkFileLengthsTiered,
  DEFAULT_MAX_FILE_LINES,
} from "../gates/fileLength.ts";
import { runComplexityGate } from "../gates/complexity.ts";
import { GateFailure } from "../errors/GateFailure.ts";

/**
 * Whole-repo scan for CI. Sources tracked files from `git ls-files` (so .gitignored
 * generated output never enters the list), classifies them, then runs file-length
 * (production+test at maxFileLines; agent-context files tiered) and complexity
 * (production+test). Hard gate: exit 2 on any error, no PR-size, no override escape.
 */
export async function runScan(cwd: string): Promise<number> {
  const config = loadConfig(cwd);
  const tracked = execFileSync("git", ["ls-files"], { cwd, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  const buckets = await classifyFiles(tracked, cwd, config);

  const problems: string[] = [];
  const codeFiles = [...buckets.production, ...buckets.test].filter((f) =>
    existsSync(join(cwd, f)),
  );

  const maxLines = config.agentHooks?.maxFileLines ?? DEFAULT_MAX_FILE_LINES;
  for (const { file, lines } of checkFileLengths(codeFiles, cwd, maxLines)) {
    problems.push(`File ${file} is ${lines} lines (> ${maxLines}).`);
  }

  const agentLimits = {
    warn: config.agentHooks?.agentDocs?.warn ?? DEFAULT_AGENT_DOC_LIMITS.warn,
    error:
      config.agentHooks?.agentDocs?.error ?? DEFAULT_AGENT_DOC_LIMITS.error,
  };
  const tiered = checkFileLengthsTiered(buckets.agent, cwd, agentLimits);
  for (const { file, lines } of tiered.errors) {
    problems.push(
      `Agent file ${file} is ${lines} lines (>= ${agentLimits.error}); apply progressive disclosure.`,
    );
  }
  for (const { file, lines } of tiered.warnings) {
    console.error(
      `Agent file ${file} is ${lines} lines (>= ${agentLimits.warn}); consider moving detail into referenced files.`,
    );
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
