import { readFileSync, existsSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { combine } from "../exec/commandRunner.ts";
import { logCommand } from "../exec/commandLog.ts";

/**
 * Checks that what the gates are about to read is what is being committed.
 *
 * `lint-staged` hides the unstaged remainder of a partially staged file before the
 * tasks run, so a gate reading from disk sees the index. That is the guarantee the
 * whole staged-content design rests on, and it was being assumed rather than
 * checked — when it did not hold, `secretlint` reported a private key that existed
 * only in the working tree, and the failure surfaced as an unexplained rejection
 * with no indication that the gates had been handed the wrong content.
 *
 * The dangerous direction is the other one. If the isolation can fail, it can leave
 * a gate reading content that was never staged and passing it, which is a gate
 * reporting on something other than the commit. This turns both directions into a
 * named, loud failure.
 *
 * Compared through git rather than by reading two files: `git diff --cached --name-only`
 * against the working tree is exactly the question being asked, and it applies the
 * repository's own line-ending and filter configuration. Comparing bytes on disk
 * would report every file in a repo with `core.autocrlf` on.
 */
export function checkStagedIsolation(files: string[], cwd: string): string[] {
  if (files.length === 0) return [];

  // Paths whose working-tree content differs from the index. `--` guards against
  // a filename that looks like a revision.
  const args = ["diff", "--name-only", "--", ...files];
  let differing: string | undefined;
  let failure = "";

  // Retried once: a lock held by a concurrent git operation is transient, and a
  // single retry distinguishes that from a repository this cannot read at all.
  for (let attempt = 1; attempt <= 2 && differing === undefined; attempt++) {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    if (result.status === 0) {
      differing = result.stdout;
      break;
    }
    failure =
      combine(result.stdout, result.stderr) || String(result.error ?? "");
  }

  if (differing === undefined) {
    // The check answers "is the working tree the index?". Unable to run, the answer
    // is unknown, and unknown must not be reported as yes.
    //
    // This returned `[]` until 2026-07-27, on the reasoning that a git failure is
    // not evidence of a breach. That was wrong in the way that matters: the
    // contention which makes git fail is the same contention under which the
    // isolation is suspected of failing, so the guard fell silent exactly when it
    // was needed. A blocked commit and a clear message is the cheaper error.
    logCommand({
      command: `git ${args.join(" ")}`,
      cwd,
      status: null,
      output: failure,
    });
    return [
      `staged-content isolation could not be verified: \`git ${args.join(" ")}\` failed. ` +
        `The gates below read files from disk, and without this check there is nothing ` +
        `establishing that what they read is what is being committed.\n${failure}`,
    ];
  }

  const problems: string[] = [];
  for (const file of new Set(differing.split("\n").filter(Boolean))) {
    // A path staged for deletion has no working-tree content by definition, and a
    // path not in the index is nothing to do with this commit.
    if (!existsSync(path.join(cwd, file))) continue;

    problems.push(
      `${file} differs between the index and the working tree at the point the gates run. ` +
        `The gates would judge content that is not being committed. This is a failure of ` +
        `staged-content isolation, not of the file — re-run the commit.`,
    );
  }

  return problems;
}

/**
 * The unstaged content a mismatch is hiding, for the diagnostics log.
 *
 * Named separately because it is only worth computing on the failing path, and
 * because it is the fact that was missing every time this defect appeared: which
 * content the gate actually saw.
 */
export function describeMismatch(file: string, cwd: string): string {
  try {
    const staged = execFileSync("git", ["show", `:${file}`], {
      cwd,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    const onDisk = readFileSync(path.join(cwd, file), "utf8");
    return (
      `${file}\n` +
      `  index:        ${staged.length} bytes\n` +
      `  working tree: ${onDisk.length} bytes\n` +
      `  the gates read the working tree`
    );
  } catch (error) {
    return `${file}: could not read both versions (${String(error)})`;
  }
}
