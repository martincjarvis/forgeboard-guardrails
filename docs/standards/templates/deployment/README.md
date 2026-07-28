# Deployment-strategy template

<!-- cspell:ignore fbds dbschema releaserc appVersion deployToolVersion semver dependsOn prerelease prereleaseId prid nologo topo myapp MYAPP NuGet ADO BuildId pathspec -->

An instantiable template for the
[deployment-strategy standard](../../deployment-strategy.md) (Stream B1, AC3). Copy
this directory into a repo, substitute your app's name, declare your components,
and CI will emit a versioned package + deploy script per component, derive an app
version from the public-surface combination, and install to a local target with a
launch-smoke — all proven by the
real-CI demonstration record,
which runs this exact template (instantiated as `fbds`) end-to-end on GitHub
Actions.

The template is **genericized**: where the sample app's short code (`fbds`) appears
it is the placeholder `<APP_NAME>`. The proven logic files (resolver, deploy engine,
packaging, CI scripts, versioning module, schemas, release configs, workflow) carry
the proven sample's logic unchanged — genericised to `<APP_NAME>` where an
app-specific token appears, with the workflow additionally carrying template
instructions. The path-scoped `compute-versions.ps1` and the pure `versioning.psm1`
carry **no placeholder at all** — they read `appName` and each component's `paths`
from `.forgeboard/guardrails.config.json`. The component-specific stage scripts are
documented stubs.

## How to instantiate

1. **Copy the template** into your repo, preserving the layout:

   - `.github/workflows/release.yml` ← `release.yml`
   - `deploy/` ← `deploy/` (engine, package script, resolver, CI scripts,
     descriptor, stage-script stubs)
   - `release/` ← `release/` (per-component semantic-release configs)
   - `schemas/` ← `schemas/` (descriptor + manifest JSON Schemas)

2. **Substitute the app name.** Do a project-wide find/replace of the literal
   token `<APP_NAME>` with your app's short code (e.g. `myapp`). It is used in:

   - `deploy/deployment.json` — `"appName": "<APP_NAME>"`.
   - `release/*.json` — `"tagFormat": "<APP_NAME>-<component>@${version}"`.
   - `deploy/ci/release.ps1`, `release.yml` — tag lookups
     (`<APP_NAME>-<component>@*`, `<APP_NAME>-app@*`, `<APP_NAME>-deploy@*`),
     the install-target dir, and the artifact name. (`deploy/ci/compute-versions.ps1`
     and `deploy/ci/versioning.psm1` read `appName` from
     `.forgeboard/guardrails.config.json` and need no substitution.)
   - `deploy/engine.ps1` + the stage-script stubs — the env-var prefix
     (`<APP_NAME>_TARGET`, `<APP_NAME>_PACKAGE_DIR`, `<APP_NAME>_COMPONENT`,
     `<APP_NAME>_VERSION`). The replacement should be a valid identifier
     (letters/digits); the convention is the uppercase app code, so
     `<APP_NAME>_TARGET` becomes e.g. `MYAPP_TARGET`. The engine's `DEPLOYED`
     line reads `appName`/`appVersion` from the manifest and needs no edit.

3. **Declare your components** in two places that must agree:

   - `deploy/deployment.json` — each component's `type`, `public` flag,
     `dependsOn` (the deployment DAG), and `preDeploy`/`deploy`/`verify`/
     `postDeploy` hook arrays. See the descriptor
     [JSON Schema](./schemas/deployment.schema.json).
   - `.forgeboard/guardrails.config.json` `components` — each component's
     versioning boundary (`paths`, excluding test files so a test-only change
     never bumps a version). This is the [ADR-0001](../../../ADR/0001-per-component-version-derivation.md)
     versioning input; the descriptor consumes the versions it produces and is
     kept separate so this standard never mutates Stream A's schema.

4. **Add a `release/<component>.json` per component.** One file per component
   name, identical except `tagFormat`. The seed set here (`infra`, `db`, `api`,
   `web`, `deploy`) is the sample's; add/remove to match your components.

5. **Replace the stage-script stubs.** Every `deploy/install/*`,
   `deploy/verify/*`, and `deploy/hooks/*` file is a documented stub that exits
   `0`. Replace each with real install/verify/hook logic for its component. Each
   stub's header documents the env-var contract and the abort-on-failure rule.

6. **Adapt the workflow's build step and the packaging payload-staging block.**
   Both are marked `SAMPLE`/`PAYLOAD-STAGING`: the build step bakes each
   component's resolved version into its own artefact at build time (a .NET
   assembly's `InformationalVersion`, a node package's `version` / emitted
   `version.json`), and `deploy/package.ps1` stages each component's built
   output under the bundle. Point both at your stacks and build outputs.

## Publishing to an immutable package registry

**This template is immutable-registry-safe by default.** Branch prereleases are
qualified by a **monotonic CI build counter**, not by semantic-release's
tag-reconstructed `.N` — so every publish is a distinct version by construction,
and a **rebase, force-push, or workflow re-run never re-mints an already-published
version**. That matters because a registry like **NuGet / npm / ADO Artifact
Feed** _hard-rejects_ a duplicate (unlike git tags / GitHub Releases, which skip
one). See the standard's
[_Prerelease qualifiers and immutable registries_](../../deployment-strategy.md#prerelease-qualifiers-and-immutable-registries)
for the full rationale.

The wiring is already in the template: `release.yml` passes the counter to both
version steps, and `compute-versions.ps1` + `resolve-versions.mjs` fold it into
every branch-channel version — the changed component's own prerelease and the
derived `appVersion`. Untouched components stay stable (there is no taint). On
**GitHub Actions** it is `github.run_number` (with
`github.run_attempt` folded in for re-runs) — the default in `release.yml`:

```yaml
# release.yml (already wired)
env:
  CI_BUILD_NUMBER: "${{ github.run_number }}"
  CI_BUILD_ATTEMPT: "${{ github.run_attempt }}"
```

**On another CI platform, point `CI_BUILD_NUMBER` at that platform's monotonic
build id.** For **Azure DevOps**, use `$(Build.BuildId)` (globally unique per run,
so `CI_BUILD_ATTEMPT` can be omitted):

```yaml
# azure-pipelines.yml
- pwsh: pwsh deploy/ci/compute-versions.ps1
  env:
    CI_BUILD_NUMBER: $(Build.BuildId)
```

With no `CI_BUILD_NUMBER` set (e.g. a local run), the qualifier falls back to `0`.

If you prefer the **registry itself** as the source of truth, replace the counter
derivation with a query for the highest already-published `<base>-<branch>.*` and
increment from that — strongest guarantee, more plumbing. Either way the publish
contract is _unique-by-construction_, not _skip-if-exists_.

## The AC1-swap note (hand-carried release config)

The `release/*.json` files are **hand-carried**: each is the **literal output**
of the toolkit's generator
(`forgeboard-guardrails` `src/versioning/releaseConfig.ts`, [ADR-0001](../../../ADR/0001-per-component-version-derivation.md)),
annotated with that generator as the canonical source. This template therefore
honours the versioning decision faithfully without depending on the (still
unpublished) toolkit — see the standard's _Approach_ section for why.

These files are **no longer executed by any runtime step** — `compute-versions.ps1`
detects bumps directly from the Conventional Commits that touch each component's
`paths`, and no longer runs `semantic-release`
([ADR-0001](../../../ADR/0001-per-component-version-derivation.md)
supersedes [ADR-0001](../../../ADR/0001-per-component-version-derivation.md)'s semantic-release
runtime; the `release/*.json` config **format** is the contract carried forward,
not the runtime). They remain solely as the toolkit-contract placeholder that
AC1 swaps.

**Stream B1 AC1 (repo-setup) swaps this:** once `@forgeboard/guardrails` is
published and installed, the hand-carried `release/*.json` is replaced by
config generated by the toolkit — a one-line source change, not a
re-implementation. Everything else in this template (resolver, engine, CI,
schemas, descriptor, hooks) is reused unchanged by AC1.

## File map

| Path                                   | Role                                                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `release.yml`                          | GitHub Actions workflow: version → build → package → deploy-smoke → publish                                         |
| `deploy/deployment.json`               | Deploy descriptor (source): components, DAG, hooks                                                                  |
| `deploy/engine.ps1`                    | Deploy engine: topo-ordered phases, abort-on-failure, emits `DEPLOYED`                                              |
| `deploy/package.ps1`                   | Packaging: per-component zips + app bundle + `deploy` package                                                       |
| `deploy/lib/resolve-versions.mjs`      | Version resolver: topo order, per-component pass-through, `appVersion` derivation, manifest                         |
| `deploy/ci/compute-versions.ps1`       | Per-component path-scoped bump detection → `results.json`                                                           |
| `deploy/ci/versioning.psm1`            | Pure versioning helpers (bump kind, pathspec, next version) used by `compute-versions.ps1`                          |
| `deploy/ci/release.ps1`                | Tag + GitHub Release publishing (component always; app/deploy on default branch)                                    |
| `deploy/install/*.ps1`                 | Per-component install stubs                                                                                         |
| `deploy/verify/*.ps1`                  | Per-component verify stubs + the app-level launch-smoke stub                                                        |
| `deploy/hooks/*.ps1`                   | Per-component pre/post hook stubs                                                                                   |
| `release/<component>.json`             | Per-component release config (literal `releaseConfig.ts` output; AC1 contract placeholder, not executed at runtime) |
| `schemas/deployment.schema.json`       | JSON Schema for the deploy descriptor                                                                               |
| `schemas/version-manifest.schema.json` | JSON Schema for the published version-manifest                                                                      |

## See also

- [Deployment-strategy standard](../../deployment-strategy.md) — the _what/why_
  of every rule this template realizes.
- Demonstration record — the
  real-CI run of this template instantiated as `fbds`.
- [ADR-0001](../../../ADR/0001-per-component-version-derivation.md) —
  the versioning decision this template consumes (supersedes
  [ADR-0001](../../../ADR/0001-per-component-version-derivation.md); bespoke path-scoped
  detector, ADR-0001's tag format and config contract carried forward).
- The `forgeboard-deploy-sample` repo — the live, instantiated sample.
