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

// thresholds.md — the standard's own defaults. No decision record names
// these: they are the allow list's starting position, not something a
// repository chose to accept.
const RUNTIME_ALLOW_BASE = new Set([
  "MIT",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
  "0BSD",
  "Unlicense",
  "CC0-1.0",
]);
const DEV_ADDITIONS_BASE = new Set([
  "MPL-2.0",
  "LGPL-2.1-or-later",
  "LGPL-3.0-or-later",
]);

// Fix 26 — licences a consuming repository's own accepted decision record
// added to the allow list, beyond the standard's own defaults above.
// gate-6-pull-request.md: "the gate reads the allow list... updating the
// list is how the decision takes effect" — so extending the allow list and
// naming the record that justified it happen in the same place, one entry
// each. Empty here: this toolkit's own reference implementation has not
// extended either list. A consuming repository adds a `"LICENCE-ID":
// "docs/ADR/00NN-....md"` entry alongside the ADR that accepted it, and
// every register row citing that licence must then name that record in its
// own "Decision record" column (registers.md: "a row whose licence reached
// the allow list by extension names the record that extended it") — see
// requiredExtensionRecord below, which is what actually enforces that.
// Exported (not just internal) so a test can inject a fixture entry without
// a second copy of this mechanism — the same reason REGISTER (check-licence.mjs)
// is exported rather than repeated as a string literal in its own tests.
export const RUNTIME_ALLOW_EXTENSIONS = new Map([
  // ["BSD-4-Clause", "docs/ADR/0007-example-licence-allowance.md"],
]);
export const DEV_ADDITIONS_EXTENSIONS = new Map([
  // ["EPL-2.0", "docs/ADR/0007-example-licence-allowance.md"],
]);

// Not frozen at module load: computed fresh from the base sets plus
// whatever the extension maps hold right now, so a test injecting a
// fixture entry into the exported maps above is reflected immediately —
// and so is a consuming repository's own edit to the maps.
function runtimeAllow() {
  return new Set([...RUNTIME_ALLOW_BASE, ...RUNTIME_ALLOW_EXTENSIONS.keys()]);
}
function devAdditions() {
  return new Set([...DEV_ADDITIONS_BASE, ...DEV_ADDITIONS_EXTENSIONS.keys()]);
}

/** The decision record a licence identifier's presence on an allow list
 *  traces to, or null when it is one of the standard's own base entries (or
 *  not on either list at all) and so needs none. Exported so the rule is
 *  directly testable without a register file on disk. */
export function requiredExtensionRecord(licence) {
  const l = (licence ?? "").trim();
  return (
    RUNTIME_ALLOW_EXTENSIONS.get(l) ?? DEV_ADDITIONS_EXTENSIONS.get(l) ?? null
  );
}

function cellsOf(row) {
  return row
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/** Rows as { dep, version, licence, scope, decisionRecord }, from the same
 *  register check-licence.mjs parses — column order per registers.md:
 *  Dependency, Version, Licence, Direct or transitive, Scope, Used by, Why,
 *  Decision record, ... (index 7). */
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
      decisionRecord: (cells[7] ?? "").trim(),
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
  if (runtimeAllow().has(l)) return "permissive";
  if (devAdditions().has(l)) return "weak-copyleft";
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
 *  { op: "AND" | "OR", left, right }, or { unparseable: true, raw } when
 *  tokens remain after the grammar (AND / OR / WITH / parentheses) is
 *  exhausted — a non-SPDX string such as "CC BY-SA 4.0" or "Apache 2.0",
 *  where whitespace looks like a token boundary but is not an operator.
 *  Stopping at the first unrecognised token and calling what was consumed
 *  so far ("CC", "Apache") the identifier would name something that was
 *  never a real licence to begin with; reporting the whole string instead
 *  gives a maintainer something to actually search for. An empty
 *  expression still degrades to a leaf of the input string, which
 *  classifyLicence already treats as "unknown" — that is a different
 *  failure (nothing recorded) from a string that does not parse. */
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

  const node = parseOr();
  if (i < tokens.length) {
    return { unparseable: true, raw: (expr ?? "").trim() };
  }
  return node;
}

/** Evaluates a parsed expression against one scope. `A OR B` is acceptable
 *  if either disjunct is (the consumer chooses); `A AND B` requires both.
 *  `blockers` names the identifier(s) actually responsible for a block —
 *  empty when acceptable — so the finding can say which term failed rather
 *  than restating the whole expression. */
export function evaluateLicenceExpression(node, scope) {
  if (node && typeof node === "object" && node.unparseable) {
    // Not a blocked identifier — there was no valid identifier to block.
    // Quoted whole, so the finding names the string a maintainer actually
    // has to fix, not a fragment the grammar happened to stop consuming at.
    return {
      acceptable: false,
      blockers: [{ id: node.raw, category: "unparseable" }],
      acceptedIds: [],
    };
  }
  if (typeof node === "string") {
    const acceptable = licenceAcceptable(node, scope);
    return {
      acceptable,
      blockers: acceptable
        ? []
        : [{ id: node, category: classifyLicence(node) }],
      // Fix 26 — the leaf identifier(s) actually responsible for
      // acceptance, so the caller can trace each back to an allow-list
      // extension and require its decision record be named.
      acceptedIds: acceptable ? [node] : [],
    };
  }
  const left = evaluateLicenceExpression(node.left, scope);
  const right = evaluateLicenceExpression(node.right, scope);
  const acceptable =
    node.op === "AND"
      ? left.acceptable && right.acceptable
      : left.acceptable || right.acceptable;
  const acceptedIds = !acceptable
    ? []
    : node.op === "AND"
      ? [...left.acceptedIds, ...right.acceptedIds]
      : [
          ...(left.acceptable ? left.acceptedIds : []),
          ...(right.acceptable ? right.acceptedIds : []),
        ];
  return {
    acceptable,
    blockers: acceptable ? [] : [...left.blockers, ...right.blockers],
    acceptedIds,
  };
}

/** Parse-then-evaluate in one call — what checkLicencePolicy actually wants
 *  per register row. */
export function licenceExpressionAcceptable(licence, scope) {
  return evaluateLicenceExpression(parseLicenceExpression(licence), scope);
}

/** Pure per-row verdict: every finding one already-parsed register row
 *  raises (an unresolved version, an unacceptable licence, or fix 26's
 *  missing extension-record citation). Extracted from the loop below so it
 *  is directly testable against a constructed row, without a staged
 *  register file on disk — the same reason classifyAdvisories
 *  (check-dependency-advisories.mjs) is kept separate from its own
 *  git/npm-audit orchestration. */
export function evaluateRegisterRow(row) {
  const findings = [];
  const versionResolved =
    Boolean(row.version) && !/^undefined$/i.test(row.version);
  if (!versionResolved) {
    findings.push({
      check: "dependency licence policy",
      path: REGISTER,
      problem:
        `${row.dep}'s version could not be resolved — the register row records ` +
        `${row.version ? `the literal '${row.version}'` : "no version"} rather than one`,
      remedy:
        `resolve ${row.dep}'s installed version (for example, \`npm ls ${row.dep}\`) ` +
        `and correct the register row; a row that is not pinned to a version cannot be judged`,
    });
  }
  const depLabel = versionResolved ? `${row.dep}@${row.version}` : row.dep;

  const verdict = licenceExpressionAcceptable(row.licence, row.scope);
  if (verdict.acceptable) {
    // Fix 26 — a licence is on the allow list either as one of the
    // standard's own defaults or because a decision record extended the
    // list to add it (registers.md: "a row whose licence reached the allow
    // list by extension names the record that extended it"). The prose
    // above the register table naming the ADR is not enough — a reviewer
    // reading one row in isolation must see it too.
    const neededRecords = [
      ...new Set(
        verdict.acceptedIds.map(requiredExtensionRecord).filter(Boolean),
      ),
    ];
    if (neededRecords.length && !row.decisionRecord) {
      findings.push({
        check: "dependency licence policy",
        path: REGISTER,
        problem:
          `${depLabel} carries licence '${row.licence}', accepted only because ` +
          `${neededRecords.join(", ")} extended the allow list — this row's Decision record column is blank`,
        remedy: `name ${neededRecords.join(" / ")} in ${REGISTER}'s Decision record column for this row`,
      });
    }
    return findings;
  }
  const list = /^runtime$/i.test(row.scope) ? "runtime" : "development";
  const blockedBy = verdict.blockers
    .map((b) => `'${b.id || "(none recorded)"}' (${b.category})`)
    .join(", ");
  findings.push({
    check: "dependency licence policy",
    path: REGISTER,
    problem:
      `${depLabel} carries licence '${row.licence || "(none recorded)"}', ` +
      `scope ${row.scope || "(none recorded)"} — not acceptable on the ${list} allow list ` +
      `(blocked by ${blockedBy})`,
    remedy: verdict.blockers.some((b) => b.category === "unknown")
      ? "determine the actual licence and record it, or remove the dependency"
      : verdict.blockers.some((b) => b.category === "unparseable")
        ? "correct the licence cell to a valid SPDX expression (the exact identifier, hyphenated, joined only by AND / OR / WITH), then re-run the check"
        : "record a decision accepting it and add the licence to the allow list, or replace the dependency",
  });
  return findings;
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
    findings.push(...evaluateRegisterRow(row));
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
