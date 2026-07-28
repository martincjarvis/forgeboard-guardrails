---
name: docs-review
description: Use when writing or reviewing anything under /docs — checks frontmatter, guidance-before-provenance ordering, document type, preferred terms, and that a reference an agent loads has a skill beside it rather than agent instructions in its body.
---

# Docs review

Apply the documentation style standard. Most of it is judgement; this separates
the part a gate can check from the part a reviewer must.

Load `docs/standards/docs-style.md` before reviewing.

## Mechanically checkable

These are findings, not opinions:

- **Three frontmatter fields**, present and non-empty: `type`, `summary`,
  `read_when`.
- **`type` is one of** `reference`, `how-to`, `explanation`, `tutorial`. A
  document class that redefines it declares that in its own convention.
- **Preferred terms** — the table in the standard. Word-boundary matches only;
  identifiers are exempt.
- **Links and anchors resolve.** The guardrails docs gate covers this; do not
  duplicate it, but do report what it finds.

## Reviewer judgement

- **Does `summary` answer the question outright?** It should let a reader act
  without opening the body. "Covers deployment" does not; "versions derive per
  component from Conventional Commits" does.
- **Does `read_when` describe a situation, not a role?** "Defining a new gate",
  not "when an agent needs gate information".
- **Is guidance before provenance?** A reader arriving mid-task hits the
  actionable content within the first screen. Why the document exists, what it
  deliberately omits, and which decisions led to it go at the bottom or in the
  decision record that owns them.
- **Does the shape match the type?** A reference that reads as a narrative is
  the most common structural error — people consult it, they do not read it
  through.
- **Is the purpose one line?** If it needs a paragraph, the document is doing
  two jobs and should be split.
- **One term per concept**, even where the standard's table does not name the
  pair. Synonyms read better and search worse.

## The two-artefact rule

A document that both a human reads and an agent loads is **two artefacts**, not
a compromise:

- The reference stays human, classified as documentation. Its frontmatter is
  what lets an agent decide whether to load it at all.
- Agent-specific procedure belongs in a skill beside it, classified as agent
  context and held to the agent-document limits.

The defect to look for is a reference carrying agent instructions as an aside —
the right place for a pointer, the wrong place for a procedure. Report it as a
missing skill rather than as prose to delete.

For the skill itself, check what a gate cannot: that each reference it names
states **when** to load it. "Read the error reference if the API returns a
non-200 status" is progressive disclosure; "see the references folder" is a
table of contents with no trigger.

## Length

An agent-loaded document over its warn threshold is split, not shortened by
relocation. Ask of the content being moved: would the agent get this right
without being told? If yes, cut it rather than moving it — the limit exists
because everything loaded competes for attention, and moving text to a file that
still gets loaded saves nothing.

## Reporting

```text
<path>:<line> — <rule>
Finding: what is wrong
Fix:     the specific edit
```

Separate the mechanical findings from the judgement ones, and say which is
which. A reviewer who cannot tell will argue about the wrong half.

## Rules

- **Do not rewrite prose to taste.** The standard governs structure, frontmatter
  and vocabulary. Anything else is the author's.
- **Do not add a term to the preferred-terms table** because you met it once.
  The table earns a row when a pair has actually caused confusion.
- **Do not propose splitting a document** that is merely long. Split one doing
  two jobs.

## References

- `docs/standards/docs-style.md` — the standard.
- `docs/standards/guardrails/gate-2-commit.md` — the link, anchor, prose and
  spelling checks that run at commit time.
- `docs/standards/guardrails/gate-4-task-completion.md` — agent-document limits
  and the Agent Skills rules.
