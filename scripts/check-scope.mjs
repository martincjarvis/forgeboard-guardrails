// Gate 3 — commit message, checks 3, 4 and 5 (structure/type are commitlint's).
//
// The scope is the component name, and the component set is derived from the
// plugin manifest (ADR-0001, ADR-0003): one component, whose paths are the
// conventional plugin directories. An empty scope means repository-wide and is
// always allowed; any other scope is not a declared component and is refused.
//
// Run by .husky/commit-msg with the message file as $1.
import { readFileSync } from "node:fs";
import {
  stagedFiles,
  deriveComponent,
  touchesComponent,
  report,
} from "./lib.mjs";

const msgFile = process.argv[2];
let message = "";
if (msgFile) {
  try {
    message = readFileSync(msgFile, "utf8");
  } catch {
    message = "";
  }
}
if (!message && process.stdin.isTTY === false) {
  // Some harnesses pipe the message on stdin instead.
  try {
    message = readFileSync(0, "utf8");
  } catch {
    /* ignore */
  }
}

const findings = [];
const header = message.split("\n")[0] ?? "";
const component = deriveComponent();

// Check 3 — the header matches type(scope): summary; scope is declared or empty.
const parsed = header.match(/^([a-z]+)(?:\(([^)]*)\))?(!)?: /);
if (!parsed) {
  findings.push({
    check: "commit message structure",
    problem: "header is not `type(scope): summary` — got: " + header,
    remedy: "see docs/standards/guardrails/gate-3-commit-message.md",
  });
} else {
  const type = parsed[1];
  const scope = parsed[2] ?? "";
  const breaking = parsed[3];
  const allowedTypes = [
    "feat",
    "fix",
    "refactor",
    "perf",
    "test",
    "docs",
    "build",
    "ci",
    "chore",
  ];
  if (!allowedTypes.includes(type)) {
    findings.push({
      check: "commit type",
      problem: "type '" + type + "' is outside the declared set",
      remedy: "use one of: " + allowedTypes.join(", "),
    });
  }
  if (scope && (!component || scope !== component.name)) {
    findings.push({
      check: "commit scope",
      problem: "scope '" + scope + "' is not a declared component",
      remedy: component
        ? "the one component is '" +
          component.name +
          "'; use it, or omit the scope for repository-wide work"
        : "omit the scope for repository-wide work",
    });
  }

  // Check 5 — scope agreement: a scope naming the component must touch it.
  if (component && scope === component.name) {
    const files = stagedFiles();
    if (
      files.length &&
      !files.some((f) => touchesComponent(f, component.paths))
    ) {
      findings.push({
        check: "scope agreement",
        problem:
          "scope '" +
          scope +
          "' names the component but no staged path touches it (" +
          component.paths.join(", ") +
          ")",
        remedy: "either touch the component's paths, or drop the scope",
      });
    }
  }

  // Check 4 — a breaking marker needs a footer describing the migration.
  if (breaking || /BREAKING CHANGE:/i.test(message)) {
    const footer = message.match(/^BREAKING CHANGE:\s*(\S.*)$/m);
    if (!footer) {
      findings.push({
        check: "breaking change",
        problem: "a breaking marker is set without a BREAKING CHANGE: footer",
        remedy: "add a BREAKING CHANGE: footer describing the migration",
      });
    }
  }
}

// Report what was derived (cross-gate rules): the component set in force.
process.stderr.write(
  component
    ? "gate 3: component set = " +
        component.name +
        " (paths: " +
        component.paths.join(", ") +
        ")\n"
    : "gate 3: no plugin manifest found — only empty scope is allowed\n",
);

report("gate 3", findings);
