// Check 15 — suppression register completeness (gate 2).
//
// Every inline suppression must name a single rule and carry a complete row in
// docs/registers/suppression-register.md (bypass-and-exceptions.md). A broadened
// annotation, or a marker with no register row, is the finding this catches.
// The register itself is the reviewed record; a generated inventory is not one.
import { resolve } from "node:path";
import { trackedFiles, isText, classOf, readStaged, report } from "./lib.mjs";
import { looksLikeTeamLabel } from "./check-adr-approver.mjs";
import { pathToFileURL } from "node:url";

export const REGISTER = "docs/registers/suppression-register.md";
// This checker defines the marker patterns as data, so it would flag its own
// source. Identified by this module's own URL — not process.argv[1], which is the
// invoker (pre-commit.mjs) when the function is imported rather than run as a CLI.
const SELF_URL = import.meta.url;

// Each marker: a directive and a function pulling every rule it names, as an
// array. Multiple rules on one line are legal — two analysers can
// name the same defect differently, or one fires several rules at one site
// (hooks/lib/run.mjs:48 is exactly that case) — so every named rule is
// checked independently against the register rather than the joined string
// being treated as one identifier or the whole marker being refused for
// naming more than one. An empty array means the marker names no rule at
// all, which IS the defect this guards against: a blanket suppression.
const MARKERS = [
  {
    name: "eslint-disable",
    re: /eslint-disable(?:-next-line|-line)?(?:\s+(.+))?/,
    rules: (/** @type {RegExpMatchArray} */ m) => splitRules(m[1]),
  },
  {
    name: "secretlint-disable",
    re: /secretlint-disable(?:\s+(.+))?/,
    rules: (/** @type {RegExpMatchArray} */ m) => splitRules(m[1]),
  },
  {
    name: "markdownlint-disable",
    re: /markdownlint-disable(?:-next-line|-line|-file)?(?:\s+(.+))?/,
    rules: (/** @type {RegExpMatchArray} */ m) => splitRules(m[1]),
  },
  {
    // Captures everything after the colon (not just a comma-free character
    // class — the defect this guards against) so a comma-separated rule list is seen
    // in full; splitRules then breaks it apart the same as every other
    // marker family.
    name: "nosemgrep",
    re: /nosemgrep(?::\s*(.+))?/,
    rules: (/** @type {RegExpMatchArray} */ m) => splitRules(m[1]),
  },
  {
    // TypeScript has no per-rule form for either directive, so these are
    // inherently blanket at the language level — not a gap in this parser.
    // Each still requires its own complete register row, naming the
    // diagnostic it suppresses in the row's justification (bypass-and-
    // exceptions.md, registers.md).
    name: "@ts-expect-error",
    re: /@ts-expect-error/,
    rules: () => ["@ts-expect-error"],
  },
  {
    name: "@ts-ignore",
    re: /@ts-ignore/,
    rules: () => ["@ts-ignore"],
  },
  {
    name: "coverage ignore",
    re: /\b(?:c8|istanbul|v8|coverage)[ _-]ignore(?:-next-line|-start)?/,
    rules: () => ["coverage-ignore"],
  },
];

/** Every rule a marker names, split on comma or whitespace and filtered to
 *  tokens that look like an identifier. Empty when the marker names none.
 *  @param {string | undefined} rest */
function splitRules(rest) {
  if (!rest) return [];
  return rest
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => /^[A-Za-z][\w./-]*$/.test(t));
}

/** Every register row, fully parsed. Columns: Code | Scope | Justification |
 *  Removable when | Approved by (registers.md). The marker-matching
 *  lookup below only ever needed the first two cells; register-row
 *  completeness (evaluateRegisterRows) needs every column, so all five are
 *  read here in one place rather than the first two being parsed twice. */
export function suppressionRegisterRows() {
  /** @type {{ code: string, scope: string, justification: string, removalCondition: string, approver: string }[]} */
  const rows = [];
  let md;
  try {
    md = readStaged(REGISTER);
  } catch {
    return rows;
  }
  for (const line of md.split("\n")) {
    if (!line.startsWith("|") || line.includes("---")) continue;
    const cells = cellsOf(line);
    if (cells.length < 2) continue;
    const code = (cells[0] ?? "").trim();
    const scope = (cells[1] ?? "").trim();
    // Skip the header row and the "no rows" sentinel.
    if (!code || (/code/i.test(code) && /scope/i.test(scope))) continue;
    if (code.startsWith("_") || code.startsWith("No rows")) continue;
    rows.push({
      code,
      scope,
      justification: (cells[2] ?? "").trim(),
      removalCondition: (cells[3] ?? "").trim(),
      approver: (cells[4] ?? "").trim(),
    });
  }
  return rows;
}

/** Every column of a register row, not only whether a marker can
 *  find it by code+scope. `looksLikeTeamLabel` is check-adr-approver.mjs's
 *  own "person, not a team label" judgement, shared rather than
 *  re-implemented ("check-adr-approver.mjs already makes that judgement;
 *  share that logic, do not write it twice").
 *
 *  Returns `{ blocking, pendingApproval }`. `blocking` rows are refused
 *  outright: a missing justification or removal condition, a removal
 *  condition of "never" (registers.md: "none of them is 'never'"), or an
 *  approver that reads as a team label or a machine. `pendingApproval` rows
 *  are otherwise complete with only the approver blank — that gets
 *  its own verdict per gate (gate 2 pushes back, gate 6 blocks), not a
 *  finding here.
 *  @param {{ code: string, scope: string, justification: string, removalCondition: string, approver: string }[]} rows */
export function evaluateRegisterRows(rows) {
  const blocking = [];
  const pendingApproval = [];
  for (const row of rows) {
    const missing = [];
    if (!row.justification) missing.push("Justification");
    if (!row.removalCondition) missing.push("Removable when");
    else if (/^never$/i.test(row.removalCondition)) {
      missing.push(
        "Removable when (reads 'never', which registers.md refuses as a removal condition)",
      );
    }
    if (missing.length) {
      blocking.push({
        check: "suppression register",
        path: REGISTER,
        problem: `row for '${row.code}' at '${row.scope}' is missing ${missing.join(", ")}`,
        remedy:
          "complete the row before the suppression it authorises can be relied on",
      });
      continue;
    }
    if (!row.approver) {
      pendingApproval.push(row);
      continue;
    }
    if (looksLikeTeamLabel(row.approver)) {
      blocking.push({
        check: "suppression register",
        path: REGISTER,
        problem: `row for '${row.code}' at '${row.scope}' names '${row.approver}' as approver, which reads as a team label, not a person`,
        remedy: "name the individual human who accepted this suppression",
      });
    }
  }
  return { blocking, pendingApproval };
}

/** Rows complete except for approval, as data. `rows` is
 *  injectable for direct testing (the same shape checkAdrApprover's `adrDir`
 *  parameter takes); the production path (no argument) reads the real
 *  register. Gate 2 (pre-commit.mjs) prints these as a push back — allowed
 *  to commit, visible, unresolved. Gate 6 (unapprovedSuppressionFindings,
 *  below) reads the same list and blocks instead: two different questions
 *  over one set of rows, not one check behind a mode flag.
 *  @param {{ code: string, scope: string, justification: string, removalCondition: string, approver: string }[]} [rows] */
export function pendingSuppressionApprovals(rows) {
  return evaluateRegisterRows(rows ?? suppressionRegisterRows())
    .pendingApproval;
}

/** The same pending-approval rows, shaped as blocking findings.
 *  gate-6-pull-request.mjs pushes these into its own findings list: there is
 *  no author present server-side to push back to (guardrail-standards.md's
 *  verdict table — "Where no author is present, the check looks for that
 *  record and fails without it"), so an unapproved suppression fails the
 *  merge rather than merely being printed.
 *  @param {{ code: string, scope: string, justification: string, removalCondition: string, approver: string }[]} [rows] */
export function unapprovedSuppressionFindings(rows) {
  return pendingSuppressionApprovals(rows).map((row) => ({
    check: "suppression register — approver",
    path: REGISTER,
    problem:
      `'${row.code}' (${row.scope}) has no approver — every other column ` +
      "is complete, but a human must accept a suppression before it merges",
    remedy:
      "name a human in the register row's Approved by column, or remove the suppression and fix the finding instead",
  }));
}

/** @param {string} row */
function cellsOf(row) {
  // Split on unescaped pipes; strip inline code backticks and emphasis.
  return row
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/** Should this file be scanned for suppressions at all? Excludes the
 *  register itself (it is what this enforces, not a subject of it), a
 *  non-text file, anything outside the production/test classes inline
 *  suppressions actually live in, and this module's own source — its
 *  MARKERS regex literals contain the marker strings as data, so it would
 *  otherwise flag itself.
 *  @param {string} file */
function shouldScanFile(file) {
  if (file === REGISTER || !isText(file)) return false;
  const cls = classOf(file);
  if (cls !== "production" && cls !== "test") return false;
  try {
    if (pathToFileURL(resolve(process.cwd(), file)).href === SELF_URL) {
      return false;
    }
  } catch {
    /* ignore */
  }
  return true;
}

/** Findings for one line: zero, or one per rule a marker names that lacks a
 *  register row, plus one for a marker naming no rule at all (more than one
 *  marker, and more than one rule per marker, can legitimately appear on the
 *  same line).
 *  @param {string} file
 *  @param {number} lineNumber
 *  @param {string} lineText
 *  @param {{ code: string, scope: string, justification: string, removalCondition: string, approver: string }[]} rows */
function findingsForLine(file, lineNumber, lineText, rows) {
  const findings = [];
  const path = `${file}:${lineNumber}`;
  for (const marker of MARKERS) {
    const m = lineText.match(marker.re);
    if (!m) continue;
    const rules = marker.rules(m);
    if (rules.length === 0) {
      findings.push({
        check: "suppression register",
        path,
        problem: `${marker.name} names no rule — a blanket suppression, which silences everything at this site`,
        remedy: "name the rule it silences, and add a register row for it",
      });
      continue;
    }
    // Multiple rules at one site are corroborating evidence, not
    // noise: the count is stated in the finding itself so a reviewer sees
    // the escalation without counting rows themselves.
    const siteNote =
      rules.length > 1
        ? ` (${rules.length} rules suppressed at this site)`
        : "";
    for (const rule of rules) {
      const hasRow = rows.some(
        (r) => r.code === rule && pathMatches(r.scope, file),
      );
      if (!hasRow) {
        findings.push({
          check: "suppression register",
          path,
          problem: `${marker.name} of \`${rule}\` has no register row${siteNote}`,
          remedy: `add a row to ${REGISTER} (Code: ${rule}, Scope: ${file})`,
        });
      }
    }
  }
  return findings;
}

/** Check tracked code files for unregistered or broadened suppressions.
 *  Inline suppressions live in code (production and test classes); prose that
 *  documents a marker, and a tool's own configuration, are not suppressions
 *  (bypass-and-exceptions.md: a wholesale config disable is a documented
 *  decision, not an exception to a rule).
 *  @param {string[]} [files] */
export function checkSuppressions(files) {
  const rows = suppressionRegisterRows();
  const scan = files ?? trackedFiles();
  const findings = [];
  for (const file of scan) {
    if (!shouldScanFile(file)) continue;
    let md;
    try {
      md = readStaged(file);
    } catch {
      continue;
    }
    md.split("\n").forEach((lineText, i) => {
      findings.push(...findingsForLine(file, i + 1, lineText, rows));
    });
  }
  // Register-row completeness is independent of which files this
  // commit scanned: an incomplete row is a defect in the register itself.
  findings.push(...evaluateRegisterRows(rows).blocking);
  return findings;
}

/** @param {string} scope @param {string} file */
function pathMatches(scope, file) {
  if (!scope) return false;
  const s = scope.replace(/\\/g, "/").replace(/\/$/, "");
  const f = file.replace(/\\/g, "/");
  return f === s || f.endsWith("/" + s) || s === f.replace(/\.[^.]+$/, "");
}

const argv1 = process.argv[1];
const isMain = argv1 && import.meta.url === pathToFileURL(argv1).href;
if (isMain) {
  const files = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const findings = checkSuppressions(files.length ? files : undefined);
  for (const row of pendingSuppressionApprovals()) {
    process.stderr.write(
      `suppressions: PUSH BACK '${row.code}' (${row.scope}) has no approver; every other column is complete\n`,
    );
  }
  process.stderr.write(
    `suppressions: ${findings.length} unregistered, broadened or incomplete\n`,
  );
  report("gate 2", findings);
}
