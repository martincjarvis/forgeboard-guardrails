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
command, its test commands by tier, and the components it depends on. Everything
the changed-component rule does is derived from those four.

**How it is declared is open.** This standard specifies the four facts, not the
file that holds them. A repository may state them in its own configuration, or
they may already exist in the stack's own project graph — a workspace
definition, a monorepo tool's dependency graph, a solution file — in which case
deriving them from there is better than restating them, because a second copy
drifts. Either satisfies this standard, on one condition: the four facts must be
resolvable without a person supplying them, and checked in. A component boundary
that lives only in someone's head is not a map.

## The changed-component rule

**Build and test only what changed.** Derive the set of changed components from
the paths in the change under judgement — staged paths at the commit gate, the
pushed range at the push gate — and run each component's build and tests only
for components in that set. A gate that builds the whole repository on every
commit charges every author for everyone else's code, and its cost grows with
the repository until people route around it.

Every gate that scopes work uses this rule: the commit gate for build and unit
tests, the push gate for the slower tiers, the pull request pipeline for what it
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
- [Gate 5 — Push](gate-5-push.md) — the slower tiers, scoped the same way.
- [Gate 6 — Pull request pipeline](gate-6-pull-request.md) — where the whole set
  is verified regardless.
- [Gate 3 — Commit message](gate-3-commit-message.md) — the commit scope is the
  component name, which is what makes per-component versioning work.
- [Deployment strategy](../deployment-strategy.md) — the release side of the same
  boundary.
