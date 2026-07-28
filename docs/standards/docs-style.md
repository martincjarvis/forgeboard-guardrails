---
type: reference
summary: How documents in /docs are structured — frontmatter, section order, and where references go.
read_when: Writing or revising anything under /docs.
---

<!-- cspell:ignore Diataxis -->

# Documentation style standard

How documents under `/docs` are structured, and why they are ordered for human
readers rather than for agent execution.

## Frontmatter

Every document under `/docs` opens with these three **base fields**:

```yaml
---
type: reference | how-to | explanation | tutorial
summary: One line stating what the document tells you.
read_when: The trigger for opening the body.
---
```

`summary` should answer the question outright where possible, so an agent can act
without reading further. `read_when` describes the situation, not the reader
("Defining a new gate", not "When an agent needs gate information").

Where a document class redefines a base field, its own convention governs — a
class whose `type` means a work type rather than a document type is following
its own convention, not breaking this one.

The three base fields are the floor, not the ceiling. A **document class** may define
additional typed fields, but only fields its own convention names — an undeclared
field is a defect, and a schema nobody maintains is worse than none.

| Class           | Extra fields                                                | Defined by                          |
| --------------- | ----------------------------------------------------------- | ----------------------------------- |
| ADR             | `status`, `decided`, `owner`, `supersedes`, `superseded_by` | [ADR conventions](../ADR/README.md) |
| Everything else | none                                                        | this standard                       |

A consuming repository may add classes of its own — tickets, delivery artefacts —
and declares their fields in its own convention.

## Section order

**Guidance first. Provenance last.** A reader arriving mid-task should hit the
actionable content within the first screen.

1. Title, then one line of purpose. If the purpose needs a paragraph, the document
   is doing two jobs — split it.
2. The content, most-used first.
3. `## References` at the foot: ADRs, related standards, external sources.

Never open with why the document exists, what it deliberately does not cover, or
which decisions led to it. That material is real, and it belongs at the bottom or
in the ADR that owns it.

## Document types

Naming the type prevents the most common structural error — applying a
task-oriented skeleton to material people consult rather than follow.

| Type          | For                                     | Shape                                         |
| ------------- | --------------------------------------- | --------------------------------------------- |
| `reference`   | Consulted mid-task, not read through    | Tables and lists; scannable; no narrative     |
| `how-to`      | Achieving one stated goal               | Prerequisites → numbered steps → verification |
| `explanation` | Understanding why something is as it is | Prose; the one type where rationale leads     |
| `tutorial`    | Learning by doing, first time through   | Ordered, complete, works end to end           |

Most standards are `reference`. Most ADRs are `explanation`.

## Language

**Active voice.** "Run the command", not "the command should be run". Passive hides
who acts, which in a standard is usually the thing the reader needs to know.

**One instruction per sentence** — `how-to` documents only. Two actions joined by
"and" become two steps, because a reader who completes half a sentence has no way
to record that.

**One term per concept.** Pick the term, use it everywhere, never vary it for
readability. Synonyms read better and search worse, and in a reference document the
reader is searching.

| Use                             | Not                        | Why                                                                             |
| ------------------------------- | -------------------------- | ------------------------------------------------------------------------------- |
| acceptance criterion / criteria | AC, ACs                    | The abbreviation reads as a proper noun and breaks search; spell it out         |
| gate                            | check                      | `gate` is what the toolkit calls them, down to `src/gates/`                     |
| spec                            | design spec, specification | Files are named `-design.md`; the artefact is a spec                            |
| toolkit                         | guardrails (bare)          | `guardrails` alone is ambiguous between the package, the concept, and the hooks |

**Identifiers are exempt.** `AC2`, `P-01` and `ADR-0002` are labels, not prose,
and stay as they are. A word-boundary match gives this for free: `AC` matches,
`AC2` does not.

Seeded, not exhaustive. Add a row when a pair has actually caused confusion — a
vocabulary nobody hit a problem with is overhead.

## Skills

Where a skill automates part of a standard, mention it **as an aside** — a
parenthetical or an italic line next to the guidance it relates to. Never let the
skill be the organising spine: a document structured around which skill runs when
is agent-facing, and stops serving the human reading it.

## What this does not govern

- **ADRs** — recording how a decision was made is the genre, not a fault. Their
  format is fixed by [the ADR conventions](../ADR/README.md).
- **Delivery artefacts** — registers, retrospectives, specs and plans have their
  own audiences and lifetimes, and belong to the repository that produces them.

## Enforcement

Two rules here are mechanically checkable, and they run as documentation checks
at the [commit gate](guardrails/gate-2-commit.md) — alongside the prose lint,
the spell check and the link and anchor integrity check: the three frontmatter
fields being present and non-empty, and the preferred-terms table. The second is a word-list check of the same shape as the cspell gate that
already runs, so it needs no new tooling.

Everything else is judgement. No gate can tell whether prose is concise or whether
provenance was front-loaded, and pretending otherwise would put a number on it that
people would then write to.

## References

- [ADR conventions](../ADR/README.md) — the one document class with extra fields.
- [Guardrail standards](guardrail-standards.md) — the gate that checks what is
  checkable here.
- Document types adapted from the Diataxis framework (<https://diataxis.fr>).
- The one-term-per-concept rule is borrowed from ASD-STE100 Simplified Technical
  English (<https://www.asd-ste100.org>), which pairs ~65 writing rules with a
  controlled 900-word dictionary. The specification itself is **not adopted**: it
  states it is "not intended for general-purpose writing", it targets procedural
  maintenance documentation for non-native readers, and ASD retains copyright, so
  its dictionary cannot ship inside this repo. The idea transfers; the artefact
  does not. Its sentence-length caps are deliberately omitted — a word count is
  easy to satisfy without writing more clearly, and it invites bad splits.
