#!/usr/bin/env node
// Gate 4 — Task completion. Fires when work is handed back.
//
// Measures the whole branch against its base and reports every finding in one
// pass — no stop at the first, because the author wants the full list once.
// See docs/standards/guardrails/gate-4-task-completion.md.
//
// Exit 0 reports. Exit 2 blocks the hand-off.
import { existsSync, readFileSync, statSync } from "node:fs";
import { git, resolveBase } from "./lib/run.mjs";
import { pathToFileURL } from "node:url";

const CHANGE_WARN = 400;
const CHANGE_ERROR = 800;
const FILE_LENGTH_ERROR = 400;
const OVERRIDE = "[large-pr]";

// Complexity, function length and parameter count (thresholds.md — gap-fill
// defaults; JavaScript/TypeScript has no stack opinion beyond ESLint's own
// core rules, so these values ARE the stack's own analyser configuration,
// not a substitute for one, per thresholds.md: "take the analyser's
// recommended rule set... only where the stack has no native opinion").
const COMPLEXITY_WARN = 10;
const COMPLEXITY_ERROR = 15;
const FUNCTION_LENGTH_WARN = 60;
const FUNCTION_LENGTH_ERROR = 100;
const PARAM_COUNT_WARN = 5;
const PARAM_COUNT_ERROR = 7;

// File class — derived from .gitattributes through the guardrail-class attribute
// (file-classes.md, ADR-0003), not from a path regex. An unclassified file is
// production: the fail-safe direction, so a file nothing declares is held to the
// strictest class rather than silently dropped from every measure. If
// check-attr itself cannot run the result is unverifiable, and the strictest
// class is still the safe answer.
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
 *  new, and the counts are tab-separated from each other only. */
export function parseNumstatZ(stdout) {
  const fields = stdout.split("\0");
  const rows = [];
  for (let i = 0; i < fields.length; i++) {
    if (!fields[i]) continue;
    const [added, deleted, inline] = fields[i].split("\t");
    if (deleted === undefined) continue;
    if (inline) {
      rows.push([added, deleted, inline]);
    } else {
      // A rename: this field ended after the counts, and the two paths follow.
      rows.push([added, deleted, fields[i + 2]]);
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
          `that tripped it, may make on its own (fix 74).`,
      );
    }
  } else if (counted > CHANGE_WARN) {
    warnings.push(
      `change size ${counted} lines is in the warn band (${CHANGE_WARN}). ` +
        `Split it, or record why this one is justified.`,
    );
  }
}

/** Files this branch added, copied, modified or renamed, relative to base —
 *  shared by the file-length and complexity measures below. */
function changedFileNames(base) {
  return git(["diff", "--name-only", "--diff-filter=ACMR", `${base}...HEAD`]);
}

// Check 2 — file length (thresholds.md, gate-4-task-completion.md row 2).
// Production and test files only; production over the error band blocks,
// test over it warns (its own warn band) — a long test file is usually
// repetitive rather than badly designed. A generated production file (a
// `*.g.cs`, say) carries the same "no remedy" property a generated lock
// file does, so it is exempt from this limit too (file-classes.md).
function measureFileLength(names, findings, warnings) {
  if (names.status !== 0) return;
  for (const file of names.stdout.split("\n")) {
    if (!file || !existsSync(file) || !statSync(file).isFile()) continue;
    const cls = classOf(file);
    if (cls !== "production" && cls !== "test") continue;
    if (isGenerated(file)) continue;
    const lines = readFileSync(file, "utf8").split("\n").length;
    if (lines <= FILE_LENGTH_ERROR) continue;
    const msg = `${file} is ${lines} lines (> ${FILE_LENGTH_ERROR}); split it into smaller units.`;
    if (cls === "production") findings.push(msg);
    else warnings.push(msg.replace(";", " (test file — warn band);"));
  }
}

// Check 4 — complexity, function length, parameter count (thresholds.md,
// gate-4-task-completion.md row 4). Production and test files only, over the
// same changed set file length uses. Production over the error band blocks;
// everything else — production's own warn band, and a test file regardless
// of how far over the error band it is — only warns, the same class split
// file length already applies ("push back is not a warning": push back is
// for production files, test files only ever warn).
//
// ESLint's own message names the actual measured value, so each rule runs at
// the WARN threshold with ESLint's own severity forced to "error" (so every
// function past it is reported at all), and bandVerdict re-derives push back
// versus block from the number in the message — ESLint's severity is not
// this table's warn band (thresholds.md: "a tool's own warning severity is
// not this table's warn band").
function bandVerdict(cls, actual, warnThreshold, errorThreshold) {
  if (actual < warnThreshold) return null;
  return cls === "production" && actual >= errorThreshold ? "block" : "warn";
}

const RULES = [
  {
    ruleId: "complexity",
    re: /has a complexity of (\d+)/,
    warn: COMPLEXITY_WARN,
    error: COMPLEXITY_ERROR,
    label: "cyclomatic complexity",
  },
  {
    ruleId: "max-lines-per-function",
    re: /has too many lines \((\d+)\)/,
    warn: FUNCTION_LENGTH_WARN,
    error: FUNCTION_LENGTH_ERROR,
    label: "function length",
  },
  {
    ruleId: "max-params",
    re: /has too many parameters \((\d+)\)/,
    warn: PARAM_COUNT_WARN,
    error: PARAM_COUNT_ERROR,
    label: "parameter count",
  },
];

/** Changed files ESLint can usefully parse, narrowed to production/test. */
function codeFilesFrom(names) {
  if (!names || names.status !== 0) return [];
  return names.stdout
    .split("\n")
    .filter((f) => f && /\.(mjs|cjs|js|mts|cts)$/.test(f))
    .filter((f) => existsSync(f) && statSync(f).isFile())
    .filter((f) => {
      const cls = classOf(f);
      return cls === "production" || cls === "test";
    });
}

/** ADR-0002: the toolkit bundles no analysis tools — a consuming repository
 *  installs eslint itself. A dynamic import, not a static one: this same
 *  hook file is what a consuming repository receives verbatim
 *  (skills/repository-bootstrap), so a repository that has not yet installed
 *  eslint must get a named, visible skip rather than a crash on module load. */
async function loadESLint() {
  try {
    return (await import("eslint")).ESLint;
  } catch {
    process.stderr.write(
      "gate 4: complexity — eslint not installed; complexity, function length and parameter count not measured\n",
    );
    return null;
  }
}

/** One ESLint message, translated into a push-back/block finding or nothing. */
function recordComplexityMessage(file, cls, message, findings, warnings) {
  const rule = RULES.find((r) => r.ruleId === message.ruleId);
  if (!rule) return;
  const actual = Number(rule.re.exec(message.message)?.[1]);
  if (!Number.isFinite(actual)) return;
  const verdict = bandVerdict(cls, actual, rule.warn, rule.error);
  if (!verdict) return;
  const msg =
    `${file}:${message.line} ${rule.label} is ${actual} ` +
    `(warn >= ${rule.warn}, error >= ${rule.error}); split or simplify the function.`;
  if (verdict === "block") findings.push(msg);
  else warnings.push(msg);
}

async function measureComplexity(names, findings, warnings) {
  const codeFiles = codeFilesFrom(names);
  if (!codeFiles.length) return;

  const ESLint = await loadESLint();
  if (!ESLint) return;

  const eslint = new ESLint({
    cwd: process.cwd(),
    overrideConfigFile: true,
    overrideConfig: {
      rules: {
        complexity: ["error", COMPLEXITY_WARN],
        "max-lines-per-function": ["error", FUNCTION_LENGTH_WARN],
        "max-params": ["error", PARAM_COUNT_WARN],
      },
    },
  });
  const results = await eslint.lintFiles(codeFiles);
  for (const result of results) {
    const file = codeFiles.find((f) =>
      result.filePath.replace(/\\/g, "/").endsWith(f.replace(/\\/g, "/")),
    );
    if (!file) continue;
    const cls = classOf(file);
    for (const message of result.messages) {
      recordComplexityMessage(file, cls, message, findings, warnings);
    }
  }
}

async function main() {
  // Fix 71 — an explicit base (argv[2]) wins over resolveBase(). Invoked
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

  const findings = [];
  const warnings = [];

  // Report what was derived (cross-gate rules): the thresholds in force and
  // where they come from. These are this standard's defaults; no stack
  // analyser overrides them for this repository.
  process.stderr.write(
    `gate 4: thresholds change-warn=${CHANGE_WARN} change-error=${CHANGE_ERROR} ` +
      `file-length-error=${FILE_LENGTH_ERROR} (standard defaults; file class via git check-attr)\n`,
  );

  measureChangeSize(base, findings, warnings);

  const names = changedFileNames(base);
  measureFileLength(names, findings, warnings);
  await measureComplexity(names, findings, warnings);

  for (const w of warnings) process.stderr.write(`gate 4: ${w}\n`);
  for (const f of findings) process.stderr.write(`gate 4: ${f}\n`);

  process.exit(findings.length > 0 ? 2 : 0);
}

// Run only when invoked as the hook. Importing the module — the tests do, for
// the pure functions above — must not execute a gate.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
