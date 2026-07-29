// Check 7 (gate 6) — dependency licence policy.
//
// Completeness (gate 2 check 16, check-licence.mjs) asks whether every
// resolved dependency has a current register row. This asks a different
// question over the SAME register: is the licence recorded on that row
// acceptable for the dependency's own scope (registers.md: "completeness and
// policy are different checks", gate-6-pull-request.md: "It also reads a
// different scope than gate 2's completeness check over the same register").
//
// Four categories, not two (gate-6-pull-request.md, "Four licence categories,
// not two"):
//   - permissive (the runtime allow list): passes
//   - weak copyleft (the development allow list additions): passes for build
//     and test, blocks the moment the dependency's own scope is runtime
//   - unknown or absent: blocks, always — never treated as "unclassified-yet"
//   - everything else (strong copyleft, source-available, commercial,
//     dual-licensed): blocks
//
// "The gate reads the allow list, not the records: the decision record is
// the justification, and updating the list is how the decision takes
// effect" (gate-6-pull-request.md) — so accepting a licence outside these
// lists is a code change to the lists below, made alongside the decision
// record that justifies it, not something this check resolves at run time
// the way check 6's advisory acceptance does.
import { readStaged, report } from "./lib.mjs";
import { REGISTER } from "./check-licence.mjs";
import { pathToFileURL } from "node:url";

// thresholds.md
const RUNTIME_ALLOW = new Set([
  "MIT",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
  "0BSD",
  "Unlicense",
  "CC0-1.0",
]);
const DEV_ADDITIONS = new Set([
  "MPL-2.0",
  "LGPL-2.1-or-later",
  "LGPL-3.0-or-later",
]);

function cellsOf(row) {
  return row
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/** Rows as { dep, version, licence, scope }, from the same register
 *  check-licence.mjs parses — column order per registers.md: Dependency,
 *  Version, Licence, Direct or transitive, Scope, ... */
function parseRegisterRows(md) {
  const rows = [];
  for (const line of md.split("\n")) {
    if (!line.startsWith("|") || line.includes("---")) continue;
    const cells = cellsOf(line);
    if (cells.length < 5) continue;
    const [dep, version, licence, , scope] = cells;
    if (!dep || (/dependency/i.test(dep) && /version/i.test(version))) continue;
    if (dep.startsWith("_") || dep.startsWith("No rows")) continue;
    rows.push({
      dep,
      version,
      licence: (licence ?? "").trim(),
      scope: (scope ?? "").trim(),
    });
  }
  return rows;
}

/** One of "permissive" | "weak-copyleft" | "unknown" | "other". Unknown is
 *  its own blocking condition, never a gap in the allow list (gate-6-pull-
 *  request.md: "a dependency with no licence is not unlicensed in the
 *  permissive sense — it is all rights reserved by default"). */
export function classifyLicence(licence) {
  const l = (licence ?? "").trim();
  if (!l || /^unknown$/i.test(l)) return "unknown";
  if (RUNTIME_ALLOW.has(l)) return "permissive";
  if (DEV_ADDITIONS.has(l)) return "weak-copyleft";
  return "other";
}

/** Pure verdict for one register row: true if the licence is acceptable for
 *  the recorded scope. Exported so the four-category rule is directly
 *  testable without a register file on disk. Takes a single identifier —
 *  the leaf of an SPDX expression, or a plain register row that never had
 *  one. Compound expressions (below) call this once per identifier; nothing
 *  here changes what "acceptable" means. */
export function licenceAcceptable(licence, scope) {
  const category = classifyLicence(licence);
  const isRuntime = /^runtime$/i.test((scope ?? "").trim());
  if (category === "permissive") return true;
  if (category === "weak-copyleft") return !isRuntime;
  return false; // "unknown" and "other" both block
}

// --- SPDX licence expression evaluation (fix 8; gate-6-pull-request.md) ---
//
// A register row's licence cell can be a bare identifier ("MIT") or a
// compound SPDX expression ("(MIT OR CC0-1.0)", "GPL-2.0-only WITH
// Classpath-exception-2.0"). Looking up the whole string as one identifier —
// what this file did before — never matches an allow list entry for a
// compound expression, and blocks it wrongly regardless of what it actually
// permits. No dependency added: the grammar needed is small enough to write
// directly — AND/OR with parentheses, AND binding tighter than OR (the SPDX
// license-expression grammar), and `A WITH B` treated as one identifier
// requiring its own allow-list entry rather than silently split into a
// passing term (an exception clause narrows what the base licence permits;
// it does not fall away for being unrecognised).
const TOKEN_RE = /\(|\)|[^\s()]+/g;
function tokenizeLicenceExpression(expr) {
  return (expr ?? "").trim().match(TOKEN_RE) ?? [];
}

/** Recursive-descent parser for one licence-register cell. Returns a string
 *  leaf (one identifier, or "A WITH B" joined back into one), or
 *  { op: "AND" | "OR", left, right }. An empty or malformed expression
 *  degrades to a leaf of the input string, which classifyLicence already
 *  treats as "unknown" or "other" — parse failure blocks the same way an
 *  unrecognised identifier does, never a silent pass. */
export function parseLicenceExpression(expr) {
  const tokens = tokenizeLicenceExpression(expr);
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];

  function parseOr() {
    let left = parseAnd();
    while (peek() === "OR") {
      next();
      left = { op: "OR", left, right: parseAnd() };
    }
    return left;
  }
  function parseAnd() {
    let left = parseAtom();
    while (peek() === "AND") {
      next();
      left = { op: "AND", left, right: parseAtom() };
    }
    return left;
  }
  function parseAtom() {
    if (peek() === "(") {
      next();
      const node = parseOr();
      if (peek() === ")") next();
      return node;
    }
    let id = next() ?? "";
    if (peek() === "WITH") {
      next();
      id = `${id} WITH ${next() ?? ""}`;
    }
    return id;
  }

  return parseOr();
}

/** Evaluates a parsed expression against one scope. `A OR B` is acceptable
 *  if either disjunct is (the consumer chooses); `A AND B` requires both.
 *  `blockers` names the identifier(s) actually responsible for a block —
 *  empty when acceptable — so the finding can say which term failed rather
 *  than restating the whole expression. */
export function evaluateLicenceExpression(node, scope) {
  if (typeof node === "string") {
    const acceptable = licenceAcceptable(node, scope);
    return {
      acceptable,
      blockers: acceptable
        ? []
        : [{ id: node, category: classifyLicence(node) }],
    };
  }
  const left = evaluateLicenceExpression(node.left, scope);
  const right = evaluateLicenceExpression(node.right, scope);
  const acceptable =
    node.op === "AND"
      ? left.acceptable && right.acceptable
      : left.acceptable || right.acceptable;
  return {
    acceptable,
    blockers: acceptable ? [] : [...left.blockers, ...right.blockers],
  };
}

/** Parse-then-evaluate in one call — what checkLicencePolicy actually wants
 *  per register row. */
export function licenceExpressionAcceptable(licence, scope) {
  return evaluateLicenceExpression(parseLicenceExpression(licence), scope);
}

/** { findings, skips }. `scanTriggered` is the caller's own scope decision —
 *  the resolved dependency set moved (a lock file change), or a scheduled
 *  run — the same change-triggered shape as check 6 and gate 2 check 16. */
export function checkLicencePolicy(scanTriggered) {
  const skips = [];
  if (!scanTriggered) {
    skips.push(
      "dependency licence policy — no dependency change and not a scheduled run, check skipped",
    );
    return { findings: [], skips };
  }

  let md;
  try {
    md = readStaged(REGISTER);
  } catch {
    return {
      findings: [
        {
          check: "dependency licence policy",
          path: REGISTER,
          problem: `${REGISTER} does not exist, so no resolved dependency's licence can be judged against the allow list`,
          remedy:
            "create the register (gate 2 check 16 already requires one row per resolved dependency) before licence policy can run",
        },
      ],
      skips,
    };
  }

  const findings = [];
  for (const row of parseRegisterRows(md)) {
    const verdict = licenceExpressionAcceptable(row.licence, row.scope);
    if (verdict.acceptable) continue;
    const list = /^runtime$/i.test(row.scope) ? "runtime" : "development";
    const blockedBy = verdict.blockers
      .map((b) => `'${b.id || "(none recorded)"}' (${b.category})`)
      .join(", ");
    findings.push({
      check: "dependency licence policy",
      path: REGISTER,
      problem:
        `${row.dep}@${row.version} carries licence '${row.licence || "(none recorded)"}', ` +
        `scope ${row.scope || "(none recorded)"} — not acceptable on the ${list} allow list ` +
        `(blocked by ${blockedBy})`,
      remedy: verdict.blockers.some((b) => b.category === "unknown")
        ? "determine the actual licence and record it, or remove the dependency"
        : "record a decision accepting it and add the licence to the allow list, or replace the dependency",
    });
  }
  return { findings, skips };
}

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  // Manual or scheduled run: always in scope — there is no staged/changed set
  // to ask, the way pre-commit.mjs and gate-6-pull-request.mjs can.
  const { findings, skips } = checkLicencePolicy(true);
  report("gate 6", findings, skips);
}
