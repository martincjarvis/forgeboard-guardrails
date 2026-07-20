import { execFileSync } from "node:child_process";
import { loadConfig } from "../config/load.ts";
import { getStagedFiles } from "../git/staged.ts";
import { getCurrentBranch } from "../git/branch.ts";
import { computeChangedComponents } from "../config/changedComponents.ts";
import { checkNotDefaultBranch } from "../gates/defaultBranchBlock.ts";
import { runPrettierFormat } from "../gates/prettierFormat.ts";
import { runMarkdownLint } from "../gates/markdownLint.ts";
import { runSecretScan } from "../gates/secretScan.ts";
import { runSpellCheck } from "../gates/spellCheck.ts";
import { runSast } from "../gates/sast.ts";
import { runComponentGates } from "../gates/componentCommands.ts";
import { runRepoLevelTests } from "../gates/repoLevelTests.ts";
import { buildLintStagedPlan, runLintStagedPlan } from "../gates/lintStaged.ts";
import { extractTicketId } from "../status/ticketId.ts";
import { parseTestOutput } from "../status/testOutputParsers.ts";
import { writeStatus } from "../status/statusWriter.ts";
import { appendEvent } from "../status/eventsWriter.ts";
import { GateFailure } from "../errors/GateFailure.ts";

export async function runPreCommitHook(cwd: string): Promise<number> {
  const config = loadConfig(cwd);
  const branch = getCurrentBranch(cwd);

  try {
    checkNotDefaultBranch(branch, config.defaultBranch);

    const stagedFiles = getStagedFiles(cwd);
    const markdownFiles = stagedFiles.filter((f) => f.endsWith(".md"));
    const changedComponents = computeChangedComponents(config, stagedFiles);

    await runPrettierFormat(stagedFiles, cwd);
    failIf(runMarkdownLint(markdownFiles, cwd), "markdown-lint");
    failIf(runSecretScan(stagedFiles, cwd), "secret-scan");
    failIf(runSpellCheck(stagedFiles, cwd), "spell-check");
    failIf(runSast(stagedFiles, cwd), "sast");

    const lintStagedPlan = buildLintStagedPlan(config, changedComponents);
    failIf(runLintStagedPlan(lintStagedPlan, stagedFiles, cwd), "lint-staged");

    const componentResults = runComponentGates(config, changedComponents, cwd);
    for (const result of componentResults) {
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

    const repoResults = runRepoLevelTests(config, cwd);
    for (const result of repoResults) {
      if (!result.pass) {
        throw new GateFailure("repo-level-test", "fix the failing repo-level check and re-commit.", "repo-level test failed");
      }
    }

    if (config.statusContract.enabled) {
      const ticketId = extractTicketId(branch, config.statusContract.ticketIdPattern);
      if (ticketId) {
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
    }

    return 0;
  } catch (error) {
    if (error instanceof GateFailure) {
      console.error(error.message);
      recordFailureEvent(cwd, config, branch);
      return 1;
    }
    throw error;
  }
}

function failIf(result: { pass: boolean; output: string }, gate: string): void {
  if (!result.pass) {
    throw new GateFailure(gate, "fix the reported issue and re-commit.", result.output);
  }
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
