---
name: testing-review
description: Use when reviewing tests against the testing strategy, deciding which tier a test belongs to, or auditing a repository's coverage configuration and test artifacts. Checks that each test sits in the right tier, asserts something that would fail, and that the coverage gate and artifact categories are configured as the standard requires.
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

| If the test…                                              | It is                           |
| --------------------------------------------------------- | ------------------------------- |
| Constructs everything it touches                          | Unit                            |
| Starts a real collaborator and stops it                   | Integration                     |
| Composes the system on ephemeral resources within the run | Self-contained end-to-end       |
| Needs something already deployed, or credentials for it   | Deployment-dependent end-to-end |

Read the test's setup, not its assertions, to place it. The tells:

- **Unit that is not** — a socket, a file path it did not create, a database
  client, a clock it does not control, a network call, an environment variable
  naming a host.
- **Integration that is not** — setup that assumes rows already exist, or that
  passes only when another test ran first. That is deployment-dependent and has
  not admitted it.
- **Self-contained that is not** — a credential read from the environment, a
  hostname that is not localhost, a resource the test does not tear down.

The falsifiable check, in order of value:

1. **Run the unit tier with the network disabled.** Anything that fails is
   mis-tiered.
2. **Run one test alone, then the suite in a shuffled order.** Anything that
   changes result depends on something it does not own.
3. **Run the self-contained end-to-end tier offline, with infrastructure
   credentials cleared.** Anything that fails belongs to the tier above.

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

- **Do not relabel a test to make it fit.** Moving a test between tiers without
  changing what it needs relabels the problem.
- **Do not propose retries.** Intermittency is a defect report about the system
  until someone shows otherwise; quarantine is the honest route, and it has an
  expiry.
- **Do not lower a threshold to make a run pass.** That is the failure mode the
  standards exist to catch.

## References

- `docs/standards/testing-strategy.md` — the tiers, coverage and artifacts.
- `docs/standards/guardrails/gate-5-push.md` — the push gate's boundary.
- `docs/standards/guardrails/flaky-tests.md` — retries and quarantine.
