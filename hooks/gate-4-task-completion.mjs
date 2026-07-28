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

const base = resolveBase();
if (!base) process.exit(0); // No base to compare against: nothing to measure.

const findings = [];
const warnings = [];

// Test and documentation lines are excluded from change size deliberately: a
// threshold that punishes tests teaches the author to write fewer of them.
const excluded = /(^|\/)(tests?|spec|__tests__)\/|\.(test|spec)\.|\.(md|txt)$/i;

const numstat = git(["diff", "--numstat", `${base}...HEAD`]);
if (numstat.status === 0) {
  let counted = 0;
  for (const line of numstat.stdout.split("\n")) {
    const [added, deleted, file] = line.split("\t");
    if (!file || added === "-" || excluded.test(file)) continue;
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

// File length, over files the change touched that still exist.
const names = git([
  "diff",
  "--name-only",
  "--diff-filter=ACMR",
  `${base}...HEAD`,
]);
if (names.status === 0) {
  for (const file of names.stdout.split("\n")) {
    if (!file || excluded.test(file) || !existsSync(file)) continue;
    if (!statSync(file).isFile()) continue;
    const lines = readFileSync(file, "utf8").split("\n").length;
    if (lines > FILE_LENGTH_ERROR) {
      findings.push(
        `${file} is ${lines} lines (> ${FILE_LENGTH_ERROR}); split it into smaller units.`,
      );
    }
  }
}

for (const w of warnings) process.stderr.write(`gate 4: ${w}\n`);
for (const f of findings) process.stderr.write(`gate 4: ${f}\n`);

process.exit(findings.length > 0 ? 2 : 0);
