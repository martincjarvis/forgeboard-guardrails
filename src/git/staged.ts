import { execFileSync } from "node:child_process";

/**
 * Every path in the index diff, including deletions and the source side of renames.
 *
 * This feeds component *selection* only — never a gate's file list. Deleting or
 * renaming a file is an ordinary way to break a component's build, so the component
 * must still be gated; filtering deletions out here silently skipped that (a
 * delete-only change to a component ran none of its build or test commands).
 *
 * Gate inputs come from lint-staged instead, whose own diffFilter defaults to ACMR,
 * so a path that no longer exists on disk never reaches a content-reading gate.
 *
 * `-z` gives NUL-separated, unquoted paths — without it git quotes and escapes any
 * path containing spaces, quotes or non-ASCII bytes, and the escaped form is not a
 * usable filename.
 */
export function getStagedPaths(cwd: string): string[] {
  const output = execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "-z"],
    {
      cwd,
      encoding: "utf8",
    },
  );
  return output.split("\0").filter(Boolean);
}
