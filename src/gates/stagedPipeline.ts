import lintStaged from "lint-staged";
import { runFileGates } from "./fileGates.ts";
import { buildLintStagedPlan, resolveFilesByRule } from "./lintStaged.ts";
import { runCommandSequence } from "../exec/commandRunner.ts";
import {
  runComponentGates,
  type ComponentGateResult,
} from "./componentCommands.ts";
import { runRepoLevelTests } from "./repoLevelTests.ts";
import { GateFailure } from "../errors/GateFailure.ts";
import type { GuardrailsConfig } from "../config/types.ts";

export interface PipelineContext {
  config: GuardrailsConfig;
  changedComponents: string[];
}

export interface PipelineResult {
  passed: boolean;
  /** Empty when no component changed, or when the run failed before reaching them. */
  componentResults: ComponentGateResult[];
}

/**
 * Quotes paths for a shell command string. User-configured lintStaged entries are
 * shell commands (`eslint --fix`, `dotnet format`), so their file arguments still
 * need quoting — a filename containing a space would otherwise arrive as two
 * arguments. The built-in gates no longer need this: they take a string[] directly.
 */
export function quotePaths(files: string[]): string {
  return files.map((file) => `"${file}"`).join(" ");
}

/**
 * Commands for the repo's own `lintStaged` entries, resolved per the spec §102 merge
 * rule: top-level entries first, then each changed component's entries scoped to that
 * component's paths, with the last matching rule winning for any given file.
 */
export function buildUserRuleCommands(
  config: GuardrailsConfig,
  changedComponents: string[],
  files: string[],
): string[] {
  const rules = buildLintStagedPlan(config, changedComponents);
  const filesByRule = resolveFilesByRule(rules, files);
  const commands: string[] = [];

  for (let i = 0; i < rules.length; i++) {
    const ruleFiles = filesByRule.get(i);
    if (!ruleFiles || ruleFiles.length === 0) continue;
    const list = Array.isArray(rules[i].command)
      ? (rules[i].command as string[])
      : [rules[i].command as string];
    for (const command of list) {
      commands.push(`${command} ${quotePaths(ruleFiles)}`);
    }
  }

  return commands;
}

/**
 * Runs every gate for this commit inside lint-staged's git workflow.
 *
 * lint-staged owns the git side: it stashes unstaged changes (including the unstaged
 * remainder of a partially-staged file, via hidePartiallyStaged) so gates read exactly
 * the content being committed, supplies the staged file list (already --diff-filter=ACMR
 * by default, so deleted paths never reach a content-reading gate), and re-stages
 * whatever the gates modified so the formatter's output lands in the commit.
 *
 * The toolkit owns gate orchestration, in one in-process task function: built-in file
 * gates, then the repo's own lintStaged commands, then component build/test and
 * repo-level tests. Running them inside the task means build and test also see staged
 * content. Tradeoff accepted in ADR-0012: that widens the window in which a hard kill
 * could leave changes in a stash entry recoverable with `git stash list`.
 */
export async function runStagedPipeline(
  ctx: PipelineContext,
  cwd: string,
): Promise<PipelineResult> {
  let componentResults: ComponentGateResult[] = [];

  const passed = await lintStaged({
    cwd,
    stash: true,
    concurrent: false,
    relative: true,
    allowEmpty: false,
    config: {
      "*": {
        title: "guardrails gates",
        task: async (staged: readonly string[]) => {
          const files = [...staged];
          try {
            await runFileGates(files, cwd);
            runUserRules(ctx, files, cwd);
            componentResults = runComponentAndRepoGates(ctx, cwd);
          } catch (error) {
            // Printed here so the actionable message reaches the developer regardless
            // of how the task runner chooses to render a rejected task.
            if (error instanceof GateFailure) console.error(error.message);
            throw error;
          }
        },
      },
    },
  });

  return { passed, componentResults };
}

function runUserRules(
  ctx: PipelineContext,
  files: string[],
  cwd: string,
): void {
  for (const command of buildUserRuleCommands(
    ctx.config,
    ctx.changedComponents,
    files,
  )) {
    const result = runCommandSequence(command, cwd);
    if (!result.pass) {
      throw new GateFailure(
        "lint-staged",
        "fix the reported issue and re-commit.",
        result.steps.at(-1)?.output ?? "",
      );
    }
  }
}

function runComponentAndRepoGates(
  ctx: PipelineContext,
  cwd: string,
): ComponentGateResult[] {
  const components = runComponentGates(ctx.config, ctx.changedComponents, cwd);

  for (const result of components) {
    if (!result.build.pass) {
      throw new GateFailure(
        `${result.component}.build`,
        "fix the build error and re-commit.",
        "build failed",
      );
    }
    if (!result.unitTest.pass) {
      const failedStep = result.unitTest.steps.at(-1);
      throw new GateFailure(
        `${result.component}.unitTest`,
        "fix the failing step and re-commit.",
        `step ${(failedStep?.index ?? 0) + 1}/${failedStep?.total ?? 1} failed: "${failedStep?.command}"`,
      );
    }
  }

  for (const result of runRepoLevelTests(ctx.config, cwd)) {
    if (!result.pass) {
      throw new GateFailure(
        "repo-level-test",
        "fix the failing repo-level check and re-commit.",
        "repo-level test failed",
      );
    }
  }

  return components;
}
