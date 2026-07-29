#!/usr/bin/env node
// Gate 4 — Task completion. Fires when work is handed back.
//
// Measures the whole branch against its base and reports every finding in one
// pass — no stop at the first, because the author wants the full list once.
// See docs/standards/guardrails/gate-4-task-completion.md.
//
// Exit 0 reports. Exit 2 blocks the hand-off.
import { existsSync, readFileSync, statSync } from "node:fs";
import { git } from "./lib/run.mjs";

const CHANGE_WARN = 400;
const CHANGE_ERROR = 800;
const FILE_LENGTH_ERROR = 400;
const OVERRIDE = "[large-pr]";

// The base is whatever the remote calls its default, falling back to main.
function resolveBase() {
  const head = git(["rev-parse", "--abbrev-ref", "origin/HEAD"]);
  const candidate = head.status === 0 ? head.stdout.trim() : "origin/main";
  return git(["rev-parse", "--verify", candidate]).status === 0
    ? candidate
    : null;
}

// File class — derived from .gitattributes through the guardrail-class attribute
// (file-classes.md, ADR-0003), not from a path regex. An unclassified file is
// production: the fail-safe direction, so a file nothing declares is held to the
// strictest class rather than silently dropped from every measure. If
// check-attr itself cannot run the result is unverifiable, and the strictest
// class is still the safe answer.
function classOf(file) {
  const r = git(["check-attr", "guardrail-class", "--", file]);
  if (r.status !== 0) return "production";
  const m = r.stdout.match(/guardrail-class:\s*(\S+)/);
  return !m || m[1] === "unspecified" ? "production" : m[1];
}

// file-classes.md: production and configuration count toward change size; test,
// documentation and agent-context do not. A threshold that punishes tests
// teaches the author to write fewer of them.
const COUNTED = new Set(["production", "configuration"]);

const base = resolveBase();
if (!base) process.exit(0); // No base to compare against: nothing to measure.

const findings = [];
const warnings = [];

// Report what was derived (cross-gate rules): the thresholds in force and where
// they come from. These are this standard's defaults; no stack analyser
// overrides them for this repository.
process.stderr.write(
  `gate 4: thresholds change-warn=${CHANGE_WARN} change-error=${CHANGE_ERROR} ` +
    `file-length-error=${FILE_LENGTH_ERROR} (standard defaults; file class via git check-attr)\n`,
);

const numstat = git(["diff", "--numstat", `${base}...HEAD`]);
let counted = 0;
if (numstat.status === 0) {
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

// File length: thresholds.md applies this to production and test files only.
// Production over the error band blocks; test over it warns (its warn band),
// because a long test file is usually repetitive rather than badly designed.
const names = git([
  "diff",
  "--name-only",
  "--diff-filter=ACMR",
  `${base}...HEAD`,
]);
if (names.status === 0) {
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

for (const w of warnings) process.stderr.write(`gate 4: ${w}\n`);
for (const f of findings) process.stderr.write(`gate 4: ${f}\n`);

process.exit(findings.length > 0 ? 2 : 0);
