---
type: explanation
status: Accepted
decided: 2026-07-28
owner: Toolkit maintainers
summary: The gates derive what they need from what a repository already declares, rather than requiring a bespoke configuration file to be authored and maintained.
read_when: Adding something a gate needs to know, or asking why there is no guardrails configuration file.
---

# Derive configuration, do not declare it

## Decision

**The gates read what the repository already states.** There is no mandatory
configuration file to author.

| What a gate needs         | Where it comes from                                                             |
| ------------------------- | ------------------------------------------------------------------------------- |
| The component graph       | The stack's own project graph — workspaces, a solution file, a project manifest |
| Each component's commands | The stack's task runner, under conventional names                               |
| File classes              | `.gitattributes`, through a `guardrail-class` attribute                         |
| Thresholds                | The analysers' own configuration, with this standard's defaults filling gaps    |
| Staged-file rules         | The staged-file runner's own configuration                                      |
| The default branch        | Git                                                                             |

An **optional** override remains for the repository whose layout genuinely
cannot be derived. It is small, it is the exception, and a repository that needs
none writes none.

## Why

The previous position was a schema-backed configuration file holding all of it.
It was tested by having two capable readers each build four repositories from
the standards alone.

**Both invented the same field name for something that does not exist**, in one
sitting, working independently. Neither could find the schema, because it lived
in a skill rather than a standard — and when that skill was later removed, the
sole in-tree definition went with it. Four repositories were produced with four
merely-compatible shapes.

That is the whole argument. A mandatory bespoke artefact that every consumer
must author, and that no consumer can find, produces exactly the divergence the
standards exist to prevent. Nothing needs inventing if there is nothing to
author.

Three supporting reasons:

- **A second copy drifts.** A component map restating a workspace definition is
  two statements of one fact, and they part company the week somebody adds a
  project to one of them.
- **The repository already does this work well.** It has a manifest, a lock
  file, a project graph and a task runner. Reusing them costs nothing and
  inherits their guarantees.
- **It is the same rule the tooling ladder already states.** Prefer what exists
  over what you would write. A bespoke configuration format is a bespoke tool
  wearing a different hat.

`.gitattributes` deserves its own note: file classification is the one thing
with no existing home in a project graph, and `.gitattributes` is an existing
git standard, already checked in, already understood, with precedence rules git
defines and a query interface (`git check-attr`) that needs no parser. It also
already carries the line-ending normalisation this standard requires, so the
file is present in a conforming repository regardless.

## Rejected alternatives

- **A configuration file with a published schema** — the previous position, and
  genuinely simpler to implement: one parser, one shape, one place to look, and
  a machine-checkable contract. Rejected because the cost falls on every
  consumer forever rather than on the toolkit once, and because the evidence
  above shows consumers cannot produce it consistently even when they are trying
  to. Simplicity for the implementer is not simplicity for the adopter.
- **Derive everything, with no override at all.** Cleaner still, and wrong: some
  repositories have layouts no graph expresses, and a standard with no escape
  hatch gets abandoned rather than argued with.
- **Publish the schema in a standard rather than a skill**, keeping the file
  mandatory. This was the reviewers' own recommendation, and it fixes the
  finding rather than the cause — the file would be findable, and still
  authored, still duplicated, still drifting.

## Consequences

- **Derived is not visible.** A file somebody wrote can be read; a derivation
  cannot. The gates must therefore **report what they resolved** — the component
  set, the class of each file in the change, the thresholds in force and where
  each came from. A wrong derivation that nobody can see is worse than a wrong
  file that anybody can open, and this obligation is what keeps the trade
  honest.
- **A stack whose graph cannot be read is a recorded gap**, not a silent
  fallback to guessing.
- The toolkit gains discovery logic per stack, which is real work and real
  maintenance. That cost sits with the toolkit, once, instead of with every
  adopter, repeatedly.
- Adoption gets shorter: a conforming repository may need nothing beyond
  `.gitattributes` entries it partly needs anyway.

## References

- [Components](../standards/guardrails/components.md) — the four facts and where
  they are found.
- [File classes](../standards/guardrails/file-classes.md) — the
  `guardrail-class` attribute.
- [Thresholds](../standards/guardrails/thresholds.md) — defaults, and when the
  stack's analysers override them.
- [Cross-gate rules](../standards/guardrails/cross-gate-rules.md) — the tooling
  ladder this decision applies to configuration.
