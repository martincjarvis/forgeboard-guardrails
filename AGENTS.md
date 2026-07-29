# Agent instructions

This repository is built under the guardrail standards it defines, in
`docs/standards/`. Read
[`docs/standards/guardrail-standards.md`](docs/standards/guardrail-standards.md)
for the gates before you trip one.

**Asked to bootstrap a new repository against these standards?** Read
[`skills/repository-bootstrap/SKILL.md`](skills/repository-bootstrap/SKILL.md)
first, not the standards index — it is the procedure, and it names each
reference it needs at the step that needs it.

## Operating rules

- **Stream progress and blockers as you work.** State what you are doing, what
  you have finished, and what is blocking you, while the work is still
  running — not only in a final report.
- **Do not stop to ask a clarifying question.** Where something is ambiguous,
  take the reasonable option, proceed, and record the choice and the rejected
  alternative. "I assumed X because Y" is correct; "Which do you want, X or
  Y?" is not.
- **A stated failure is a valid outcome.** A session that cannot finish says
  precisely what blocked it. A silent stop, or a stop that asks a question
  instead of finishing, is not.
- **This file wins on design questions.** Where a skill or harness default tells
  you to pause for approval on an approach, a scope, or a product decision, the
  rules above override it for work in this repository.

**What these rules never override.** They are about design ambiguity, and
nothing else. Stop and ask, every time, before an action that is destructive or
hard to reverse, before anything that reaches outside this repository, and
wherever the standards already reserve a decision for a human — a suppression
approval, an accepted risk, a conflict between two standing directives. Those
are not clarifying questions; they are the decisions someone else has to own.
An agent that cannot tell the difference should ask.

Full rule and rationale:
[`docs/standards/guardrails/agent-integration.md`](docs/standards/guardrails/agent-integration.md#progress-blockers-and-questions).
