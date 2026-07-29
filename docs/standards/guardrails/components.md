---
type: reference
summary: A component is a deployable unit; the map declares its paths, build, tests and dependencies, and the changed-component rule derives every gate's scope from it.
read_when: Declaring a component map, or working out why a gate did or did not run a component's build and tests.
---

<!-- cspell:ignore BFF -->

# Components

**A component is a deployable unit** — something that is versioned, released and
deployed on its own, and could in principle be deployed without the others
moving. It is not a folder, a language, or a layer.

Worked example. A single application made of a browser front end, its
backend-for-frontend, an internal API, a database, and the infrastructure that
hosts them has **five** components:

| Component            | Deployed as                                      |
| -------------------- | ------------------------------------------------ |
| Front end            | Static bundle served to browsers                 |
| Backend-for-frontend | Service, released independently of the front end |
| Internal API         | Service, with its own consumers                  |
| Database schema      | Migration applied to a database                  |
| Infrastructure       | Declarative definition applied to a provider     |

**What this buys.** A styling change in the front end rebuilds and tests the
front end. It does not re-run the internal API's unit tests, re-apply the
schema, or plan the infrastructure. On a repository with five components, that
is the difference between a gate developers keep and a gate they route around.

## The map

**What it must declare**, per component: the paths that belong to it, its build
command, its test command per kind, and the components it depends on. Everything
the changed-component rule does is derived from those four.

**The four facts are derived, not declared**
([ADR-0003](../../ADR/0003-derive-configuration.md)). Every stack already states
them somewhere, and restating them in a configuration file of this toolkit's
own invention creates a second copy that drifts the week somebody adds a project
to one of them.

| Fact         | Read from                                                                      |
| ------------ | ------------------------------------------------------------------------------ |
| Paths        | The workspace, solution or project manifest that already groups the source     |
| Dependencies | The project references or workspace dependencies already declared between them |
| Build        | The stack's task runner, under a conventional name                             |
| Tests        | The same, one name per kind — unit, integration, end-to-end                    |

**Conventional names are what make the last two derivable.** A repository whose
test commands are called anything at all cannot be read; one that names them
consistently needs no configuration to be understood. Where a stack has an
established convention, that is the convention.

**An optional override exists for what cannot be derived**, and is the exception
rather than the starting point. A repository whose layout the graph expresses
writes none.

**What is derived must be reported.** A file somebody wrote can be read; a
derivation cannot. Every gate that scopes work states the component set it
resolved and why, so a wrong answer is visible rather than silent — that
obligation is the price of not having a file to open.

## The changed-component rule

**Build and test only what changed.** Derive the set of changed components from
the paths in the change under judgement — staged paths at the commit gate, the
pushed range at the push gate — and run each component's build and tests only
for components in that set. A gate that builds the whole repository on every
commit charges every author for everyone else's code, and its cost grows with
the repository until people route around it.

Every gate that scopes work uses this rule: the commit gate for build and unit
tests, the push gate for the slower kinds, the pull request pipeline for what it
deliberately does **not** scope.

Three constraints make it safe rather than merely fast:

- **Declared dependencies widen the set.** A component whose dependency changed
  is itself changed. Dependency edges are part of the map, not documentation: if
  the front end consumes the backend-for-frontend's contract, a change to that
  contract must select the front end too.
- **A path in no component selects everything.** That is the default, and it is
  the safe direction: falling through to "nothing changed" is the failure mode
  that lets a build file change pass ungated. This is the mirror of the
  [file-class default](file-classes.md), which narrows an unclassified file to
  the strictest class rather than widening it — different questions, each failing
  safe its own way. Naming which components a shared
  path belongs to is the optimisation, available to any repository willing to
  maintain it, and wrong only when it is stale.
- **The whole set is still verified somewhere.** Scoping is a gate optimisation,
  not a claim about the repository. The full build and full test run belongs in
  the [pull request pipeline](gate-6-pull-request.md), where its cost is paid
  once per change rather than once per commit.

**The map is itself checked**, because a wrong map fails silently in the one
direction nothing else catches. A component declared to have no dependents
under-scopes every gate that trusts it, and the whole-repository run in the
pipeline still passes — the code does build; it was simply never proved to build
in response to the change that broke it. Verify that every tracked path belongs
to exactly one component or is explicitly repository-wide, and that each
declared dependency edge matches a real reference.

## The single-component repository

A repository can have exactly one component. That is the ordinary case for a
single-package application or library — not a special case the rules above
need an exception for. Each one already resolves it:

- **The map still has one entry.** Paths, build command, test commands and
  dependencies are declared or derived the same way; there is one row instead
  of several, and no dependency edges, because there is nothing else to
  depend on.
- **The component graph is still derived** — it has one node and no edges.
  Nothing about the derivation step is skipped; there is simply nothing to
  compute a topology over.
- **"Only what changed" still applies, and it resolves to "always."** Any
  tracked path either belongs to the one component or belongs to none, and a
  path in no component selects everything, per the fail-safe default above.
  Either way the one component is selected: there is no narrower set to fall
  back to, so the component's build and tests run whenever anything tracked
  changes.
- **Per-component versioning still applies**, and collapses to
  whole-repository versioning: the one component's version is computed from
  the commits touching its paths — in effect, the whole repository — and if
  it is marked `public`, `appVersion` tracks it directly. See
  [Deployment strategy](../deployment-strategy.md#appversion-derivation).

## Running it by hand

Resolving the changed set is the first thing to check when a gate scoped
something unexpectedly.

| Purpose                             | Command                                            |
| ----------------------------------- | -------------------------------------------------- |
| Paths changed against the base      | `git diff --name-only origin/main...HEAD`          |
| Paths staged for this commit        | `git diff --cached --name-only --diff-filter=ACMR` |
| Changed projects, workspace tooling | `npx nx show projects --affected`                  |
| Changed projects, plain workspaces  | `npm query .workspace` then match against the diff |
| Projects in a solution              | `dotnet sln list`                                  |

Compare the tool's answer with the map's: a component the diff touches that the
tool does not list is a missing path pattern, and a component listed that the
diff does not touch is an over-broad one.

## Verification

- [ ] Every component in the map is separately deployable.
- [ ] Every tracked path maps to exactly one component, or is declared
      repository-wide.
- [ ] A change confined to one component runs that component's build and tests,
      and no others.
- [ ] A change to a component's contract selects its consumers.
- [ ] A path belonging to no component does not silently select nothing.

## References

- [Gate 2 — Commit](gate-2-commit.md) — build and unit tests, scoped by this rule.
- [Gate 5 — Push](gate-5-push.md) — the slower kinds, scoped the same way.
- [Gate 6 — Pull request pipeline](gate-6-pull-request.md) — where the whole set
  is verified regardless.
- [Gate 3 — Commit message](gate-3-commit-message.md) — the commit scope is the
  component name, which is what makes per-component versioning work.
- [Deployment strategy](../deployment-strategy.md) — the release side of the same
  boundary.
