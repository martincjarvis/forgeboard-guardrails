---
type: reference
summary: The four test tiers, what belongs in each and who owns it, plus the coverage gate's configuration and the artifact categories a pipeline publishes.
read_when: Deciding which tier a test belongs to, configuring the coverage gate, or wiring test and coverage artifacts into a pipeline.
---

<!-- cspell:ignore lcov junit cobertura nyc vitest XPlat -->

# Testing strategy

Every gate routes work by test tier: the commit gate runs unit tests, the push
gate runs integration and self-contained end-to-end tests, the pipeline runs the
deployment-dependent ones, and the release gate runs what needs the real
environment. This standard defines the tiers those gates assume, and the
coverage gate that measures them.

## The four tiers

A tier is defined by **what the test needs in order to run**, not by what it
covers or how long it takes. Breadth and duration follow from the dependency;
they do not define it.

| Tier                            | Needs                                                                | Runs at     | Owned by                           |
| ------------------------------- | -------------------------------------------------------------------- | ----------- | ---------------------------------- |
| Unit                            | The code under test and nothing it did not construct itself          | Gate 2      | The developer                      |
| Integration                     | Real collaborators the test starts and stops — a database, a broker  | Gate 5      | The developer                      |
| Self-contained end-to-end       | The composed system, stood up by the test run on ephemeral resources | Gate 5      | The developer                      |
| Deployment-dependent end-to-end | A deployment to infrastructure the test did not create               | Gate 6 or 8 | The team that owns the environment |

The boundaries in practice:

- **Unit ends where a process boundary begins.** A test that opens a socket, a
  file it did not create, or a database connection is not a unit test, whatever
  directory it sits in. The commit gate runs this tier on every commit, so its
  cost is paid hundreds of times a day — that budget is the reason the boundary
  is drawn tightly rather than a matter of taste.
- **Integration owns its collaborators.** It starts them, it stops them, and it
  does not care what ran before it. A test that assumes a database already has
  rows in it belongs to no tier — it is a deployment-dependent test that has not
  admitted it.
- **Self-contained end-to-end composes the system without deploying it.** The
  distinction from the tier below is the [push gate's](guardrails/gate-5-push.md)
  hard line: everything the test needs is stood up within the run and torn down
  after, it runs offline, and it holds no credentials for external
  infrastructure.
- **Deployment-dependent end-to-end runs after a deployment**, never at push
  time. It is shared state, it takes minutes, and it makes a developer's push
  depend on infrastructure being available — three reasons the push gate refuses
  it.

**A test in the wrong tier is a defect in its own right.** It is not merely slow:
a deployment-dependent test labelled as a unit test will fail on someone else's
machine for reasons that have nothing to do with their change, and the lesson
they learn is that the gate lies.

## What a test must do to count

- **Assert something that fails when the requirement is unmet.** A test whose
  name matches a requirement is not evidence the requirement is met.
- **Encode the requirement, not the implementation.** When behaviour must
  change, the test changes because the requirement changed — never because the
  code did and the test was in the way.
- **Fail for one reason.** A test that can fail for several reasons reports
  none of them clearly.
- **Not be retried into passing.** Intermittency is a finding; see
  [flaky tests](guardrails/flaky-tests.md).

## Coverage

The coverage gate is **command-delegated**: the toolkit runs the command named
in the `coverage` configuration field and treats a non-zero exit as a shortfall.
**The configured command owns the threshold** — the toolkit parses no coverage
numbers. The native tool self-fails below its configured floor and prints the
shortfall.

An unset `coverage` field is a deliberate, **visible** skip: the gate says so
rather than silently passing.

The same command that gates also **emits the artifacts**, so one invocation both
enforces the floor and writes the reports a pipeline publishes.

### The two configuration shapes

A repository with a single stack sets `coverage` to one string. A repository
whose stacks cannot run one unified pass sets an array, which supports two
distinct patterns:

| Pattern                  | Shape                                                                                                          | When to use it                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Merge-then-threshold** | Each step emits a per-component report; a final step merges them and applies one threshold to the merged total | A single unified number is wanted, and a merge tool spans the stacks                                             |
| **Per-stack floors**     | Each step owns its own threshold and self-fails below it                                                       | No merge tool spans the stacks, or a single floor would mask a regression in one stack behind another's strength |

The difference is **where the threshold lives**: on a final merge step, or on
every step.

**The sequence is fail-fast.** It stops at the first step that exits non-zero, so
under per-stack floors a consumer sees only the first failing stack's output.
Fix that stack and re-run to find the next. There is no run-everything-and-report
mode.

**Thresholds are per repository, or per stack through the array — never per
component.** Finer granularity is a change to the toolkit, not a configuration of
this field; a repository that wants it files that rather than working around it
with overlapping sequences.

Changed-line coverage is a separate floor, enforced in the pipeline — see
[gate 6](guardrails/gate-6-pull-request.md). A repository comfortably above its
overall floor absorbs an entirely uncovered change without the number moving.

## Artifact categories

Each tier publishes under its own category, and the categories are **never
merged**. A hundred low-severity security findings must not bury a coverage
regression, and a coverage delta must not drown a test failure.

| Tier     | Artifact                                   | Category        |
| -------- | ------------------------------------------ | --------------- |
| Security | SARIF                                      | Code scanning   |
| Coverage | Cobertura or LCOV                          | Coverage report |
| Tests    | JUnit XML, or the host's native equivalent | Test results    |

The artifacts come from the tooling each tier already runs — no separate step
produces them. The pipeline's job is to publish them under these categories in a
form the host ingests without conversion.

## Tool provisioning

A runner missing a tool a gate depends on **silently skips that gate and reports
green** unless the gate is written to notice. That is the failure this standard
cares most about, because it looks exactly like success.

The coverage figure is the cheapest signal that provisioning is still correct:
when a tool is absent, self-skipping tests drop the pass count without raising a
failure, so a coverage number or pass count that moves between environments is
the warning that a gate has gone quiet. Compare the counts across environments,
and treat an unexplained improvement as suspicious.

## Verification

- [ ] Every test file resolves to exactly one tier, and the tier is declared
      rather than inferred from a directory name.
- [ ] No unit test opens a socket, a database connection, or a file it did not
      create.
- [ ] Every integration test starts and stops its own collaborators, and passes
      when run alone and in any order.
- [ ] Every self-contained end-to-end test passes offline with no infrastructure
      credentials present.
- [ ] Deployment-dependent tests exist, and run at gate 6 or gate 8 — never at
      the push gate.
- [ ] The coverage command owns its threshold and self-fails below it.
- [ ] An unset coverage command reports a visible skip.
- [ ] Test and coverage artefacts are rendered by the host, not merely uploaded.
- [ ] Security, coverage and test results publish under separate categories.
- [ ] Pass counts are compared across environments, and an unexplained rise is
      investigated as a possible silent skip.

## References

- [Guardrail standards](guardrail-standards.md) — the gates that run each tier.
- [Gate 2 — Commit](guardrails/gate-2-commit.md) — the unit tier.
- [Gate 5 — Push](guardrails/gate-5-push.md) — integration and self-contained
  end-to-end, and the boundary that keeps deployments out.
- [Gate 6 — Pull request pipeline](guardrails/gate-6-pull-request.md) —
  changed-line coverage and published evidence.
- [Flaky tests](guardrails/flaky-tests.md) — retries, quarantine and expiry.
- [Components](guardrails/components.md) — where a component declares its test
  command per tier.
