---
type: reference
summary: The gate downstream of the merge — the deployed artefact and its version must be the ones the pipeline validated, and no release may contain a prerelease.
read_when: Building a release pipeline, or deciding what must be true before a deployment proceeds.
---

# Gate 8 — Release

Fires when a merged change is deployed. The least frequent gate and the only one
downstream of the merge, so its findings cost the most to act on — which is the
argument for everything above it, not an argument for skipping it.

| #   | Check                            | Type        | Fails when                                                                              |
| --- | -------------------------------- | ----------- | --------------------------------------------------------------------------------------- |
| 1   | Deployable artefact identity     | Integrity   | The artefact deployed is not the one the pull request pipeline validated                |
| 2   | Derived version agreement        | Integrity   | The version being published differs from the one the commit messages in range derive to |
| 3   | No prerelease in a release       | Policy      | A release build resolves any internal dependency to a prerelease version                |
| 4   | Deployment succeeds              | Correctness | Any component fails to deploy                                                           |
| 5   | Post-deployment end-to-end tests | Correctness | An end-to-end test fails against the deployed environment                               |
| 6   | Rollback proven                  | Correctness | The previous version cannot be restored                                                 |

Checks 1 and 2 are the same question asked of the two things that can drift.
Every gate above validated a specific commit; deploying a rebuilt or re-tagged
artefact deploys something no gate ever saw, and publishing a version nobody
derived breaks the only link between what shipped and what changed. Deploy the
validated artefact at the derived version, or record what was actually deployed
and accept that the chain restarts there.

Check 3 is the version-class rule of [gate 3](gate-3-commit-message.md),
enforced where it can actually be enforced — at the point the resolved
dependency versions are known. Internal covers siblings, not just this
repository: a prerelease from another team is exactly as unfit to release as one
of your own, and reading it narrowly leaves a hole no single-repository test
would ever reveal.

Check 5 is the home of the deployment-dependent end-to-end tests excluded from
[gate 5](gate-5-push.md) — unless [gate 6](gate-6-pull-request.md) can provision
an environment per pull request, in which case they run there instead and this
gate re-runs only what needs the real environment.

This gate is deliberately thin. Deployment strategy, versioning and environment
promotion are a subject of their own; what belongs in a guardrails standard is
only the boundary — what must be true for a deployment to be allowed to proceed,
and what must not be discovered for the first time afterwards.

## Running it by hand

| Purpose                         | Command                                                           |
| ------------------------------- | ----------------------------------------------------------------- |
| Artefact identity, Node         | `npm pack --dry-run` and compare the integrity hash               |
| Artefact identity, any stack    | `sha256sum <artefact>` against the value the pipeline recorded    |
| Derived version for a component | `npx semantic-release --dry-run`                                  |
| Prerelease dependencies, Node   | `npm ls --all --json \| grep -- '-'` on resolved versions         |
| Prerelease dependencies, .NET   | `dotnet list package --include-transitive`                        |
| Rollback rehearsal              | Deploy the previous version to the same target and re-run check 5 |

Check 6 is the one people document rather than exercise. Rehearse it on the same
path a real rollback would take, not a variant that happens to work.

## Verification

- [ ] The deployed artefact is byte-identical to the one that passed gate 6, or
      its identity is recorded as different.
- [ ] The published version matches the one derived from the commit messages in
      range, per component.
- [ ] A release resolving an internal dependency to a prerelease is refused, and
      a sibling repository's prerelease is refused on the same terms.
- [ ] A component that fails to deploy stops the release rather than leaving the
      system half-updated.
- [ ] Deployment-dependent end-to-end tests run here or at gate 6, and it is
      stated which.
- [ ] Rollback is exercised, not merely documented.

## References

- [Gate 3 — Commit message](gate-3-commit-message.md) — where the version is derived.
- [Gate 6 — Pull request pipeline](gate-6-pull-request.md) — what validated the artefact.
- [Deployment strategy](../deployment-strategy.md) — the subject this gate only
  draws a boundary around.
