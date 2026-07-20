import { minimatch } from "minimatch";
import type { GuardrailsConfig } from "./types.ts";

export function computeChangedComponents(config: GuardrailsConfig, stagedFiles: string[]): string[] {
  const directlyChanged = new Set<string>();

  for (const [name, component] of Object.entries(config.components)) {
    const matches = stagedFiles.some((file) => component.paths.some((pattern) => minimatch(file, pattern)));
    if (matches) directlyChanged.add(name);
  }

  // Build reverse dependency edges: dependency -> [dependents]
  const dependents = new Map<string, string[]>();
  for (const [name, component] of Object.entries(config.components)) {
    for (const dep of component.dependsOn ?? []) {
      dependents.set(dep, [...(dependents.get(dep) ?? []), name]);
    }
  }

  const all = new Set(directlyChanged);
  const queue = [...directlyChanged];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const dependent of dependents.get(current) ?? []) {
      if (!all.has(dependent)) {
        all.add(dependent);
        queue.push(dependent);
      }
    }
  }

  return [...all];
}
