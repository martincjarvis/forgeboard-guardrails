---
type: reference
summary: Every guardrail threshold, its default, and the rule that the stack's own analyser defaults win over the gap-filling numbers here.
read_when: Configuring a repository's guardrail limits, or auditing whether the ones it uses were chosen rather than inherited.
---

<!-- cspell:ignore cyclomatic -->

# Thresholds

**Every number below is configurable per repository, and every number below has
a default.** A standard that fixes the values is wrong for the next repository;
one that supplies none forces each repository to invent them, and a threshold
invented under deadline is set wherever the current change happens to land.

## The stack's analysers win

Established analysers ship rule sets their maintainers have calibrated against
far more code than this standard has seen, and the numbers below were not
derived from anything comparable. So for the code-shape measures — complexity,
function length, parameter count, file length — take the analyser's recommended
rule set for that stack, and use the value here only to **fill a gap** where the
stack has no native opinion.

A repository that disables a native rule in order to substitute a number from
this table has made itself worse and gained nothing.

The measures marked **gap-fill** are the ones this applies to. The rest are
properties of the workflow rather than of the code, and no analyser has a view
on them.

**This is a rule about which values apply, not about which tool runs.** A
stack's own analyser wins the numbers; it does not excuse that stack from the
general-purpose scan. The general-purpose tool still runs everywhere, including
a stack with its own specialised analyser — it is a backstop, not a
replacement, and is expected to find nothing where the specialised analyser
already has that stack covered. See
[cross-gate rules: checks are tiered by cost](cross-gate-rules.md#checks-are-tiered-by-cost-and-the-tier-decides-the-gate)
for the full rule and why excluding a covered stack removes the backstop.

**A type checker is not a linter, either.** The same distinction
[cross-gate rules](cross-gate-rules.md#checks-are-tiered-by-cost-and-the-tier-decides-the-gate)
draws for complexity holds one level over: a type checker verifies that values
match their declared types; a linter enforces the rules about how code is
shaped — banned patterns, dead code, unused values, style. Turning a type
checker's strictness up satisfies neither a linter check nor a complexity
check that calls for one — `tsc --strict` is not an ESLint configuration,
however strict its settings, and a repository that treats it as one has shipped
no linter at all.

## The table

| Threshold                            | Default                                                                                                                                                                                                                                                                                   | Applies to                                                                                                                                                          |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change size, warn                    | 400 lines                                                                                                                                                                                                                                                                                 | Added + deleted, production, configuration and tooling only                                                                                                         |
| Change size, error                   | 800 lines                                                                                                                                                                                                                                                                                 | As above                                                                                                                                                            |
| Change size override marker          | `[large-pr]` in a branch commit message locally; server-side also requires a human-approved row in [the change-size override register](registers.md#the-change-size-override-register), matched by branch ([fix 74](cross-gate-rules.md#an-override-answers-a-push-back-it-is-not-a-fix)) | Change size only, not the length or complexity limits                                                                                                               |
| File length, warn                    | 300 lines — gap-fill                                                                                                                                                                                                                                                                      | Production and test files                                                                                                                                           |
| File length, error                   | 400 lines — gap-fill                                                                                                                                                                                                                                                                      | Production and test files                                                                                                                                           |
| File length, tooling warn            | 600 lines — gap-fill                                                                                                                                                                                                                                                                      | Tooling files ([ADR-0008](../../ADR/0008-tooling-complexity-band.md))                                                                                               |
| File length, tooling error           | 800 lines — gap-fill                                                                                                                                                                                                                                                                      | Tooling files ([ADR-0008](../../ADR/0008-tooling-complexity-band.md))                                                                                               |
| Agent-facing document, warn          | 200 lines                                                                                                                                                                                                                                                                                 | Files an agent loads as context                                                                                                                                     |
| Agent-facing document, error         | 500 lines                                                                                                                                                                                                                                                                                 | As above; matches the Agent Skills recommendation                                                                                                                   |
| Cyclomatic complexity, warn          | 10 per function — gap-fill                                                                                                                                                                                                                                                                | Production and test code                                                                                                                                            |
| Cyclomatic complexity, error         | 15 per function — gap-fill                                                                                                                                                                                                                                                                | Production and test code                                                                                                                                            |
| Cyclomatic complexity, tooling warn  | 20 per function — gap-fill                                                                                                                                                                                                                                                                | Tooling code ([ADR-0008](../../ADR/0008-tooling-complexity-band.md))                                                                                                |
| Cyclomatic complexity, tooling error | 25 per function — gap-fill                                                                                                                                                                                                                                                                | Tooling code ([ADR-0008](../../ADR/0008-tooling-complexity-band.md))                                                                                                |
| Function length, warn                | 60 lines — gap-fill                                                                                                                                                                                                                                                                       | Production and test code                                                                                                                                            |
| Function length, error               | 100 lines — gap-fill                                                                                                                                                                                                                                                                      | Production and test code                                                                                                                                            |
| Function length, tooling warn        | 150 lines — gap-fill                                                                                                                                                                                                                                                                      | Tooling code ([ADR-0008](../../ADR/0008-tooling-complexity-band.md))                                                                                                |
| Function length, tooling error       | 200 lines — gap-fill                                                                                                                                                                                                                                                                      | Tooling code ([ADR-0008](../../ADR/0008-tooling-complexity-band.md))                                                                                                |
| Parameter count, warn                | 5 per function — gap-fill                                                                                                                                                                                                                                                                 | Production and test code                                                                                                                                            |
| Parameter count, error               | 7 per function — gap-fill                                                                                                                                                                                                                                                                 | Production and test code                                                                                                                                            |
| Dependency advisory, block           | High and above for runtime; critical for development-only                                                                                                                                                                                                                                 | Resolved dependencies                                                                                                                                               |
| Dependency advisory, push back       | Medium for runtime; high for development-only                                                                                                                                                                                                                                             | Resolved dependencies                                                                                                                                               |
| Dependency licence, block            | A licence with no entry in `scripts/licence-table.mjs`, and anything unknown or absent                                                                                                                                                                                                    | Resolved dependencies, direct and transitive                                                                                                                        |
| Dependency licence, decision rule    | OSI-approved and compatible with this repository's own licence (or none declared) — see [`scripts/licence-table.mjs`](../../../scripts/licence-table.mjs) and [gate-6-pull-request.md](gate-6-pull-request.md#licence-policy-a-table-not-two-allow-lists)                                 | Resolved dependencies, direct and transitive; not a fixed default this table can state as a threshold, because it is per-licence recorded fact rather than a number |
| Commercial acceptance expiry         | 12 months                                                                                                                                                                                                                                                                                 | Any licence accepted by decision record                                                                                                                             |
| Advisory scan schedule               | Daily                                                                                                                                                                                                                                                                                     | Runs whether or not a dependency changed                                                                                                                            |
| Dependency update proposals          | Weekly                                                                                                                                                                                                                                                                                    | Raised automatically; reviewed like any other change                                                                                                                |
| File size, warn                      | 1 MB                                                                                                                                                                                                                                                                                      | Any tracked file                                                                                                                                                    |
| File size, error                     | 5 MB                                                                                                                                                                                                                                                                                      | Any tracked file                                                                                                                                                    |
| Test quarantine expiry               | 14 days                                                                                                                                                                                                                                                                                   | Any quarantined test                                                                                                                                                |
| Diagnostic log retention             | 24 hours                                                                                                                                                                                                                                                                                  | Local gate logs                                                                                                                                                     |
| Coverage floor, repository           | None — the repository declares it                                                                                                                                                                                                                                                         | The coverage command owns the comparison                                                                                                                            |
| Coverage floor, changed lines        | 80%                                                                                                                                                                                                                                                                                       | Lines added or modified by the change                                                                                                                               |

## Rules

- **Read from the analyser that enforces them**, not from a configuration file
  of this toolkit's own ([ADR-0003](../../ADR/0003-derive-configuration.md)).
  The values here fill the gaps where a stack has no opinion. A threshold a
  reader cannot find in the repository is not a threshold, it is a habit.
- **An unset threshold takes the default**, and the gate reports which value it
  used. A gate that silently applies a default teaches the team a number nobody
  chose.
- **Changing a threshold is a decision, recorded.** Raising a limit to admit the
  change in hand is the failure mode this whole standard exists to catch.
- **Consistency across the team beats any particular value.** A number everyone
  is held to does the work; a number that is right in the abstract and applied in
  three different places three different ways does not. Whichever source a
  repository takes its code-shape thresholds from, every developer, every agent
  and the pipeline resolve the same configuration.
- **No per-file overrides.** A file that needs an exemption takes one through the
  [suppression register](registers.md), with an approver, like every other
  accepted finding.
- **A tool's own warning severity is not this table's warn band.** See
  [guardrail standards: warn means two different things](../guardrail-standards.md#warn-means-two-different-things).
- **Tooling has its own complexity and length band, decided on its own terms
  rather than inherited or left absent** ([ADR-0008](../../ADR/0008-tooling-complexity-band.md),
  `Accepted`). File length, cyclomatic complexity and function length each
  gain a tooling-scoped pair, wider than production's — a gate script has a
  different shape than product code, often more branching by necessity (a
  check that classifies several finding kinds) and often more acceptable at
  greater length (a single file implementing one gate's full logic) — but a
  band, not an absence: the code deciding what merges is not exempt from
  being examined, only held to a wider ceiling than the code it gates.
  **Parameter count is not widened.** A function that takes many parameters
  is exactly as hard to call correctly whether the file is tooling or
  product code, and nothing about being a gate script relaxes that — tooling
  keeps that one measure's existing "production and test code" scope, which
  is to say no mechanical parameter-count check applies to it at all, the
  same as today.
  **What the tooling numbers were derived from:** the same way production's
  own gap-fill numbers were — a round, conventional figure with a stated
  multiple of production's, not read off a specific analyser's shipped
  defaults (no established analyser publishes a distinct band for
  "infrastructure or gate script," so this is gap-fill same as production's
  own numbers, only for a class with no analyser opinion of its own to
  observe in the first place). File length doubles production's pair
  (300/400 → 600/800). Cyclomatic complexity keeps production's own 5-point
  warn-to-error gap, shifted up by ten (10/15 → 20/25). Function length
  doubles production's error threshold with a proportionally wider warn gap
  (60/100 → 150/200, a 50-line gap against production's 40). These are
  indicative starting points, not load-bearing precision — a repository is
  free to set its own, the same as every other gap-fill value in this table.

## Verification

- [ ] Every threshold in use is readable from checked-in configuration.
- [ ] Change size counts production, configuration and tooling files
      together, not each counted separately.
- [ ] A gate run states which value it applied, and whether it was set or default.
- [ ] For each code-shape measure, the repository takes the stack analyser's
      recommendation where one exists, and the gap-fill default only where none does.
- [ ] No native analyser rule has been disabled to substitute a number from this
      table.
- [ ] A stack whose only specialised analyser is a type checker still has a
      linter configured — the type checker's strictness is not treated as
      satisfying the lint check.
- [ ] A stack's own analyser being authoritative for its values has not been used
      to exclude that stack from the general-purpose scan.
- [ ] Every developer, agent and pipeline run resolves the same configuration.
- [ ] A threshold changed since adoption has a decision record saying why.
- [ ] A tool's own `warn` severity is not treated as this table's warn band —
      the rule still fails the run rather than merely printing.
- [ ] A tooling-classed file over its own band (file length, cyclomatic
      complexity or function length) is a finding; one under it is not, and
      a production or test file is never measured against the tooling
      numbers by mistake.
- [ ] This table and [file classes](file-classes.md) state the tooling band
      identically — the same six numbers, not restated differently in each
      place.

## References

- [Guardrail standards](../guardrail-standards.md) — the gate index these thresholds serve.
- [File classes](file-classes.md) — which class a threshold applies to.
- [Registers](registers.md) — where a per-file exemption is recorded instead.
- [ADR-0008](../../ADR/0008-tooling-complexity-band.md) — tooling's own
  complexity and length band, and why the current exemption was not
  affirmed instead.
