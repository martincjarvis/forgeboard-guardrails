---
type: explanation
status: Proposed
decided:
owner: Toolkit maintainers
summary: file-classes.md gives tooling files no length limit and no complexity band at all, so a consuming repository's ported gate scripts — code that decides what merges — can grow arbitrarily complex with zero mechanical check anywhere in the pipeline. Two options are named; neither is chosen here.
read_when: Deciding whether tooling should gain its own complexity and length band, or whether the current exemption should simply be affirmed with its reason stated.
---

# Tooling has no complexity or length limit anywhere — decide deliberately

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

## The choice, put to a human rather than made here

Two options, and this record does not pick one:

1. **Give tooling its own complexity and length band**, narrower or wider
   than production's, decided on its own terms rather than inherited. A gate
   script has a different shape than product code — often more branching by
   necessity (a check that classifies several finding kinds), often more
   acceptable at greater length (a single file implementing one gate's full
   logic, which this toolkit's own `scripts/gate-6-pull-request.mjs` already
   is) — so a band copied from production's numbers might be wrong in either
   direction without ever having been chosen for tooling specifically.
2. **Affirm the current exemption, with its reason stated where a future
   reader will find it** — in `thresholds.md` itself, next to the scope row,
   rather than left to be inferred from what the table does not mention. The
   argument that a long gate script is not a design smell still holds; what
   is missing is a record saying so was a decision rather than an oversight,
   the same distinction [ADR-0003](0003-derive-configuration.md) already
   draws for why `.gitattributes` was chosen over a configuration file.

Whichever is chosen, it is a standing policy decision that outlives any one
ticket — not a defect with an obvious remedy — and belongs in a record a
future audit can find, not a comment buried in one repository's
`.gitattributes`.

## References

- [File classes](../standards/guardrails/file-classes.md) — the current
  exemption, and the class it belongs to.
- [Thresholds](../standards/guardrails/thresholds.md) — the scope rows this
  decision would edit, whichever option is chosen.
- [Cross-gate rules](../standards/guardrails/cross-gate-rules.md#checks-are-tiered-by-cost-and-the-tier-decides-the-gate) —
  the general-purpose-backstop reasoning this decision sits beside.
