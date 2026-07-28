---
name: guardrails-config
description: Use when creating or editing .forgeboard/guardrails.config.json — covers component boundaries, dependsOn, test-type fields, lintStaged merge rules, the statusContract opt-in, and new-vs-existing-repo adoption.
---

# Configuring .forgeboard/guardrails.config.json

## Components

A component is both a gating unit and an independent-versioning unit. Add a new
component when a directory has its own build/test lifecycle; extend an existing
component's `paths` when it's just more source for the same lifecycle.

## dependsOn

Use `dependsOn` when a component's breakage could come from a _different_
component's change — typically a shared library. Declare it on the dependent:
`"web": { "dependsOn": ["shared-lib"] }`. This is gating-only: a `shared-lib`
change triggers `web`'s build/test gates even with no files of its own staged.
It does not cascade a version bump.

Do not fold a dependency's source into a dependent's own `paths` as a
workaround — that breaks independent versioning for the dependency.

## Test-type fields

Declare `unitTest`, `integrationTest`, `e2eTest`, `e2eSmokeTest` as needed — all
optional. Only `unitTest` runs at pre-commit in A1; the others are declared now
so later phases don't need a config-shape change. Omit `e2eTest` entirely for
a non-user-facing component (e.g. a backend-only library).

## Command fields accept a sequence

Every command field takes `string | string[]`, run in order, fail-fast. Use
this for a multi-step check, e.g. a public-contract compliance test after unit
tests: regenerate the artefact, then diff it against the committed baseline.

## lintStaged merge

Top-level `lintStaged` applies repo-wide; a component's own `lintStaged`
applies only to that component's staged files and overrides a same-glob
top-level entry. The universal `prettier --write --ignore-unknown` built-in
always runs first, before any configured `lintStaged` entry.

## statusContract — opt-in, default off

`statusContract.enabled` defaults to `false`. Turn it on only if something
will actually consume the emitted state directory —
otherwise leave it off; the core gates (commits, secrets, linting, SAST,
formatting, build/test, versioning) work fully either way. If enabling,
`ticketIdPattern` defaults to `[A-Z]+-\d+`; override it if the
repo's ticket-tracking isn't that scheme (e.g. GitHub Issues/ADO, or nothing).

## External tool requirement: semgrep (SAST)

The SAST gate uses [semgrep](https://github.com/semgrep/semgrep), which is OSS
(MPL-2.0) but Python-distributed rather than npm-bundled. Install it once on
each developer machine and CI runner:

```bash
# Windows (Python 3 LTS via winget, then semgrep via pip)
winget install Python.Python.3.12
pip install semgrep

# macOS / Linux
brew install semgrep        # macOS
# or: python3 -m pip install semgrep
```

`guardrails doctor` warns about declared component commands it can't resolve,
but does not check semgrep — run `semgrep --version` after install to verify.
Without semgrep on PATH, the SAST gate fails loudly with a remediation message
on every commit it would otherwise scan.

All other gates (prettier, markdownlint, cspell, secretlint) are npm-bundled
into `@forgeboard/guardrails` itself and require no separate installation.

## Adopting into an existing repo

Run `guardrails format` once and commit the result _before_ your next real
commit — otherwise the universal prettier gate will reformat old files the
first time anyone touches them, burying real changes in reflow noise. The
default-branch-block gate is an immediate behaviour change if the repo
previously committed straight to its default branch — expect that.
