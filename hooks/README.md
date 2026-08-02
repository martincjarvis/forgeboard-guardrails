<!-- cspell:ignore unpushed -->

# hooks

Agent-integration hooks: checks that run inline in an agent's own working
session, registered in `hooks.json` and fired by the harness's own hook
events — as opposed to `scripts/`, which is fired by git (the `.husky/`
hooks) or CI. See
[agent-integration.md](../docs/standards/guardrails/agent-integration.md) for
the standard these implement, and each gate's own reference (linked below)
for what it checks and why.

`.gitattributes` classes this directory `guardrail-class=production`, not
`tooling` — the per-repository rule in
[file-classes.md](../docs/standards/guardrails/file-classes.md#rules) ("the
class is per repository, not per filename"): this repository's product is the
tooling itself, so its own coverage floor and length limits apply to these
files the same as they would to application code in a repository that merely
consumes this toolkit.

## Registration

| File         | What it is for                                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `hooks.json` | Declares which harness event fires which script below. Read by the harness itself, not by any script in this directory. |

## Hooks

| File                         | Fires on                                                               | Implements                                                                                                                                                                                                                                      |
| ---------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gate-0-session-start.mjs`   | `SessionStart` — when a session (or task) begins                       | [Gate 0 — Baseline](../docs/standards/guardrails/gate-0-baseline.md): the quick baseline (behind base, clean tree, `node_modules` present), surfaced non-blocking. Never auto-rebase; the build and full suite are deferred to `npm run gate:0` |
| `gate-1-edit.mjs`            | `PostToolUse` (`Write`\|`Edit`\|`MultiEdit`) — after a file is written | [Gate 1 — Edit](../docs/standards/guardrails/gate-1-edit.md): best-effort formatting (never fails the edit), then a secret scan on tracked files only                                                                                           |
| `gate-4-task-completion.mjs` | `Stop` — when work is handed back                                      | [Gate 4 — Task completion](../docs/standards/guardrails/gate-4-task-completion.md): change size, file length, complexity, function length and parameter count, measured against the branch's base                                               |

## lib

| File             | What it is for                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `thresholds.mjs` | The size and shape numbers, in one place. Imported by `eslint.config.mjs` — the standard flat-config location a consuming repository tunes — and by gate 4, which re-runs the same rules at their warn values to band a finding. Gate 4 still runs eslint self-contained, because it must work in a repository that has no eslint config yet; sharing the numbers is what stops the two diverging. A threshold is the last acceptable value: `COMPLEXITY_ERROR = 15` means 15 passes and 16 blocks.                                                                                                                                                                                                                       |
| `unpushed.mjs`   | How many commits on the branch are not on its remote, as one line of gate 4's output. A note for review, never a refusal — and never a push. Its own file because a review note is a different concern from the size and complexity measures beside it. Reports a named skip when there is no remote or no upstream branch, so "unavailable" never reads as "nothing to push".                                                                                                                                                                                                                                                                                                                                            |
| `run.mjs`        | Cross-platform process helpers. Not itself a gate — the single implementation both hooks above build on, and that `scripts/lib.mjs` re-exports rather than repeating, so every gate under `scripts/` shares it too. Exports `run` (spawns a command, forcing a shell on Windows so npm's `.cmd` shims resolve — CVE-2024-27980), `cleanGitEnv`/`git` (a git spawn with `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE` and related variables stripped, so a nested repository resolves itself rather than one a parent git process pointed at), `have` (is a tool on PATH), `resolveBase` (derives the default branch from `origin/HEAD`, no hardcoded fallback), and `readEvent` (parses the harness's JSON event off stdin). |

## test

The test suite for every check in this directory and in `scripts/` — they
share `lib/run.mjs`, so one suite covers both. Run with `npm test`, which
invokes `hooks.test.mjs` alone; every other file here is loaded by it. Builds
a throwaway git repository per case, because the behaviour under test is a
function of git state and cannot be exercised without one.

**Split by subject area, not carried as one file.** A single file this size
reached the point where lizard's JS span detector reports a function past its
real end — a tool artefact, driven by accumulated file state rather than any
single block (measured, and resolved as ours rather than asserted upstream;
see [cross-gate-rules.md](../docs/standards/guardrails/cross-gate-rules.md#a-check-reused-across-gates-carries-its-severity-model-with-it))
— and gate 6 (unlike gate 7's identical, report-only invocation of the same
scan) hard-blocks on it with no suppression path. See
[ADR-0009](../docs/ADR/0009-split-hooks-test-suite.md). Each file below stays
well under the size where that recurs; adding tests to one is fine, adding a
new subject area is a new file, imported by `hooks.test.mjs` alongside the
others.

| File                                                       | What it is for                                                                                                                                                                                                          |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hooks.test.mjs`                                           | The suite's entry point. Imports every file below for its side effect of registering tests with `node:test`; carries no tests itself.                                                                                   |
| `support.mjs`                                              | Shared, non-test helpers every subject-area file uses: the throwaway git-repository builder, process wrappers, and the suppression-marker constants built by concatenation so they do not flag this suite's own source. |
| `gate-1-4-task-completion.test.mjs`                        | Gate 1 (edit) and gate 4 (task completion): change size, the override marker's hook-side behaviour, complexity warn vs. block, the `parseNumstatZ`/`describeUnpushed` pure helpers.                                     |
| `change-size-override-register.test.mjs`                   | `check-change-size-override.mjs`: the server-side override register that backs the `[large-pr]` marker — branch-matched, human-approved rows, and the `--message` proposal checkpoints.                                 |
| `gate-4-file-classes.test.mjs`                             | Gate 4: how `guardrail-class` and `guardrail-generated` count (or discount) files toward change size and the length limit.                                                                                              |
| `gate-2-commit.test.mjs`                                   | Gate 2 (commit): machine-id, staged-tree checks, lint wiring, the protected-branch check, `resolveBase()`.                                                                                                              |
| `gate-6-dependency-advisories-and-licence-policy.test.mjs` | Gate 6: dependency-advisory classification, the licence table, and the licence-policy decision rule and SPDX-expression evaluation.                                                                                     |
| `licence-register-completeness.test.mjs`                   | Gate 2 check 16: licence-register and licence-table completeness, and the licence-policy check refusing a licence with no table entry.                                                                                  |
| `gate-6-licence-register-row-decisions.test.mjs`           | Gate 6: a register row accepting a licence the policy alone would refuse, and accepted-advisory ids.                                                                                                                    |
| `adr-approver-and-citations.test.mjs`                      | `check-adr-approver.mjs`: the human-approver requirement and the register-citation fallback.                                                                                                                            |
| `link-integrity.test.mjs`                                  | `check-links.mjs`: link and anchor integrity — `resolveTarget`'s branches, exercised through the CLI.                                                                                                                   |
| `suppression-register.test.mjs`                            | `check-suppressions.mjs`: the suppression-register contract and register-row evaluation.                                                                                                                                |
| `semgrep-sarif-filtering.test.mjs`                         | SARIF path normalisation and in-source suppression filtering for semgrep's uploaded SARIF, plus the semgrep end-to-end and repository-scope guards.                                                                     |
| `refusal-proof-contract.test.mjs`                          | `check-refusal-proofs.mjs`'s three-state contract, and the spell-check enforcement guards (the cspell flag the CLI recognises; cspell actually reading code, not only Markdown).                                        |
| `scan-output-classification.test.mjs`                      | Scan-output classification into clean / finding / unavailable: c8 and diff-cover coverage outcomes, and osv-scanner (`check-osv-scanner.mjs` + `lib.mjs`).                                                              |
| `gate-5-markdown-push.test.mjs`                            | The push-time markdown gate: cross-document link/anchor integrity at push, the tree-wide markdownlint sweep wired into gate 6, and its wiring guard.                                                                    |
| `branch-behind-base.test.mjs`                              | `check-branch-behind-base.mjs`: the behind-base classification (unresolvable base, behind, level, possibly-stale fetch) and the real-module regression guards.                                                          |
| `branch-protection.test.mjs`                               | `check-branch-protection.mjs` and `configure-branch-protection.mjs`: required-context derivation, the policy 16-24 verdict, every skip path, and the unconfigured-protection finding.                                   |
| `repository-features.test.mjs`                             | `check-repository-features.mjs`: the public/private feature finding vs. skip split and the live `gh` orchestration's skip paths.                                                                                        |
| `repo-structural-regression.test.mjs`                      | Cross-cutting regression guards over this repo's own structural state: gate-7 robustness, registered suppressions, the hooks/README index, workflow SHA pinning, quality-script wiring.                                 |
| `gate-7-wiring-audits.test.mjs`                            | `check-script-wiring.mjs` and `check-licence-table.mjs`'s on-demand re-validation.                                                                                                                                      |
| `standards-instantiation.test.mjs`                         | `check-standards-instantiation.mjs`: stack references, multi-component contradictions, removals outside the enforcement map.                                                                                            |
| `instantiation-residue.test.mjs`                           | `check-standards-instantiation.mjs`: cspell residue — dead stack vocabulary outside the derived list.                                                                                                                   |
| `toolkit-exemption.test.mjs`                               | `check-standards-instantiation.mjs` and `lib.mjs`: hardcoded commit SHA in test files, and the `isToolkit()` exemption predicate.                                                                                       |
| `tooling-class.test.mjs`                                   | `check-tooling-class.mjs`: the `tooling` class declaration and its coverage-leakage checks.                                                                                                                             |
| `approval-provenance.test.mjs`                             | `check-approval-provenance.mjs`: a freshly staged already-approved ADR or register row with no prior approver-blank commit.                                                                                             |
| `pr-body-artefacts.test.mjs`                               | `check-pr-body-artefacts.mjs` and `readPrBody`: reserved-class findings the PR body must cite, and the pre-PR `--file` draft path.                                                                                      |
| `report-ci-reconciliation.test.mjs`                        | `check-report-ci-reconciliation.mjs`: gate FAIL-label extraction from real job logs and report/CI reconciliation.                                                                                                       |
