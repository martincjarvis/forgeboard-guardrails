---
name: deployment-review
description: Use when auditing or setting up a repository's versioning, packaging and deployment against the deployment strategy — per-component versions from Conventional Commits, prerelease channels per branch, immutable releases, the descriptor and deploy order, and what must be true before a release proceeds.
---

# Deployment review

Apply the deployment strategy to a repository. The standard states the ten
rules; this decides whether a repository honours them and what to change when it
does not.

Load `docs/standards/deployment-strategy.md` before reviewing. Load
`docs/standards/guardrails/gate-8-release.md` for the release gate's own checks,
and `docs/standards/guardrails/gate-3-commit-message.md` for how versions are
derived from messages.

## What to establish first

1. **The component map** — the paths, build, tests and dependency edges. Every
   versioning question is answered from it, so a wrong map produces wrong
   versions silently.
2. **Which components are public.** The application version derives from the
   public surface; a component wrongly marked public moves the application
   version for a change nobody outside can see.
3. **The host and its registry.** Whether it rejects duplicate versions decides
   how much the prerelease qualifier is doing.

## The audit

Work these in order. Each is a yes/no with evidence, not an impression.

### Versioning

- **Per component, from its own paths.** A component whose paths saw no
  releasable commit keeps its last version. Check by finding a commit that
  touched one component and confirming the others did not move.
- **Test paths excluded from the versioning surface.** A test-only change must
  bump nothing — and must still run every test.
- **Shared libraries by path overlap, not dependency edges.** The edge orders
  deployment; it does not derive versions. A repository using `dependsOn` to
  propagate a version bump has conflated the two.
- **No taint.** A component whose dependency became a prerelease is not itself a
  prerelease.
- **Versions derived, never hand-edited.** Grep the branch for edits to version
  fields; each one is a finding.

### Prerelease channels

- **The identifier derives from the branch**, so two concurrent branches at the
  same derived version occupy different channels.
- **A build counter qualifies it**, so two builds of one branch at one version
  do not collide on a registry that refuses overwrites.
- **A release contains no prerelease.** Check the resolved dependency versions
  of a release build, including packages from sibling repositories.

### Immutability

- A published version is never rebuilt or overwritten. Confirm the publish step
  skips or fails on an existing version rather than replacing it.
- Confirm it by attempting a republish of an existing version in a scratch
  context, if one is available.

### The deployment itself

- **The descriptor is versioned like any component.** Deploy scripts and the
  descriptor are a deployable, not loose files.
- **Deploy order comes from the dependency edges**, and only changed components
  deploy.
- **Every stage verifies**, and the application runs a final smoke.
- **Rollback is exercised**, not documented. Ask when it was last run.

## Adoption, for a repository with none of this

1. Declare the component map and mark the public components.
2. Adopt Conventional Commits and gate the message format — the derivation has
   no input without it.
3. Add version derivation and tagging, and confirm the tags are per component.
4. Add packaging, then the descriptor and the deploy engine.
5. Add the release gate's checks last: artefact identity, version agreement, no
   prerelease in a release, rollback.

Do not start at step 5. Each step is the input to the next, and a release gate
over a versioning scheme nobody trusts fails in ways that look like tooling
faults.

## Reporting

```text
Rule <n> — <name>
State:    Held | Partial | Broken | Unknown
Evidence: what you ran or read
Risk:     what ships wrongly because of it
Fix:      the specific change
```

Rank by what reaches production. A version that does not describe its change
outranks a missing smoke test, because everything downstream trusts the version.

## Rules

- **Never propose hand-editing a version** to correct a derivation. Fix the
  derivation or the commit scope that fed it.
- **Never propose republishing over an existing version.** Publish a new one.
- **A deployment-dependent test does not move to the push gate** to make a
  pipeline simpler.
- **Record a deviation** as a decision record in the consuming repository, with
  the alternative rejected — not as a comment in a pipeline file.

## References

- `docs/standards/deployment-strategy.md` — the ten rules.
- `docs/standards/guardrails/gate-8-release.md` — the release gate.
- `docs/standards/guardrails/gate-3-commit-message.md` — version derivation.
- `docs/ADR/0001-per-component-version-derivation.md` — why the detector is the
  toolkit's own.
