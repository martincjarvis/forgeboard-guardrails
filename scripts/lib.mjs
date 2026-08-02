// cspell:ignore martincjarvis targetable
// Shared helpers for the gate scripts. The process helpers come from the same
// cross-platform module the agent hooks use, so Windows resolving `npx` to
// `npx.cmd` is handled in one place and these scripts stay shell-free.
//
// Split by subject (ADR-0009): the git index / staged-content, coverage, and
// scan/SARIF families live in sibling lib-staged.mjs, lib-coverage.mjs and
// lib-scans.mjs and are re-exported here, so every existing
// `import { ... } from "./lib.mjs"` keeps working unchanged. This file holds
// the cross-cutting helpers that did not form a distinct enough cluster to
// extract — file/class classification, the diagnosis printer, and the
// dependency/licence readers.
import { existsSync, readFileSync } from "node:fs";
import { git, run, have, cleanGitEnv, resolveBase } from "../hooks/lib/run.mjs";

export { git, run, have, cleanGitEnv, resolveBase };

// Note: git exports GIT_DIR / GIT_INDEX_FILE / GIT_WORK_TREE (and a few more)
// into the environment when it runs a hook, so a child git spawned with those
// inherited would resolve THIS repository rather than the one its cwd points at
// — breaking the hook tests' throwaway repositories and confusing a pre-commit
// check that re-reads the index. cleanGitEnv (above, from run.mjs) strips them
// so a child git always resolves its repository from its cwd.

import {
  splitLines,
  stagedFiles,
  trackedFiles,
  changedFiles,
  readStaged,
  withStagedWorkingTree,
} from "./lib-staged.mjs";
import {
  classifyTestCoverageOutcome,
  classifyDiffCoverOutcome,
  diffCoverTotalLines,
  extractCoverageAndTestSummary,
} from "./lib-coverage.mjs";
import {
  normalizeSarifPaths,
  filterSuppressedSarif,
  classifyOsvScannerOutcome,
  extractOsvJsonFindings,
  extractOsvSarifFindings,
  resolvedSemgrepRules,
  semgrepRuleRecord,
} from "./lib-scans.mjs";

export {
  splitLines,
  stagedFiles,
  trackedFiles,
  changedFiles,
  readStaged,
  withStagedWorkingTree,
  classifyTestCoverageOutcome,
  classifyDiffCoverOutcome,
  diffCoverTotalLines,
  extractCoverageAndTestSummary,
  normalizeSarifPaths,
  filterSuppressedSarif,
  classifyOsvScannerOutcome,
  extractOsvJsonFindings,
  extractOsvSarifFindings,
  resolvedSemgrepRules,
  semgrepRuleRecord,
};

/** The guardrail-class of one path, derived from .gitattributes (ADR-0003). An
 *  unclassified file is production — the fail-safe direction (file-classes.md).
 *  @param {string} file @returns {string} */
export function classOf(file) {
  const r = git(["check-attr", "guardrail-class", "--", file]);
  if (r.status !== 0) return "production";
  const m = r.stdout.match(/guardrail-class:\s*(\S+)/);
  const cls = m && m[1];
  return !cls || cls === "unspecified" ? "production" : cls;
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

/** Does a changed path fall under the component (its shipped directories)?
 *  @param {string} file @param {string[]} paths */
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

/**
 * @param {(f: string) => string} [readFile]
 * @param {(p: string) => boolean} [exists]
 */
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

/** A gate scans text files; binaries are skipped for content checks.
 *  @param {string} file */
export function isText(file) {
  return !BINARY.test(file);
}

// Backticks anywhere in a register cell. Every register writes its identity
// cells as markdown code spans — a branch, a dependency, a rule name — while
// the value a gate compares against arrives bare, off the command line or out
// of the resolved dependency tree. Compared raw, the two never match and an
// approved row reads as absent.
const CODE_SPAN = /`/g;

/** A register cell's text with its code-span backticks removed, for comparing
 *  against a bare value. Shared rather than re-declared per check: the same
 *  mismatch has now been found in two registers, and a third copy is a third
 *  chance to forget it.
 *  @param {string | null | undefined} cell */
export function bareCell(cell) {
  return (cell || "").replace(CODE_SPAN, "").trim();
}

/** Print a diagnosis (cross-gate rule: name the check, the path, the remedy).
 *  Always exits (0 when no findings, 2 otherwise) — typed `never` so callers
 *  narrow correctly after a failure report rather than reading past it.
 *  @param {string} gate
 *  @param {{ check: string, path?: string, problem?: string, remedy?: string }[]} findings
 *  @param {string[]} [skips]
 *  @returns {never} */
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

/** gate 7's own print loop used to print only
 *  `String(f.problem).split("\n")[0].slice(0, 200)`, on the assumption that
 *  an external tool's first output line summarises it. True for neither
 *  tool that tripped it: secretlint's stdout opens with a blank line before
 *  its first real finding (the printed body was empty), and lizard's real
 *  output opens with a decorative `====…` banner ahead of the per-function
 *  rows that are the actual finding. Drops every blank line and every
 *  bare `====…`/`----…` divider line, wherever they occur, and returns up
 *  to `maxLines` of what is left, each capped at `maxLineLength` — enough
 *  for a reader to act on, not the first line of whatever the tool
 *  happened to emit.
 *  @param {string | null | undefined} problem */
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
