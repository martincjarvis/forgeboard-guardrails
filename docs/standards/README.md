---
type: reference
summary: Index of the standards this toolkit defines and enforces, and the skills that apply them.
read_when: Looking for a standard, or adding one.
---

# Standards index

The standards this toolkit ships. A repository that installs the toolkit gets
these documents and the skills beside them; the gates enforce what they state.

## Index

- [`guardrail-standards.md`](guardrail-standards.md) — the guardrail gate index:
  the nine gates ordered by how often each fires, the check types and the four
  verdicts. Each gate, and the vocabulary they share, has its own reference under
  [`guardrails/`](guardrails/); every one carries a verification checklist and
  the commands to run its checks by hand.
- [`deployment-strategy.md`](deployment-strategy.md) — per-component
  path-scoped versioning, prerelease channels, and the descriptor → manifest →
  deploy-engine pipeline.
- [`testing-strategy.md`](testing-strategy.md) — the six kinds of test every gate
  routes by, what belongs in each and who owns it, the coverage gate's
  configuration, and the artifact categories a pipeline publishes.
- [`logging-diagnostics.md`](logging-diagnostics.md) — the logging and
  diagnostics policy, its per-stack realization and the tiered enforcement
  boundary.
- [`docs-style.md`](docs-style.md) — how documents under `/docs` are structured:
  frontmatter, guidance-before-provenance ordering, and document types.

## Decision records

- [`docs/ADR/`](../ADR/README.md) — why the toolkit is the way it is. Two records
  so far: per-component version derivation, and which analysis tools are bundled
  rather than resolved from `PATH`.

## Skills

Each standard that an agent applies has a skill beside it, written for the agent
rather than for a human reader.

- [`guardrail-audit`](../../skills/guardrail-audit/SKILL.md) — walks the nine
  gates over a repository, reports each check as present, partial, absent,
  suppressed or unknown, and proposes a tool per gap from its per-stack
  references.
- [`logging-review`](../../skills/logging-review/SKILL.md) — applies the tiered
  logging checklist to changed code and records a finding per file against the
  policy anchors.
- [`testing-review`](../../skills/testing-review/SKILL.md) — places each test in
  its kind by what it needs to run, checks it would fail if the requirement were
  unmet, and audits the coverage configuration and artifact categories.
- [`deployment-review`](../../skills/deployment-review/SKILL.md) — audits
  per-component versioning, prerelease channels, immutability and the deploy
  order against the deployment strategy.
- [`docs-review`](../../skills/docs-review/SKILL.md) — separates the checkable
  part of the documentation standard from the judgement, and reports a reference
  carrying agent instructions as a missing skill.

## References

- [Suppression register](../registers/suppression-register.md) — this repository's own
  instance of the register the standards describe.
