import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const DEFAULT_MAX_FILE_LINES = 400;

/**
 * Content line count. A trailing newline terminates the last line rather than
 * starting an empty one, so a 400-line newline-terminated file reports 400, not 401.
 */
function contentLineCount(cwd: string, file: string): number {
  const text = readFileSync(join(cwd, file), "utf8");
  return text === ""
    ? 0
    : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
}

/**
 * Files whose line count exceeds `max`. Skips files that do not exist — a deleted
 * file in a branch diff has no length to gate (and reading it would throw).
 */
export function checkFileLengths(
  files: string[],
  cwd: string,
  max: number,
): { file: string; lines: number }[] {
  const offenders: { file: string; lines: number }[] = [];
  for (const file of files) {
    if (!existsSync(join(cwd, file))) continue;
    const lines = contentLineCount(cwd, file);
    if (lines > max) offenders.push({ file, lines });
  }
  return offenders;
}

/**
 * Tiered length check for agent-context files (progressive disclosure): `errors`
 * are at/over `error` (block), `warnings` are at/over `warn` but under `error`
 * (advisory). Skips missing files, like checkFileLengths.
 */
export function checkFileLengthsTiered(
  files: string[],
  cwd: string,
  limits: { warn: number; error: number },
): {
  warnings: { file: string; lines: number }[];
  errors: { file: string; lines: number }[];
} {
  const warnings: { file: string; lines: number }[] = [];
  const errors: { file: string; lines: number }[] = [];
  for (const file of files) {
    if (!existsSync(join(cwd, file))) continue;
    const lines = contentLineCount(cwd, file);
    if (lines >= limits.error) errors.push({ file, lines });
    else if (lines >= limits.warn) warnings.push({ file, lines });
  }
  return { warnings, errors };
}
