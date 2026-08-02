// cspell:ignore blueoakcouncil jschardet opensource
// The licence table — recorded facts about each licence this
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
// the standards themselves, with the upstream commit recorded, not
// the whole table here. This file IS that whole table: the toolkit's own
// canonical copy, since whether a licence is OSI-approved is not a property
// of any one repository.

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
  // jschardet (a transitive dependency of the new diff-cover
  // devDependency) carries this in its own package.json `license` field
  // verbatim, "+" and all — kept as the register's own mechanical-production
  // rule states (licenceTableEntry's own comment: "correct the register cell
  // rather than adding an alias"), so the table key matches what actually
  // resolves rather than the SPDX "-or-later" spelling.
  "LGPL-2.1+": {
    name: "GNU Lesser General Public License v2.1 or later",
    reference: "https://opensource.org/license/lgpl-2-1",
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
      stateChanges: true,
      // Weak copyleft: modifications to the library itself must be
      // disclosed and stay under LGPL — irrelevant to whether this table
      // entry blocks, since compatible() (check-licence-policy.mjs) treats
      // Development scope as always compatible regardless of these two —
      // nothing downstream ever ships it.
      sourceDisclosure: true,
      sameLicence: true,
      networkUseDisclosure: false,
    },
    limitations: { noTrademark: true, noWarranty: true, noLiability: true },
  },
};
