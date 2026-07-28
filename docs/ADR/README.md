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
