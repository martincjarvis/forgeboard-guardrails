import { buildLintStagedPlan, resolveFilesByRule } from "./lintStaged.ts";
import type { GuardrailsConfig } from "../config/types.ts";

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
