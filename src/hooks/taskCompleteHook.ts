import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { loadConfig } from "../config/load.ts";
import { getCurrentBranch } from "../git/branch.ts";
import { branchDiff } from "../git/branchDiff.ts";
import {
  classifyFiles,
  DEFAULT_AGENT_DOC_LIMITS,
} from "../gates/fileClassify.ts";
import { classifyPrSize, DEFAULT_PR_SIZE } from "../gates/prSize.ts";
import {
  checkFileLengths,
  checkFileLengthsTiered,
  DEFAULT_MAX_FILE_LINES,
} from "../gates/fileLength.ts";
import { runComplexityGate } from "../gates/complexity.ts";
import { GateFailure } from "../errors/GateFailure.ts";

/**
 * Stop hook: gate the branch before task-complete. PR-size counts production+config
 * lines only; file-length blocks over-long production/test files and applies a tiered
 * progressive-disclosure limit to agent-context files; complexity runs over
 * production+test. Collects every finding (no fail-fast); exit 2 blocks, else 0.
 */
export async function runTaskCompleteHook(
  cwd: string,
  _stdinJson: string,
): Promise<number> {
  const config = loadConfig(cwd);
  const branch = getCurrentBranch(cwd);
  if (branch === config.defaultBranch) return 0;

  const diff = branchDiff(cwd, config.defaultBranch);
  if (!diff.base || diff.files.length === 0) return 0;

  const buckets = await classifyFiles(
    diff.files.map((f) => f.path),
    cwd,
    config,
  );
  const blocking: string[] = [];
  const warnings: string[] = [];

  // Check A — PR-size (AC 3): production + config lines only.
  const counted = new Set([...buckets.production, ...buckets.config]);
  const lines = diff.files
    .filter((f) => counted.has(f.path))
    .reduce((s, f) => s + f.added + f.deleted, 0);
  const thresholds = {
    warn: config.agentHooks?.prSize?.warn ?? DEFAULT_PR_SIZE.warn,
    error: config.agentHooks?.prSize?.error ?? DEFAULT_PR_SIZE.error,
  };
  const hasOverride = branchLog(cwd, diff.base).includes("[large-pr]");
  const verdict = classifyPrSize(lines, thresholds, hasOverride);
  if (verdict === "error") {
    blocking.push(
      `PR size ${lines} production+config lines exceeds the error limit ` +
        `(${thresholds.error}); review with the user whether this size is ` +
        "reasonable, and if it is, amend a commit on this branch to add the " +
        "`[large-pr]` marker to its message (`git commit --amend`) so this " +
        "check passes.",
    );
  } else if (verdict === "warn") {
    warnings.push(
      `PR size ${lines} production+config lines (warn > ${thresholds.warn})`,
    );
  }

  // Checks B/C operate on files that still exist on disk (skip deletions).
  const codeFiles = [...buckets.production, ...buckets.test].filter((f) =>
    existsSync(join(cwd, f)),
  );

  // Check B — file-length (AC 4): production + test at maxFileLines.
  const maxLines = config.agentHooks?.maxFileLines ?? DEFAULT_MAX_FILE_LINES;
  for (const { file, lines: n } of checkFileLengths(codeFiles, cwd, maxLines)) {
    blocking.push(
      `File ${file} is ${n} lines (> ${maxLines}); split it into smaller units.`,
    );
  }

  // Check B' — agent-context progressive disclosure (tiered).
  const agentLimits = {
    warn: config.agentHooks?.agentDocs?.warn ?? DEFAULT_AGENT_DOC_LIMITS.warn,
    error:
      config.agentHooks?.agentDocs?.error ?? DEFAULT_AGENT_DOC_LIMITS.error,
  };
  const tiered = checkFileLengthsTiered(buckets.agent, cwd, agentLimits);
  for (const { file, lines: n } of tiered.errors) {
    blocking.push(
      `Agent file ${file} is ${n} lines (>= ${agentLimits.error}); apply ` +
        "progressive disclosure — keep the entry file lean and move detail into " +
        "referenced files.",
    );
  }
  for (const { file, lines: n } of tiered.warnings) {
    warnings.push(
      `Agent file ${file} is ${n} lines (>= ${agentLimits.warn}); consider ` +
        "moving detail into referenced files.",
    );
  }

  // Check C — complexity (opt-in, AC 4): production + test.
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
