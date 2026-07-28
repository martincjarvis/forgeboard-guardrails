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

## The table

| Threshold                      | Default                                                                                    | Applies to                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Change size, warn              | 400 lines                                                                                  | Added + deleted, production and configuration only    |
| Change size, error             | 800 lines                                                                                  | As above                                              |
| Change size override marker    | `[large-pr]` in a branch commit message                                                    | Change size only, not the length or complexity limits |
| File length, warn              | 300 lines — gap-fill                                                                       | Production and test files                             |
| File length, error             | 400 lines — gap-fill                                                                       | Production and test files                             |
| Agent-facing document, warn    | 200 lines                                                                                  | Files an agent loads as context                       |
| Agent-facing document, error   | 500 lines                                                                                  | As above; matches the Agent Skills recommendation     |
| Cyclomatic complexity, warn    | 10 per function — gap-fill                                                                 | Production and test code                              |
| Cyclomatic complexity, error   | 15 per function — gap-fill                                                                 | Production and test code                              |
| Function length, warn          | 60 lines — gap-fill                                                                        | Production and test code                              |
| Function length, error         | 100 lines — gap-fill                                                                       | Production and test code                              |
| Parameter count, warn          | 5 per function — gap-fill                                                                  | Production and test code                              |
| Parameter count, error         | 7 per function — gap-fill                                                                  | Production and test code                              |
| Dependency advisory, block     | High and above for runtime; critical for development-only                                  | Resolved dependencies                                 |
| Dependency advisory, push back | Medium for runtime; high for development-only                                              | Resolved dependencies                                 |
| Dependency licence, block      | Anything not on the allow list for that scope, and anything unknown                        | Resolved dependencies, direct and transitive          |
| Runtime licence allow list     | `MIT`, `ISC`, `BSD-2-Clause`, `BSD-3-Clause`, `Apache-2.0`, `0BSD`, `Unlicense`, `CC0-1.0` | Dependencies present in what is shipped               |
| Development licence allow list | The runtime list, plus `MPL-2.0`, `LGPL-2.1-or-later`, `LGPL-3.0-or-later`                 | Build, test and tooling dependencies only             |
| Commercial acceptance expiry   | 12 months                                                                                  | Any licence accepted by decision record               |
| Advisory scan schedule         | Daily                                                                                      | Runs whether or not a dependency changed              |
| Dependency update proposals    | Weekly                                                                                     | Raised automatically; reviewed like any other change  |
| File size, warn                | 1 MB                                                                                       | Any tracked file                                      |
| File size, error               | 5 MB                                                                                       | Any tracked file                                      |
| Test quarantine expiry         | 14 days                                                                                    | Any quarantined test                                  |
| Diagnostic log retention       | 24 hours                                                                                   | Local gate logs                                       |
| Coverage floor, repository     | None — the repository declares it                                                          | The coverage command owns the comparison              |
| Coverage floor, changed lines  | 80%                                                                                        | Lines added or modified by the change                 |

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

## Verification

- [ ] Every threshold in use is readable from checked-in configuration.
- [ ] A gate run states which value it applied, and whether it was set or default.
- [ ] For each code-shape measure, the repository takes the stack analyser's
      recommendation where one exists, and the gap-fill default only where none does.
- [ ] No native analyser rule has been disabled to substitute a number from this
      table.
- [ ] Every developer, agent and pipeline run resolves the same configuration.
- [ ] A threshold changed since adoption has a decision record saying why.

## References

- [Guardrail standards](../guardrail-standards.md) — the gate index these thresholds serve.
- [File classes](file-classes.md) — which class a threshold applies to.
- [Registers](registers.md) — where a per-file exemption is recorded instead.
