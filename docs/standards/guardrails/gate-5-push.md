---
type: reference
summary: The expensive local tests, run once per push — coverage and integration; end-to-end needs a deployment and runs later.
read_when: Deciding which kind of test something is, or why an end-to-end test must not run at push time.
---

<!-- cspell:ignore oneline -->

# Gate 5 — Push

The expensive tests live here. They run once per push rather than once per
commit, and they judge the whole range being pushed.

| #   | Check             | Type        | Runs for                | Fails when                                        |
| --- | ----------------- | ----------- | ----------------------- | ------------------------------------------------- |
| 1   | Coverage          | Correctness | The repository          | The coverage command exits non-zero               |
| 2   | Integration tests | Correctness | Changed components only | An integration test for a changed component fails |

The coverage check cannot distinguish a genuine shortfall from a command that
failed to run — both exit non-zero. Its message must name both possibilities and
carry the command's own output rather than assert the shortfall.

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

| Check             | Node                                  | .NET                                          |
| ----------------- | ------------------------------------- | --------------------------------------------- |
| Coverage          | `npm test -- --coverage`              | `dotnet test --collect:"XPlat Code Coverage"` |
| Integration tests | `npm run test:integration`            | `dotnet test --filter Category=Integration`   |
| End-to-end tests  | `npx playwright test`                 | `dotnet test --filter Category=EndToEnd`      |
| The pushed range  | `git log --oneline origin/main..HEAD` | —                                             |

The offline test is the one worth running deliberately: disable network access,
clear any infrastructure credentials, and run the suite. Anything that fails was
reaching outside the repository's own boundary and is not an integration test.

## Verification

- [ ] Coverage below the floor blocks the push.
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

## References

- [Components](components.md) — what scopes checks 2 and 3.
- [Gate 6 — Pull request pipeline](gate-6-pull-request.md) — changed-line
  coverage, and where deployment-dependent tests may run.
- [Gate 8 — Release](gate-8-release.md) — where they run otherwise.
- [Testing strategy](../testing-strategy.md) — what belongs in each kind this
  gate runs, and how the coverage command is configured.
