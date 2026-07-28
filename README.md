# guardrails

A delivery-guardrails toolkit: the standards a repository is held to, the skills
that apply them, and the gates that enforce them.

## What is here

- [`docs/standards/`](docs/standards/README.md) — the standards. Start with the
  [guardrail gate index](docs/standards/guardrail-standards.md).
- [`docs/ADR/`](docs/ADR/README.md) — why the toolkit is the way it is.
- [`skills/`](skills/) — one skill per standard, written for an agent applying
  or auditing it.

## State

Rebuilt from an empty tree. The standards and the skills are complete; the
toolkit that enforces them is being reimplemented against them, rather than the
standards being written to describe whatever the toolkit already did.

No source is carried over. Earlier branches remain for reference, and are worth
reading for the gate implementations and hook wiring, but nothing is inherited
unexamined.
