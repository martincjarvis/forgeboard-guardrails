import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { GuardrailsConfig } from "../config/types.ts";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function runDoctorCheck(config: GuardrailsConfig): string[] {
  const warnings: string[] = [];

  for (const [name, component] of Object.entries(config.components)) {
    for (const field of [
      "build",
      "unitTest",
      "integrationTest",
      "e2eTest",
      "e2eSmokeTest",
    ] as const) {
      const command = component[field];
      if (!command) continue;
      const first = Array.isArray(command) ? command[0] : command;
      const executable = first.split(" ")[0];
      if (!isLikelyResolvable(executable)) {
        warnings.push(
          `${name}.${field}: "${executable}" does not look resolvable on PATH — verify it's installed.`,
        );
      }
    }
  }

  return warnings;
}

function isLikelyResolvable(executable: string): boolean {
  // Heuristic only (per spec: parsing a shell command string can't perfectly resolve
  // aliases/wrapper scripts/shell built-ins) — real check remains the actual gate run.
  const knownGlobals = new Set([
    "dotnet",
    "npm",
    "npx",
    "node",
    "az",
    "azd",
    "git",
    "semgrep",
  ]);
  if (knownGlobals.has(executable)) return true;
  return existsSync(join(packageRoot, "node_modules", ".bin", executable));
}
