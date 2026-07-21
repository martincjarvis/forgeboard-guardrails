import { minimatch } from "minimatch";
import { runCommandSequence } from "../exec/commandRunner.ts";
import type { GuardrailsConfig } from "../config/types.ts";

/**
 * One lint-staged rule. Top-level (app-wide) entries have no `paths` and match any
 * staged file by glob alone. Component entries carry their component's `paths`, so
 * they apply only to that component's own staged files (glob AND path-scope) — the
 * component author doesn't repeat the directory in every glob. Rules are held in an
 * ordered list rather than a `Record` keyed by glob so that a component can override
 * a same-glob top-level entry for its own files while the top-level entry still
 * governs files elsewhere (the two can't share one map key).
 */
export interface LintRule {
  glob: string;
  command: string | string[];
  paths?: string[];
}

export function buildLintStagedPlan(config: GuardrailsConfig, changedComponents: string[]): LintRule[] {
  const rules: LintRule[] = [];

  // Top-level entries first (app-wide, path-agnostic).
  for (const [glob, command] of Object.entries(config.lintStaged ?? {})) {
    rules.push({ glob, command });
  }

  // Then each changed component's entries, scoped to that component's paths. Being
  // later in the list, a component rule overrides a same-glob top-level rule for the
  // files it is scoped to (see the last-match resolution in runLintStagedPlan).
  for (const name of changedComponents) {
    const component = config.components[name];
    for (const [glob, command] of Object.entries(component.lintStaged ?? {})) {
      rules.push({ glob, command, paths: component.paths });
    }
  }

  return rules;
}

function ruleMatches(rule: LintRule, file: string): boolean {
  const globMatch = minimatch(file, rule.glob, { matchBase: true });
  const pathMatch = rule.paths ? rule.paths.some((p) => minimatch(file, p)) : true;
  return globMatch && pathMatch;
}

export function runLintStagedPlan(
  rules: LintRule[],
  stagedFiles: string[],
  cwd: string
): { pass: boolean; output: string } {
  // Resolve each staged file to the LAST rule that matches it by glob AND path-scope.
  // "Last wins" is what makes a component rule override a same-glob top-level rule for
  // that component's files, while a file outside the component falls through to the
  // top-level rule (which is earlier but the only remaining match).
  const filesByRule = new Map<number, string[]>();
  for (const file of stagedFiles) {
    let chosen = -1;
    for (let i = 0; i < rules.length; i++) {
      if (ruleMatches(rules[i], file)) chosen = i;
    }
    if (chosen >= 0) {
      const list = filesByRule.get(chosen) ?? [];
      list.push(file);
      filesByRule.set(chosen, list);
    }
  }

  // Run rules in declared order over their resolved files, fail-fast on the first miss.
  for (let i = 0; i < rules.length; i++) {
    const files = filesByRule.get(i);
    if (!files || files.length === 0) continue;

    const commands = rules[i].command;
    const list = Array.isArray(commands) ? commands : [commands];
    const withFiles = list.map((command) => `${command} ${files.join(" ")}`);
    const result = runCommandSequence(withFiles, cwd);

    if (!result.pass) {
      const failedStep = result.steps.at(-1);
      return { pass: false, output: `glob "${rules[i].glob}": ${failedStep?.output ?? ""}` };
    }
  }

  return { pass: true, output: "" };
}
