---
type: reference
summary: Commit messages follow Conventional Commits, the scope is the component name, and per-component versions are derived from the messages rather than declared.
read_when: Configuring the commit-message gate, or working out how a component's version was arrived at.
---

<!-- cspell:ignore EDITMSG -->

# Gate 3 — Commit message

Commit messages follow **Conventional Commits**. This is not a house style
preference: the message is the input to per-component version derivation, so a
malformed message does not merely read badly, it produces the wrong version or
no version at all.

| #   | Check           | Type   | Fails when                                                                                                      |
| --- | --------------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| 1   | Structure       | Policy | The message does not match `type(scope): summary`                                                               |
| 2   | Type            | Policy | The type is outside the declared set                                                                            |
| 3   | Scope           | Policy | The scope is not a declared component, and is not empty                                                         |
| 4   | Breaking change | Policy | A breaking change is marked without a footer describing the migration                                           |
| 5   | Scope agreement | Policy | The scope names a component the change does not touch, or the change touches components the scope does not name |

## Structure

```text
type(scope): summary

optional body

optional footers, including BREAKING CHANGE: <description>
```

A breaking change is marked either by `!` after the scope — `feat(api)!:` — or
by a `BREAKING CHANGE:` footer. The footer is required either way, because the
marker says a consumer must act and says nothing about what to do.

Default type set, configurable per repository:

| Type                                                       | Means                                | Version effect |
| ---------------------------------------------------------- | ------------------------------------ | -------------- |
| `feat`                                                     | New capability in the public surface | Minor          |
| `fix`                                                      | Defect corrected                     | Patch          |
| Any type marked breaking                                   | Consumers must act                   | Major          |
| `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore` | Everything else                      | None           |

## Driving version derivation

**The scope is the component name.** That is the whole mechanism: it is what
lets one repository holding five deployable units release them on five
independent version lines instead of one shared number that moves whenever
anything moves.

For each component, the version is derived from the commit messages since its
last release that carry its scope: a breaking marker takes the major, otherwise
a `feat` takes the minor, otherwise a `fix` takes the patch, otherwise nothing
is released. A component nothing touched does not get a version, and does not
get deployed.

Rules:

- **Versions are derived, never hand-edited.** A commit that edits a version
  number is a defect: it competes with the derivation, and whichever wins, the
  version no longer describes the change that produced it.
- **The scope must agree with the paths.** A message scoped to one component
  while the diff touches another silently versions the wrong thing. Check 5 is
  what catches it, and the remedy is usually that the commit spans components
  and should be two commits.
- **An empty scope means repository-wide** — tooling, configuration, or
  documentation belonging to no component. It releases nothing on its own.
- **A type outside the set is refused, not ignored.** A typo in the type is
  indistinguishable from a deliberate `chore` to a derivation that skips what it
  does not recognise, and it silently withholds a release.
- **The same messages produce the release notes.** A summary written for the
  gate rather than for a reader ends up in front of one.

## Version classes

The branch decides the class, and the two classes may not mix in a release.

| Branch         | Produces   | Shape                                                               |
| -------------- | ---------- | ------------------------------------------------------------------- |
| Feature branch | Prerelease | The derived version plus a prerelease identifier and a build number |
| Default branch | Release    | The derived version alone                                           |

**A release may not contain a prerelease component.** This is the rule the two
classes exist to enforce: a released application composed of components, one of
which is a prerelease, is a release in name only — it ships something that was
never on the default branch and never passed the gates a release passed. A
release build that resolves any **internal dependency** — one the organisation
publishes, from this repository or a sibling — to a prerelease version fails. On
a prerelease build the same resolution is allowed, and reported.

**The prerelease identifier is derived from the branch.** Concurrent branches
are the normal case, and two of them will reach the same derived version at the
same time. If the identifier does not distinguish them, the second build either
collides with the first or overwrites it, and whoever pulled the version in
between got something nobody can now identify. Deriving the identifier from the
sanitised branch name makes each branch its own channel, so a consumer can take
one branch's prerelease with no chance of receiving another's.

**The build number distinguishes builds within one branch.** The branch name
separates channels; it does not separate two builds of the same branch at the
same derived version, which are still different artefacts. A registry that
refuses overwrites rejects the second unless the identifier moves, so qualify
the prerelease with a monotonic build counter as well. The two answer different
collision questions and both are needed.

**Versions do not propagate along dependency edges — the no-taint rule.** A
component whose dependency became a prerelease is not itself dragged to one. A
shared library is modelled by path overlap — its paths listed in each consumer —
so a change to it bumps every consumer directly, and each consumer bumps because
its own paths changed, not because a version was inherited. Dependency edges
order deployments; they do not derive versions. A change to an interface
contract surfaces in its consumers as work they have to do, which is the honest
signal and the one an inherited version cannot substitute for.

**Versions start at 0.0.0 and stay below 1.0.0 until there is a first external
consumer.** Before that point there is nobody to break, so the major has nothing
to signal and spending it costs the one signal that matters later. The move to
1.0.0 is a decision about consumers, not about completeness.

## The application version

An application composed of components has its own version, derived rather than
declared: from the component versions that moved, and from what changed in the
public surface those components present. A change confined to component
internals moves that component and not the application; a change to what
consumers can see moves both.

The application is a prerelease if any component it deploys is one — which is
the same rule as above, read from the other end.

## Running it by hand

| Purpose                                     | Command                                                      |
| ------------------------------------------- | ------------------------------------------------------------ |
| Check one message                           | `npx commitlint --edit .git/COMMIT_EDITMSG`                  |
| Check every message on the branch           | `npx commitlint --from origin/main --to HEAD`                |
| Messages a component's version derives from | `git log origin/main..HEAD --format=%s -- <component paths>` |
| Paths the branch actually touched           | `git diff --name-only origin/main...HEAD`                    |
| Dry-run the derivation                      | `npx semantic-release --dry-run`                             |

Check 5 is the two middle commands compared: the scopes in the messages against
the components the paths belong to. A scope with no matching path, or a path
with no matching scope, is the finding.

## Verification

- [ ] A message missing its type prefix is refused, and the refusal states the
      expected form.
- [ ] A type outside the declared set is refused rather than treated as no-op.
- [ ] A scope that is not a declared component is refused.
- [ ] A breaking marker without a migration footer is refused.
- [ ] A commit scoped to one component while touching another is refused.
- [ ] `feat` produces a minor, `fix` a patch, a breaking marker a major, and
      every other type no release.
- [ ] Two components changed on one branch receive independent versions.
- [ ] A component untouched by the change receives no version and no deployment.
- [ ] No commit in the branch edits a version number by hand.
- [ ] A feature branch build produces a prerelease; a default branch build does not.
- [ ] Two builds of the same branch at the same derived version produce two
      distinct, non-colliding versions.
- [ ] A release containing a prerelease component is refused; the same
      resolution on a prerelease build is allowed and reported.
- [ ] Two concurrent branches at the same derived version publish to distinct
      channels and neither overwrites the other.
- [ ] A component is not moved to a prerelease by a dependency that became one.
- [ ] A repository with no external consumer is still below 1.0.0.
- [ ] The application version moves when the public surface changes, and does not
      move for a change confined to component internals.

## References

- [Components](components.md) — what a scope names.
- [Gate 8 — Release](gate-8-release.md) — where the derivation is consumed and checked.
- Conventional Commits (<https://www.conventionalcommits.org>) — the message
  structure this gate enforces, and the source of the type-to-version mapping.
- Semantic Versioning (<https://semver.org>) — what the derived major, minor and
  patch mean to a consumer.
- [Deployment strategy](../deployment-strategy.md) — the source of the no-taint rule.
