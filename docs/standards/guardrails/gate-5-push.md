---
type: reference
summary: The expensive local tests, run once per push — coverage and integration; end-to-end needs a deployment and runs later.
read_when: Deciding which kind of test something is, or why an end-to-end test must not run at push time.
---

<!-- cspell:ignore oneline govulncheck -->

# Gate 5 — Push

The expensive tests live here. They run once per push rather than once per
commit, and they judge the whole range being pushed.

| #   | Check                                     | Type        | Runs for                    | Fails when                                              |
| --- | ----------------------------------------- | ----------- | --------------------------- | ------------------------------------------------------- |
| 1   | Coverage                                  | Correctness | The repository              | The coverage command exits non-zero                     |
| 2   | Integration tests                         | Correctness | Changed components only     | An integration test for a changed component fails       |
| 3   | Cross-stack dependency scan (osv-scanner) | Security    | The resolved dependency set | osv-scanner reports an advisory with no accepted record |

Check 3 is not component-scoped like check 2 — it reads the resolved
dependency set, the same repository-wide shape check 1 already has, not the
files the push touched. Placed here rather than gate 2 because it is
network-bound (it queries the OSV database), and gates 1 and 2 fire on every
edit or commit ([placing-a-new-check](placing-a-new-check.md)). It does not
replace a stack's own scanner (`govulncheck`, `cargo audit`, and so on) —
those stay where they are faster or more precise; this is the
general-purpose backstop that runs regardless
([cross-gate rules](cross-gate-rules.md#checks-are-tiered-by-cost-and-the-tier-decides-the-gate)).
External, resolved from `PATH`, never bundled — the same treatment as
semgrep and lizard ([ADR-0002](../../ADR/0002-analysis-tool-distribution.md)).

The command that owns the coverage floor also runs the unit suite, so a
non-zero exit has three possible causes, not one: a failing unit test, a
genuine coverage shortfall, or the command itself failing to run. The gate
distinguishes them from the command's own output rather than reporting one
compound finding that cannot name its own cause — the test runner's own
summary line names a failure count regardless of what coverage did, and the
coverage tool's own threshold message only prints once the suite passed and
coverage alone fell short. Where none of that is present but the command
still exited non-zero, it is reported as exactly that: the command did not
run to completion, never guessed as a shortfall.

## Why end-to-end tests are not here

An end-to-end test is black box against a **deployed** environment, so it cannot
run at push time by definition — there is nothing deployed. It runs where a
deployment exists: against an ephemeral environment in the
[pipeline](gate-6-pull-request.md), or after a real deployment at
[gate 8](gate-8-release.md).

What runs here is **integration**: orchestration across code this repository
owns, with externals stubbed. It may stand up a real database or broker in a
disposable container — that is still integration, because everything being
exercised is yours and nothing is deployed.

Three reasons the boundary is a hard line rather than a preference. A deployment
makes a developer's push depend on infrastructure being available and on their
holding credentials for it. Its runtime is minutes to tens of minutes, which
pushes people toward bypassing the gate. And it is shared state — two pushes
racing on one environment produce failures that belong to neither change.

## Running it by hand

| Check                       | Node                                  | .NET                                          |
| --------------------------- | ------------------------------------- | --------------------------------------------- |
| Coverage                    | `npm test -- --coverage`              | `dotnet test --collect:"XPlat Code Coverage"` |
| Integration tests           | `npm run test:integration`            | `dotnet test --filter Category=Integration`   |
| End-to-end tests            | `npx playwright test`                 | `dotnet test --filter Category=EndToEnd`      |
| Cross-stack dependency scan | `osv-scanner --format json -r .`      | `osv-scanner --format json -r .`              |
| The pushed range            | `git log --oneline origin/main..HEAD` | —                                             |

The offline test is the one worth running deliberately: disable network access,
clear any infrastructure credentials, and run the suite. Anything that fails was
reaching outside the repository's own boundary and is not an integration test.

## Verification

- [ ] Coverage below the floor blocks the push, reported as a coverage
      finding, not folded into a compound "test or coverage" verdict.
- [ ] A failing unit test surfacing here is reported as a test failure, not
      misattributed to coverage merely because they share one command.
- [ ] A broken coverage command blocks the push without claiming a shortfall.
- [ ] A check with no command configured reports a visible skip, never a silent pass.
- [ ] Only components touched by the pushed range run their tests.
- [ ] A failing integration test blocks the push, and the failure names the
      component and the test.
- [ ] Every test in this gate passes with no deployed environment reachable and
      no infrastructure credentials present.
- [ ] No test in this gate provisions, deploys to, or reads a shared environment.
- [ ] Integration tests that need a database or broker get it from a disposable
      container the run creates and destroys.
- [ ] End-to-end tests exist, and run at gate 6 or gate 8 rather than here.
- [ ] The cross-stack dependency scan reports a visible, named skip when
      osv-scanner is not on `PATH` — never a silent pass.
- [ ] The cross-stack dependency scan still runs for a stack that already has
      its own specialised advisory scanner, rather than being excluded from it.
- [ ] osv-scanner's own exit code is never the finding by itself: the check
      parses its structured `--format json` output for a named advisory id.
      A non-zero exit with none reports unavailable — the same visible,
      named skip as the tool being absent — never a finding with no
      identifier in it ([cross-gate-rules.md](cross-gate-rules.md#a-refusal-is-a-diagnosis)).

## References

- [Components](components.md) — what scopes check 2; check 3 is
  repository-wide instead, like check 1.
- [Gate 6 — Pull request pipeline](gate-6-pull-request.md) — changed-line
  coverage, and where deployment-dependent tests may run.
- [Gate 8 — Release](gate-8-release.md) — where they run otherwise.
- [Testing strategy](../testing-strategy.md) — what belongs in each kind this
  gate runs, and how the coverage command is configured.
