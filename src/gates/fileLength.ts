import { readFileSync } from "node:fs";
import { join } from "node:path";

export const DEFAULT_MAX_FILE_LINES = 400;

/**
 * Files whose line count exceeds `max`. Operates on the pre-filtered code-file
 * list (generated code already excluded by filterCodeFiles), so a hit is always a
 * real source file to split.
 */
export function checkFileLengths(
  files: string[],
  cwd: string,
  max: number,
): { file: string; lines: number }[] {
  const offenders: { file: string; lines: number }[] = [];
  for (const file of files) {
    const text = readFileSync(join(cwd, file), "utf8");
    // Count content lines. A trailing newline terminates the last line rather than
    // starting an empty one, so a 400-line newline-terminated file reports 400, not
    // 401. This refines the spec's literal `split("\n").length`, which counts the
    // trailing-newline empty element as a line — a real over-count on a hard gate.
    const lines =
      text === "" ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
    if (lines > max) offenders.push({ file, lines });
  }
  return offenders;
}
