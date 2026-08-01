---
type: reference
summary: A skill that makes any planning session declare its user journeys, and a gate that enforces them where guardrails exist — the on-ramp by which a repository accumulates its own guardrails through ordinary feature work.
read_when: Implementing either slice below, or deciding whether a change to journey handling belongs to this design or to slice 7 of the distributable-guardrails design.
---

<!-- cspell:ignore speckit -->

# Journey-driven planning — design

[Slice 7](2026-08-01-distributable-guardrails-slice-7-user-journeys.md) of the distributable-guardrails
design changes the corpus: user journeys are declared in a spec, and each
journey's end-to-end test is written failing when implementation starts and green
when the plan completes.

This design is the other half — making a planning session actually produce those
journeys, in any repository, whether or not it has guardrails.

## Why this is the on-ramp

The skill's obvious value is better specs. Its more useful value is that a
repository accumulates end-to-end journey tests through ordinary feature work, and
a later audit can offer to protect what is already there:

> _You have eleven end-to-end journey tests and no gate protecting them. Shall I
> add one?_

That is guardrails arriving through the front door. It sets a hard constraint:
**the skill must work in a repository with no guardrails**, and merely be better
in one that has them. It cannot depend on the capability vocabulary, the gate
model, or `.guardrails/` existing.

## What planning skills already do

| Skill                            | Does                                                              | Missing                                                            |
| -------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| `brainstorming`                  | Produces a spec, section by section, with user approval           | Never asks for user journeys                                       |
| `writing-plans`                  | Per-task TDD: write the failing test, watch it fail, make it pass | No outer bracket around the feature                                |
| `verification-before-completion` | Demands evidence before work is claimed complete                  | Verifies what the plan specifies — nothing tells it journeys exist |
| speckit, built-in others         | Their own artefacts and layouts                                   | The same gaps                                                      |

The inner loop already exists. What is missing is the outer bracket — and there is
nothing for it to test, because no journeys are declared.

## Decisions already taken

| Decision                                                                                       | Why                                                                                                                    |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **A skill and a gate, degrading**                                                              | The skill works everywhere; the gate enforces where guardrails exist. Enforcement cannot be the on-ramp's precondition |
| **Interactive: derive what follows, mark the rest as unanswered, then draft the obvious gaps** | The derivation surfaces the questions; the human's answers establish the shape; only then is drafting safe             |
| **Autonomous: derive journeys framed by the parent scope's journeys**                          | Decomposing already-declared journeys is not inventing requirements — the parent is the authority                      |
| **Autonomous with no parent journeys: stop**                                                   | Nothing authorises a derivation. The absence is the finding, against the parent spec                                   |
| **Key on the artefact and the activity, never on a tool's file paths**                         | `docs/superpowers/plans/` is one tool's layout; keying on it means silently doing nothing for every other              |
| **A spec with unanswered journey gaps is committable**                                         | The gaps are the resume point. A session per slice, not one context carrying everything                                |
| **"The test failed first" is enforced by the gate, best-effort in the skill**                  | Only the gate can require evidence. Consistent with everything else here degrading                                     |

## The two slices

### Slice A — The journey skill

**Brief.** A skill that activates alongside any planning or specification
activity and makes journeys a required output. Portable: no dependency on
guardrails, on `.guardrails/`, or on any particular planning tool's layout.

Covers: activation — what activity or artefact triggers it, and how it composes
with a planning skill already running; the interactive sequence, derive → mark
gaps → human answers → draft remaining; the autonomous sequence, deriving from a
parent scope's journeys and refusing when there is no parent; what a declared
journey must contain, per [slice 7](2026-08-01-distributable-guardrails-slice-7-user-journeys.md);
recognising a spec or plan artefact without knowing which tool wrote it; and both
plan-time outputs below.

#### Two outputs at plan time, not one

A plan the skill has touched carries **both**:

- **A first task that writes the end-to-end test for every declared journey, and
  watches each one fail.** `writing-plans` already does this per task — write the
  failing test, run it, see it fail, then implement. The journey tests are the
  same discipline one level out, bracketing the feature rather than the task.
- **Completion criteria naming those tests.** This is the half that is easy to
  omit and the one that carries the weight.

The second matters because of what already exists downstream.
`verification-before-completion` fires when work is about to be claimed done and
demands evidence — but it runs the verifications **the plan specifies**. A plan
that never named its journey tests passes its own criteria with every journey red,
and the verification skill has done exactly what it was asked. The skill does not
replace that mechanism; it supplies the criteria that make it bite.

**Success.** A planning session in a repository with no guardrails ends with
declared journeys. An autonomous slice delivery derives journeys naming the
parent they decompose. A spec whose journeys cannot be settled stops with specific
unanswered questions, committable and resumable. A plan the skill touched cannot
be verified complete while a journey test is red, because its own criteria say so.

**Failure.** The skill does nothing because a planning tool wrote its spec
somewhere unexpected. Journeys drafted before the human has answered anything, so
the agent's assumptions become the acceptance criteria. A verdict — "this spec is
underspecified" — where a specific question was needed. Refusing to stop, so a
session runs long and gets routed around next time. **A plan that opens with the
failing journey tests and never names them in its completion criteria** — the
tests exist, nothing checks them, and the plan closes green.

```gherkin
Given a planning session in a repository with no guardrails installed
When a spec is written
Then it declares user journeys, or names the questions blocking them

Given an autonomous session delivering one slice of a larger design
When it derives its journeys
Then each names the parent journey it decomposes

Given an autonomous session whose parent scope declares no journeys
When it starts
Then it stops and reports the parent spec as the defect

Given a spec declaring three journeys
When a plan is written to deliver it
Then the plan's first task writes three failing end-to-end tests
And the plan's completion criteria name those three tests

Given a plan whose completion criteria name its journey tests
When work is claimed complete with one of them red
Then verification-before-completion refuses the claim, on the plan's own criteria

Given a spec with three unanswered journey questions
When the session ends
Then the spec is committable and a later session resumes from those questions
```

**Complexity: high.** Activation without control of the host skill is the hard
part, and the interactive sequence has to be genuinely useful or it gets routed
around.

---

### Slice B — The journey gate

**Brief.** The enforcement half, in a repository that has guardrails. It checks
what slice A produces and refuses what slice A can only advise against.

Covers: what is checked and at which gate; how a declared journey is located in a
spec; how a journey is matched to its end-to-end test; what evidence establishes
that a test failed before the implementation existed; and the capability this
belongs to, from
[slice 1's vocabulary](2026-08-01-distributable-guardrails-slice-1-foundations.md).

**Success.** A spec declaring no journeys is a finding. A journey with no test,
once implementation has started, is a finding. A plan marked complete with a red
journey test is refused. A derived journey naming no parent is a finding.

**Failure.** A check that cannot fail — the defect class this toolkit exists to
catch. Matching a journey to a test by a heuristic that quietly mismatches.
Blocking a repository that has journeys but has not yet adopted the naming
convention.

```gherkin
Given a repository with guardrails and a spec declaring no journeys
When the gate runs
Then it reports the spec, naming the capability

Given a declared journey whose end-to-end test has only ever passed
When the gate runs
Then it reports that the test has no evidence of having failed

Given a plan marked complete while one journey test is red
When the merge is attempted
Then it is refused
```

**Complexity: medium.** Bounded by slice A's output and by the existing gate
model.

## Sequencing

Slice A first: slice B checks what slice A produces, and building the check
against a format that has not settled is the mistake the distributable-guardrails
pack made at its own seams.

Both depend on [slice 7](2026-08-01-distributable-guardrails-slice-7-user-journeys.md) landing in the
corpus, since that is where a journey's required content is defined.

## Where this lives

In this toolkit for now, distributed with the plugin. Its final home is
undecided: the skill complements planning tools that have nothing to do with
guardrails, and may belong somewhere neutral. That is a placement decision, not a
design one, and moving it later costs a directory.

## Out of scope

- Modifying `brainstorming`, `writing-plans`, speckit or any other planning tool
- Defining what a journey must contain — that is
  [slice 7](2026-08-01-distributable-guardrails-slice-7-user-journeys.md)
- Generating implementation from journeys
- Any change to the six kinds of test in
  [testing-strategy](../standards/testing-strategy.md)

## Questions

1. **How a skill reliably composes with a planning skill already running.**
   Activation is description-matching, and two skills both matching is a hope
   rather than a guarantee. A hook is more reliable and less portable. This is the
   central unknown and slice A's spec must settle it.
2. **What evidence establishes that a test failed first.** Git history showing the
   test predating the implementation is checkable and is a weaker claim than
   someone having watched it fail. Recording the failing run's output is stronger
   and is a new artefact.
3. **Whether a repository can decline journeys wholesale** — the opt-out question,
   for a repository that has guardrails and does not want this capability.
   Presumably yes, through the same register, but it interacts with slice 7 making
   journeys a corpus rule rather than a capability.

## References

- [Slice 7 — user journeys declared](2026-08-01-distributable-guardrails-slice-7-user-journeys.md) — what a
  journey must contain, and the bracket this design produces
- [Testing strategy](../standards/testing-strategy.md) — the six kinds of test and
  the end-to-end rule
- [Distributable guardrails](2026-08-01-distributable-guardrails-design.md) — the
  gate model slice B enforces within
