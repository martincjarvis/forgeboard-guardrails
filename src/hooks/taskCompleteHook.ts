import { execFileSync } from "node:child_process";
import { loadConfig } from "../config/load.ts";
import { getCurrentBranch } from "../git/branch.ts";
import { branchDiff } from "../git/branchDiff.ts";
import { filterCodeFiles } from "../gates/codeFiles.ts";
import { classifyPrSize, DEFAULT_PR_SIZE } from "../gates/prSize.ts";
import {
  checkFileLengths,
  DEFAULT_MAX_FILE_LINES,
} from "../gates/fileLength.ts";
import { runComplexityGate } from "../gates/complexity.ts";
import { GateFailure } from "../errors/GateFailure.ts";

/**
 * Stop hook: gate the branch before the agent calls the task complete. Runs the
 * PR-size, file-length, and (opt-in) complexity checks against the branch diff,
 * collecting every finding rather than failing fast, so the agent sees all problems
 * at once. Exit 2 blocks and feeds stderr back to the agent; exit 0 allows.
 */
export async function runTaskCompleteHook(
  cwd: string,
  _stdinJson: string,
): Promise<number> {
  const config = loadConfig(cwd);
  const branch = getCurrentBranch(cwd);

  // Nothing to gate on the default branch.
  if (branch === config.defaultBranch) return 0;

  const diff = branchDiff(cwd, config.defaultBranch);
  if (
    !diff.base ||
    (diff.files.length === 0 && diff.added + diff.deleted === 0)
  ) {
    return 0;
  }

  const blocking: string[] = [];
  const warnings: string[] = [];

  // Check A — PR-size (AC 3)
  const thresholds = {
    warn: config.agentHooks?.prSize?.warn ?? DEFAULT_PR_SIZE.warn,
    error: config.agentHooks?.prSize?.error ?? DEFAULT_PR_SIZE.error,
  };
  const lines = diff.added + diff.deleted;
  const hasOverride = branchLog(cwd, diff.base).includes("[large-pr]");
  const verdict = classifyPrSize(lines, thresholds, hasOverride);
  if (verdict === "error") {
    blocking.push(
      `PR size ${lines} lines exceeds the error limit (${thresholds.error}); ` +
        "review with the user whether this size is reasonable, and if it is, amend a " +
        "commit on this branch to add the `[large-pr]` marker to its message " +
        "(`git commit --amend`) so this check passes.",
    );
  } else if (verdict === "warn") {
    warnings.push(`PR size ${lines} lines (warn > ${thresholds.warn})`);
  }

  // Shared filtered code-file list for checks B and C.
  const codeFiles = await filterCodeFiles(diff.files, cwd, config);

  // Check B — file-length (AC 4)
  const maxLines = config.agentHooks?.maxFileLines ?? DEFAULT_MAX_FILE_LINES;
  const overLong = checkFileLengths(codeFiles, cwd, maxLines);
  for (const { file, lines: n } of overLong) {
    blocking.push(
      `File ${file} is ${n} lines (> ${maxLines}); split it into smaller units.`,
    );
  }

  // Check C — complexity (opt-in, AC 4)
  try {
    runComplexityGate(codeFiles, cwd, config);
  } catch (error) {
    if (error instanceof GateFailure) blocking.push(error.message);
    else throw error;
  }

  for (const w of warnings) console.error(w);
  for (const b of blocking) console.error(b);
  return blocking.length > 0 ? 2 : 0;
}

/** All commit messages on the branch (base..HEAD), for the sticky override scan. */
function branchLog(cwd: string, base: string): string {
  try {
    return execFileSync("git", ["log", "--format=%B", `${base}..HEAD`], {
      cwd,
      encoding: "utf8",
    });
  } catch {
    return "";
  }
}
