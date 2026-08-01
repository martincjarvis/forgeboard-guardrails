---
type: reference
summary: How this repository records architecture decisions — the frontmatter is canonical, records are superseded rather than edited.
read_when: Writing a decision record, or looking for why something is the way it is.
---

# Architecture decision records

A decision record holds **one choice, its alternatives, and why**. It is the
artefact the standards point at when a reader asks why a rule is what it is, and
the one a push back resolves into.

## Frontmatter is canonical

```yaml
---
status: Proposed | Accepted | Superseded
decided: YYYY-MM-DD
owner: <who owns the consequences>
supersedes: <record id, when applicable>
superseded_by: <record id, when applicable>
approver: <a human, for a record that accepts a risk, licence, suppression or opt-out>
---
```

Prose may summarise the status; the frontmatter is what tooling reads and what
wins when the two disagree.

## Rules

- **Never edit an accepted record.** Supersede it with a new one. A record that
  changes silently makes every citation of it unreliable.
- **A `Proposed` record may be edited freely** — nothing depends on it yet.
- **Record the rejected alternative**, not only the choice. An outcome without
  its alternatives cannot be re-argued later without reconstructing it from
  scratch.
- **One decision per record.** Two decisions in one record cannot be superseded
  independently.
- **`approver` is required, and must name a human, on a record that accepts a
  risk, a licence outside the allow list, a suppression, or an opt-out from a
  check** — the classes [registers.md](../standards/guardrails/registers.md)
  and [bypass-and-exceptions.md](../standards/guardrails/bypass-and-exceptions.md)
  already reserve for a human, regardless of which artefact records the
  decision. `owner` may still be a team, because it names who lives with the
  consequences day to day; `approver` may not, because it names who accepted
  the risk on the record. An ordinary design ADR — most of the index below —
  needs neither. `scripts/check-adr-approver.mjs` is the gate: it refuses
  `status: Accepted` on a record it reads as accepting one of the four classes
  above when `approver` is empty or reads as a team label rather than a
  person, at commit time and again at the pull request pipeline.
- **A record any register row cites in its Decision record column is one of
  the four classes, whatever words the record itself uses.** A register row
  pointing at an ADR is that ADR being used to accept something — structural
  evidence, not vocabulary, and it cannot be evaded by wording a decision
  differently than the last one. The vocabulary check above still applies on
  its own for a record no row cites yet — an accepted risk with nothing
  pointing at it. `scripts/check-adr-approver.mjs` follows the citation
  first and falls back to reading the prose only when no row cites the
  record.

## Numbering

Records are numbered in this repository's own sequence. Where a decision was
first taken elsewhere and carried here, the record states the position as it now
stands rather than replaying the history — the original remains the historical
account in its own repository.

## Index

- [0001](0001-per-component-version-derivation.md) — versions are derived per
  component from Conventional Commits, by a path-scoped detector.
- [0002](0002-analysis-tool-distribution.md) — the toolkit bundles no analysis
  tools; the consuming repository installs them.
- [0003](0003-derive-configuration.md) — the gates derive what they need from
  what a repository already declares, rather than from a configuration file.
- [0004](0004-development-scope-licence-acceptances.md) — four licences
  outside the table's decision rule, accepted for development scope only.
- [0005](0005-generated-files-discounted-from-change-size.md) — a file
  declared `guardrail-generated` counts toward neither change size nor the
  length limit.
- [0006](0006-change-size-override-is-a-human-decision.md) — an agent
  reports a change-size finding; a human, not the agent, applies
  `[large-pr]`. Superseded by [0010](0010-large-pr-marker-refused-without-approved-row.md).
- [0007](0007-pull-request-precondition-is-resolvability.md) — a pull
  request opens when every finding an implementer could resolve has been
  resolved; the reserved classes are a consequence, not the definition.
- [0008](0008-tooling-complexity-band.md) — tooling gets its own file-length,
  complexity and function-length band, wider than production's; affirming
  the exemption instead was rejected.
- [0009](0009-split-hooks-test-suite.md) — `hooks/test/hooks.test.mjs` is
  split by subject area so lizard's function-span detection stops merging
  adjacent functions; warn-not-block at gate 6 and a tool-artefact register
  row were rejected.
- [0010](0010-large-pr-marker-refused-without-approved-row.md) — a commit
  whose own message introduces `[large-pr]` is refused at the commit-msg
  hook unless the change-size override register already carries a
  human-approved row for the branch; supersedes 0006.
