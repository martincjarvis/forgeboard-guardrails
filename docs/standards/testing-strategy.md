---
type: reference
summary: The six kinds of test, what each may touch, where each runs, the environments that run them, and the coverage and artifact rules that measure them.
read_when: Deciding which kind of test to write, wiring tests into gates or environments, or configuring the coverage gate.
---

<!-- cspell:ignore lcov junit cobertura nyc vitest XPlat readyness -->

# Testing strategy

Every gate routes work by test kind, and every environment runs a different
subset. This standard defines both: what each kind may touch, and where each is
allowed to run.

## The six kinds

A kind is defined by **what it is allowed to touch**, not by how long it takes
or how much it covers. Breadth and duration follow from that; they do not decide
it.

| Kind         | Exercises                                                            | Depends on                                  | Runs at                              |
| ------------ | -------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------ |
| Unit         | One class or method                                                  | Mocks for everything else                   | Gate 2                               |
| Architecture | That the code obeys the architecture it claims                       | The source tree only                        | Gate 2                               |
| Integration  | Orchestration across code this repository owns                       | Real internals; mocked or stubbed externals | Gate 5                               |
| End-to-end   | A user journey through public interfaces only                        | A deployed environment                      | Gate 6 or 8                          |
| Smoke        | That a deployment succeeded                                          | A deployed environment, safely              | After every deployment               |
| Health check | That the process is live, and that it and its dependencies are ready | The running process                         | After every deployment, before smoke |

### Unit

Class or method level, with mocks for everything the unit does not own. Fast
enough that the commit gate can run the whole tier on every commit — that budget
is why the boundary is drawn tightly, not fastidiousness.

### Architecture

Assertions on the shape of the code rather than its behaviour: that a slice does
not reach into another slice, that a layer does not depend upward, that a
dependency direction holds.

**They run with the unit tests because they are fast**, not because they are
conceptually similar to unit tests. Reading the source and checking a dependency
direction costs about what a unit test costs, so the cheapest gate can afford
them — and the earlier a structural drift is caught, the less code has been
written on top of it.

An architecture nobody enforces mechanically is a diagram. These tests are what
makes it a constraint.

### Integration

Orchestration **between components this repository owns**, with external
dependencies stubbed or mocked. The canonical shape: an HTTP endpoint receives a
request, the service layers run for real, and the expected database write is
asserted — one path, all of it yours, nothing beyond your boundary.

Real internals are the point. Mocking your own service layer inside an
integration test leaves nothing being integrated.

**Entirely runnable locally**, which is a hard requirement rather than an
aspiration. Disposable containers or a local orchestration framework provide the
real database or broker; anything that cannot be stood up on a developer's
machine is an external dependency and gets stubbed.

### End-to-end

**Black box, against a deployed environment.** Public interfaces only: what a
real consumer can call, plus the logs and diagnostics the system emits. No
reaching into a database to assert, no calling an internal service, no test
hooks that a real user does not have — an end-to-end test that needs privileged
access is asserting on the implementation and will pass while the product is
broken.

Written **behaviour-first**, in the given–when–then shape, and named for the
journey rather than the endpoint. **At least one per user journey**: the journey
is the unit of coverage here, not the screen or the service.

Because assertions come from public surfaces and diagnostics, end-to-end tests
are the strongest argument for the logging standard. A journey that cannot be
asserted without database access usually means the system is not saying enough
about what it did.

### Smoke

A small suite proving a deployment **succeeded** — safe to run in any
environment including production, because it creates nothing it does not clean
up and touches no real customer data. It answers "is this deployment good",
never "is this feature correct".

### Health checks

Two questions, not one:

- **Liveness** — the process is up and responsive.
- **Readiness** — it and every dependency it needs are ready to serve.

They run **after every deployment and before smoke**, in every environment. A
smoke failure against a process that was never ready is a misleading failure,
and the ordering is what stops a whole team debugging the wrong thing.

## The shape of the suite

A pyramid, deliberately:

```text
        ▲   few        End-to-end — one per user journey
       ───   middling   Integration — orchestration paths
      ─────  many       Unit + architecture — classes, methods, structure
```

Inverting it is the common failure: end-to-end tests are the slowest to run, the
flakiest, and the least specific about what broke. A suite weighted toward them
takes longer to tell you less. **A journey needs one end-to-end test, not
several** — the variations belong at the level where they run in seconds and
name the failing unit.

## Where each kind can run

**Unit, architecture and integration run entirely locally.** No exceptions: a
developer who cannot run them without a deployment cannot work.

**End-to-end runs against a deployment**, and the order of preference is:

1. **A wholly local deployment** — local orchestration or local servers. Best,
   because the loop stays on the developer's machine.
2. **An ephemeral environment the developer creates and destroys** — spun up on
   demand, torn down after. Second best, and the target for anything that cannot
   run locally.
3. **A shared `dev` environment**, deployed **through the pipeline**. Allowed,
   including on manual trigger — but the deployment is a pipeline run, never a
   push from a laptop, so what is deployed is what the gates validated.

A repository whose end-to-end tests can only run in a shared environment has a
gap to close, not a policy.

## Environments

| Environment        | Health checks     | Smoke | End-to-end                       |
| ------------------ | ----------------- | ----- | -------------------------------- |
| Local or ephemeral | Yes               | Yes   | Yes — the preferred home         |
| `dev`              | Yes, after deploy | Yes   | **Full suite, every deployment** |
| `test`             | Yes, after deploy | Yes   | On demand, manually triggered    |
| Production         | Yes, after deploy | Yes   | No                               |

Three rules follow:

- **Health checks precede smoke, everywhere.** Deployment, then liveness and
  readiness, then smoke. A failure at either of the first two stops the sequence.
- **`dev` runs the full end-to-end suite on every deployment.** That is what
  makes `dev` the place a regression is caught rather than reported.
- **Every environment can run smoke**, including production. A deployment nobody
  can validate in the environment that matters is a deployment taken on trust.

## Coverage

The coverage gate is **command-delegated**: the toolkit runs the command named
in the `coverage` configuration field and treats a non-zero exit as a shortfall.
**The configured command owns the threshold** — the toolkit parses no coverage
numbers. The native tool self-fails below its floor and prints the shortfall.

An unset `coverage` field is a deliberate, **visible** skip: the gate says so
rather than silently passing.

**A command that only reports passes forever.** Many coverage tools emit a
report and exit zero however low the number is. Wired in as the coverage
command, such a tool satisfies the gate's letter and none of its purpose: the
gate reads a non-zero exit as the shortfall signal, and this one never returns
it, so the floor is never enforced and nobody finds out. The threshold goes in
the command itself — and **prove it fails**, by raising the floor above current
coverage once and confirming the gate refuses.

The same command that gates also **emits the artifacts**, so one invocation both
enforces the floor and writes what the pipeline publishes.

### The two configuration shapes

One string for a single stack. An array where stacks cannot run one unified
pass, supporting two patterns:

| Pattern                  | Shape                                                                                                          | When to use it                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Merge-then-threshold** | Each step emits a per-component report; a final step merges them and applies one threshold to the merged total | A single unified number is wanted, and a merge tool spans the stacks                                             |
| **Per-stack floors**     | Each step owns its own threshold and self-fails below it                                                       | No merge tool spans the stacks, or a single floor would mask a regression in one stack behind another's strength |

**The sequence is fail-fast**, so under per-stack floors a consumer sees only
the first failing stack. Fix it and re-run to find the next.

**Thresholds are per repository, or per stack through the array — never per
component.**

Changed-line coverage is a separate floor, enforced in the pipeline — see
[gate 6](guardrails/gate-6-pull-request.md).

**Coverage is measured on unit and integration tests.** End-to-end coverage
numbers are misleading: a single journey touches most of the code and reports a
figure that says nothing about whether any of it is tested.

**Coverage measures production code only.** Files
[classed `tooling`](guardrails/file-classes.md) — a repository's own
gate scripts and other development automation — are excluded from the metric
entirely, the same way they are never deployed. Counting them pressures the
floor downward for a number that no longer means what it claims.
[File classes](guardrails/file-classes.md) states the one exception: a
repository whose product is the tooling itself.

## Tooling code is excluded from the product's coverage floor, not from testing

Exclusion from a metric is not exemption from a suite. A `tooling`-classed
file enforces every other rule in this standard — it is what a bad commit or
a bad pull request actually meets — so leaving it untested makes it the one
piece of code in the repository nothing guards. Two audit iterations, given
the same guidance, produced opposite answers: one invented a `tooling tests`
job and made it required on every pull request unconditionally; the next
created none at all. Neither is what the standard actually asks for.

**A repository carrying ported gate or check scripts runs a `tooling tests`
suite against them**, at three tiers rather than one:

- **Change-triggered, blocking, at gate 6** — the same shape
  [change-triggered checks](guardrails/change-triggered-checks.md) already
  states for a dependency, applied to a different subject: the suite runs
  when the pull request's range touches a `tooling`-classed file, and reports
  a visible skip naming why when it does not. A change to product code alone
  does not wait on, or get blocked by, tests of machinery it never touched.
- **Unconditional, at gate 7 and on a schedule** — a gate script can break
  without anyone editing it (a dependency it calls changes behaviour, a
  platform API it reads drifts), the same reasoning the dependency-advisory
  scan's own schedule exists for. Gate 7's sweep and the scheduled run catch
  that regardless of what a pull request touched.

Making the suite **required** in branch protection needs one more thing
before it is safe: [a required check that legitimately skips can leave a
pull request permanently pending](guardrails/branch-protection.md#a-required-check-that-legitimately-skips-must-still-report) —
read that before wiring this one in.

## Artifact categories

Never merged — a hundred low-severity findings must not bury a coverage
regression, and a coverage delta must not drown a test failure.

| Kind     | Artifact                                   | Category        |
| -------- | ------------------------------------------ | --------------- |
| Security | SARIF                                      | Code scanning   |
| Coverage | Cobertura or LCOV                          | Coverage report |
| Tests    | JUnit XML, or the host's native equivalent | Test results    |

The artifacts come from the tooling each kind already runs. The pipeline's job
is to publish them in a form the host renders without conversion.

## Tool provisioning

A runner missing a tool a gate depends on **silently skips that gate and reports
green** unless the gate is written to notice. That is the failure this standard
cares most about, because it looks exactly like success.

Pass counts are the cheapest signal: a count that moves between environments
without an explanation means something is self-skipping. Treat an unexplained
improvement as suspicious.

## Verification

- [ ] Unit tests mock everything outside the class under test, and the whole
      tier runs on every commit.
- [ ] Architecture tests exist, run with the unit tests, and fail when a
      dependency direction is violated.
- [ ] Integration tests use real internals and stub only what crosses the
      repository's boundary.
- [ ] Unit, architecture and integration all run on a developer machine with no
      deployment.
- [ ] End-to-end tests assert only through public interfaces and diagnostics —
      none reaches into a database or an internal service.
- [ ] Every user journey has at least one end-to-end test, written
      behaviour-first.
- [ ] The suite is pyramid-shaped: fewest end-to-end, most unit.
- [ ] End-to-end runs locally or against an environment a developer can create
      and destroy; a shared environment is deployed through the pipeline only.
- [ ] `dev` runs the full end-to-end suite on every deployment.
- [ ] Smoke tests are safe in production and clean up after themselves.
- [ ] Health checks distinguish liveness from readiness, and readiness covers
      every dependency.
- [ ] Health checks run after deployment and before smoke, in every environment.
- [ ] Coverage is measured on unit and integration, and the command owns its
      threshold — proved by raising the floor above current coverage and seeing
      the gate refuse, not by reading the configuration.
- [ ] The coverage report contains no file classed `tooling`.
- [ ] A repository carrying ported gate or check scripts runs a `tooling
  tests` suite against them — its absence is not a silent default, one
      way or the other. `checkToolingTestSuiteExists`
      (`scripts/check-tooling-class.mjs`) is the mechanical proxy, run at
      [gate 7](guardrails/gate-7-on-demand.md): a repository with
      `tooling`-classed files and no `test`-classed file naming any of them
      is a finding — the audit-13 defect, 26 `tooling`-classed scripts with
      no test file, no job, and nothing positioned to notice.
- [ ] The `tooling tests` suite is change-triggered and blocking at gate 6
      (a visible skip, naming why, when the range touches no `tooling`-classed
      file) and unconditional at gate 7 and on a schedule.
- [ ] If the suite is a required status check, it is wired the way
      [branch protection](guardrails/branch-protection.md#a-required-check-that-legitimately-skips-must-still-report)
      states — a skip that still leaves a pull request mergeable, not one
      that leaves it stuck waiting for a status nothing will ever report.

## References

- [Guardrail standards](guardrail-standards.md) — the gates that run each kind.
- [Gate 2 — Commit](guardrails/gate-2-commit.md) — unit and architecture.
- [Gate 5 — Push](guardrails/gate-5-push.md) — integration.
- [Gate 6 — Pull request pipeline](guardrails/gate-6-pull-request.md) —
  end-to-end against an ephemeral environment, and changed-line coverage.
- [Gate 8 — Release](guardrails/gate-8-release.md) — health checks, smoke, and
  the full suite on `dev`.
- [Logging and diagnostics](logging-diagnostics.md) — what end-to-end tests
  assert on.
- [Flaky tests](guardrails/flaky-tests.md) — retries and quarantine.
- [File classes](guardrails/file-classes.md) — what `tooling` is, and the
  toolkit's own exception to it.
- [Change-triggered checks](guardrails/change-triggered-checks.md) — the
  trigger shape the `tooling tests` suite reuses.
- [Branch protection](guardrails/branch-protection.md) — the trap in making
  a conditionally-skipped suite a required status check, and how to avoid it.
