import { join, extname } from "node:path";
import * as prettier from "prettier";
import { minimatch } from "minimatch";
import type { GuardrailsConfig } from "../config/types.ts";

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
];

/**
 * The shared code-file list for the file-length and complexity gates. Generated
 * code is excluded once, deterministically, rather than relying on any downstream
 * tool's built-in ignore: keep configured code extensions, then drop anything
 * prettier ignores or that matches an exclude glob.
 */
export async function filterCodeFiles(
  files: string[],
  cwd: string,
  config: GuardrailsConfig,
): Promise<string[]> {
  const extensions =
    config.agentHooks?.codeExtensions ?? DEFAULT_CODE_EXTENSIONS;
  const exclude = config.agentHooks?.exclude ?? DEFAULT_EXCLUDE_GLOBS;

  const kept: string[] = [];
  for (const file of files) {
    if (!extensions.includes(extname(file))) continue;
    if (exclude.some((glob) => minimatch(file, glob, { dot: true }))) continue;
    const info = await prettier.getFileInfo(join(cwd, file), {
      ignorePath: join(cwd, ".prettierignore"),
    });
    if (info.ignored) continue;
    kept.push(file);
  }
  return kept;
}
