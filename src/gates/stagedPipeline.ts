import { buildLintStagedPlan, resolveFilesByRule } from "./lintStaged.ts";
import type { GuardrailsConfig } from "../config/types.ts";
import lintStaged from "lint-staged";

export interface PipelineContext {
  config: GuardrailsConfig;
  changedComponents: string[];
  /** Absolute path to the toolkit's src/cli.ts — the same entry point the hook shims call. */
  cliPath: string;
  /** OS temp path the component gates write their JSON report to. Never inside the repo. */
  reportPath: string;
}

function quote(values: string[]): string {
  // lint-staged parses these command strings into argv with string-argv (shell:false),
  // which honours double quotes — so quoting is what keeps "my file.js" one argument.
  return values.map((value) => `"${value}"`).join(" ");
}

function runner(cliPath: string): string {
  // Same invocation form as the installed hook shims, so a consuming repo needs no
  // toolchain beyond the Node already required to run the hook at all.
  return `npx tsx "${cliPath}"`;
}

/**
 * The full ordered command list for one pre-commit run, given the files lint-staged
 * resolved as staged.
 *
 * Order is the design spec §102 contract: built-in file gates (which include the
 * universal formatter) → configured top-level lintStaged rules → component-scoped
 * rules → component build/unitTest and repo-level tests. Everything here executes
 * inside lint-staged's stash window, so every gate — including build and test —
 * sees staged content rather than the developer's working tree.
 */
export function buildPipelineCommands(files: string[], ctx: PipelineContext): string[] {
  const commands: string[] = [];
  if (files.length === 0) return commands;

  commands.push(`${runner(ctx.cliPath)} gate file-gates -- ${quote(files)}`);

  const rules = buildLintStagedPlan(ctx.config, ctx.changedComponents);
  const filesByRule = resolveFilesByRule(rules, files);
  for (let i = 0; i < rules.length; i++) {
    const ruleFiles = filesByRule.get(i);
    if (!ruleFiles || ruleFiles.length === 0) continue;
    const list = Array.isArray(rules[i].command) ? (rules[i].command as string[]) : [rules[i].command as string];
    for (const command of list) {
      commands.push(`${command} ${quote(ruleFiles)}`);
    }
  }

  commands.push(
    `${runner(ctx.cliPath)} gate components --out "${ctx.reportPath}" -- ${quote(ctx.changedComponents)}`
  );

  return commands;
}

/**
 * Runs every gate for this commit inside lint-staged's git workflow.
 *
 * What lint-staged buys, and why the toolkit no longer hand-rolls it: it stashes
 * unstaged changes (including the unstaged remainder of a partially-staged file)
 * before running anything, so gates read exactly the content being committed; and it
 * re-stages whatever the commands modified, so the universal formatter's output lands
 * in the commit instead of dirtying the tree behind it. Design spec §121 always
 * specified lint-staged for this; A1 shipped a hand-rolled matcher without the git
 * workflow, which is what made both defects possible.
 *
 * Tradeoff accepted in ADR-0012: component build/test run inside the stash window
 * too, so they also see staged content. That widens the window during which a hard
 * kill (not SIGINT — lint-staged restores on that) could leave changes in a stash
 * entry the user must recover with `git stash list`.
 *
 * `concurrent: false` is load-bearing: the spec's gate order (formatter first) is
 * only meaningful if the commands run in sequence.
 */
export async function runStagedPipeline(ctx: PipelineContext, cwd: string): Promise<boolean> {
  return lintStaged({
    config: { "*": (files: readonly string[]) => buildPipelineCommands([...files], ctx) },
    cwd,
    stash: true,
    concurrent: false,
    relative: true,
    allowEmpty: false
  });
}
