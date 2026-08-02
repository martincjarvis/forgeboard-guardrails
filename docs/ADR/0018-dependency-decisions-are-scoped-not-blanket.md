---
type: explanation
status: Accepted
decided: 2026-08-02
owner: Toolkit maintainers
supersedes: 0002
summary: Dependency decisions are scoped by phase — bootstrap and uplift select the best-supported permissive tooling and its maintained presets, while a development task pushes back on a dependency the plan did not name. A blanket no-new-dependency line is the rejected reading.
read_when: Adding a dependency, adopting or replacing an analysis tool, or asking why the toolkit ships maintained presets rather than a hand-written rule list.
---

<!-- cspell:ignore backstop backstops misattribution misattributed -->

# Dependency decisions are scoped by phase, not blanket

## Decision

**ADR-0002's "the toolkit supplies opinionated configuration" is a positive
obligation, and the dependency rule that governs how it is met is scoped in two
halves.**

- **Bootstrap and uplift.** Selecting the tooling _is_ the task. Pick the
  best-supported permissive tools and their maintained presets, targeting
  current best practice for the latest LTS of the stack, across code style,
  correctness, static analysis and SAST. Writing a bespoke rule list here is the
  anti-pattern: the repository takes on maintenance of something a community
  maintains better, and gets exactly what happened to this one — a four-rule
  eslint config that measured no complexity at all while seven of eight real
  breaches sat invisible because nobody typed `complexity` into the list.
- **Development tasks.** A dependency not named in the plan is pushed back on.
  New dependencies are proposed at brainstorming or design time, where the
  trade-off is argued and recorded, never introduced mid-implementation.

The two halves share one rule — a dependency decision is deliberate and
recorded — and differ in what "deliberate" means at each phase. At bootstrap,
"deliberate" is the act of choosing the stack's established tooling and the
preset its maintainers ship; at development, it is the act of taking a proposed
dependency to design before reaching for it.

## Why

ADR-0002 held two claims together: "the toolkit bundles no analysis tools"
(about not vendoring binaries a consuming repository already installs through
its own package manager) and "the toolkit supplies opinionated configuration
and orchestration" (a positive obligation). The second is an _obligation to
configure_, and a hand-written rule list of four core rules is its inversion —
the toolkit supplying no opinion at all on the values its own specialised
analyser exists to measure.

eslint is this stack's specialised analyser
([cross-gate-rules.md](../standards/guardrails/cross-gate-rules.md#checks-are-tiered-by-cost-and-the-tier-decides-the-gate)):
it is authoritative for JavaScript's code-shape values. The four-rule config
left it measuring none of them — `complexity`, `max-lines-per-function`,
`max-depth` and `max-params` were all absent — while lizard, the
general-purpose backstop that is _expected to find nothing_ on a stack the
specialised analyser covers, carried the whole job and did it badly:

|                                | lizard                                      | eslint (measured) |
| ------------------------------ | ------------------------------------------- | ----------------- |
| Real complexity breaches found | 1 of 8                                      | 8 of 8            |
| False length breaches raised   | 3                                           | 0                 |
| Worst misreport                | `splitRules`, 7 real lines, reported as 256 | —                 |

[Cross-gate-rules.md](../standards/guardrails/cross-gate-rules.md#checks-are-tiered-by-cost-and-the-tier-decides-the-gate)
already documents lizard's function-span misattribution, and gate 6
hard-blocks on it. The backstop doing the specialised analyser's job is the
failure mode the tiering rule exists to prevent.

## The misattribution this corrects

`eslint.config.mjs` cited **ADR-0011** for a no-new-dependency line.
ADR-0011 is `reconciliation-matches-labels-not-details` — nothing to do with
dependencies. That number was leaked from another repository (ForgeBoard),
where it presumably names a dependency decision; here it names nothing. The
real lineage is ADR-0002, and this record supersedes it.

## Rejected alternatives

- **A blanket no-new-dependency line.** The reading that produced the four-rule
  eslint config: "the toolkit holds a no-new-dependency line for itself, so
  ship no presets and a minimal rule list." Rejected on the evidence above: it
  is the anti-pattern at the bootstrap half, where selecting presets _is_ the
  task, and it is too blunt for the development half, where a dependency can be
  proposed and recorded rather than refused outright. ADR-0002 never stated a
  blanket line; it stated a positive obligation to configure, which the blanket
  reading inverted into an obligation not to.
- **Bundle the tools.** ADR-0002's own rejected alternative, restated here
  because this decision carries its "bundles no tools" half forward unchanged:
  the consuming repository installs the tools through its own package manager
  and pins them in its own lock file. The toolkit supplies the configuration,
  not the binaries.

## Consequences

- ADR-0002 is superseded. Its "bundles no analysis tools" half (do not vendor
  binaries; the consuming repository installs and pins them) is unchanged and
  carried forward here; its "supplies opinionated configuration" half is the
  positive obligation this record scopes by phase.
- Bootstrap and uplift adopt maintained presets for the stack's own analyser,
  not a hand-written rule list. Each plugin adopted earns its place by catching
  something no other tool here catches, and carries a licence register row like
  any other dependency.
- A development task that wants a new dependency takes it to brainstorming or
  design first; a dependency reaching implementation un-named is pushed back
  on, not installed.
- A blanket "no-new-dependency" line is not a line this toolkit holds. The
  eslint configuration no longer cites one.

## References

- [ADR-0002](0002-analysis-tool-distribution.md) — the decision this record
  supersedes; its "bundles no tools" half is carried forward unchanged.
- [Cross-gate rules](../standards/guardrails/cross-gate-rules.md#checks-are-tiered-by-cost-and-the-tier-decides-the-gate) —
  the specialised-analyser-is-authoritative rule this decision puts into
  effect for JavaScript.
- [Thresholds](../standards/guardrails/thresholds.md#the-stacks-analysers-win) —
  the stack's analysers win the code-shape values.
