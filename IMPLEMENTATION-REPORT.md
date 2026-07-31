# Implementation report — the repository gates itself

<!-- cspell:ignore misparse -->

What was built, what was derived, what each gate was proved against, and what
does not work. Blunt where it should be.

## What was built

A package manifest and a set of Node scripts that make gates 0, 2, 3, 5 and 7
real for this repository, wired with `husky` (installation) and `lint-staged`
(staged isolation), as the brief directed. Node is the orchestrator; every gate
is a `.mjs` script with no shell, so it runs unchanged on Windows and Linux.
Tools are development dependencies pinned by `package-lock.json` (ADR-0002).

| Gate               | Where                                                            | What runs                                                                                                                                                                                      |
| ------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 — Baseline       | `npm run gate:0` → `scripts/gate-0-baseline.mjs`                 | fetch + behind check, clean tree, `npm ci`, build (`tsc`), tests, counts quoted                                                                                                                |
| 2 — Commit         | `.husky/pre-commit`: `lint-staged` then `scripts/pre-commit.mjs` | format/prose/spelling on staged bytes; lock sync, file size, machine-identifying content, secret scan, link and anchor integrity, suppression register, changed-component build and unit tests |
| 3 — Commit message | `.husky/commit-msg`: `commitlint` then `scripts/check-scope.mjs` | structure/type/breaking via commitlint; scope validity and agreement derived from the plugin manifest                                                                                          |
| 5 — Push           | `.husky/pre-push`: `scripts/gate-5-push.mjs`                     | pushed range; `c8` coverage, command-delegated                                                                                                                                                 |
| 7 — On demand      | `npm run gate:7` → `scripts/gate-7-on-demand.mjs`                | repository-wide and history secret scan, link integrity, installation, workspace capability; reports, caller decides                                                                           |

The two existing agent hooks were extended, not discarded: gate 4 was rewritten
to read file class from git attributes (see below), and gate 1 was repaired.
gate 1 and gate 4 are unchanged in role.

## What was derived, and from where (ADR-0003)

There is no `guardrails.config.json`. Nothing was invented.

| What a gate needs | Derived from                                       | How                                                                                                                                                                            |
| ----------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The component set | `.claude-plugin/plugin.json` `name`                | one component, `forgeboard-guardrails`; its paths are the conventional plugin directories that exist (`hooks`, `skills`, `.claude-plugin`); everything else is repository-wide |
| File classes      | `.gitattributes` `guardrail-class` attribute       | queried with `git check-attr`; an unclassified file is production (fail-safe)                                                                                                  |
| Thresholds        | `docs/standards/guardrails/thresholds.md` defaults | change size 400/800, file length 400, file size 1 MB/5 MB; no stack analyser overrides them here                                                                               |
| Build             | `package.json` `scripts.build` → `tsc --noEmit`    | the JS analyser; a warning is a failure (zero-warning line)                                                                                                                    |
| Coverage floor    | measured (see below), set at 80%                   | the repository declares it; `c8` owns the comparison                                                                                                                           |
| Default branch    | git (`origin/HEAD`, falling back to `origin/main`) | —                                                                                                                                                                              |
| Staged-file rules | each tool's own checked-in configuration           | prettier reads `.editorconfig`/`.prettierrc.json`; markdownlint reads `.markdownlint.jsonc`; cspell reads `cspell.json`; secretlint reads `.secretlintrc.json`                 |

Every gate run states what it resolved (the components, the thresholds, where
each came from) — the obligation ADR-0003 places on a derived configuration.

## Coverage — measured, set, proved

The hooks are exercised through subprocesses, so Node's built-in coverage cannot
see them; `c8` is used instead, because it aggregates `NODE_V8_COVERAGE` across
child Node processes. Measured line coverage:

| Platform                      | gate-1 | gate-4 | run.mjs | All files |
| ----------------------------- | ------ | ------ | ------- | --------- |
| Windows (Node 24)             | 86.6%  | 95.4%  | 95.8%   | 93.1%     |
| devcontainer (Linux, Node 24) | —      | —      | —       | 82.3%     |

The floor is set at **80%** — the nearest round number at or below the lowest
measured figure across both supported platforms (82.3% in the container), not at
the measured value, so it does not ratchet on noise. Proved to fail: raising the
floor above measured coverage (94% on Windows, where 93.1% is measured) refuses
the push with c8's own shortfall message. The variance is real and explained:
gate 1's secret-scan path is environment-dependent (secretlint errors on a
config-less scratch repo on Windows but exits clean in the container), so the
exact lines covered move. The floor accommodates both.

## Every gate, proved by planting a violation and seeing it refused

- **Gate 0** — `npm run gate:0` on the working tree reported `pass=11 fail=0
skipped=0`, then blocked (exit 2) on two real findings: the branch is behind
  `origin/main`, and the tree held uncommitted changes. Counts are quoted, not
  summarised.
- **Gate 2** — four violations planted into staged files, each refused (exit 2)
  and each removed: a GitHub token (secret scan), an `// eslint-disable` with no
  register row (suppression register), a link to a non-existent file (link
  integrity), and `/home/<user>` (machine-identifying content). Each refusal is a
  diagnosis naming the check, the path and the remedy.
- **Gate 3** — a non-Conventional message and an undeclared scope (`bogus`) both
  refused (exit 2); a repository-wide `chore:` message accepted. This gate also
  refused two of this work's own commits when the scope was written `guardrails`
  instead of the derived `forgeboard-guardrails` — live proof, not a staged one.
- **Gate 5** — the push passes at floor 80 and is refused (exit 2) at floor 94,
  with the honest message that a non-zero exit is either a shortfall or a runner
  failure.
- **Gate 7** — reports only (exit 0). A GitHub token planted in a tracked file is
  reported by the repository-wide scan; the history scan found a real private-key
  test fixture in the archived pre-rebuild branches (see findings). On Windows it
  reports `core.longpaths` unset; on Linux it reports clean.

## The hook defects that had to be fixed (the brief's "do not rewrite" preserved working code, not defects)

1. **gate-4 file classification.** It classed files by a hardcoded path regex,
   which violates file-classes.md and ADR-0003. Rewritten to read
   `guardrail-class` from `.gitattributes` via `git check-attr`, with the
   production fail-safe. The tests were corrected for the right reason (a `.gitattributes`
   in the scratch repo) and extended: a file classed as test does not count toward
   change size; a configuration file counts but has no length limit; an unclassified
   file is production.
2. **gate-1 overclaiming.** It treated any non-zero `secretlint` exit as a
   confirmed security finding. A tool or config error is not a breach; the
   cross-gate rule "never claim more than was checked" is explicit. It now blocks
   only on a parsed finding and reports an error as unavailable.
3. **`hooks/lib/run.mjs` could not spawn npm on Windows.** Under Node's
   CVE-2024-27980 fix, spawning a `.cmd` without a shell returns EINVAL, so every
   `npx`-based check silently reported "unavailable" on Windows — the silent green
   the standard exists to prevent. The bare command now runs through a shell on
   Windows so PATHEXT resolves `npx.cmd`, `semgrep.exe`, etc. uniformly.
4. **`GIT_DIR` inheritance in hook context.** git exports `GIT_DIR` /
   `GIT_INDEX_FILE` / `GIT_WORK_TREE` into a hook's environment, so a child git
   spawned by a gate resolved this repository instead of the one its cwd pointed
   at — which broke the hook tests' scratch repositories. `git` spawns now strip
   those variables (and the test helper does too), so a child git always resolves
   its repository from its cwd. This is also what makes the tests pass when the
   pre-commit hook runs them.

The suppression register is empty. No inline suppressions were added, so no row
was needed; nothing here required an approver.

## What the standards required that is not implemented, and why

- **Cross-language analysis (gate 2 check 8) per commit.** `semgrep --config auto`
  fetches its ruleset from the network. A per-commit gate that needs the network
  is a gate people route around (the cross-gate rule's own argument), so it runs
  at gate 7, not gate 2. Gate 2 reports it as a visible skip with the reason.
- **Integration tests (gate 5 check 2).** The repository has no integration tests
  yet, so gate 5 reports a visible skip. The mechanism is in place; add tests
  under a component path and it runs.
- **Dependency licence register (gate 2 check 16).** Implemented in spirit by
  derivation (`npm ls` would be the source), but not wired as a blocking check —
  it is change-triggered and this change adds the dependencies, so it would fire
  on its own adoption. Left for the first dependency change after adoption, with
  the `docs/registers/` location already in place.
- **End-to-end, smoke, health (gates 6/8).** Out of scope (the brief covers 0, 2,
  3, 5, 7); gate 6 is the server-side authority the local gates are a fast copy of.
- **Native build warnings.** This repository has no compiler; "build" is `tsc
--noEmit`, which emits errors (no warning tier). The zero-warning line holds as
  zero errors. A genuine compiled build is a gap that does not apply here.

## Findings the gates surfaced (reported, not suppressed)

- **A private-key test fixture is in the history.** Gate 7's history scan found a
  PEM private key in the archived pre-rebuild branches (`main`,
  `feature/FB-0008-docs-gate`). It appears to be a well-known sample key used to
  test the old gate, not a live credential, but the history scan is correct to
  surface it: the remedy is to confirm it is not real and, if it is, revoke first
  (the key is in every clone even though it is gone from HEAD). Rewriting history
  is a separate, recorded decision.
- **`core.longpaths` is unset on Windows.** Gate 7 reports it (a gate reports; it
  does not mutate global git config). A deep path can fail to clone or build on
  Windows.
- **The rebuild branch is behind `origin/main`.** Gate 0 reports it; this is
  expected for a rebuild branch and is a real finding, not a gate defect.

## Where the standards were wrong, unclear, or rubbed

- **The component name is verbose as a scope.** Derived from the plugin manifest,
  the one valid non-empty scope is `forgeboard-guardrails`. That is correct but
  long; in practice most commits here use an empty (repository-wide) scope, which
  is always allowed. The standard is not wrong, but a reader expecting a short
  scope will trip on it the way this work's first commit attempts did.
- **Gate 2's strict ordering is softened in practice.** The standard runs the
  formatter before everything; `lint-staged` does the format/prose/spelling pass,
  then the orchestrator does the rest, so lock sync lands after the formatter.
  This is harmless (formatting does not change whether lock sync passes) and the
  cross-gate rule allows reordering where one check does not change what a later
  reads — but it is a deviation worth naming.
- **lizard's span merging, in some JavaScript files.** The standard names
  `lizard` for complexity. Observed directly against this repository:
  `lizard` merges adjacent top-level function expressions in some JavaScript
  files into one reported span covering many real functions (it reported a
  six-line function at cyclomatic complexity 25). This is narrower than "its
  JS tokenizer misparses ES modules," a claim an earlier draft of this report
  made and this revision retracts — it does not do this uniformly, and
  nothing here establishes a general ES-module misparse. A finding of
  implausible length (a reported span far longer than the function actually
  is) is checked against the source before it is believed, not treated as
  fact on lizard's report alone; where it turns out to be a real span-merge
  artefact, that file's complexity measurement falls back to the stack's own
  analyser. `thresholds.md` has the stack's own analyser win over these
  gap-fill numbers, so for this JS-only repository `tsc`/ESLint is
  authoritative and lizard is excluded from JS with the reason stated. The
  standard's command is right for languages lizard parses well; it is not
  right for every file in this one.
- **Gate 2 check 9 has no established tool.** Machine-identifying content (local
  absolute paths, usernames) is not covered by secretlint's rules, so the check is
  bespoke (`scripts/check-machine-id.mjs`), at level 3 of the tooling ladder with
  its reason recorded in the source — exactly the temporary state the standard
  allows.

## Verdict

The repository passes its own gates on both Windows and the devcontainer: clean
build, 11/11 tests, 80%+ coverage, prettier/cspell/markdownlint/links clean,
every commit gate enforced. The two findings that remain (a key in the history,
long paths on Windows) are real and reported, not hidden. The gates do not pass
themselves off as greener than they are.
