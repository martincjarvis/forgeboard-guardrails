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

| File             | What it is for                                                                                                                                                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hooks.test.mjs` | The test suite for every check in this directory and in `scripts/` — they share `lib/run.mjs`, so one suite covers both. Run with `npm test`. Builds a throwaway git repository per case, because the behaviour under test is a function of git state and cannot be exercised without one. |
