---
type: reference
summary: The coverage and test-artifacts standard — the command-delegated coverage gate, its two string[] patterns, the fail-fast consequence, and the tier-to-category mapping for CI publication.
read_when: Configuring the `coverage` gate, or wiring coverage/test artifacts into CI.
---

<!-- cspell:ignore lcov junit cobertura SARIF semgrep lizard dotnet nyc vitest SAST code-scanning XPlat fail-fast guardrails -->

# Coverage & test-artifacts standard

The canonical policy for the pre-push coverage gate and the artifacts a CI pipeline
publishes from it: what the gate is, the two `string[]` patterns it supports, the
fail-fast consequence of running steps in sequence, and the tier-to-category mapping
that keeps coverage, tests, and security findings in separate CI categories.

## Purpose and scope

The `coverage` gate is **command-delegated**: the toolkit runs the command named in the
`coverage` config field and treats a non-zero exit as a shortfall. **The configured
command owns the threshold** — the toolkit parses no coverage numbers. The native tool
self-fails below its configured floor and prints the shortfall (e.g.
`node --test --experimental-test-coverage --test-coverage-lines=80`,
`dotnet test /p:Threshold=80`, `vitest run --coverage.thresholds.lines=80`). An unset
`coverage` field is a deliberate, **visible** skip — the gate prints
`coverage gate skipped: no "coverage" command configured` rather than silently passing.

The same command that gates also **emits the artifacts**: a single `npm run test:coverage`
both enforces the floor and writes `coverage/lcov.info` and `coverage/junit.xml`, so one
invocation gates and publishes. The threshold-free variant
(`npm run test:coverage:report`) writes the artifacts without enforcing a floor, for a
"report only" run.

The gate is configured in the consuming repo's
guardrails configuration's `coverage` field, typed `string | string[]`.

## The two `string[]` patterns

A repo with a single stack sets `coverage` to one string. A repo with multiple stacks
that cannot run one unified pass sets it to a `string[]`. The array shape supports two
distinct patterns, reconciled here:

| Pattern                  | Shape                                                                                                                    | When to use it                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Merge-then-threshold** | Each step emits a per-component report; the final step merges the reports and applies one threshold to the merged total. | A repo wanting a single unified coverage number across all stacks, where a merge tool (`lcov`, `dotnet coverage merge`, `nyc merge` + check) spans them. |
| **Per-stack floors**     | Each step owns its own threshold and self-fails below it.                                                                | A mixed-stack repo where no merge tool spans the stacks; each stack holds its own floor independently.                                                   |

A concrete mixed-stack example (a .NET backend + a Node toolkit), each stack owning its
own floor:

```json
{
  "coverage": [
    "dotnet test --collect:'XPlat Code Coverage' /p:Threshold=80",
    "npm run test:coverage"
  ]
}
```

Both patterns are valid uses of the same `string[]` field. The difference is **where the
threshold lives**: on a final merge step (one unified number), or on every step
(per-stack floors). Choose per-stack floors when the stacks have no shared merge tool or
when a single floor would mask a regression in one stack behind strength in another.

## Fail-fast consequence

The toolkit runs the `coverage` sequence through `runCommandSequence`, which is
**fail-fast**: it returns on the first failing step. (Source: the toolkit's
`src/exec/commandRunner.ts` — `runCommandSequence` returns `{ pass: false }` on the
first command that exits non-zero, with that step's captured output.) This module has no
counterpart in this repository, so it is named here in prose rather than linked.

The practical consequence under **per-stack floors**: a consumer sees only the **first**
failing stack's output. Fix that stack and re-run to discover the next. There is no
"run all and report every failure" mode — the sequence stops at the first non-zero exit,
so a stack that would fail later is never reached while an earlier step fails.

## Per-component thresholds are not a feature

The `coverage` field is **per-repo** (or per-stack via the array), never per-component. A
repo cannot configure different coverage floors for different components through this
gate. If finer-grained control is required it is a new toolkit feature, not a
configuration of the existing field; file it as a separate ticket rather than working
around it with overlapping sequences.

## Tier-to-category mapping for CI publication

Each tier publishes under its own CI category; the categories are **never merged**. A
hundred low-severity security findings must not bury a coverage regression, and a
coverage delta must not drown a test failure.

| Tier               | Artifact | CI category                  |
| ------------------ | -------- | ---------------------------- |
| Security (semgrep) | SARIF    | code-scanning                |
| Coverage           | lcov     | coverage comment / dashboard |
| Tests              | JUnit    | test-results check           |

The artifacts themselves are produced by the native tooling each tier already runs:
semgrep emits SARIF, and Node's built-in `lcov` and `junit` reporters write the coverage
and test artifacts alongside the human-readable spec output. The CI workflow that uploads
them under these categories is the A2-c deliverable; this standard fixes the mapping it
conforms to.

## Tool provisioning

A CI runner without `semgrep` and `lizard` on `PATH` silently skips the SAST and
complexity gates and reports green — they are external, resolved from `PATH` by design.
Runners **must** provision both. The coverage figure is the cheapest signal that
provisioning is still correct: when those tools are absent the suite's self-skipping
tests drop the pass count without raising a failure, so a coverage number or pass count
that moves between environments is the warning that a gate has gone quiet.

## References

- [Gate 5 — Push](guardrails/gate-5-push.md) — where the coverage command runs, and why a non-zero exit is not proof of a shortfall.
- [Gate 6 — Pull request pipeline](guardrails/gate-6-pull-request.md) — changed-line coverage, and the report formats a host ingests.
- [Documentation style](docs-style.md) — how this document is structured.
