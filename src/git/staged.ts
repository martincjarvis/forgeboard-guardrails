import { execFileSync } from "node:child_process";

/**
 * Paths staged for commit that exist on disk.
 *
 * `--diff-filter=ACMR` drops Deletions and the source side of renames: gates read
 * file content, so handing them a path git knows about but the filesystem does not
 * turns into a commit-blocking gate failure that is not a finding (semgrep in
 * particular errors on a missing target).
 *
 * `-z` gives NUL-separated, unquoted paths — without it git quotes and escapes any
 * path containing spaces, quotes or non-ASCII bytes, and the escaped form is not a
 * usable filename.
 */
export function getStagedFiles(cwd: string): string[] {
  const output = execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
    { cwd, encoding: "utf8" }
  );
  return output.split("\0").filter(Boolean);
}
