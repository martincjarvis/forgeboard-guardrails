// cspell:ignore martincjarvis targetable
// Shared helpers for the gate scripts. The process helpers come from the same
// cross-platform module the agent hooks use, so Windows resolving `npx` to
// `npx.cmd` is handled in one place and these scripts stay shell-free.
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { git, run, have, cleanGitEnv, resolveBase } from "../hooks/lib/run.mjs";

export { git, run, have, cleanGitEnv, resolveBase };

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

/** True only in this toolkit's own repository. Several checks skip here,
 *  because this repository's test suite legitimately asserts its own history
 *  and its corpus legitimately names every stack it documents.
 *
 *  The plugin's `name` decides, not the manifest's existence: a repository
 *  developing some other Claude plugin carries the same file, and exempting
 *  it would disable exactly the checks that catch ported content. A fork
 *  keeps the name and stays the toolkit; a fork that renames is a different
 *  plugin, and a consumer of these standards. */
export const TOOLKIT_PLUGIN_NAME = "forgeboard-guardrails";

export function isToolkit(
  readFile = (f) => readFileSync(f, "utf8"),
  exists = existsSync,
) {
  const manifest = ".claude-plugin/plugin.json";
  if (!exists(manifest)) return false;
  try {
    return JSON.parse(readFile(manifest))?.name === TOOLKIT_PLUGIN_NAME;
  } catch {
    // An unreadable or malformed manifest is not proof this is the toolkit,
    // and the fail-safe direction is to run the checks rather than skip them.
    return false;
  }
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

const DECORATIVE_LINE_RE = /^[=-]{5,}$/;

/** Fix 92 — gate 7's own print loop used to print only
 *  `String(f.problem).split("\n")[0].slice(0, 200)`, on the assumption that
 *  an external tool's first output line summarises it. True for neither
 *  tool that tripped it: secretlint's stdout opens with a blank line before
 *  its first real finding (the printed body was empty), and lizard's real
 *  output opens with a decorative `====…` banner ahead of the per-function
 *  rows that are the actual finding. Drops every blank line and every
 *  bare `====…`/`----…` divider line, wherever they occur, and returns up
 *  to `maxLines` of what is left, each capped at `maxLineLength` — enough
 *  for a reader to act on, not the first line of whatever the tool
 *  happened to emit. */
export function formatFindingBody(
  problem,
  { maxLines = 5, maxLineLength = 200 } = {},
) {
  const content = [];
  for (const line of String(problem ?? "").split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || DECORATIVE_LINE_RE.test(trimmed)) continue;
    content.push(
      line.length > maxLineLength ? line.slice(0, maxLineLength) : line,
    );
    if (content.length >= maxLines) break;
  }
  return content;
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

/** This repository's own declared licence, read from `package.json`'s native
 *  `license` field — the standard, already-present place a Node project
 *  states its SPDX identifier (`npm ls`, `license-checker` and this
 *  repository's own dependency-licence register all read the same field for
 *  every *dependency*; this reads it for the repository itself), rather than
 *  inventing a new config file for the same fact. Null when the field is
 *  absent or blank, which the licence-policy decision rule
 *  (check-licence-policy.mjs) treats as "the repository declares no licence"
 *  (gate-6-pull-request.md) — this toolkit's own case today. */
export function repositoryLicenceId() {
  let pkg;
  try {
    pkg = JSON.parse(readFileSync("package.json", "utf8"));
  } catch {
    return null;
  }
  const license = pkg?.license;
  return typeof license === "string" && license.trim() ? license.trim() : null;
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

/** Fix 25 — semgrep's SARIF output includes a finding suppressed in source
 *  (an inline marker comment) rather than omitting it, marking it
 *  `suppressions: [{ kind: "inSource" }]` so a consumer can choose to hide
 *  it. gate-6-pull-request.mjs's own check honours the suppression and
 *  exits 0 — the register row is what accepted it. GitHub's code-scanning
 *  check is built from the identical uploaded SARIF and has no such
 *  awareness: it treats every result in the file as a candidate new alert
 *  and fails the pull request on a finding this repository already
 *  accepted. Dropping these results before upload is not less honest than
 *  uploading them — the suppression is already recorded in
 *  docs/registers/suppression-register.md, which is the audit trail a
 *  reviewer actually reads; the SARIF file's job on the platform is to
 *  surface what is NOT already accounted for. A missing or unreadable file
 *  is left alone, the same as normalizeSarifPaths above — the caller's own
 *  status check reports that separately. */
export function filterSuppressedSarif(path) {
  let sarif;
  try {
    sarif = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return;
  }
  for (const run_ of sarif.runs ?? []) {
    run_.results = (run_.results ?? []).filter(
      (result) =>
        !(result.suppressions ?? []).some((s) => s.kind === "inSource"),
    );
  }
  writeFileSync(path, JSON.stringify(sarif));
}

/** Fix 11 (gate-5-push.md: "A broken coverage command blocks the push
 *  without claiming a shortfall") — splits the test verdict from the
 *  coverage verdict for a single combined `c8 --check-coverage ... node
 *  --test ...` invocation, rather than reporting one compound "either a test
 *  failed or coverage is below the floor" finding that cannot name its own
 *  cause.
 *
 *  Three outcomes, distinguished from the command's own output rather than
 *  its exit code (all three exit non-zero alike):
 *  - node:test's own spec-reporter summary line (`ℹ fail N` / `# fail N`,
 *    the same pattern gate-0-baseline.mjs already reads) names a failure
 *    count regardless of what coverage did — a test failure is a test
 *    failure whether or not coverage also happened to fall short.
 *  - c8's own "ERROR: Coverage for lines (X%) does not meet global
 *    threshold (Y%)" line only prints once the underlying command itself
 *    exited 0 and coverage alone fell short of `--lines=<threshold>`.
 *  - Neither line present, but the command still exited non-zero: the
 *    command itself did not run to completion (a missing file, a crashed
 *    process, a tool not installed) — genuinely unknown, and must not be
 *    reported as though it were a shortfall. */
export function classifyTestCoverageOutcome(output) {
  const failMatch = output.match(/# fail (\d+)|ℹ fail (\d+)/);
  const failCount = failMatch ? Number(failMatch[1] || failMatch[2]) : 0;
  if (failCount > 0) {
    return {
      kind: "test-failure",
      detail: `${failCount} unit test(s) failed`,
    };
  }
  const shortfall = output.match(
    /ERROR: Coverage for lines \(([\d.]+)%\) does not meet global threshold \(([\d.]+)%\)/,
  );
  if (shortfall) {
    return {
      kind: "coverage-shortfall",
      detail: `coverage is ${shortfall[1]}%, below the ${shortfall[2]}% floor`,
    };
  }
  return {
    kind: "broken-command",
    detail:
      "the command exited non-zero without a test-runner summary or a coverage report — it did not run to completion",
  };
}

/** Classify `diff-cover`'s own output for gate 6 check 8, "changed-line
 *  coverage" (gate-6-pull-request.md, "coverage and untrusted runs": the
 *  overall floor and the changed-line floor are two different numbers,
 *  computed two different ways, and both must be wired as blocking). The
 *  same three-outcome problem classifyTestCoverageOutcome above solves for
 *  c8: a genuine shortfall against `--fail-under` and a command that did
 *  not run to completion (the Cobertura report missing, the tool crashing)
 *  both exit non-zero, and the exit code alone cannot tell them apart —
 *  only diff-cover's own "Failure: Coverage (X%) is below the threshold
 *  (Y%)" line distinguishes a real shortfall from a broken run. */
export function classifyDiffCoverOutcome(output) {
  const shortfall = output.match(
    /Failure: Coverage \(([\d.]+)%\) is below the threshold \(([\d.]+)%\)/,
  );
  if (shortfall) {
    return {
      kind: "shortfall",
      detail: `changed-line coverage is ${shortfall[1]}%, below the ${shortfall[2]}% floor`,
    };
  }
  return {
    kind: "broken-command",
    detail:
      "diff-cover exited non-zero without a threshold-failure line — it did not run to completion (see the log above for why)",
  };
}

/** Fix 51 — a percentage computed from zero measured items is unavailable,
 *  not a pass: on a run whose test suite crashed before executing anything,
 *  the Cobertura report it wrote has zero instrumented statements, diff-cover
 *  finds no changed line to check against it, and prints `Total: 0 lines` /
 *  `Coverage: 100%` — then exits 0, because zero missing out of zero met is
 *  a 100% ratio by the arithmetic alone. That is the exit-0 class inside the
 *  check gate 6's changed-line coverage exists to close, not a clean run:
 *  cross-gate-rules.md already says a check that could not run says so
 *  rather than asserting a cause, and a report covering nothing did not run
 *  in the sense that matters. Reads diff-cover's own `Total:` line — present
 *  whether the run passed or failed — rather than treating any zero-missing
 *  result as clean. `null` when the line never printed at all (the command
 *  did not get that far), distinct from a genuine `0`. */
export function diffCoverTotalLines(output) {
  const m = output.match(/^Total:\s*(\d+)\s*lines?/m);
  return m ? Number(m[1]) : null;
}

/** osv-scanner (fix 44 — cross-gate-rules.md, "never claim more than was
 *  checked"): a non-zero exit means either "vulnerabilities found" or "the
 *  scan itself did not complete" (a missing lockfile, an unsupported
 *  ecosystem, a network failure, a version mismatch) — the same shape
 *  classifyTestCoverageOutcome and classifyDiffCoverOutcome above already
 *  solve for their own tools, generalised to cross-gate-rules.md's own
 *  wording: "a refusal names the specific thing being refused; a refusal
 *  whose problem text contains no identifier is itself a finding." Audit 12
 *  found exactly that live: a CI run failed gate 6 with osv-scanner's own
 *  startup banner as the problem text and no vulnerability id anywhere in
 *  it, while the standalone osv-scanner check on the same commit passed
 *  clean — the exit code alone cannot tell "found something" from "could not
 *  finish", only the tool's own structured output can (osv-scanner's
 *  `--format json`, or the SARIF this repository already produces for gate
 *  6's upload — extractOsvJsonFindings / extractOsvSarifFindings below turn
 *  either into the same flat id list this classifies).
 *  Zero findings on a non-zero exit is `unavailable`, not a pass and not a
 *  finding: the caller reports it as a skip naming what went wrong, the same
 *  as osv-scanner not being on PATH at all. */
export function classifyOsvScannerOutcome(status, findings) {
  if (status === 0) return { kind: "clean", findings: [] };
  if (findings.length > 0) return { kind: "vulnerabilities", findings };
  return {
    kind: "unavailable",
    detail:
      `osv-scanner exited with status ${status} but named no vulnerability — ` +
      "the scan itself did not complete (a missing lockfile, an unsupported " +
      "ecosystem, a network failure, a version mismatch); rerun locally to see why",
  };
}

/** Vulnerability ids out of osv-scanner's own `--format json` shape
 *  (`results[].packages[].vulnerabilities[].id`, per its documented output).
 *  Unparseable or empty stdout yields no findings — the caller's non-zero
 *  exit plus an empty list is what classifyOsvScannerOutcome reads as
 *  `unavailable` rather than `clean`. */
export function extractOsvJsonFindings(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  const findings = [];
  for (const result of parsed?.results ?? []) {
    for (const pkg of result?.packages ?? []) {
      for (const vuln of pkg?.vulnerabilities ?? []) {
        if (vuln?.id) findings.push(vuln.id);
      }
    }
  }
  return findings;
}

/** The same extraction as extractOsvJsonFindings, from the SARIF file gate 6
 *  already writes and uploads (`runs[].results[].ruleId`) — read after
 *  normalizeSarifPaths/filterSuppressedSarif so a finding already accepted
 *  by an in-source suppression is not read back as blocking here either. A
 *  missing or unreadable file yields no findings, same as unparseable JSON. */
export function extractOsvSarifFindings(sarifPath) {
  let sarif;
  try {
    sarif = JSON.parse(readFileSync(sarifPath, "utf8"));
  } catch {
    return [];
  }
  const findings = [];
  for (const run_ of sarif?.runs ?? []) {
    for (const result of run_?.results ?? []) {
      if (result?.ruleId) findings.push(result.ruleId);
    }
  }
  return findings;
}

/** The figures a reader who is not a developer needs to see on the run's own
 *  page without downloading anything: the test pass/fail/total counts, and
 *  the overall lines-coverage percentage — read from the same c8 + node:test
 *  output classifyTestCoverageOutcome above already parses, so both read the
 *  one command actually ran rather than a second, divergent source. Returns
 *  `null` for a figure this output does not contain (a crashed run before
 *  either reporter printed) rather than a false zero — gate-6-pull-request.md
 *  "coverage legible without a download": a reader must see the number, not
 *  a plausible-looking placeholder standing in for a command that never
 *  finished. */
export function extractCoverageAndTestSummary(output) {
  const testsMatch = output.match(/# tests (\d+)|ℹ tests (\d+)/);
  const passMatch = output.match(/# pass (\d+)|ℹ pass (\d+)/);
  const failMatch = output.match(/# fail (\d+)|ℹ fail (\d+)/);
  const coverageMatch = output.match(
    /^All files\s*\|\s*[\d.]+\s*\|\s*[\d.]+\s*\|\s*[\d.]+\s*\|\s*([\d.]+)/m,
  );
  const num = (m) => (m ? Number(m[1] || m[2]) : null);
  return {
    tests: num(testsMatch),
    pass: num(passMatch),
    fail: num(failMatch),
    linesCoveragePercent: coverageMatch ? Number(coverageMatch[1]) : null,
  };
}
