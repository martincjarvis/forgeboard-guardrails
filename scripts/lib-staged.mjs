// The git-index / staged-content family of the shared gate helpers, split out
// of lib.mjs by subject (ADR-0009). Every export here is re-exported from
// lib.mjs, so consumers keep importing it from there unchanged.
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { git } from "../hooks/lib/run.mjs";

/** @param {string} s */
export function splitLines(s) {
  return s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Files in the index for this commit (added/copied/modified/renamed). */
export function stagedFiles() {
  const r = git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
  if (r.status !== 0) return [];
  return splitLines(r.stdout);
}

/** Every file git tracks. */
export function trackedFiles() {
  const r = git(["ls-files"]);
  return r.status === 0 ? splitLines(r.stdout) : [];
}

/** Files touched across a commit range — the range-scoped counterpart to
 *  stagedFiles(), for a check running where there is no index to read. A CI
 *  checkout of a pull request has no staged content (gate-6-pull-request.md:
 *  check 3 adapts `git diff --cached` to `git diff origin/<base>...HEAD`); this
 *  is that adaptation, shared by every check that needs it rather than
 *  reimplemented per check.
 *  @param {string} range */
export function changedFiles(range) {
  const r = git(["diff", "--name-only", "--diff-filter=ACMR", range]);
  if (r.status !== 0) return [];
  return splitLines(r.stdout);
}

/** Read a path's staged content — the git-index blob, via `git show :<path>` —
 *  rather than the working tree. During a commit the working tree can already
 *  differ from what is staged (a file edited after `git add`), and a check
 *  that reads disk there judges content that is not what is being committed
 *  (gate-2-commit.md: staged-content isolation, and the checks in 2.3 that
 *  read file content — 9, 15, 17 — the same as the file-scoped ones in 2.2).
 *  Falls back to the working tree when there is no index entry: an untracked
 *  path, or a whole-repository sweep run outside a commit (gate 7), where
 *  there is no staged/unstaged distinction to protect and the working tree is
 *  the thing actually being swept.
 *  @param {string} file */
export function readStaged(file) {
  const r = git(["show", `:${file}`]);
  return r.status === 0 ? r.stdout : readFileSync(file, "utf8");
}

/** A git command's combined stdout+stderr, for problem text — both streams
 *  the user needs to see when a command fails, read once rather than each
 *  call site reconstructing the pair.
 *  @param {{ stdout?: string, stderr?: string }} r @returns {string} */
function gitOutput(r) {
  return (r.stdout || "") + (r.stderr || "");
}

/** Runs fn() with the working tree matching the staged index — the
 *  hide-and-restore isolation family (gate-2-commit.md, "Two ways to
 *  isolate"), for checks 12/13 (build, unit tests) which need the real
 *  working tree rather than a detached copy.
 *
 *  Deliberately not `git stash push` + `pop`: `pop` re-applies a *patch*, and
 *  a file that was newly staged (never committed) and then edited unstaged
 *  is an add/add conflict `pop` cannot resolve on its own — reproducible with
 *  a brand-new staged file, edited-but-not-restaged, which is exactly the
 *  scenario this function exists to isolate. Instead: `git stash create`
 *  snapshots the current tracked changes into a durable git object without
 *  touching the working tree at all, `git stash store` makes that object a
 *  normal, listed stash entry (so a hard kill before this function reaches
 *  its restore step still leaves a `git stash list` entry the developer can
 *  recover by hand — the required survivability), `checkout-index`
 *  materialises the staged blobs over exactly the files that differ, and
 *  restore is a direct blob read from the snapshot back onto disk — never a
 *  patch, so nothing can conflict.
 *
 *  Text files only: restoration reads each blob as UTF-8, the same encoding
 *  every other staged-content read in this module uses (readStaged).
 *
 *  Returns fn()'s return value, or `{ isolationFailed: true, problem }` when
 *  the isolation itself could not be created or verified — per check 2, an
 *  unverifiable result blocks and says so rather than guessing.
 *  @template T
 *  @param {() => T} fn */
export function withStagedWorkingTree(fn) {
  const unstaged = git(["diff", "--name-only"]);
  if (unstaged.status !== 0) {
    return {
      isolationFailed: true,
      problem: "cannot read the unstaged diff to isolate the staged tree",
    };
  }
  const files = splitLines(unstaged.stdout);
  if (files.length === 0) return fn(); // already matches the index

  const label = "gate-2: isolate staged tree for build/test";
  const created = git(["stash", "create", label]);
  const snapshot = created.status === 0 ? created.stdout.trim() : "";
  if (!snapshot) {
    return {
      isolationFailed: true,
      problem:
        gitOutput(created) +
        (snapshot
          ? ""
          : "`git stash create` produced no snapshot to restore from"),
    };
  }
  const stored = git(["stash", "store", "-m", label, snapshot]);
  if (stored.status !== 0) {
    return {
      isolationFailed: true,
      problem: gitOutput(stored),
    };
  }

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    for (const f of files) {
      const blob = git(["show", `${snapshot}:${f}`]);
      if (blob.status === 0) {
        writeFileSync(f, blob.stdout);
      } else {
        // Not present in the working tree at snapshot time (an unstaged
        // deletion of a staged add) — remove it again.
        try {
          unlinkSync(f);
        } catch {
          /* already gone */
        }
      }
    }
    const list = git(["stash", "list"]);
    const first = list.status === 0 ? (list.stdout.split("\n")[0] ?? "") : "";
    if (first.includes(label)) git(["stash", "drop", "stash@{0}"]);
  };
  const onSignal = () => {
    restore();
    process.exit(130);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  try {
    const checkout = git([
      "checkout-index",
      "--index",
      "--force",
      "--",
      ...files,
    ]);
    if (checkout.status !== 0) {
      return {
        isolationFailed: true,
        problem: gitOutput(checkout),
      };
    }
    const verify = git(["diff", "--name-only"]);
    if (verify.status !== 0 || verify.stdout.trim() !== "") {
      return {
        isolationFailed: true,
        problem: "working tree still differs from the index after isolating it",
      };
    }
    return fn();
  } finally {
    restore();
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
  }
}
