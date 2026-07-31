---
type: explanation
status: Accepted
decided: 2026-07-31
owner: Toolkit maintainers
approver: Martin Jarvis
summary: Tooling gains its own file-length, cyclomatic-complexity and function-length band — wider than production's, decided on its own terms rather than inherited or left absent. The rejected alternative, affirming the exemption with its reason recorded, is named and why it lost.
read_when: Asking why a tooling-classed file is measured against a wider band than production instead of no band at all, or deriving the tooling numbers for a repository that wants its own.
---

<!-- cspell:ignore unwidened -->

# Tooling has its own complexity and length band

## The gap

[File classes](../standards/guardrails/file-classes.md) gives `tooling`
files no length limit and no complexity band at all —
[thresholds.md](../standards/guardrails/thresholds.md) scopes cyclomatic
complexity, function length and parameter count to "production and test
code," and file length to "production and test files," by design: a long
gate script is not a design smell the way a long product file is, the same
reasoning that already exempts tooling from the length limit.

Lizard's absence from a ported gate corpus is **correct**, not an oversight —
tooling is excluded from complexity scanning corpus-wide, and a repository
that classes its ported scripts `tooling` (with the reasoning stated inline
in `.gitattributes`) is doing exactly what this standard asks. An audit
verified `No thresholds exceeded` against gate 6's own scope and found
nothing hidden.

**The consequence is that the code deciding what merges is the least
examined code in the repository.** A gate script can grow arbitrarily
complex — nested conditionals, functions doing five things, whatever a
rushed edit leaves behind — with zero mechanical check anywhere in the
pipeline, precisely because it is tooling. That is the wrong way round: the
code with the most leverage over what ships is held to a lower bar than the
code it gates.

## What this decision does not do

**Does not simply add `tooling` to the production complexity band.** The
exemption from the length limit exists for a real reason — a 900-line gate
script is not automatically a design smell the way a 900-line application
file is — and folding tooling into the production band without deciding
that deliberately would silently discard that reasoning rather than weigh
it.

**Does not extend [fix 73](../standards/guardrails/file-classes.md)'s
generated-file discount to tooling.** Ported gate scripts are copied, not
generated — a human can act on them, edit them, simplify them — and
[fix 74](0006-change-size-override-is-a-human-decision.md) is how that case
is already handled: by asking a human, not by exempting the code from
measurement.

## Decision

**Tooling gets its own complexity and length band**, wider than
production's, decided on its own terms rather than inherited. A gate script
has a different shape than product code — often more branching by necessity
(a check that classifies several finding kinds), often more acceptable at
greater length (a single file implementing one gate's full logic, which this
toolkit's own `scripts/gate-6-pull-request.mjs` already is) — so a band
copied from production's numbers would be wrong in either direction without
ever having been chosen for tooling specifically.

[Thresholds](../standards/guardrails/thresholds.md) carries the actual
numbers this decision adds — file length, cyclomatic complexity and function
length, each roughly double production's own gap-fill pair, with parameter
count deliberately left unwidened — and states what they were derived from.
[File classes](../standards/guardrails/file-classes.md)'s class table now
reads the same as production's `Length limit` and `Warn band` cells for
tooling — a real ceiling, enforced the same way (**push back**, not merely
reported) — only the numbers behind it differ.

## Why option 2 lost

The rejected alternative was to affirm the current exemption, with its
reason recorded where a future reader would find it, rather than give
tooling a band at all. The argument for it was real and survives partly
intact: a long gate script is not automatically a design smell the way a
long product file is, and that reasoning is _why the tooling band is wider
than production's_, not why it should be absent.

What option 2 could not answer is the gap this record opened with: **a
recorded reason does not make an unchecked thing checked.** Affirming the
exemption would leave the code that decides what merges as the least
examined code in the repository, on purpose, with a citation. That is a
worse position than an unexplained gap, not a better one — an unexplained
gap at least reads as unfinished; a deliberately-recorded exemption reads as
settled, and settles the wrong thing. The code with the most leverage over
what ships does not get to opt out of being examined merely because examining
it is inconvenient for the reason it is long. A band that is wider than
production's honours the same argument option 2 was built on without
conceding the actual point in dispute — whether this code is examined at
all.

## Consequences

- A tooling-classed file over its own file-length, cyclomatic-complexity or
  function-length band is a finding, the same severity as a production file
  over its band. Parameter count is unaffected — tooling keeps that one
  measure's existing production/test-only scope.
- Every consuming repository inherits this finding on day one, once its own
  gate 6 and gate 7 invocations are extended to scan tooling-classed files
  against these numbers — not done in this decision. Both currently scope
  their lizard invocation to production and test files only
  (`scripts/gate-6-pull-request.mjs`, `scripts/gate-7-on-demand.mjs`); wiring
  the tooling band into that scan is a mechanical follow-up this record
  establishes the numbers for, not a defect in this record.
- The toolkit's own `scripts/**` and `hooks/**` — classed `production` in
  this repository, not `tooling` ([file-classes.md](../standards/guardrails/file-classes.md#rules):
  "in a repository whose product is the tooling itself... those same
  scripts are production") — were measured against the new numbers as a
  feasibility check, not a reclassification: two of the three warnings a
  prior audit found under the production band clear under the tooling
  numbers; a third (`splitRules`, `scripts/check-suppressions.mjs`, 243
  lines) still exceeds the tooling function-length band. Reported, not tuned
  around — the band was derived independently of what would make this
  finding disappear.

## References

- [File classes](../standards/guardrails/file-classes.md) — the class table
  this decision edits.
- [Thresholds](../standards/guardrails/thresholds.md) — the actual band
  numbers, and what they were derived from.
- [Cross-gate rules](../standards/guardrails/cross-gate-rules.md#checks-are-tiered-by-cost-and-the-tier-decides-the-gate) —
  the general-purpose-backstop reasoning this decision sits beside.
