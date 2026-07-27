import { execFileSync } from "node:child_process";
import { loadConfig } from "../config/load.ts";
import { getCurrentBranch } from "../git/branch.ts";
import { changedFilesForPush } from "../git/pushRange.ts";
import { computeChangedComponents } from "../config/changedComponents.ts";
import { runCoverageGate } from "../gates/coverage.ts";
import {
  runPrePushComponentTests,
  type ComponentTestResult,
} from "../gates/prePushComponentTests.ts";
import { extractTicketId } from "../status/ticketId.ts";
import { updateTestOutcomes } from "../status/statusWriter.ts";
import { appendEvent } from "../status/eventsWriter.ts";
import { reportLogPath, logVerdict } from "../exec/commandLog.ts";
import { GateFailure } from "../errors/GateFailure.ts";
import type { GuardrailsConfig } from "../config/types.ts";

export async function runPrePushHook(
  cwd: string,
  stdinRefLines: string,
): Promise<number> {
  const config = loadConfig(cwd);
  const branch = getCurrentBranch(cwd);

  try {
    runCoverageGate(config, cwd);

    const changedFiles = changedFilesForPush(
      cwd,
      stdinRefLines,
      config.defaultBranch,
    );
    const changedComponents = computeChangedComponents(config, changedFiles);
    const componentResults = runPrePushComponentTests(
      config,
      changedComponents,
      cwd,
    );

    recordPass(cwd, config, branch, componentResults);
    return 0;
  } catch (error) {
    if (error instanceof GateFailure) {
      console.error(error.message);
      logVerdict(error.gate, error.message);
      reportLogPath();
      recordFailure(cwd, config, branch);
      return 1;
    }
    throw error;
  }
}

function recordPass(
  cwd: string,
  config: GuardrailsConfig,
  branch: string,
  componentResults: ComponentTestResult[],
): void {
  if (!config.statusContract.enabled) return;
  const ticketId = extractTicketId(
    branch,
    config.statusContract.ticketIdPattern,
  );
  if (!ticketId) return;
  const commit = safeHeadSha(cwd);

  const ranIntegration = componentResults.some(
    (r) => r.integration.steps.length > 0,
  );
  const ranE2e = componentResults.some((r) => r.e2e.steps.length > 0);
  updateTestOutcomes(cwd, ticketId, {
    integration: { status: ranIntegration ? "pass" : "unknown" },
    e2e: { status: ranE2e ? "pass" : "unknown" },
    commit,
  });

  appendEvent(cwd, {
    schemaVersion: 1,
    ticketId,
    timestamp: new Date().toISOString(),
    type: "gate-run",
    hook: "pre-push",
    result: "pass",
    commit,
  });
}

function recordFailure(
  cwd: string,
  config: GuardrailsConfig,
  branch: string,
): void {
  if (!config.statusContract.enabled) return;
  const ticketId = extractTicketId(
    branch,
    config.statusContract.ticketIdPattern,
  );
  if (!ticketId) return;
  appendEvent(cwd, {
    schemaVersion: 1,
    ticketId,
    timestamp: new Date().toISOString(),
    type: "gate-run",
    hook: "pre-push",
    result: "fail",
    commit: safeHeadSha(cwd),
  });
}

function safeHeadSha(cwd: string): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd,
      encoding: "utf8",
    }).trim();
  } catch {
    return "(no commits yet)";
  }
}
