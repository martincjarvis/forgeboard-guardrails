---
type: reference
summary: The expensive tests, run once per push — coverage, integration, and only the end-to-end tests that stand up their own environment.
read_when: Deciding which tier a test belongs to, or why an end-to-end test must not run at push time.
---

<!-- cspell:ignore oneline -->

# Gate 5 — Push

The expensive tests live here. They run once per push rather than once per
commit, and they judge the whole range being pushed.

| #   | Check                           | Type        | Runs for                | Fails when                                                  |
| --- | ------------------------------- | ----------- | ----------------------- | ----------------------------------------------------------- |
| 1   | Coverage                        | Correctness | The repository          | The coverage command exits non-zero                         |
| 2   | Integration tests               | Correctness | Changed components only | An integration test for a changed component fails           |
| 3   | Self-contained end-to-end tests | Correctness | Changed components only | An end-to-end test that stands up its own environment fails |

The coverage check cannot distinguish a genuine shortfall from a command that
failed to run — both exit non-zero. Its message must name both possibilities and
carry the command's own output rather than assert the shortfall.

## Which end-to-end tests belong here

Only the ones that **stand up everything they need within the test run** and
tear it down after — a locally orchestrated composition of the components under
test, started by the test host on ephemeral ports and storage.

An end-to-end test that requires a **deployment to infrastructure outside the
test run** does not belong in this gate, whatever it exercises. The boundary is
the dependency, not the breadth of the test:

| Belongs in the push gate                                   | Does not                                                   |
| ---------------------------------------------------------- | ---------------------------------------------------------- |
| Local orchestration of the components, started by the test | Provisioning cloud resources                               |
| Ephemeral containers or in-process hosts the test controls | Deploying to a shared or long-lived environment            |
| Fixtures the test creates and destroys                     | Anything requiring credentials for external infrastructure |
| Runs offline                                               | Runs only against a live tenancy or subscription           |

Three reasons this is a hard line, not a preference. A deployment makes a
developer's push depend on infrastructure being available and on their holding
credentials for it. Its runtime is minutes to tens of minutes, which pushes
people toward bypassing the gate. And it is shared state — two pushes racing on
one environment produce failures that belong to neither change.

Deployment-dependent end-to-end tests run **after** a deployment, in the pipeline
that performed it — [gate 6](gate-6-pull-request.md) check 5 where an
environment can be provisioned per pull request, [gate 8](gate-8-release.md)
otherwise. They are never a push gate. Placing them here would also break
[the changed-component rule](components.md#the-changed-component-rule), since a
deployment is whole-system by nature.

## Running it by hand

| Check             | Node                                  | .NET                                          |
| ----------------- | ------------------------------------- | --------------------------------------------- |
| Coverage          | `npm test -- --coverage`              | `dotnet test --collect:"XPlat Code Coverage"` |
| Integration tests | `npm run test:integration`            | `dotnet test --filter Category=Integration`   |
| End-to-end tests  | `npx playwright test`                 | `dotnet test --filter Category=EndToEnd`      |
| The pushed range  | `git log --oneline origin/main..HEAD` | —                                             |

The offline test for check 3 is the one worth running deliberately: disable
network access, clear any infrastructure credentials from the environment, and
run the suite. Anything that fails was never a self-contained test.

## Verification

- [ ] Coverage below the floor blocks the push.
- [ ] A broken coverage command blocks the push without claiming a shortfall.
- [ ] A check with no command configured reports a visible skip, never a silent pass.
- [ ] Only components touched by the pushed range run their tests.
- [ ] A failing integration test blocks the push, and the failure names the
      component and the test.
- [ ] Every end-to-end test in this gate passes with no external infrastructure
      reachable and no infrastructure credentials present.
- [ ] No test in this gate provisions, deploys to, or reads a shared environment.
- [ ] Deployment-dependent end-to-end tests exist, and run at gate 6 or gate 8
      rather than here.

## References

- [Components](components.md) — what scopes checks 2 and 3.
- [Gate 6 — Pull request pipeline](gate-6-pull-request.md) — changed-line
  coverage, and where deployment-dependent tests may run.
- [Gate 8 — Release](gate-8-release.md) — where they run otherwise.
- [Coverage and test artifacts](../coverage-and-test-artifacts.md) — how the
  coverage command is configured and what it publishes.
