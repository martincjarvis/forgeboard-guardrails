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

// Check 1 — change size (thresholds.md, gate-4-task-completion.md row 1).
// Counted files together count as one number; the override marker clears
// this check only.
function measureChangeSize(base, findings, warnings) {
  const numstat = git(["diff", "--numstat", `${base}...HEAD`]);
  if (numstat.status !== 0) return;

  let counted = 0;
  for (const line of numstat.stdout.split("\n")) {
    const [added, deleted, file] = line.split("\t");
    if (!file || added === "-") continue;
    if (!COUNTED.has(classOf(file))) continue;
    counted += Number(added) + Number(deleted);
  }

  if (counted > CHANGE_ERROR) {
    const log = git(["log", `${base}..HEAD`, "--format=%B"]);
    if (!log.stdout.includes(OVERRIDE)) {
      findings.push(
        `change size ${counted} lines exceeds the error threshold (${CHANGE_ERROR}). ` +
          `Split it, or amend a commit on this branch to carry the ${OVERRIDE} marker.`,
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
// repetitive rather than badly designed.
function measureFileLength(names, findings, warnings) {
  if (names.status !== 0) return;
  for (const file of names.stdout.split("\n")) {
    if (!file || !existsSync(file) || !statSync(file).isFile()) continue;
    const cls = classOf(file);
    if (cls !== "production" && cls !== "test") continue;
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

await main();
