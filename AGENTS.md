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

- **Fix it, restructure it, or suppress it — in that order.** A finding gets
  fixed first; where the finding cannot be fixed without changing behaviour,
  restructure to avoid the pattern; suppress with a justification only once
  both are genuinely unavailable, and say why fixing was not possible, not
  merely why suppressing is tolerable. A change that makes a finding
  disappear without changing what the code does — moving the pattern rather
  than removing it — is evasion, refused the same as an unregistered
  suppression. Full rule:
  [`docs/standards/guardrails/bypass-and-exceptions.md`](docs/standards/guardrails/bypass-and-exceptions.md#fix-it-restructure-it-or-suppress-it--in-that-order).
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

**"Reaches outside this repository" is about the destination, not the
distance from the working tree.** Configuring the repository a task is
actually about — its branch protection, its required checks, its host
settings — is part of that task, however far the change lands from a local
file, and is not what this clause holds back. Bootstrapping a repository
against these standards names that explicitly: configuring gate 6's merge
policy is one of the adoption steps
([`skills/repository-bootstrap/SKILL.md`](skills/repository-bootstrap/SKILL.md)),
not a line deferred to a closing checklist, and
[`docs/standards/guardrails/branch-protection.md`](docs/standards/guardrails/branch-protection.md)
runs it from the agent's own authenticated session during bootstrap. What the
clause holds back is a _different_ destination the task was never asked to
touch — pushing to a repository nobody named, publishing to a package
registry, notifying a third party. The reserved list above is closed and
explicit; host configuration on the repository the task is about is not on
it.

Full rule and rationale:
[`docs/standards/guardrails/agent-integration.md`](docs/standards/guardrails/agent-integration.md#progress-blockers-and-questions).
