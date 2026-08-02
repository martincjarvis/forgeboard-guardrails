---
name: docs-review
description: Use when writing or reviewing documentation — checks frontmatter, guidance-before-provenance ordering, document type, one term per concept, and that a reference an agent loads has a skill beside it rather than agent instructions in its body.
---

# Docs review

<!-- cspell:ignore frontmatter -->

Most documentation quality is judgement; this separates the part a linter can
check from the part a reviewer must. Formatting, spelling and link hygiene are
the `lint` and `spelling` capabilities in
[docs/standards.md](../../docs/standards.md) — report what they find, do not
duplicate them.

## Mechanically checkable

These are findings, not opinions:

- **Three frontmatter fields**, present and non-empty: `type`, `summary`,
  `read_when`.
- **`type` is one of** `reference`, `how-to`, `explanation`, `tutorial`.
- **Links and anchors resolve.**

## Reviewer judgement

- **Does `summary` answer the question outright?** It should let a reader act
  without opening the body. "Covers deployment" does not; "versions derive per
  component from Conventional Commits" does.
- **Does `read_when` describe a situation, not a role?** "Adding a new
  capability", not "when an agent needs capability information".
- **Is guidance before provenance?** A reader arriving mid-task hits the
  actionable content within the first screen. Why the document exists, what it
  deliberately omits, and which decisions led to it go at the bottom.
- **Does the shape match the type?** A reference that reads as a narrative is
  the most common structural error — people consult it, they do not read it
  through.
- **Is the purpose one line?** If it needs a paragraph, the document is doing
  two jobs and should be split.
- **One term per concept.** Synonyms read better and search worse.

## The two-artefact rule

A document that both a human reads and an agent loads is **two artefacts**, not
a compromise:

- The reference stays human. Its frontmatter is what lets an agent decide
  whether to load it at all.
- Agent-specific procedure belongs in a skill beside it.

The defect to look for is a reference carrying agent instructions as an aside —
the right place for a pointer, the wrong place for a procedure. Report it as a
missing skill rather than as prose to delete.

For the skill itself, check what a linter cannot: that each reference it names
states **when** to load it. "Read the error reference if the API returns a
non-200 status" is progressive disclosure; "see the references folder" is a
table of contents with no trigger.

## Length

An agent-loaded document that has grown too long is split, not shortened by
relocation. Ask of the content being moved: would the agent get this right
without being told? If yes, cut it rather than moving it — everything loaded
competes for attention, and moving text to a file that still gets loaded saves
nothing.

## Reporting

```text
<path>:<line> — <rule>
Finding: what is wrong
Fix:     the specific edit
```

Separate the mechanical findings from the judgement ones, and say which is
which. A reviewer who cannot tell will argue about the wrong half.

## Rules

- **Do not rewrite prose to taste.** Structure, frontmatter and vocabulary are
  reviewable. Anything else is the author's.
- **Do not ban a synonym** because you met it once. A pair earns a rule when it
  has actually caused confusion.
- **Do not propose splitting a document** that is merely long. Split one doing
  two jobs.
