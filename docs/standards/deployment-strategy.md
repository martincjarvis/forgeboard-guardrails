---
type: reference
summary: How a multi-component app is versioned per-component, packaged, and deployed from CI-produced artefacts, with the app version derived from its public components.
read_when: Setting up or reviewing a multi-component app's versioning, packaging, or deployment.
---

<!-- cspell:ignore fbds dbschema releaserc appVersion deployToolVersion semver dependsOn prerelease prereleaseId prid nologo topo semanticrelease NuGet npm ADO BuildId buildId pathspec greppable APPVERSION -->

# Deployment-strategy standard

How a multi-component app is versioned per-component, packaged, and installed from CI-produced artefacts, and how its version derives from the public-component combination.

## Deployment rules

The strategy is ten rules. Each states the _what/why_; a repository realizes the
_how_ with whatever its platform already provides.

### 1. SemVer-from-git, per-component, independent

Each component's version is computed from the conventional commits that touch
**its own** declared `paths` — and only those. A component whose paths saw no
releasable commit is **unchanged**: it keeps its last released version while
other components move. `paths` is the component's **production surface** — its
versioning boundary — and excludes test files (`!**/*.test.*` etc.), so a
test-only change never bumps a version. (This gates versioning only, never test
execution — see rule 8.) A **shared library** consumed by several components is
expressed as **path overlap** — its pathspec listed in each consumer's `paths` —
so a change to it bumps every consumer directly. It is **not** a `dependsOn`
edge: `dependsOn` is deploy order only (see _Component model_), never a
versioning edge. The default branch produces a stable release; a `feature/*`
branch produces a prerelease whose identifier is the **sanitised branch name**
(`feature/checkout-v2` → `…-checkout-v2.<n>`), so concurrent branches deploy
without colliding (see _Branch deployments_). The bump is read straight from the
Conventional Commits in those paths; the tag format is
`<appName>-<component>@<version>`
([ADR-0001](../ADR/0001-per-component-version-derivation.md) fixes the tag
format and the per-component config-format contract, and makes the runtime
detector this toolkit's own; see _Mechanism_).

### 2. Immutable releases

A published version is never rebuilt or overwritten. Branch prereleases are
qualified by a **monotonic CI build counter**, so every publish is a **distinct
version by construction** — the default is safe for an **immutable package
registry** (NuGet / npm / ADO Artifact Feed) that _hard-rejects_ a duplicate,
and for **skip-on-duplicate** targets (git tags, GitHub/ADO releases) alike.
Re-releasing an existing version is still forbidden; the publishing step also
skips any git tag that already exists, as a backstop. This is a deliberate
default rather than an opt-in — see _Prerelease qualifiers and immutable
registries_.

### 3. App version = the public-surface combination

The deployable app has its own SemVer (`appVersion`) derived from the versions
of components marked `public` (see _appVersion derivation_). It is not an
independent free number and not a mechanical concatenation of all component
versions.

### 4. IaC / deploy-scripts are versioned deployables

The deploy orchestrator, descriptor, and per-stage scripts are a first-class
component (`deploy`) with their own version and package — not loose repo files.
Its version surfaces as `deployToolVersion`, and it carries its own package and
tag (`<appName>-deploy@<deployToolVersion>`). Because it _is_ the deployer, it
sits outside the deployed `components` map / DAG: packaged and tagged for
version history, but not installed by the engine.

### 5. Branch-verified script changes

A change to any deploy script or the descriptor is proven by running the full
ordered deploy + launch-smoke in CI on the branch/PR before merge. The
deploy-smoke runs on **every** branch and PR, so a deployment-pipeline change (a
schema-migration ordering, a new stage script) is validated end-to-end without
merging untested code to the default branch.

### 6. CI produces packages; local builds minimal-ceremony

Packaging and release happen only in GitHub Actions. A developer's local build
is a single command with no release ceremony.

### 7. Deployment-target-agnostic

Packages are self-describing; the deploy engine takes a target parameter. The
same package + descriptor drive a local install target (demonstrated) and a
future cloud target (contract only). The demonstration passes a filesystem
directory as the target; a cloud target would pass its own address.

### 8. Deployment is verified behaviour

Every stage runs a `verify` step and the app runs a final launch-smoke; the
real-CI install proving a healthy start is the evidence, not a unit test. CI runs
every component's test suite on **every** branch/PR, unconditionally —
independent of the versioning `paths` — so a test-only change (backfilling
coverage) still runs and is validated even though it bumps nothing. The
developer-authored deploy-smoke is a distinct, developer-owned tier: the
developer is responsible for ensuring their E2E tests work and are valid, ahead
of any further testing owned by the test team.

### 9. Per-component prerelease — no taint

A component is a prerelease **iff its own `paths` changed on the branch**; an
untouched component stays **stable** at its last release even while a sibling is
prerelease. The app is a prerelease iff **any deployed component is**. There is
**no taint** down the `dependsOn` DAG — a stable component is never dragged to a
prerelease by a changed dependency (see _Per-component prerelease_). "A release
never depends on a prerelease" still holds, but through _deploy-only-changed_ —
an unchanged stable component is simply not rebuilt or redeployed against the
change — not through taint. For consumed package dependencies (internal
libraries or third-party) depending on a prerelease is **advisory, not
blocked**.

### 10. Conventional commits are the versioning input

Every bump is derived from the conventional commits touching a component's
`paths`, tied to the toolkit's conventional-commit gate. Consuming repos (and
this repo) commit in conventional-commit format; it is a hard input to the
mechanism, not a style preference.

## appVersion derivation

Each component carries `"public": true|false` (default `false`). Only public
components form the app's public surface; non-public components (BFFs / internal
APIs, `infra`, `dbschema`, the `deploy` orchestrator) **never** move
`appVersion`.

- **All public components** (`type` `api` / `library` / `ui`): their SemVer bump
  propagates directly — any public MAJOR → app **MAJOR**; else any public MINOR →
  app **MINOR**; else **PATCH**. A MAJOR is signalled the standard Conventional
  Commits way — `!` after the type/scope (`feat(web)!: …`) or a `BREAKING CHANGE:`
  footer — which the bump detector already reads to bump the component. There is
  **no separate app-major marker**: a breaking change to a public component (api
  or ui) is a breaking change for the app's consumers by definition (a ui's
  consumer is the end user), and in both cases the human declares it in the
  commit, not a diff. **MAJOR/BREAKING only applies from 1.0 onward** — see
  _Versioning lifecycle_: in 0.x there are no breaking commits, so pre-1.0 the
  app only ever sees MINOR/PATCH contributions.
- `appVersion` bump = the highest contribution across public components, applied
  to the **previous** `appVersion`. Any non-public change still floors the app at
  a patch (the app content changed) but cannot raise it above patch.
- **The previous `appVersion` is persisted as an app-level git tag**
  `<appName>-app@<appVersion>` (e.g. `fbds-app@2.3.0`), written by CI on the
  default branch alongside the per-component tags. The next run reads the latest
  such tag as its base; the first-ever run has none and derives from `0.0.0`.
  This makes `appVersion` a real running SemVer, not a value recomputed from
  scratch each build. The tag is written on the **default branch only** so the
  lookup only ever reads stable app versions.

Rationale: the app's public surface is semantically versioned for its consumers.
A public API breakage is an app-major event; a breaking change confined to an
internal component (a DB schema consumed only by the app's own API, a BFF
consumed only by the app's own UI) is invisible to external consumers and is at
most an app-patch. Whether a public change is breaking is always a human call
recorded in the commit (`!` / `BREAKING CHANGE:`) — the tooling never diffs a
contract, for an API or a UI, so the same convention governs both.

## Versioning lifecycle — 0.x until an external consumer

Every component (and the app) **starts at `0.0.0`** — CI seeds a
`<appName>-<component>@0.0.0` tag at repo bootstrap so the detector's first
release is `0.1.0`, not `1.0.0`. While a component is in **initial
development (0.x)**:

- Only `feat` (→ minor) and `fix` (→ patch) are used. **No commit is marked
  breaking** (`!` / `BREAKING CHANGE:`) in 0.x — there is no external consumer to
  break and no backwards-compatibility contract yet, so a breaking marker is
  meaningless. (This also side-steps the detector auto-promoting a breaking
  change straight to `1.0.0`.)
- `appVersion` likewise stays in 0.x, derived from public MINOR/PATCH
  contributions.

**`1.0.0` is a deliberate go-live decision**, taken when the component/app first
has an **external consumer** and must therefore maintain backwards
compatibility. It is cut by a human creating the `1.0.0` release (the analogue of
the "don't auto-decide majors" rule for the 0→1 boundary); the automation never
promotes to `1.0.0` on its own. From `1.0` onward, normal SemVer applies and
`BREAKING CHANGE` / `!` becomes meaningful (→ MAJOR). The demonstration runs
entirely in 0.x; the app-MAJOR path (public `BREAKING`) is covered by the
resolver's unit tests, not exercised in the 0.x sample.

## Per-component prerelease (no taint)

A component is a prerelease **iff its own `paths` changed on the branch** (a
`feature/*` build with at least one releasable commit in its paths); the
prerelease identifier is the **sanitised branch name**, so each branch is its own
channel. An **untouched component stays stable** at its last released version —
it is never dragged to a prerelease by a changed dependency.

- The app is a prerelease **iff any deployed component is** — the app manifest
  then carries a prerelease `appVersion` on that branch's channel.
- Stable releases arise on the default branch, where every component is at a
  stable version.
- **No DAG taint.** An earlier iteration propagated prerelease down `dependsOn`;
  that is **removed**. `dependsOn` is deploy order only (see _Component model_),
  not a versioning or taint edge. A shared library several components depend on
  is modelled by **path overlap** — its pathspec listed in each consumer's
  `paths` — so changing it bumps every consumer directly; the versioning graph
  lives in `paths`, not `dependsOn`.
- **Deploy-only-changed makes this safe.** Because the engine deploys only
  components whose version changed (see _Deploy only changed_), an unchanged
  stable component is not rebuilt or redeployed against a changed dependency — so
  "a release never depends on a prerelease" holds by not touching the unchanged
  component, not by tainting it.
- **Consumed package dependencies** — an internal library pulled in as a package,
  or a third-party dependency: depending on a prerelease is **advisory only** (a
  warning, not a blocked release); tracking those is the developer's call.

Realized in the CI **version** step: `compute-versions.ps1` computes each
component's bump from the commits in **its** `paths`, and `resolve-versions.mjs`
passes those versions through unchanged (no taint synthesis) before deriving
`appVersion` and emitting the manifest.

## Branch deployments

A `feature/*` branch is a **first-class deploy target**: pushing it runs the full
pipeline — versions, packages, and a real deploy — so a developer can validate a
deployment pipeline end-to-end without merging untested code to the default
branch.

- **Branch-namespaced versions.** Because the prerelease identifier is the
  sanitised branch name, every artefact a **changed** component publishes is on
  that branch's own channel: `<appName>-api@2.1.0-checkout-v2.1`,
  `<appName>-api@2.1.0-search.1`, etc. A component whose paths did not change
  publishes nothing — it stays at its stable tag. Two concurrent branches
  touching the same component never collide, and a branch never consumes another
  branch's versions.
- **Switch-branch coherence.** Each deploy writes its own branch-namespaced
  `version-manifest.json`, and the engine overwrites the target (idempotent). So
  if a developer deploys branch A then switches to branch B and deploys, the
  target ends up exactly on B's versions — A's tags can never satisfy B's
  resolution because the identifiers differ.
- **What a branch publishes vs the default branch.** A branch push publishes
  **prerelease** tags + packages for the components it **changed** (untouched
  components publish nothing) and runs the deploy-smoke. It does **not** write the
  `<appName>-app@` tag — that stays the default branch's job, so the
  previous-`appVersion` lookup only ever reads stable app versions. Pull requests
  build + deploy-smoke but publish nothing.
- **Immutability holds per channel — collision-proof by construction.** Each
  branch prerelease is qualified by the CI build counter (`…-<branch>.<build>`),
  so successive publishes are distinct versions and a **rebase / force-push /
  workflow re-run never re-mints an already-published version** — the exact case
  that would otherwise reject on an immutable registry. An already-published exact
  tag is still never rebuilt (the tag-exists skip, kept as a backstop). Deleting
  the branch retires its channel. See _Prerelease qualifiers and immutable
  registries_.

## Prerelease qualifiers and immutable registries

The branch prerelease qualifier is a **monotonic CI build counter**, not a number
reconstructed from git tags. This is the **default**, chosen so a branch
deployable is safe to push to an **immutable package registry** (NuGet, npm, ADO
Artifact Feed) — one that _hard-rejects_ a duplicate version — with no per-repo
opt-in.

Why not derive the number from tags: a tag-reconstructed counter (semantic-
release's default `.N`, read from the reachable channel tags) **repeats** under
ordinary history operations — a **rebase / force-push** orphans the branch's
prerelease tags and restarts the count; a **workflow re-run** recomputes the same
number; **deleting** a tag frees it for reuse. On a skip-on-duplicate target (git
tags, GitHub/ADO releases) a repeat is silently skipped; on an immutable registry
it is a **failed publish**. A SemVer detail forces the fix into the right place:
registries treat everything after `+` (build metadata) as **non-distinguishing**,
so uniqueness must live in the **prerelease segment** (after `-`), never in a
`+<sha>` suffix.

The counter is CI-platform-provided:

- **GitHub Actions** — `github.run_number` (per-repo monotonic). A re-run keeps
  `run_number` and increments `github.run_attempt`, so the attempt is folded in
  (`…-<branch>.<run_number>-<attempt>`) when a re-run must also publish.
- **Azure DevOps** — `$(Build.BuildId)` (globally unique per run; no attempt
  suffix needed).

It is applied **uniformly**: the changed component's own version and the derived
`appVersion` both carry the same `<build>` segment on the branch channel — a
single `--build-id` flows into the resolver so the two agree. Untouched
components stay at their stable versions and carry no branch qualifier.

An alternative, if a team prefers the registry itself as the source of truth:
query the target feed for the highest already-published `<base>-<branch>.*` and
increment. Strongest guarantee, more plumbing; the CI-counter default is chosen
because it needs no feed round-trip and is uniform across publish targets.

The demonstration proves this on real CI: a workflow **re-run** of the same commit
publishes `…-<branch>.<n>` on the first attempt and a **distinct**
`…-<branch>.<n>-2` on the re-run — the collision a tag-derived counter would have
produced, avoided by construction.

A repository publishing only tags and releases exercises the skip-on-duplicate
path; a registry target adopts one of the above. The wiring is the host's own —
its workflow syntax, its artefact feed — and is not prescribed here.

## Deploy descriptor → published version-manifest

Two artefacts, source vs published:

- **Deploy descriptor** (`deploy/deployment.json`, source-of-truth, part of the
  `deploy` component). Declares per-component deployment metadata keyed to the
  same component names the gates use. Kept **separate from** the gating
  configuration, so deployment concerns do not mutate the versioning and gating
  model — the descriptor consumes the versions ADR-0001 produces.
- **Published version-manifest** (`version-manifest.json`, emitted per release by
  CI). The descriptor merged with CI-resolved versions + build metadata — a
  self-contained, immutable instruction set an arbitrary deployer consumes with
  only the packages and the manifest.

### Baked-in versions — the manifest is the deployer's file, not the app's identity

Each component's version is **baked into its own built artefact** at build time
(a .NET assembly's `InformationalVersion`, a node package's `version` / emitted
`version.json`), so a running component reports its identity from what was
compiled into it — **never** by reading the manifest about itself. The manifest
tells the deployer what to install and in what order; the derived `appVersion` is
surfaced by the deploy engine from the manifest, not by any component. This is
the cross-cutting invariant that makes packages self-describing and deployable
without side-channel state.

### Packages exclude tooling by class

A component's package contains its production and configuration files only.
Files [classed `tooling`](guardrails/file-classes.md) — the gate
scripts and other development-only automation a repository writes for
itself — are excluded from every package **by that class**, never by a
hand-maintained ignore list that drifts out of step with what the repository
actually added. The same `.gitattributes` declaration that classifies a file
for the gates is what packaging reads.

### Component model — object map, dependsOn DAG

`components` is an **object keyed by component name** (no `name` field, no
`order`/`deployOrder`). Ordering comes solely from `dependsOn`; the engine
topologically sorts. `dependsOn` expresses **deploy order only** — the
topological install sequence. It is **not** a versioning edge (that is `paths`
overlap, rule 1), **not** a prerelease-taint edge (there is no taint, see
_Per-component prerelease_), and not test scoping. Independent nodes are eligible
for parallel execution
(schema-enabled); the reference engine runs them sequentially in topological
order, breaking ties alphabetically by key for stable output.

### One-directional dependency rule

**`dependsOn` is the allowed-dependency chain, and it is one-directional.** A
component's `verify` may assume only that its own `dependsOn` closure is already
deployed — **never** a component that depends on it. A provider must not require
its consumer to exist first: `api` (a provider of `web`) never checks for `web`
in its own verify; that composition assertion belongs to the app-level smoke,
which runs after every component is installed. This keeps the deploy order and
the health checks consistent — a check never reaches forward past its own node.

### Lifecycle hooks — standardized, arrays, two levels

A fixed, all-optional vocabulary, each an **array of commands** run in listed
order: `preDeploy`, `deploy`, `verify`, `postDeploy`. Present at both the
**component** level (run around that component) and the **app** level (run around
the whole deployment; app `verify` is the launch-smoke). This absorbs any
bespoke "glue" — glue is a hook-array entry or a `type:"glue"` component with
`dependsOn`, not a separate concept.

### Published manifest shape

```json
{
  "appName": "fbds",
  "appVersion": "2.3.0",
  "deployToolVersion": "1.1.0",
  "gitSha": "…",
  "builtAt": "…",
  "app": {
    "preDeploy": [],
    "verify": ["verify/app-smoke.ps1"],
    "postDeploy": []
  },
  "components": {
    "infra": {
      "type": "infra",
      "version": "1.0.0",
      "public": false,
      "package": "fbds-infra@1.0.0.zip",
      "deploy": ["install/infra.ps1"],
      "verify": ["verify/infra.ps1"]
    },
    "db": {
      "type": "dbschema",
      "version": "1.4.0",
      "public": false,
      "dependsOn": ["infra"],
      "package": "fbds-db@1.4.0.zip",
      "preDeploy": ["hooks/db-pre.ps1"],
      "deploy": ["install/db.ps1"],
      "verify": ["verify/db.ps1"]
    },
    "api": {
      "type": "api",
      "version": "2.1.0",
      "public": true,
      "dependsOn": ["db"],
      "package": "fbds-api@2.1.0.zip",
      "deploy": ["install/api.ps1"],
      "verify": ["verify/api-health.ps1"]
    },
    "web": {
      "type": "ui",
      "version": "0.9.2",
      "public": true,
      "dependsOn": ["api"],
      "package": "fbds-web@0.9.2.zip",
      "deploy": ["install/web.ps1"],
      "postDeploy": ["hooks/web-post.ps1"]
    }
  }
}
```

`appVersion` `2.3.0` matches no single component version — proving it is the
derived public-surface value, not a copy. `type` stays as informational /
type-default metadata; ordering derives from `dependsOn` only.

## Deploy engine

The `deploy` component ships a small engine that, given a package set + manifest
and a `-Target` directory:

1. Runs app-level `preDeploy`.
2. Topologically sorts `components` on `dependsOn` (alphabetical tie-break).
3. For each component in order, **reconciles against installed state**: if the
   target already carries this component at the manifest's version (an install
   marker `<target>/<name>/.<appName>-version` whose contents match), it logs
   `SKIP <name>` and moves on; otherwise it logs `DEPLOY <name> <version>`, runs
   `preDeploy → deploy → verify → postDeploy` (each array in listed order), then
   writes the marker. A non-zero exit in any phase aborts the whole deployment
   with a single clean `ABORT:` line.
4. Runs app-level `verify` — the launch-smoke.
5. Emits `DEPLOYED <appName> <appVersion>` from the manifest — the deployer
   surfacing the derived app version (no component reads the manifest for this).

It is target-agnostic — the local demonstration passes a filesystem directory; a
cloud target would pass its own address.

### Deploy only changed (reconcile)

The engine deploys a component **iff its manifest version differs from the
version already installed** at the target (or nothing is installed). A component
whose installed marker already matches the manifest is **skipped** (`SKIP`); a
**fresh** target has no markers, so the first deploy installs everything. This is
what makes the engine idempotent — re-running the same manifest is a no-op of
`SKIP` lines — and it is the mechanism by which an unchanged stable component is
never redeployed against a changed dependency (rule 9). Combined with
per-component path-scoped versioning, a single-component change flows end to end
as exactly one redeploy: only the changed component gets a new version, and only
the changed component is installed.

## Diagnostics

The version and deploy scripts emit **structured, greppable log lines** rather
than raw tool chatter:

- `VERSION <component>: …` — per component, whether it bumped (and from/to what)
  or is unchanged, with the count of releasable commits in its paths.
- `APPVERSION: <prev> -> <next>` — the derived app version.
- `DEPLOY <component> <version>` / `SKIP <component> …` — the reconcile decision
  per component.
- `ABORT: …` — a single clean line on a failed phase (the failing component and
  phase), not a raw stack. An expected failure is **labelled**, so a red run is
  read at a glance and the demonstration can quote the decisive line.

## Realization and enforcement

### Mechanism

This standard states what a deployment mechanism must satisfy. It does not ship
one, for the same reason the rest of the toolkit bundles nothing: a mechanism
shipped here would be one stack's, and every adopter of another stack would
inherit a runtime they did not choose.

A conforming mechanism, whatever implements it, must:

- **Derive each component's version** from the Conventional Commits touching its
  own paths, and tag as `<appName>-<component>@<version>`.
- **Publish a descriptor** naming the components, their types, their declared
  dependencies and their public marker — versioned like any other deployable.
- **Emit a version manifest** per run, recording what was resolved so a
  deployment can be traced to the versions it carried.
- **Deploy in dependency order**, and deploy only what changed.
- **Verify each stage**, then run health checks, then smoke — in that order.
- **Refuse to republish** an existing version.

Most platforms already provide most of this. An application-composition
framework or an infrastructure-as-code tool typically expresses the descriptor
and the ordering; the host's pipeline expresses the rest. Reach for those before
writing any of it — a bespoke engine here is the level-3 answer to a question
level 1 usually already answers.

### Versioning source

The per-component bump is read from the Conventional Commits touching each
component's paths, by the path-scoped detector
[ADR-0001](../ADR/0001-per-component-version-derivation.md) records — not by a
general-purpose release tool. That decision fixes the tag format and the
per-component release-config contract.

Where a repository generates its release config rather than hand-writing it, the
generator is the canonical source and the generated file carries a note saying
so. A hand-written copy that drifts from the generator is the failure to avoid;
generating it, or checking it against the generator, is how that is prevented.

### Enforcement boundary

Three bands run through the strategy:

- **Mechanised** — version computation, tag format, package emission, the ordered
  deploy, deploy-only-changed reconcile, and `appVersion` derivation are the CI
  workflow + the path-scoped version detector + the version resolver + the deploy
  engine. These are code that runs on every commit; a rule break fails the build
  or the deploy.
- **Convention / reviewed** — immutability discipline, scripts-as-versioned-
  component, target-agnostic packaging, the `public` marker's honest use, and
  the one-directional dependency rule. These are encoded in the descriptor +
  engine contract and reinforced by review.
- **Demonstrated** — the real pipeline run plus the local-install launch smoke,
  recorded in a demonstration record held by the consuming programme. The
  integration evidence that the whole mechanism works end to end.

## Verification

- [ ] Each component's version is computed only from conventional commits
      touching its own declared `paths`, and a test-only change bumps nothing.
- [ ] A component with no releasable commit on its `paths` keeps its last
      released version while sibling components move.
- [ ] A published version is never rebuilt, and a branch prerelease's
      monotonic CI build-counter qualifier means a rebase, force-push, or
      workflow re-run never re-mints an already-published version.
- [ ] `appVersion` moves only from public components' bumps; a non-public
      component's change floors it at patch and never raises it further.
- [ ] Every component and the app start at `0.0.0`, and no commit is marked
      breaking (`!` / `BREAKING CHANGE:`) while the component is in 0.x.
- [ ] `1.0.0` is cut by a deliberate human decision, never auto-promoted by
      the tooling.
- [ ] The `deploy` component carries its own version and package but sits
      outside the deployed `components` DAG.
- [ ] A component's package contains no file classed `tooling` — checked by
      inspecting the package contents, not the source tree.
- [ ] A change to a deploy script or the descriptor runs the full ordered
      deploy plus launch-smoke in CI on the branch/PR before merge.
- [ ] CI runs every component's test suite on every branch/PR, independent of
      whether that component's `paths` moved its version.
- [ ] A component is a prerelease iff its own `paths` changed on the branch;
      an unchanged dependency stays stable even when what it depends on is a
      prerelease.
- [ ] The engine deploys a component only when its manifest version differs
      from what is already installed at the target, so a re-run of an
      already-deployed manifest produces only `SKIP` lines.
- [ ] A component's `verify` step never checks for a component that depends
      on it — only its own `dependsOn` closure.

## References

- [ADR-0001](../ADR/0001-per-component-version-derivation.md) — versions are
  derived per component from Conventional Commits by a path-scoped detector this
  toolkit owns. Fixes the tag format `<appName>-<component>@<version>`, the
  `release/*.json` config-format contract generated from the components map, and
  default branch → release / feature branch → prerelease. This standard consumes
  that decision.
- [Guardrail standards](guardrail-standards.md) — the gates that hold the
  release boundary this strategy sits behind, and where the no-prerelease-in-a-
  release rule is enforced.
- **Rule 8's evidence bar** is integration evidence from a real pipeline run —
  an install plus a launch smoke — never unit tests alone. The requirement comes
  from the consuming programme's test-integrity rules, which are named here in
  prose rather than linked, having no counterpart in this repository.
