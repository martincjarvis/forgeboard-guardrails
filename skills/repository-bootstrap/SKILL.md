---
name: repository-bootstrap
description: Use when setting up a new repository to comply with the guardrail standards, or bringing an existing repository into compliance for the first time. States the order to declare vocabulary, wire the root instruction file, and adopt each content standard and the gates — naming which reference to open at each step, so an agent does not read the whole corpus before starting.
---

# Repository bootstrap

Sequences the other five skills into one first-time setup. Each step below
names the one reference it needs — load it there, not before. Do not delegate
"read the standards" to a sub-agent as a whole task; delegate one step's
reference if you delegate at all.

## Before you start

Establishing the stacks, the host and what already exists is the same first
move for any repository work here: follow
`skills/guardrail-audit/SKILL.md`'s "Before you start" section rather than
repeating it.

One extra question decides step 1: is this a genuinely new repository, with no
source and no history, or an existing one adopting the standards for the first
time? A blank repository has nothing to sweep or migrate; an existing one does.

## The order

1. **Sweep first, if there is anything to sweep.** For an existing repository,
   follow `skills/guardrail-audit/SKILL.md`'s "Adopting guardrails in a
   repository that has none" section from its first step. For a genuinely new
   repository, there is nothing yet to find — start at step 2.

2. **Declare the vocabulary.** Load
   `docs/standards/guardrails/components.md`,
   `docs/standards/guardrails/file-classes.md` and
   `docs/standards/guardrails/thresholds.md` when declaring the component map,
   the file-class patterns and the size thresholds. Every step below reads what
   gets declared here, so it comes before all of them, not after.

3. **Wire the root instruction file.** Load
   `docs/standards/guardrails/agent-integration.md` when creating the
   repository's `AGENTS.md` — one canonical file, thin pointers from any other
   harness-specific name, and the edit-time and task-completion hooks each
   harness in use must fire.

4. **Testing strategy.** Load `docs/standards/testing-strategy.md` and
   `skills/testing-review/SKILL.md` when placing the first test and
   configuring coverage. This precedes the gates and deployment strategy below
   because both depend on tests already passing and coverage already
   configured — wiring gate 5 or a release gate against a suite that does not
   exist yet just moves the failure, it does not prevent it.

5. **Logging and diagnostics.** Load `docs/standards/logging-diagnostics.md`'s
   enforcement boundary section and the matching stack reference under
   `skills/logging-review/reference/` (`dotnet.md` or `react-ts.md`) when
   wiring the analyser for the repository's stack. Tier 0 is mechanical and
   belongs at commit time; Tier 1 and Tier 2 are review-time only and need no
   wiring yet.

6. **Deployment strategy**, only if the repository packages or deploys.
   Follow `skills/deployment-review/SKILL.md`'s "Adoption, for a repository
   with none of this" section in full — it is already sequenced against the
   same component map from step 2; do not re-sequence it here. Skip this step
   entirely for a repository with nothing to release, and say so rather than
   leaving it silently undone.

7. **The gates.** Follow `skills/guardrail-audit/SKILL.md`'s "Adopting
   guardrails in a repository that has none" section in full, from wherever
   step 1 left off. It states its own order for the nine gates and why; this
   skill does not restate it.

8. **Docs style**, once the repository starts writing its own `/docs`. Load
   `docs/standards/docs-style.md` and `skills/docs-review/SKILL.md` when the
   first document is drafted — not before, and not as a reason to write
   documents nobody asked for.

## What done looks like

- Every step above has evidence, not configuration alone.
  `skills/guardrail-audit/SKILL.md`'s "Verifying rather than assuming" section
  applies here too: a check is real once you have seen it fail on something it
  should fail on, not merely once it appears in a config file.
- A step skipped because it does not apply yet (no release target, no `/docs`)
  is recorded as skipped and why, not silently absent.
- The root instruction file is the only place operating rules live; every
  other harness file it applies to is a pointer, not a copy.

## Rules

- **Stream progress and blockers as you go**, and do not stop to ask a
  clarifying question — take the reasonable option, proceed, and record the
  choice and the rejected alternative. A stated failure with its reason is a
  valid outcome; a silent stop, or a question instead of one, is not. This
  overrides a skill or harness default that says to pause for approval on an
  approach or a scope. It never overrides a pause for a destructive or
  irreversible action, or for a decision the standards reserve for a human.
  Full rule: `docs/standards/guardrails/agent-integration.md`.
- **Do not read the corpus front-to-back before starting.** Each step above
  names the one reference it needs; the rest can wait for their own step.
- **Do not dispatch a sub-agent to digest the standards as a whole.** A
  sub-agent given "read the standards and report back" has the same problem
  this skill exists to solve — hand it one step's reference instead, or do the
  step yourself.
- **Do not invent a step this order omits.** A gap you notice becomes a
  finding for the human, per `docs/standards/guardrail-standards.md`, not an
  extra phase folded in here.

## References

- `docs/standards/README.md` — the full standards index, for anything this
  order does not cover.
- `skills/guardrail-audit/SKILL.md` — the gate-by-gate audit and adoption
  order this skill sequences around.
- `skills/testing-review/SKILL.md`, `skills/logging-review/SKILL.md`,
  `skills/deployment-review/SKILL.md`, `skills/docs-review/SKILL.md` — the
  per-standard procedures each step above hands off to.
- `docs/standards/guardrails/agent-integration.md` — the root instruction
  file rule, and the progress, blocker and question rule above.
