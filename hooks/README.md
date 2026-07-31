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

| File                         | Fires on                                                               | Implements                                                                                                                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gate-1-edit.mjs`            | `PostToolUse` (`Write`\|`Edit`\|`MultiEdit`) — after a file is written | [Gate 1 — Edit](../docs/standards/guardrails/gate-1-edit.md): best-effort formatting (never fails the edit), then a secret scan on tracked files only                                             |
| `gate-4-task-completion.mjs` | `Stop` — when work is handed back                                      | [Gate 4 — Task completion](../docs/standards/guardrails/gate-4-task-completion.md): change size, file length, complexity, function length and parameter count, measured against the branch's base |

## lib

| File      | What it is for                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run.mjs` | Cross-platform process helpers. Not itself a gate — the single implementation both hooks above build on, and that `scripts/lib.mjs` re-exports rather than repeating, so every gate under `scripts/` shares it too. Exports `run` (spawns a command, forcing a shell on Windows so npm's `.cmd` shims resolve — CVE-2024-27980), `cleanGitEnv`/`git` (a git spawn with `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE` and related variables stripped, so a nested repository resolves itself rather than one a parent git process pointed at), `have` (is a tool on PATH), `resolveBase` (derives the default branch from `origin/HEAD`, no hardcoded fallback), and `readEvent` (parses the harness's JSON event off stdin). |

## test

The test suite for every check in this directory and in `scripts/` — they
share `lib/run.mjs`, so one suite covers both. Run with `npm test`, which
invokes `hooks.test.mjs` alone; every other file here is loaded by it. Builds
a throwaway git repository per case, because the behaviour under test is a
function of git state and cannot be exercised without one.

**Split by subject area (fix 79), not carried as one file.** A single file
this size reached the point where lizard's function-span detection merges
adjacent functions into one over-length block — a tool artefact, not a real
finding — and gate 6 (unlike gate 7's identical, report-only invocation of
the same scan) hard-blocks on it with no suppression path. See
[ADR-0009](../docs/ADR/0009-split-hooks-test-suite.md). Each file below stays
well under the size where that recurs; adding tests to one is fine, adding a
new subject area is a new file, imported by `hooks.test.mjs` alongside the
others.

| File                                                       | What it is for                                                                                                                                                                                                          |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hooks.test.mjs`                                           | The suite's entry point. Imports every file below for its side effect of registering tests with `node:test`; carries no tests itself.                                                                                   |
| `support.mjs`                                              | Shared, non-test helpers every subject-area file uses: the throwaway git-repository builder, process wrappers, and the suppression-marker constants built by concatenation so they do not flag this suite's own source. |
| `gate-1-4-task-completion.test.mjs`                        | Gate 1 (edit) and gate 4 (task completion): change size, the override marker, file classes, complexity warn vs. block.                                                                                                  |
| `gate-2-commit.test.mjs`                                   | Gate 2 (commit): machine-id, staged-tree checks, lint wiring, the protected-branch check, `resolveBase()`.                                                                                                              |
| `gate-6-dependency-advisories-and-licence-policy.test.mjs` | Gate 6: dependency advisories, the licence table and licence-policy decision rule, licence completeness.                                                                                                                |
| `gate-6-licence-register-row-decisions.test.mjs`           | Gate 6: a register row accepting a licence the policy alone would refuse, and accepted-advisory ids.                                                                                                                    |
| `adr-approver-and-citations.test.mjs`                      | `check-adr-approver.mjs`: the human-approver requirement and the register-citation fallback.                                                                                                                            |
| `links-and-suppressions.test.mjs`                          | `check-links.mjs` and `check-suppressions.mjs`: link/anchor integrity and the suppression-register contract.                                                                                                            |
| `gate-5-push-and-scans.test.mjs`                           | SARIF filtering, the refusal-proof contract, coverage/diff-cover classification, `check-osv-scanner.mjs`.                                                                                                               |
| `branch-and-repository-policy.test.mjs`                    | `check-branch-behind-base.mjs`, `check-branch-protection.mjs`, `check-repository-features.mjs`.                                                                                                                         |
| `gate-7-wiring-audits.test.mjs`                            | `check-script-wiring.mjs` and `check-licence-table.mjs`'s on-demand re-validation.                                                                                                                                      |
| `standards-instantiation.test.mjs`                         | `check-standards-instantiation.mjs`: stack references, multi-component contradictions, cspell/SHA residue.                                                                                                              |
| `tooling-class.test.mjs`                                   | `check-tooling-class.mjs`: the `tooling` class declaration and its coverage-leakage checks.                                                                                                                             |
| `approval-provenance-and-pr-body.test.mjs`                 | `check-approval-provenance.mjs`, `check-pr-body-artefacts.mjs`, `check-report-ci-reconciliation.mjs`.                                                                                                                   |
