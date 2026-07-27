import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Refuses a commit that changes a `package.json` without its lockfile.
 *
 * A manifest and its lockfile are one fact recorded twice. When they disagree,
 * `npm ci` installs one thing and `npm install` another, and the next fresh
 * checkout silently rewrites the lockfile as a side effect of installing — which
 * is how this was found: `engines` was added to the toolkit's manifest and the
 * lockfile still described the package without it for two days, discovered only
 * because a new worktree's `npm install` came back with a dirty tree.
 *
 * Deliberately a staging check rather than a content check. Deciding whether a
 * lockfile is *correct* for a manifest means resolving the dependency graph, which
 * is `npm install`'s job and takes as long as it takes. Requiring the two to move
 * together is cheap, has no false negatives worth the difference, and the fix is
 * always the same: run `npm install` and stage the result.
 */
export function checkLockfileSync(files: string[], cwd: string): string[] {
  const problems: string[] = [];

  for (const file of files) {
    if (path.posix.basename(file) !== "package.json") continue;

    // The lockfile beside this manifest, not the root one — in a monorepo they are
    // different files and pairing a nested manifest with the root lockfile would
    // let a real mismatch through while blaming the wrong one.
    const lockfile = path.posix.join(
      path.posix.dirname(file),
      "package-lock.json",
    );
    const normalised = lockfile.startsWith("./") ? lockfile.slice(2) : lockfile;

    // A project with no lockfile is not using one. Inventing the requirement would
    // block commits in repos this gate has no business in.
    if (!existsSync(path.join(cwd, normalised))) continue;

    if (!files.includes(normalised)) {
      problems.push(
        `${file} is staged without ${normalised}. A manifest and its lockfile are one fact ` +
          `recorded twice, and a commit that moves only one leaves \`npm ci\` and \`npm install\` ` +
          `disagreeing. Run \`npm install\` and stage the lockfile with it.`,
      );
    }
  }

  return problems;
}
