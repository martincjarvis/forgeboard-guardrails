import { execFileSync } from "node:child_process";
import { loadConfig } from "../config/load.ts";
import { getStagedFiles } from "../git/staged.ts";
import { getCurrentBranch } from "../git/branch.ts";
import { computeChangedComponents } from "../config/changedComponents.ts";
import { checkNotDefaultBranch } from "../gates/defaultBranchBlock.ts";
import { runStagedPipeline } from "../gates/stagedPipeline.ts";
import { extractTicketId } from "../status/ticketId.ts";
import { parseTestOutput } from "../status/testOutputParsers.ts";
import { writeStatus } from "../status/statusWriter.ts";
import { appendEvent } from "../status/eventsWriter.ts";
import { GateFailure } from "../errors/GateFailure.ts";
import type { ComponentGateResult } from "../gates/componentCommands.ts";

export async function runPreCommitHook(cwd: string): Promise<number> {
  const config = loadConfig(cwd);
  const branch = getCurrentBranch(cwd);

  try {
    checkNotDefaultBranch(branch, config.defaultBranch);
  } catch (error) {
    if (error instanceof GateFailure) {
      console.error(error.message);
      recordFailureEvent(cwd, config, branch);
      return 1;
    }
    throw error;
  }

  const stagedFiles = getStagedFiles(cwd);
  const changedComponents = computeChangedComponents(config, stagedFiles);

  const { passed, componentResults } = await runStagedPipeline({ config, changedComponents }, cwd);

  if (!passed) {
    // The failing gate already printed its own named, actionable message.
    recordFailureEvent(cwd, config, branch);
    return 1;
  }

  if (config.statusContract.enabled) {
    writeStatusFromResults(cwd, config, branch, componentResults);
  }
  return 0;
}

function writeStatusFromResults(
  cwd: string,
  config: ReturnType<typeof loadConfig>,
  branch: string,
  componentResults: ComponentGateResult[]
): void {
  const ticketId = extractTicketId(branch, config.statusContract.ticketIdPattern);
  if (!ticketId) return;

  const commit = safeHeadSha(cwd);
  const unitResult = componentResults[0]?.unitTest;
  const parsedCounts = unitResult?.steps[0] ? parseTestOutput(unitResult.steps[0].output) : null;

  writeStatus(cwd, {
    schemaVersion: 1,
    ticketId,
    updatedAt: new Date().toISOString(),
    commit,
    branch,
    build: { status: "pass", warnings: 0, errors: 0 },
    tests: {
      unit: parsedCounts ? { status: "pass", ...parsedCounts } : { status: "pass" },
      integration: { status: "unknown" },
      e2e: { status: "unknown" },
      e2eSmoke: { status: "unknown" }
    },
    activity: null
  });

  appendEvent(cwd, {
    schemaVersion: 1,
    ticketId,
    timestamp: new Date().toISOString(),
    type: "gate-run",
    hook: "pre-commit",
    result: "pass",
    commit
  });
}

function safeHeadSha(cwd: string): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
  } catch {
    return "(no commits yet)";
  }
}

function recordFailureEvent(cwd: string, config: ReturnType<typeof loadConfig>, branch: string): void {
  if (!config.statusContract.enabled) return;
  const ticketId = extractTicketId(branch, config.statusContract.ticketIdPattern);
  if (!ticketId) return;
  appendEvent(cwd, {
    schemaVersion: 1,
    ticketId,
    timestamp: new Date().toISOString(),
    type: "gate-run",
    hook: "pre-commit",
    result: "fail",
    commit: safeHeadSha(cwd)
  });
}
