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
- [`coverage-and-test-artifacts.md`](coverage-and-test-artifacts.md) — the
  coverage gate's configuration shapes and the tier → category mapping for
  publication.
- [`logging-diagnostics.md`](logging-diagnostics.md) — the logging and
  diagnostics policy, its per-stack realization and the tiered enforcement
  boundary.
- [`docs-style.md`](docs-style.md) — how documents under `/docs` are structured:
  frontmatter, guidance-before-provenance ordering, and document types.
- [`templates/deployment/`](templates/deployment/) — the instantiable deployment
  template: CI workflow, deploy engine, version resolver, schemas and
  per-component release config.

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
- [`guardrails-config`](../../skills/guardrails-config/SKILL.md) — creating and
  editing the toolkit's own configuration: component boundaries, dependency
  edges, test-type fields and the merge rules.
- [`logging-review`](../../skills/logging-review/SKILL.md) — applies the tiered
  logging checklist to changed code and records a finding per file against the
  policy anchors.

## References

- [Suppression register](../suppression-register.md) — this repository's own
  instance of the register the standards describe.
