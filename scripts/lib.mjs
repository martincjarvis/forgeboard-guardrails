// Shared helpers for the gate scripts. The process helpers come from the same
// cross-platform module the agent hooks use, so Windows resolving `npx` to
// `npx.cmd` is handled in one place and these scripts stay shell-free.
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { git, run, have, cleanGitEnv } from "../hooks/lib/run.mjs";

export { git, run, have, cleanGitEnv };

// Note: git exports GIT_DIR / GIT_INDEX_FILE / GIT_WORK_TREE (and a few more)
// into the environment when it runs a hook, so a child git spawned with those
// inherited would resolve THIS repository rather than the one its cwd points at
// — breaking the hook tests' throwaway repositories and confusing a pre-commit
// check that re-reads the index. cleanGitEnv (above, from run.mjs) strips them
// so a child git always resolves its repository from its cwd.

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
 *  reimplemented per check. */
export function changedFiles(range) {
  const r = git(["diff", "--name-only", "--diff-filter=ACMR", range]);
  if (r.status !== 0) return [];
  return splitLines(r.stdout);
}

/** The guardrail-class of one path, derived from .gitattributes (ADR-0003). An
 *  unclassified file is production — the fail-safe direction (file-classes.md). */
export function classOf(file) {
  const r = git(["check-attr", "guardrail-class", "--", file]);
  if (r.status !== 0) return "production";
  const m = r.stdout.match(/guardrail-class:\s*(\S+)/);
  return !m || m[1] === "unspecified" ? "production" : m[1];
}

/** The single component this repository ships, derived from the plugin manifest
 *  (ADR-0001, ADR-0003). Its paths are the conventional plugin directories that
 *  exist here; everything else is repository-wide and releases nothing. */
export function deriveComponent() {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(".claude-plugin/plugin.json", "utf8"));
  } catch {
    return null;
  }
  const name = manifest?.name;
  if (!name) return null;
  const pluginDirs = [
    "hooks",
    "skills",
    "commands",
    "agents",
    ".claude-plugin",
  ];
  const paths = pluginDirs.filter((d) => existsSync(d));
  return { name, paths };
}

/** Does a changed path fall under the component (its shipped directories)? */
export function touchesComponent(file, paths) {
  return paths.some((p) => file === p || file.startsWith(p + "/"));
}

const BINARY =
  /\.(png|jpg|jpeg|gif|ico|webp|pdf|zip|gz|tar|woff2?|ttf|eot|mp4|mov|exe|dll|so|dylib|pyc|wasm|lock)$/i;

/** A gate scans text files; binaries are skipped for content checks. */
export function isText(file) {
  return !BINARY.test(file);
}

/** Print a diagnosis (cross-gate rule: name the check, the path, the remedy). */
export function report(gate, findings, skips = []) {
  for (const s of skips) process.stderr.write(`${gate}: SKIP ${s}\n`);
  for (const f of findings) {
    const where = f.path ? ` (${f.path})` : "";
    process.stderr.write(`${gate}: FAIL ${f.check}${where}\n`);
    if (f.problem) process.stderr.write(`        ${f.problem}\n`);
    if (f.remedy) process.stderr.write(`        ${f.remedy}\n`);
  }
  process.exit(findings.length > 0 ? 2 : 0);
}

export function splitLines(s) {
  return s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
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
 *  the thing actually being swept. */
export function readStaged(file) {
  const r = git(["show", `:${file}`]);
  return r.status === 0 ? r.stdout : readFileSync(file, "utf8");
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
 *  unverifiable result blocks and says so rather than guessing. */
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
        (created.stdout || "") +
        (created.stderr || "") +
        (snapshot
          ? ""
          : "`git stash create` produced no snapshot to restore from"),
    };
  }
  const stored = git(["stash", "store", "-m", label, snapshot]);
  if (stored.status !== 0) {
    return {
      isolationFailed: true,
      problem: (stored.stdout || "") + (stored.stderr || ""),
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
        problem: (checkout.stdout || "") + (checkout.stderr || ""),
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

/** The resolved dependency tree, direct and transitive, as a Map of
 *  name -> version. `npm ls --all --json` is the no-extra-tooling option
 *  (registers.md), optionally narrowed with `--omit=dev` to the runtime
 *  subset — the same runtime/development split gate 6 checks 6 and 7 both
 *  need (registers.md: "scope changes the answer for both"). Returns null
 *  when the tree could not be read at all (`npm ci` never ran, or the output
 *  is not JSON), which is unverifiable rather than clean and must not be
 *  read as "nothing resolved". */
export function resolvedDependencyTree({ omitDev = false } = {}) {
  const args = ["ls", "--all", "--json"];
  if (omitDev) args.push("--omit=dev");
  const r = run("npm", args);
  let tree;
  try {
    tree = JSON.parse(r.stdout || "");
  } catch {
    return null;
  }
  const deps = new Map();
  const seen = new Set();
  (function walk(node) {
    for (const [name, info] of Object.entries(node?.dependencies ?? {})) {
      if (info?.version) deps.set(name, info.version);
      const key = `${name}@${info?.version}`;
      if (!seen.has(key)) {
        seen.add(key);
        walk(info);
      }
    }
  })(tree);
  return deps;
}

/** Locate the default branch's remote tip, as a rev to diff against. */
export function resolveBase() {
  const head = git(["rev-parse", "--abbrev-ref", "origin/HEAD"]);
  const candidate = head.status === 0 ? head.stdout.trim() : "origin/main";
  return git(["rev-parse", "--verify", "--quiet", candidate]).status === 0
    ? candidate
    : null;
}

/** GitHub's code-scanning ingestion treats a SARIF `artifactLocation.uri`
 *  with backslashes as naming a different file from the same path written
 *  with forward slashes. pull-request.yml runs the identical semgrep scan on
 *  two matrix legs; on Linux it already emits `hooks/lib/run.mjs`, but the
 *  Windows leg emits `hooks\lib\run.mjs` — GitHub's ingestion never
 *  reconciles the two, so the same finding double-counts, cannot anchor to
 *  the changed lines it should annotate, and cannot be dismissed once for
 *  both legs. Every artifact URI in the file is normalised to forward
 *  slashes before the workflow uploads it — a no-op on Linux, where the
 *  paths already are forward slashes. A missing or unreadable file is left
 *  alone; the caller's own status check reports that separately. */
export function normalizeSarifPaths(path) {
  let sarif;
  try {
    sarif = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return;
  }
  for (const run_ of sarif.runs ?? []) {
    for (const result of run_.results ?? []) {
      for (const loc of result.locations ?? []) {
        const artifact = loc.physicalLocation?.artifactLocation;
        if (artifact && typeof artifact.uri === "string") {
          artifact.uri = artifact.uri.replace(/\\/g, "/");
        }
      }
    }
  }
  writeFileSync(path, JSON.stringify(sarif));
}
