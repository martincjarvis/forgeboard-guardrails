#!/usr/bin/env node
// Gate 4 — Task completion. Fires when work is handed back.
//
// Measures **change size** — added plus deleted across the branch, which no
// single commit shows. That branch scope is the whole reason this gate exists.
//
// File length and complexity are NOT here. They are per-file and per-function
// properties, true at every moment rather than only across a branch, and gate 2
// refuses them at the commit that causes them. Checking them here as well would
// leave a check that can never fail, because gate 2 already refused the commit.
// See docs/standards/guardrails/gate-4-task-completion.md.
//
// Exit 0 reports. Exit 2 blocks the hand-off.
// cspell:ignore unpushed Unpushed
import { git, resolveBase } from "./lib/run.mjs";
import { describeUnpushed, readUnpushed } from "./lib/unpushed.mjs";
import { CHANGE_WARN, CHANGE_ERROR } from "./lib/thresholds.mjs";
import { pathToFileURL } from "node:url";

// Re-exported so the test suite imports `describeUnpushed` from this hook
// unchanged — the function moved to ./lib/unpushed.mjs, the public surface
// of this hook did not.
export { describeUnpushed };

const OVERRIDE = "[large-pr]";

// File class — derived from .gitattributes through the guardrail-class attribute
// (file-classes.md, ADR-0003), not from a path regex. An unclassified file is
// production: the fail-safe direction, so a file nothing declares is held to the
// strictest class rather than silently dropped from every measure. If
// check-attr itself cannot run the result is unverifiable, and the strictest
// class is still the safe answer.
/** @param {string} file @returns {string} */
function classOf(file) {
  const r = git(["check-attr", "guardrail-class", "--", file]);
  if (r.status !== 0) return "production";
  // A plain string search, not a regex: this exact pattern
  // (`\s*(\S+)` immediately inside a short function) is what was defeating
  // lizard's line-span detection here, ballooning this function's reported
  // length into the hundreds of unrelated lines that follow it — the actual
  // cause behind the CCN/length warning this function used to trip.
  const marker = "guardrail-class:";
  const idx = r.stdout.indexOf(marker);
  const value =
    idx < 0
      ? ""
      : r.stdout
          .slice(idx + marker.length)
          .trim()
          .split("\n")[0];
  return !value || value === "unspecified" ? "production" : value;
}

// file-classes.md: production, configuration and tooling count toward change
// size; test, documentation and agent-context do not. A threshold that
// punishes tests teaches the author to write fewer of them.
const COUNTED = new Set(["production", "configuration", "tooling"]);

// A generated file — declared through its own `guardrail-generated`
// attribute, never a sixth guardrail-class (file-classes.md: "a separate
// attribute, not a sixth class" — a lockfile keeps its `guardrail-class` for
// every other check; only change size and the length limit read this one).
// `git check-attr` always prints a line, even for a path no .gitattributes
// mentions — verified directly, not assumed: `unspecified` (never declared)
// and `unset` (`-guardrail-generated`) both read `<marker><value>` the same
// as `set` does, so the fail-safe direction is "only `set` counts as
// generated", the same shape classOf() already uses for guardrail-class.
/** @param {string} file @returns {boolean} */
function isGenerated(file) {
  const r = git(["check-attr", "guardrail-generated", "--", file]);
  if (r.status !== 0) return false;
  const marker = "guardrail-generated:";
  const idx = r.stdout.indexOf(marker);
  if (idx < 0) return false;
  const value = r.stdout
    .slice(idx + marker.length)
    .trim()
    .split("\n")[0];
  return value === "set";
}

/** `git diff -z --numstat` rows as `[added, deleted, path]`, path being the
 *  file as it now stands.
 *
 *  `-z` is what makes the path usable. Without it a renamed file's third
 *  column is `{scripts => .guardrails}/a.mjs` — not a path, so `check-attr`
 *  resolves it `unspecified`, which file classes read as `production`. Under
 *  `-z` a rename instead emits three NUL-terminated fields, old path then
 *  new, and the counts are tab-separated from each other only.
 *  @param {string} stdout
 *  @returns {[string, string, string][]} */
export function parseNumstatZ(stdout) {
  const fields = stdout.split("\0");
  /** @type {[string, string, string][]} */
  const rows = [];
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (!field) continue;
    const [added, deleted, inline] = field.split("\t");
    if (added === undefined || deleted === undefined) continue;
    if (inline) {
      rows.push([added, deleted, inline]);
    } else {
      // A rename: this field ended after the counts, and the two paths follow.
      const renamed = fields[i + 2];
      if (renamed === undefined) continue;
      rows.push([added, deleted, renamed]);
      i += 2;
    }
  }
  return rows;
}

// Check 1 — change size (thresholds.md, gate-4-task-completion.md row 1).
// Counted files together count as one number; the override marker clears
// this check only. A generated file — a lock file, `*.g.cs`, any output no
// author can meaningfully edit because the next generation run discards it —
// contributes nothing here (file-classes.md: "a generated file counts toward
// neither change size nor the length limit"); its `guardrail-class` still
// governs every other check.
/** @param {string} base @param {string[]} findings @param {string[]} warnings */
function measureChangeSize(base, findings, warnings) {
  const numstat = git(["diff", "-z", "--numstat", `${base}...HEAD`]);
  if (numstat.status !== 0) return;

  let counted = 0;
  for (const [added, deleted, file] of parseNumstatZ(numstat.stdout)) {
    if (added === "-") continue;
    if (!COUNTED.has(classOf(file))) continue;
    if (isGenerated(file)) continue;
    counted += Number(added) + Number(deleted);
  }

  if (counted > CHANGE_ERROR) {
    const log = git(["log", `${base}..HEAD`, "--format=%B"]);
    if (!log.stdout.includes(OVERRIDE)) {
      findings.push(
        `change size ${counted} lines exceeds the error threshold (${CHANGE_ERROR}). ` +
          `Split it, or report the size and what is driving it — accepting it with the ` +
          `${OVERRIDE} marker is a human's decision, not one this check, or the agent ` +
          `that tripped it, may make on its own.`,
      );
    }
  } else if (counted > CHANGE_WARN) {
    warnings.push(
      `change size ${counted} lines is in the warn band (${CHANGE_WARN}). ` +
        `Split it, or record why this one is justified.`,
    );
  }
}

function main() {
  // An explicit base (argv[2]) wins over resolveBase(). Invoked
  // standalone (the Stop hook, hooks.json) this hook has always had to
  // derive its own base and resolveBase() is the right, and only, way to do
  // that. Invoked as a subprocess of scripts/gate-6-pull-request.mjs, the
  // caller has *already* resolved a base for this exact checkout — from
  // GITHUB_BASE_REF in CI, falling back to resolveBase() only for a manual
  // run — before spawning this hook; re-deriving here via resolveBase()
  // alone hits the same gap the caller just worked around, and does so
  // unconditionally: GitHub Actions' `actions/checkout` never runs `git
  // remote set-head origin -a`, so `origin/HEAD` is unresolvable on every
  // run of that workflow, not intermittently. Before this fix, gate 6 always
  // resolved a base while this hook, spawned seconds later in the same
  // checkout, always reported the SKIP below — so gate 4's structural checks
  // (change size, file length, complexity) had never actually run in CI, on
  // any pull request, despite reading as an ordinary, correctly-worded skip.
  const base = process.argv[2] || resolveBase();
  if (!base) {
    // No base to compare against: origin/HEAD could not be resolved and no
    // explicit base was given. A silent exit(0) here would read as "nothing
    // to measure" when the truth is "could not tell" — say so instead
    // (cross-gate-rules.md).
    process.stderr.write(
      "gate 4: SKIP change size / file length / complexity — origin/HEAD could not be resolved\n",
    );
    process.exit(0);
  }

  /** @type {string[]} */
  const findings = [];
  /** @type {string[]} */
  const warnings = [];

  // Report what was derived (cross-gate rules): the thresholds in force and
  // where they come from. These are this standard's defaults; no stack
  // analyser overrides them for this repository.
  process.stderr.write(
    `gate 4: thresholds change-warn=${CHANGE_WARN} change-error=${CHANGE_ERROR} ` +
      `(standard defaults; file class via git check-attr)\n`,
  );

  measureChangeSize(base, findings, warnings);

  for (const w of warnings) process.stderr.write(`gate 4: ${w}\n`);
  for (const f of findings) process.stderr.write(`gate 4: ${f}\n`);

  // A fact for the reviewer handing work back, not a refusal: how many commits
  // on this branch are not on the remote. See describeUnpushed for why this
  // reports and never pushes.
  process.stderr.write(`gate 4: ${readUnpushed()}\n`);

  process.exit(findings.length > 0 ? 2 : 0);
}

// Run only when invoked as the hook. Importing the module — the tests do, for
// the pure functions above — must not execute a gate.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
