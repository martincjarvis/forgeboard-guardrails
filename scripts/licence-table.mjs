// cspell:ignore blueoakcouncil opensource
// The licence table (fix brief 6) — recorded facts about each licence this
// repository's own dependencies carry, not an enumerated allow list.
//
// gate-6-pull-request.md used to say "the allow lists are enumerated
// identifiers, not adjectives... two implementers will sort the ambiguous
// cases differently and neither will know." That objection is sound and this
// table answers it rather than overriding it: "permissive" stops being an
// adjective and becomes DATA WITH A CITATION. Two people reading one entry's
// `osiApproved: true` and `conditions.sameLicence: false` reach the same
// answer, which is exactly what the enumerated list was protecting — see
// docs/standards/guardrails/gate-6-pull-request.md's own "Licence policy: a
// table, not two allow lists" section for the superseded reasoning.
//
// Every entry was verified against its own `reference` — the OSI's approval
// page where one exists, or the licence steward's own canonical text
// otherwise — not populated from recollection (a licence's OSI status is a
// checked fact, never asserted). `checked` records the date that
// verification happened; `npm run gate:7`'s licence-table re-validation
// (check-licence-table.mjs) re-reads each reference and reports drift, on
// demand — never on a schedule, because a licence's text and classification
// are immutable once published (change-triggered-checks.md).
//
// Schema per entry, keyed by SPDX identifier:
//   name         — the licence's common name
//   reference    — the authoritative source this entry was checked against
//   osiApproved  — recorded fact, with `reference` as its citation
//   checked      — ISO date this entry was last verified against `reference`
//   permissions  — booleans: commercialUse, distribution, modification,
//                  privateUse, patentGrant, sublicensing
//   conditions   — booleans: notice, stateChanges, sourceDisclosure,
//                  sameLicence (share-alike), networkUseDisclosure
//   limitations  — booleans: noTrademark, noWarranty, noLiability (recorded
//                  for completeness; they narrow what the licence covers,
//                  they do not affect the permissive/blocking derivation)
//
// A consuming repository carries only the entries its own resolved
// dependency set actually uses — arriving by the same instantiation route as
// the standards themselves (fix 12), with the upstream commit recorded, not
// the whole table here. This file IS that whole table: the toolkit's own
// canonical copy, since whether a licence is OSI-approved is not a property
// of any one repository.

/** Derived, never asserted directly on an entry: a licence is permissive
 *  when it imposes none of source-disclosure, same-licence (share-alike) or
 *  network-use-disclosure. Notice retention (and, for some permissive
 *  licences, a state-changes note) alone is permissive. */
export function isPermissive(entry) {
  const c = entry.conditions;
  return !c.sourceDisclosure && !c.sameLicence && !c.networkUseDisclosure;
}

export const LICENCE_TABLE = {
  MIT: {
    name: "MIT License",
    reference: "https://opensource.org/license/mit",
    osiApproved: true,
    checked: "2026-07-30",
    permissions: {
      commercialUse: true,
      distribution: true,
      modification: true,
      privateUse: true,
      patentGrant: false,
      sublicensing: true,
    },
    conditions: {
      notice: true,
      stateChanges: false,
      sourceDisclosure: false,
      sameLicence: false,
      networkUseDisclosure: false,
    },
    limitations: { noTrademark: true, noWarranty: true, noLiability: true },
  },
  "Apache-2.0": {
    name: "Apache License 2.0",
    reference: "https://opensource.org/license/apache-2-0",
    osiApproved: true,
    checked: "2026-07-30",
    permissions: {
      commercialUse: true,
      distribution: true,
      modification: true,
      privateUse: true,
      patentGrant: true,
      sublicensing: true,
    },
    conditions: {
      // Section 4(b): a modified file must carry a prominent notice that it
      // changed — beyond plain notice retention, but not source-disclosure
      // or share-alike, so this stays permissive by the derived rule.
      notice: true,
      stateChanges: true,
      sourceDisclosure: false,
      sameLicence: false,
      networkUseDisclosure: false,
    },
    limitations: { noTrademark: true, noWarranty: true, noLiability: true },
  },
  ISC: {
    name: "ISC License",
    reference: "https://opensource.org/license/isc-license-txt",
    osiApproved: true,
    checked: "2026-07-30",
    permissions: {
      commercialUse: true,
      distribution: true,
      modification: true,
      privateUse: true,
      patentGrant: false,
      sublicensing: false,
    },
    conditions: {
      notice: true,
      stateChanges: false,
      sourceDisclosure: false,
      sameLicence: false,
      networkUseDisclosure: false,
    },
    limitations: { noTrademark: true, noWarranty: true, noLiability: true },
  },
  "BSD-2-Clause": {
    name: 'BSD 2-Clause "Simplified" License',
    reference: "https://opensource.org/license/bsd-2-clause",
    osiApproved: true,
    checked: "2026-07-30",
    permissions: {
      commercialUse: true,
      distribution: true,
      modification: true,
      privateUse: true,
      patentGrant: false,
      sublicensing: false,
    },
    conditions: {
      notice: true,
      stateChanges: false,
      sourceDisclosure: false,
      sameLicence: false,
      networkUseDisclosure: false,
    },
    limitations: { noTrademark: true, noWarranty: true, noLiability: true },
  },
  "BSD-3-Clause": {
    name: 'BSD 3-Clause "New" or "Revised" License',
    reference: "https://opensource.org/license/bsd-3-clause",
    osiApproved: true,
    checked: "2026-07-30",
    permissions: {
      commercialUse: true,
      distribution: true,
      modification: true,
      privateUse: true,
      patentGrant: false,
      sublicensing: false,
    },
    conditions: {
      // The third clause (no use of contributors' names to endorse without
      // permission) is a limitation on trademark-style use, not one of the
      // tracked conditions — it changes nothing about permissiveness.
      notice: true,
      stateChanges: false,
      sourceDisclosure: false,
      sameLicence: false,
      networkUseDisclosure: false,
    },
    limitations: { noTrademark: true, noWarranty: true, noLiability: true },
  },
  "Artistic-2.0": {
    name: "Artistic License 2.0",
    reference: "https://opensource.org/license/artistic-2-0",
    osiApproved: true,
    checked: "2026-07-30",
    permissions: {
      commercialUse: true,
      distribution: true,
      modification: true,
      privateUse: true,
      patentGrant: true,
      sublicensing: false,
    },
    conditions: {
      // Verified against the OSI text directly, not assumed from the
      // "OSI-approved, therefore permissive" shortcut: Section 4 requires
      // that a modified version's Source form "be made freely available",
      // and requires documenting how it differs from the Standard Version —
      // real source-disclosure and state-changes obligations, not mere
      // notice retention. This is the entry gate-6-pull-request.md's own
      // "check conditions before concluding" warning was written for.
      notice: true,
      stateChanges: true,
      sourceDisclosure: true,
      sameLicence: false,
      networkUseDisclosure: false,
    },
    limitations: { noTrademark: true, noWarranty: true, noLiability: true },
  },
  "BlueOak-1.0.0": {
    name: "Blue Oak Model License 1.0.0",
    reference: "https://opensource.org/license/blue-oak-model-license",
    osiApproved: true, // OSI approved this licence on 2024-01-19
    checked: "2026-07-30",
    permissions: {
      commercialUse: true,
      distribution: true,
      modification: true,
      privateUse: true,
      patentGrant: true,
      // The steward's own text (blueoakcouncil.org/license/1.0.0) grants
      // "everything with this software that would otherwise infringe" a
      // contributor's copyright, but never uses the word "sublicense" and
      // does not explicitly grant it.
      sublicensing: false,
    },
    conditions: {
      // "Notices": recipients must receive the licence text or a link to
      // it. No source-disclosure, share-alike or network clause.
      notice: true,
      stateChanges: false,
      sourceDisclosure: false,
      sameLicence: false,
      networkUseDisclosure: false,
    },
    limitations: { noTrademark: true, noWarranty: true, noLiability: true },
  },
  "Python-2.0": {
    name: "Python License 2.0 (Python Software Foundation)",
    reference: "https://opensource.org/license/python-2-0",
    osiApproved: true,
    checked: "2026-07-30",
    permissions: {
      commercialUse: true,
      distribution: true,
      modification: true,
      privateUse: true,
      patentGrant: false,
      sublicensing: false,
    },
    conditions: {
      notice: true,
      stateChanges: false,
      sourceDisclosure: false,
      sameLicence: false,
      networkUseDisclosure: false,
    },
    limitations: { noTrademark: true, noWarranty: true, noLiability: true },
  },
  "CC0-1.0": {
    name: "Creative Commons CC0 1.0 Universal",
    // Not OSI-approved (opensource.org/licenses does not list it — Creative
    // Commons licenses, including this one, are outside OSI's approved
    // list, which covers only licenses meeting the Open Source Definition
    // for software). The steward's own canonical text is the reference.
    reference: "https://creativecommons.org/publicdomain/zero/1.0/legalcode",
    osiApproved: false,
    checked: "2026-07-30",
    permissions: {
      commercialUse: true,
      distribution: true,
      modification: true,
      privateUse: true,
      // The dedication explicitly leaves patent and trademark rights
      // unaffected — waived rights, not a granted licence.
      patentGrant: false,
      sublicensing: true,
    },
    conditions: {
      // A public-domain dedication: no conditions of any kind, not even
      // notice retention.
      notice: false,
      stateChanges: false,
      sourceDisclosure: false,
      sameLicence: false,
      networkUseDisclosure: false,
    },
    limitations: { noTrademark: true, noWarranty: true, noLiability: true },
  },
  WTFPL: {
    name: "Do What The F*ck You Want To Public License",
    // Not OSI-approved (absent from opensource.org/licenses).
    reference: "http://www.wtfpl.net/txt/copying/",
    osiApproved: false,
    checked: "2026-07-30",
    permissions: {
      commercialUse: true,
      distribution: true,
      modification: true,
      privateUse: true,
      patentGrant: false,
      sublicensing: true,
    },
    conditions: {
      notice: false,
      stateChanges: false,
      sourceDisclosure: false,
      sameLicence: false,
      networkUseDisclosure: false,
    },
    limitations: { noTrademark: true, noWarranty: true, noLiability: true },
  },
  "CC-BY-3.0": {
    name: "Creative Commons Attribution 3.0 Unported",
    reference: "https://creativecommons.org/licenses/by/3.0/legalcode",
    osiApproved: false, // absent from opensource.org/licenses (a content, not software, licence)
    checked: "2026-07-30",
    permissions: {
      commercialUse: true,
      distribution: true,
      modification: true,
      privateUse: true,
      patentGrant: false,
      // Section 4(a) explicitly states "You may not sublicense the Work."
      sublicensing: false,
    },
    conditions: {
      notice: true, // attribution: keep copyright notices, name the author
      stateChanges: false,
      sourceDisclosure: false,
      sameLicence: false, // no share-alike clause, unlike CC BY-SA
      networkUseDisclosure: false,
    },
    limitations: { noTrademark: true, noWarranty: true, noLiability: true },
  },
  "CC-BY-SA-4.0": {
    name: "Creative Commons Attribution-ShareAlike 4.0 International",
    reference: "https://creativecommons.org/licenses/by-sa/4.0/legalcode",
    osiApproved: false, // absent from opensource.org/licenses (a content, not software, licence)
    checked: "2026-07-30",
    permissions: {
      commercialUse: true,
      distribution: true,
      modification: true,
      privateUse: true,
      patentGrant: false,
      sublicensing: false,
    },
    conditions: {
      notice: true, // attribution (Section 3(a))
      stateChanges: false,
      sourceDisclosure: false,
      sameLicence: true, // share-alike (Section 3(b)): adaptations need a BY-SA-compatible licence
      networkUseDisclosure: false,
    },
    limitations: { noTrademark: true, noWarranty: true, noLiability: true },
  },
};

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
 *  a typo. */
export function licenceTableEntry(id) {
  return LICENCE_TABLE[(id ?? "").trim()];
}

// --- SPDX licence expression parsing (fix 8, moved here by fix brief 6 so
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
 *  gives a maintainer something to actually search for. */
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

/** Every leaf identifier in a parsed expression, in order, duplicates
 *  included — what a "does every licence in this cell have a table entry"
 *  completeness check needs (gate 2), as distinct from evaluating whether
 *  the expression as a whole is acceptable (gate 6, check-licence-policy.mjs).
 *  An unparseable expression yields its raw string as a single "leaf" so the
 *  caller still has something to report against. */
export function leafIdentifiers(node) {
  if (node && typeof node === "object" && node.unparseable) return [node.raw];
  if (typeof node === "string") return [node];
  return [...leafIdentifiers(node.left), ...leafIdentifiers(node.right)];
}

/** Evaluates a parsed expression against one leaf predicate. `A OR B` is
 *  acceptable if either disjunct is (the consumer chooses); `A AND B`
 *  requires both. `blockers` names the identifier(s) actually responsible
 *  for a block — empty when acceptable — so a finding can say which term
 *  failed rather than restating the whole expression. `leafVerdict(id)`
 *  returns `{ acceptable, reason }` for one bare identifier; policy
 *  (check-licence-policy.mjs) supplies the actual decision rule. */
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
