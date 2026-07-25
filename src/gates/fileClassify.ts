import { join, extname } from "node:path";
import * as prettier from "prettier";
import { minimatch } from "minimatch";
import type { GuardrailsConfig } from "../config/types.ts";

export type FileCategory =
  "generated" | "agent" | "test" | "config" | "production" | "other";

export const DEFAULT_CODE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".cs",
  ".py",
  ".go",
  ".java",
  ".rb",
];

export const DEFAULT_EXCLUDE_GLOBS = [
  "**/*.generated.*",
  "**/*.g.cs",
  "**/*.designer.cs",
  "**/migrations/**",
  "**/*.min.js",
  "**/dist/**",
  "**/bin/**",
  "**/obj/**",
  "**/package-lock.json",
  "**/yarn.lock",
  "**/pnpm-lock.yaml",
  "**/*.lock",
];

export const DEFAULT_CONFIG_EXTENSIONS = [
  ".json",
  ".jsonc",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".xml",
  ".props",
  ".targets",
];

export const DEFAULT_TEST_GLOBS = [
  "**/*.test.*",
  "**/*.spec.*",
  "**/__tests__/**",
  "**/test/**",
  "**/tests/**",
  "**/*_test.go",
  "**/*Test.cs",
  "**/*Tests.cs",
];

export const DEFAULT_AGENT_DOC_GLOBS = [
  "CLAUDE.md",
  "**/CLAUDE.md",
  "AGENTS.md",
  "**/AGENTS.md",
  "GEMINI.md",
  "**/GEMINI.md",
  ".github/copilot-instructions.md",
  "**/SKILL.md",
  ".claude/commands/**/*.md",
  ".claude/agents/**/*.md",
  ".cursor/rules/**/*.mdc",
  ".cursorrules",
  ".windsurf/rules/**/*.md",
  ".windsurfrules",
  ".clinerules",
];

export const DEFAULT_AGENT_DOC_LIMITS = { warn: 200, error: 500 };

function matchesAny(file: string, globs: string[]): boolean {
  return globs.some((glob) => minimatch(file, glob, { dot: true }));
}

/**
 * Assign every path exactly one category, first-match-wins in the order
 * generated → agent → test → config → production → other. Classification is by
 * name/glob/extension only (never reads file contents), so a deleted file present
 * in a branch diff still classifies — the length/complexity gates skip missing
 * files, but PR-size still counts its removed lines.
 */
export async function classifyFiles(
  files: string[],
  cwd: string,
  config: GuardrailsConfig,
): Promise<Record<FileCategory, string[]>> {
  const ah = config.agentHooks ?? {};
  const exclude = ah.exclude ?? DEFAULT_EXCLUDE_GLOBS;
  const agentGlobs = ah.agentDocs?.globs ?? DEFAULT_AGENT_DOC_GLOBS;
  const testGlobs = ah.testGlobs ?? DEFAULT_TEST_GLOBS;
  const configExt = ah.configExtensions ?? DEFAULT_CONFIG_EXTENSIONS;
  const codeExt = ah.codeExtensions ?? DEFAULT_CODE_EXTENSIONS;

  const buckets: Record<FileCategory, string[]> = {
    generated: [],
    agent: [],
    test: [],
    config: [],
    production: [],
    other: [],
  };

  for (const file of files) {
    if (matchesAny(file, exclude)) {
      buckets.generated.push(file);
      continue;
    }
    const info = await prettier.getFileInfo(join(cwd, file), {
      ignorePath: join(cwd, ".prettierignore"),
    });
    if (info.ignored) {
      buckets.generated.push(file);
      continue;
    }
    if (matchesAny(file, agentGlobs)) {
      buckets.agent.push(file);
      continue;
    }
    if (matchesAny(file, testGlobs)) {
      buckets.test.push(file);
      continue;
    }
    const ext = extname(file);
    if (configExt.includes(ext)) {
      buckets.config.push(file);
      continue;
    }
    if (codeExt.includes(ext)) {
      buckets.production.push(file);
      continue;
    }
    buckets.other.push(file);
  }
  return buckets;
}
