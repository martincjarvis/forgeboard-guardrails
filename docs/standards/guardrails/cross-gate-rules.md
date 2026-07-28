---
type: reference
summary: The rules every gate holds regardless of what it checks — ordering, the tooling tier ladder, zero warnings, evidence, and how a refusal must read.
read_when: Building a gate, or judging whether an existing one is defective in a way its checks would not reveal.
---

# Cross-gate rules

These hold for every gate. A gate that breaks one of them is defective even when
its checks are correct.

## Order is part of the contract

**Fail fast, and shift left.** A defect caught earlier costs less: earlier in
the gate sequence, and earlier in the gate order within it. Two rules produce
that, and the second overrides the first.

**Cheapest first.** Within a gate, order checks by what they cost to run, not by
how important they feel. A formatter that runs in a second precedes a test suite
that runs in a minute, so the common failure is reported in a second. Ordering by
severity instead means paying the expensive check's cost before learning the
cheap one would have failed anyway.

**Except where a check changes what a later one reads.** A check that mutates
the tree — a formatter rewriting files, an isolation step hiding unstaged
changes — must run before anything that reads what it touched, whatever it
costs. Otherwise the later check judges bytes that are about to change, and its
verdict is about a state that will not exist.

That is why the commit gate runs the formatter first and the isolation check
before anything reads a file: not because they are cheap, though they are, but
because everything after them depends on what they did.

A reordering changes what the gate sees. It is a change to the contract, not a
presentation choice.

## Build and test only what changed

Stated in full as
[the changed-component rule](components.md#the-changed-component-rule), beside
the component map it depends on.

## Prefer established tooling to bespoke checks

Nearly every check in this standard has a mature open-source implementation,
usually several, maintained by people who have seen failure modes this
repository has not met yet. Take one. Write a check only to fill a gap no
available tool covers, and treat that as a temporary state rather than an asset
— a bespoke check is a thing to maintain, a thing to document, and a thing that
is wrong in ways nobody else has already found and fixed.

Stop at the first level that covers the check:

| Level | Source                                           | Why it comes first                                                                               |
| ----- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| 1     | A capability the hosting platform already offers | Nothing to install, nothing to keep running, and it reports where the merge policy already looks |
| 2     | An established open-source tool                  | Maintained by someone else, calibrated against more code than this repository                    |
| 3     | A check written here                             | Only for a gap the first two do not cover                                                        |

Level 1 is the one most often skipped, and the two clearest examples are
dependency updates and code scanning. A platform that raises dependency-update
pull requests on a schedule, or scans for vulnerable patterns and publishes the
findings to its own review surface, is offering the exact check this standard
asks for — already integrated with the required status checks, already
annotating changed lines, already retaining history across runs. Reimplementing
that in the pipeline costs work and produces something less connected.

Within level 2, **prefer the stack's own tool where one exists, and fall back to
the Node ecosystem where none does.** A formatter, a prose lint, a spell check
and a secret scan are stack-independent problems, and one implementation across
every repository is worth more than a per-stack choice. A language's own
formatter and analysers are not: they understand the language, and an external
pass never will.

**The Node ecosystem is the named fallback, not merely a habit.** It is broad
enough to cover the stack-independent checks for any language, mature, and
already required by the format standards the pipeline publishes. A repository
whose stack has no answer takes that rather than inventing one, so that two
repositories on the same unfamiliar stack converge instead of diverging.

**A repository that already has a working answer keeps it.** The fallback names
what to reach for when there is nothing; it is not an argument for replacing
something that already meets the standard. A stack-native alternative is worth
raising only for a new repository, and only where the team finds the fallback
genuinely unacceptable — adopted deliberately it is a decision record, while the
fallback taken by default needs nothing.

**Prefer tools that honour `.editorconfig`.** Indentation, character set and
line endings are declared once, in a file every major editor and a good many
tools already read, rather than repeated in each tool's own configuration where
the copies drift and contradict each other. A tool that reads it inherits the
repository's answer for free; a tool that does not needs its own copy of the
same settings, and that copy is one more thing to keep true.

This is the same reasoning as preferring a format the host ingests natively: an
existing, widely-implemented declaration beats a private one, and the cost of
ignoring it lands later as a diff full of whitespace nobody changed.

Two qualifications, both real:

- **Adopting a tool is a dependency decision**, subject to whatever line the
  repository holds on dependencies, and recorded like any other — including the
  alternative that was rejected.
- **Configuring a tool is not writing one.** Preferring established tooling does
  not mean accepting its defaults unexamined; it means not reimplementing its
  analysis. The rule set is still the repository's to choose.

## A warning is a failure

Every build and lint check in every gate holds a zero-warning, zero-error line.
A threshold above zero is a number people write to, and a warning nobody is
required to clear is a finding the repository has silently accepted.

## Local gates are a fast copy; the server gate is the authority

Gates 0–5 exist to give the author the answer in seconds instead of minutes, and
every blocking check among them must have a named required status check in
[gate 6](gate-6-pull-request.md). A check that runs only locally is advisory
whatever its verdict says, because nothing stops a change that never ran it. A
check that runs only server-side is correct but slow, and slow checks are where
people learn to push and hope.

## Decisions live in decision records; documents state the current position

Every artefact this standard asks for falls into one of three kinds, and mixing
them is what makes a corpus unreadable:

| Kind            | Holds                                                                    | Reads as                                    |
| --------------- | ------------------------------------------------------------------------ | ------------------------------------------- |
| Decision record | One choice, its alternatives, and why — including any check opted out of | A settled question, with its history intact |
| Register        | Accepted findings, one row each                                          | A list somebody must keep true              |
| Document        | What is currently the case                                               | The present tense, with no argument in it   |

The split between the first two is by **scope, not severity**: one accepted
finding is a register row, and excluding a check from the repository is a
decision record.

A document that narrates how its content came to be forces every future reader
to work out which parts still apply. Keep it current, keep it short, and put the
provenance — the decision records, the related references — in a footer at the
end where someone chasing the reasoning will find it and everyone else can skip
it. Superseding a decision means a new record, not an edit to the document that
quietly changes what it says without saying so.

## Every verdict leaves evidence someone else can read

A pass with no artefact is a claim; a pass with a test report, a coverage report
and a findings file is a result. This falls hardest on the gate that gates the
merge, but it applies anywhere a verdict outlives the session that produced it.

## A refusal is a diagnosis

Name the check, the path, the offending content and the action that clears it. A
gate that reports only "failed" forces the author to re-run the command by hand
to learn what broke.

## Never claim more than was checked

A check that could not run reports unknown. Stating a cause the evidence does
not support sends the author looking in the wrong place.

## A check that did not enforce says why

Silence is indistinguishable from a pass. Every run distinguishes three states —
passed, skipped, suppressed by decision — and a check nobody notices missing is
worse than one that was never there.

## Auto-repair only where the fix is unambiguous

Formatting, yes. A link with one candidate target, yes. Anything requiring a
choice is reported, not guessed.

## Verification

- [ ] Every blocking local check has a named required status check server-side.
- [ ] No gate emits a warning it does not treat as a failure.
- [ ] Every refusal names the check, the path and the remedy.
- [ ] A check that could not run says so, rather than passing or asserting a cause.
- [ ] Every check the platform already provides is enabled rather than rebuilt.
- [ ] Within each gate, checks run cheapest first, except where one changes what
      a later one reads.
- [ ] The cheapest check that would catch a given defect is the one that catches
      it — no defect waits for a slower gate that an earlier one could have found.
- [ ] Indentation, character set and line endings are declared once in
      `.editorconfig`, and no tool's own configuration contradicts it.
- [ ] A bespoke check has a recorded reason no existing tool covered it.

## References

- [Guardrail standards](../guardrail-standards.md) — the gate index.
- [Bypass and exceptions](bypass-and-exceptions.md) — the three reporting states
  in full.
- [Components](components.md) — the changed-component rule.
