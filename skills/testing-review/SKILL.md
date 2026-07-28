---
name: testing-review
description: Use when reviewing tests against the testing strategy, deciding which kind of test something is, or auditing coverage, environments and health-check ordering. Places each test by what it is allowed to touch, checks it would fail if the requirement were unmet, and checks the suite shape, whether each kind runs locally, and per-environment policy.
---

# Testing review

Apply the testing strategy to a repository or a change. The standard defines the
tiers; this decides whether the tests in front of you honour them.

Load `docs/standards/testing-strategy.md` before reviewing. Load
`docs/standards/guardrails/flaky-tests.md` when a test is intermittent, and
`docs/standards/guardrails/gate-5-push.md` when the question is whether an
end-to-end test may run at push time.

## Tier placement

Classify by **what the test needs to run**, never by its directory or its name.
The directory is a claim; the dependencies are the evidence.

| If the test…                                                    | It is        |
| --------------------------------------------------------------- | ------------ |
| Exercises one class or method with everything else mocked       | Unit         |
| Asserts on the shape of the code, needing only the source       | Architecture |
| Runs real internals of this repository, stubbing only externals | Integration  |
| Drives a journey through public interfaces against a deployment | End-to-end   |
| Proves a deployment succeeded, safely, anywhere                 | Smoke        |

Read the test's setup, not its assertions, to place it. The tells:

- **Unit that is not** — a socket, a file path it did not create, a database
  client, a clock it does not control, a network call.
- **Integration that is not** — an unmocked call across the repository's own
  boundary, or setup that assumes rows already exist. The second is an
  end-to-end test that has not admitted it.
- **Integration that is really a unit test** — every collaborator mocked,
  including this repository's own service layer. Nothing is being integrated.
- **End-to-end that is not black box** — a database assertion, a call to an
  internal service, a test-only hook a real user does not have. It will pass
  while the product is broken.
- **A journey with no end-to-end test at all**, or several covering the same
  journey while another has none.

The falsifiable checks, in order of value:

1. **Run unit, architecture and integration with the network disabled and no
   deployment reachable.** Anything that fails is mis-tiered — these three are
   required to run entirely locally.
2. **Run one test alone, then the suite shuffled.** Anything that changes result
   depends on something it does not own.
3. **Run the end-to-end suite against a freshly created ephemeral environment.**
   Anything needing a long-lived environment is relying on accumulated state.
4. **Count the shape.** Unit far outnumbers integration, which outnumbers
   end-to-end. An inverted pyramid takes longer to tell you less.

## Where each kind can run

- Unit, architecture and integration run locally: **no deployment, no exceptions.** A
  developer who cannot run them without one cannot work.
- Integration may use disposable containers or a local orchestration framework
  for a real database or broker — that is still integration.
- End-to-end, in order of preference: a wholly local deployment; an ephemeral
  environment the developer creates and destroys; a shared `dev` environment
  deployed **through the pipeline**, including on a manual trigger.

A repository whose end-to-end tests only run in a shared environment has a gap
to close. Report it as one.

## Environments and ordering

| Environment        | Health checks | Smoke | End-to-end                       |
| ------------------ | ------------- | ----- | -------------------------------- |
| Local or ephemeral | Yes           | Yes   | Yes — the preferred home         |
| `dev`              | Yes           | Yes   | **Full suite, every deployment** |
| `test`             | Yes           | Yes   | On demand, manually triggered    |
| Production         | Yes           | Yes   | No                               |

**Health checks run after deployment and before smoke, everywhere.** Check the
ordering explicitly: a pipeline that smokes before readiness produces failures
that send people to the wrong place. Check readiness covers every dependency,
not just that the process answers.

## Test quality

For each test in the change:

- **Would it fail if the requirement were unmet?** Delete the implementation
  line it targets and confirm it goes red. A test that passes against broken
  code is worse than no test — it is a false claim with a name.
- **Does it encode the requirement or the implementation?** A test that must be
  edited whenever the code is refactored is testing the code's shape.
- **Can it fail for more than one reason?** Then it reports none of them.
- **Was it changed in this diff?** A test edited in the same change as the code
  it covers needs its own justification: the requirement changed, or the test
  was wrong. "It was failing" is not one.

## Coverage configuration

- The `coverage` command **owns its threshold** and self-fails below it. A
  toolkit that parses coverage numbers is doing the tool's job.
- An unset command reports a **visible skip**, never a silent pass.
- The array form is either merge-then-threshold or per-stack floors — state
  which, since the sequence is fail-fast and per-stack floors surface only the
  first failing stack.
- Thresholds are per repository or per stack, never per component.
- Changed-line coverage is a separate floor in the pipeline. Check it exists: an
  overall floor alone lets an entirely uncovered change through.

## Artifacts

Three categories, never merged: security findings, coverage, test results. Check
each publishes in a form the host renders rather than stores — if a reviewer has
to download a file to see which test failed, the format is wrong for that host.

## The silent-skip check

**A missing tool makes a gate report green.** This is the failure mode that
looks most like success, so check it explicitly:

- Compare pass counts and coverage between a developer machine and the pipeline.
  An unexplained rise means tests are self-skipping somewhere.
- Confirm every tool the configuration names is installed on the runner, by
  name.

## Reporting

One finding per problem:

```text
<path>:<line> — <tier claimed> but <tier it is>
Evidence: the dependency that decides it
Fix:      move it, or remove the dependency
```

For coverage and artifact findings, name the configuration field and what it
should say.

## Rules

- **Do not relabel a test to make it fit.** Moving a test between kinds without
  changing what it needs relabels the problem.
- **Do not propose adding end-to-end tests to raise confidence.** More of the
  slowest, least specific kind buys the least; the missing coverage almost
  always belongs lower down.
- **Do not accept a test hook that only tests use.** An end-to-end test needing
  privileged access is not black box.
- **Do not propose retries.** Intermittency is a defect report about the system
  until someone shows otherwise; quarantine is the honest route, and it has an
  expiry.
- **Do not lower a threshold to make a run pass.** That is the failure mode the
  standards exist to catch.

## References

- `docs/standards/testing-strategy.md` — the tiers, coverage and artifacts.
- `docs/standards/guardrails/gate-5-push.md` — the push gate's boundary.
- `docs/standards/guardrails/flaky-tests.md` — retries and quarantine.
