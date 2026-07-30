---
type: explanation
status: Accepted
decided: 2026-07-30
owner: Martin Jarvis
approver: Martin Jarvis
summary: Four licences outside the table's decision rule — CC0-1.0, WTFPL, CC-BY-3.0 and CC-BY-SA-4.0 — are accepted for development scope only, each on its own grounds, because none is OSI-approved and none reaches a published artefact.
read_when: A dependency's licence is refused by the licence policy check, or auditing the dependency-licence register.
---

# Development-scope licence acceptances

## Decision

**Four licences are accepted for `Development` scope only.** Each is accepted on
its own grounds. This is not a blanket acceptance of a category, and none would
pass at `Runtime` scope without a further decision.

This toolkit declares no licence of its own, so no dependency licence conflicts
with one. Every dependency below is resolved transitively by a declared
devDependency and is consumed at build, lint or test time. The toolkit publishes
standards, skills and gate scripts; it bundles no analysis tool
([ADR-0002](0002-analysis-tool-distribution.md)) and ships none of these packages.

### CC0-1.0 — `spdx-license-ids@3.0.23`

A public-domain dedication: commercial use, distribution, modification, private
use and sublicensing all permitted, with no notice requirement, no share-alike
and no source disclosure. In practice more permissive than MIT.

**Why it is not OSI-approved**, and why that does not weigh here: the dedication
leaves patent and trademark rights unaffected — rights are waived, not licensed —
and that patent silence is OSI's objection. It is not a restriction on use. The
Free Software Foundation classes CC0 as a free licence.

- **Obligations accepted:** none.
- **Rejected alternative:** none exists. This package _is_ the canonical SPDX
  licence identifier list, which the licence table's own vocabulary derives from.

### WTFPL — `@azu/style-format@1.0.1`

Every permission granted, every condition absent — no notice, no attribution, no
share-alike.

**Why it is not OSI-approved:** legal informality rather than restriction. No
warranty disclaimer, no patent grant, deliberately flippant drafting. The FSF
lists it as a free, GPL-compatible licence.

- **Obligations accepted:** none.
- **Risk accepted:** the absent warranty disclaimer is a theoretical exposure that
  does not arise for a package consumed at lint time.
- **Rejected alternative:** replacing the transitive parent to drop it. Rejected
  as disproportionate — three levels deep behind a formatter, no obligation to
  breach.

### CC-BY-3.0 — `spdx-exceptions@2.5.0`

Attribution required. **No share-alike**, which is what separates it from
CC-BY-SA-4.0 below and makes it the weaker of the two obligations.

Accepted on the same grounds as the dictionary below and with less to accept: the
package is **data, not code** — the canonical list of SPDX licence exception
identifiers — and this repository neither adapts nor redistributes it. Creative
Commons licences are absent from OSI's approved list because that list covers
software; a licence-identifier dataset is exactly the content case CC-BY exists
for.

- **Obligations accepted:** attribution, which binds distribution of the content.
  This repository distributes none.
- **Condition on the acceptance:** if this dataset is vendored, modified, or
  shipped in a published artefact, this acceptance does not cover it and the
  decision must be retaken.
- **Rejected alternative:** none practical. Like `spdx-license-ids`, this is the
  canonical dataset for what it describes, and it arrives transitively with the
  licence tooling that reads it.

### CC-BY-SA-4.0 — `@cspell/dict-en-common-misspellings@2.1.13`

**The only one of the four carrying live share-alike obligations**, and the only
one that would be refused outright at runtime scope:

- attribution required (Section 3(a));
- **share-alike** — adaptations must carry a BY-SA-compatible licence
  (Section 3(b));
- sublicensing not permitted.

Accepted because the package is a dictionary of common English misspellings —
data, which is the content case CC-BY-SA exists for — and because this repository
neither adapts nor redistributes it. `cspell` reads it at lint time. Creative
Commons themselves advise against CC licences for software, and that advice is
why this row is scoped and reasoned rather than waved through.

- **Obligations accepted:** attribution and share-alike, both of which bind only
  an adaptation. This repository creates none.
- **Condition on the acceptance:** if the dictionary's content is vendored,
  modified, or shipped, this acceptance does not cover it. The scope column
  enforces that — `compatible()` evaluates the licence against the dependency's
  scope, so a move to `Runtime` re-raises the finding automatically.
- **Rejected alternative:** substituting a permissively-licensed misspelling
  dictionary. Rejected for now — the alternatives are materially smaller and the
  spell-check gate's value depends on dictionary coverage. This is the row worth
  revisiting first if the obligation ever becomes live.

## Why not extend the licence table instead

The table records **facts about a licence**: whether it is OSI-approved, what it
permits, what it requires. None of these four is OSI-approved, and recording
otherwise would make the table false. The decision to tolerate a licence that
fails the rule belongs on the register row and in this record, where it carries a
scope, a named approver and a stated condition — not in the table, where it would
silently change the rule for every future dependency and for every repository
that instantiates this corpus.

## References

- [Registers](../standards/guardrails/registers.md) — why a licence acceptance is a decision record, not a register row alone.
- [Gate 6 — Pull request pipeline](../standards/guardrails/gate-6-pull-request.md) — the licence decision rule.
- [Dependency licence register](../registers/dependency-licence-register.md) — the four rows this record covers.
