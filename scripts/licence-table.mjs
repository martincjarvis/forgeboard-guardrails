// The licence table's recorded facts live in licence-table-data.mjs (data
// with a citation, not an enumerated allow list — see that file's header
// for the schema and reasoning). This file holds the operations on those
// facts: the permissive derivation, the table lookup, the SPDX-expression
// parser, and the expression evaluator.
//
// `LICENCE_TABLE` is re-exported so consumers (check-licence-table.mjs's
// re-validation, and the gate-6 tests) keep importing it from here — the
// data moved, the public surface did not.
import { LICENCE_TABLE } from "./licence-table-data.mjs";

export { LICENCE_TABLE };

/** @typedef {{ name: string, reference: string, osiApproved: boolean, checked: string, permissions: { commercialUse: boolean, distribution: boolean, modification: boolean, privateUse: boolean, patentGrant: boolean, sublicensing: boolean }, conditions: { notice: boolean, stateChanges: boolean, sourceDisclosure: boolean, sameLicence: boolean, networkUseDisclosure: boolean }, limitations: { noTrademark: boolean, noWarranty: boolean, noLiability: boolean } }} LicenceEntry */
/** @typedef {string | { op: "AND" | "OR", left: LicenceExpr, right: LicenceExpr, unparseable?: undefined } | { unparseable: true, raw: string }} LicenceExpr */

/** Derived, never asserted directly on an entry: a licence is permissive
 *  when it imposes none of source-disclosure, same-licence (share-alike) or
 *  network-use-disclosure. Notice retention (and, for some permissive
 *  licences, a state-changes note) alone is permissive.
 *  @param {LicenceEntry} entry */
export function isPermissive(entry) {
  const c = entry.conditions;
  return !c.sourceDisclosure && !c.sameLicence && !c.networkUseDisclosure;
}

/** The table entry for a licence identifier as it appears in a register
 *  cell, or undefined when the table carries no entry for it — which is
 *  itself a finding (gate-6-pull-request.md: "a licence in the resolved set
 *  with no table entry is a finding at gates 2 and 6, naming the licence").
 *  A register cell that is not a proper SPDX identifier (a space instead of
 *  a hyphen, say) will not match here even if the table carries the right
 *  licence under its correct identifier — that is the "unparseable"
 *  finding's job (registers.md: "Licence — the licence as resolved", which
 *  means the correct SPDX identifier, not prose about it), not this
 *  function's; correct the register cell rather than adding an alias for
 *  a typo.
 *  @param {string} id */
export function licenceTableEntry(id) {
  const table = /** @type {Record<string, LicenceEntry>} */ (LICENCE_TABLE);
  return table[(id ?? "").trim()];
}

// --- SPDX licence expression parsing, shared here so
// both gate 2 (check-licence.mjs, completeness) and gate 6
// (check-licence-policy.mjs, policy) share one parser rather than each
// carrying its own copy) ---
//
// A register row's licence cell can be a bare identifier ("MIT") or a
// compound SPDX expression ("(MIT OR CC0-1.0)", "GPL-2.0-only WITH
// Classpath-exception-2.0"). AND/OR with parentheses, AND binding tighter
// than OR (the SPDX license-expression grammar), and `A WITH B` treated as
// one identifier requiring its own table entry rather than silently split
// into a passing term (an exception clause narrows what the base licence
// permits; it does not fall away for being unrecognised).
const TOKEN_RE = /\(|\)|[^\s()]+/g;
/** @param {string} expr */
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
 *  gives a maintainer something to actually search for.
 *  @param {string} expr
 *  @returns {LicenceExpr} */
export function parseLicenceExpression(expr) {
  const tokens = tokenizeLicenceExpression(expr);
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];

  /** @returns {LicenceExpr} */
  function parseOr() {
    let left = parseAnd();
    while (peek() === "OR") {
      next();
      left = { op: "OR", left, right: parseAnd() };
    }
    return left;
  }
  /** @returns {LicenceExpr} */
  function parseAnd() {
    let left = parseAtom();
    while (peek() === "AND") {
      next();
      left = { op: "AND", left, right: parseAtom() };
    }
    return left;
  }
  /** @returns {LicenceExpr} */
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

/** Every leaf identifier in a parsed expression, in order, duplicates
 *  included — what a "does every licence in this cell have a table entry"
 *  completeness check needs (gate 2), as distinct from evaluating whether
 *  the expression as a whole is acceptable (gate 6, check-licence-policy.mjs).
 *  An unparseable expression yields its raw string as a single "leaf" so the
 *  caller still has something to report against.
 *  @param {LicenceExpr} node @returns {string[]} */
export function leafIdentifiers(node) {
  if (node && typeof node === "object" && node.unparseable) return [node.raw];
  if (typeof node === "string") return [node];
  return [...leafIdentifiers(node.left), ...leafIdentifiers(node.right)];
}

/** Combine an AND/OR branch's left and right verdicts into one — extracted
 *  from `evaluateLicenceExpression` so the recursion reads as traversal and
 *  the combination reads as the AND/OR rule. `A OR B` is acceptable if
 *  either disjunct is; `A AND B` requires both.
 *  @param {{ op: string, left: any, right: any }} node
 *  @param {{ acceptable: boolean, blockers: any[], acceptedIds: string[] }} left
 *  @param {{ acceptable: boolean, blockers: any[], acceptedIds: string[] }} right
 *  @returns {{ acceptable: boolean, blockers: any[], acceptedIds: string[] }} */
function combineBranch(node, left, right) {
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

/** Evaluates a parsed expression against one leaf predicate. `A OR B` is
 *  acceptable if either disjunct is (the consumer chooses); `A AND B`
 *  requires both. `blockers` names the identifier(s) actually responsible
 *  for a block — empty when acceptable — so a finding can say which term
 *  failed rather than restating the whole expression. `leafVerdict(id)`
 *  returns `{ acceptable, reason }` for one bare identifier; policy
 *  (check-licence-policy.mjs) supplies the actual decision rule.
 *  @param {LicenceExpr} node
 *  @param {(id: string) => { acceptable: boolean, reason: string | undefined }} leafVerdict
 *  @returns {{ acceptable: boolean, blockers: { id: string, reason: string | undefined }[], acceptedIds: string[] }} */
export function evaluateLicenceExpression(node, leafVerdict) {
  if (node && typeof node === "object" && node.unparseable) {
    return {
      acceptable: false,
      blockers: [{ id: node.raw, reason: "unparseable" }],
      acceptedIds: [],
    };
  }
  if (typeof node === "string") {
    const { acceptable, reason } = leafVerdict(node);
    return {
      acceptable,
      blockers: acceptable ? [] : [{ id: node, reason }],
      acceptedIds: acceptable ? [node] : [],
    };
  }
  const left = evaluateLicenceExpression(node.left, leafVerdict);
  const right = evaluateLicenceExpression(node.right, leafVerdict);
  return combineBranch(node, left, right);
}
