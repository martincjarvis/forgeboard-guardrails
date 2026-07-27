import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
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
/**
 * The manifest fields a lockfile mirrors, in npm's `packages[""]` entry. A change
 * anywhere else — `scripts`, `description`, `engines`' neighbours — cannot alter
 * the lockfile.
 */
const LOCKFILE_FIELDS = [
  "name",
  "version",
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
  "bundleDependencies",
  "bundledDependencies",
  "overrides",
  "workspaces",
  "bin",
  "engines",
];

/**
 * Whether this manifest's change could move the lockfile at all.
 *
 * Without this the gate is unsatisfiable for a change it should never have
 * objected to. Adding an npm script alters `package.json` and cannot alter
 * `package-lock.json`, so `npm install` produces nothing to stage and the demand
 * can never be met — found when this gate blocked the commit that introduced it.
 * A gate with no reachable remedy is worse than no gate: it teaches people to
 * reach for `--no-verify`.
 *
 * Compares only the mirrored fields, so it needs no dependency resolution. When
 * the previous version cannot be read — a new manifest, or no history — the
 * answer is yes, because a manifest that never had a lockfile pairing is exactly
 * the case worth flagging.
 */
function affectsLockfile(file: string, cwd: string): boolean {
  let previous: Record<string, unknown>;
  let current: Record<string, unknown>;
  try {
    previous = JSON.parse(
      execFileSync("git", ["show", `HEAD:${file}`], { cwd, encoding: "utf8" }),
    );
    current = JSON.parse(readFileSync(path.join(cwd, file), "utf8"));
  } catch {
    return true;
  }

  return LOCKFILE_FIELDS.some(
    (field) =>
      JSON.stringify(previous[field]) !== JSON.stringify(current[field]),
  );
}

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

    if (!files.includes(normalised) && affectsLockfile(file, cwd)) {
      problems.push(
        `${file} is staged without ${normalised}. A manifest and its lockfile are one fact ` +
          `recorded twice, and a commit that moves only one leaves \`npm ci\` and \`npm install\` ` +
          `disagreeing. Run \`npm install\` and stage the lockfile with it.`,
      );
    }
  }

  return problems;
}
