import { minimatch } from "minimatch";
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

export function buildLintStagedPlan(
  config: GuardrailsConfig,
  changedComponents: string[],
): LintRule[] {
  const rules: LintRule[] = [];

  // Top-level entries first (app-wide, path-agnostic).
  for (const [glob, command] of Object.entries(config.lintStaged ?? {})) {
    rules.push({ glob, command });
  }

  // Then each changed component's entries, scoped to that component's paths. Being
  // later in the list, a component rule overrides a same-glob top-level rule for the
  // files it is scoped to (see the last-match resolution in resolveFilesByRule).
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
  const pathMatch = rule.paths
    ? rule.paths.some((p) => minimatch(file, p))
    : true;
  return globMatch && pathMatch;
}

/**
 * Resolves each file to the LAST rule matching it by glob AND path-scope, returning
 * rule index → files. "Last wins" is what lets a component rule override a same-glob
 * top-level rule for that component's files while files elsewhere still fall through
 * to the top-level rule.
 */
export function resolveFilesByRule(
  rules: LintRule[],
  files: string[],
): Map<number, string[]> {
  const filesByRule = new Map<number, string[]>();
  for (const file of files) {
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
  return filesByRule;
}
