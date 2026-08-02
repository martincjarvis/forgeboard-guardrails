---
name: repository-bootstrap
description: Use when asked to set up, bootstrap, or uplift a repository with quality guardrails — wires formatting, linting, tests, commit hygiene, secret scanning and CI through the stack's own tools, reusing whatever the repository already has.
---

# Repository bootstrap

Leave the repository enforcing the ten capabilities in
[docs/standards.md](../../docs/standards.md), using off-the-shelf tools, with
nothing depending on this plugin afterwards. Works on an empty repository and
on an existing one; the existing one's working setup is extended, never
replaced.

**Do not run this on the plugin's own repository** (its root has
`.claude-plugin/plugin.json` naming `forgeboard-guardrails`) — say so and stop.

## 1. Survey — read-only

Establish, quoting the command or file that proves each:

- **Stack(s)**: manifests present (`package.json`, `*.csproj`/`*.sln`,
  `pyproject.toml`). A repository can have several; wire each.
- **Existing tooling**: formatters, linters, test runners, hook managers, CI
  workflows already configured. These are kept and built on. An existing hook
  manager (lefthook, pre-commit, husky) is the one you wire into — never
  install a second.
- **Host + CI platform**: `git remote -v`, existing workflow files.
- **Baseline**: does the current default branch pass its own CI? Record the
  answer before changing anything.
- **Default branch, and whether it is protected**: `gh repo view` or the
  platform equivalent, when a remote exists.

If no manifest identifies a stack, ask (interactive) or record the ambiguity
and wire only the stack-neutral capabilities (unattended).

## 2. Propose

One summary before writing: capabilities to wire, the tool chosen for each
(existing tool first, then the stack reference table), and anything that looks
inapplicable. In an interactive session the human can strike items here — each
strike becomes an `off` entry with `why` and `who`. Unattended, wire
everything and note doubts in the report.

Load the reference for each stack found:
[references/node.md](references/node.md),
[references/dotnet.md](references/dotnet.md),
[references/python.md](references/python.md),
[references/shared.md](references/shared.md) (secrets, spelling, CI, branch
review — stack-neutral).

## 3. Wire

Order: formatter first (so later checks judge formatted bytes), then linters,
then hooks, then CI.

- **Line endings first of all.** Ensure `.gitattributes` normalises to LF
  (`templates/gitattributes`) before the formatter runs — a Windows checkout
  with CRLF fails the format gate on files nobody edited. Renormalise
  (`git add --renormalize .`) if the repository already has mixed endings.

- **Reuse, then template.** A capability the repository already implements is
  recorded in `.guardrails.json` as-is. Missing ones take the plugin's
  `templates/` file for the stack, adapted to the repository — never the other
  way round. Template filenames are stored without their leading dot
  (`lintstagedrc.json`, `gitattributes`) so they stay inert in the plugin;
  restore the dot when copying (`.lintstagedrc.json`, `.gitattributes`).
- **One verify entry point.** Create the stack's canonical chained command
  (`npm run verify`, a `verify` target, `nox`/`make verify`) that runs
  format-check, lint, typecheck, and tests. CI and developers run the same
  command. A multi-stack repository still gets exactly one entry point,
  chaining each stack's own verify (e.g. `npm run verify` running
  `dotnet build -warnaserror && dotnet test` after the Node steps) — pick
  the runner the repository already leans on. IaC files count as a stack:
  [references/infra.md](references/infra.md).
- **Hooks**: commit = format + lint + secrets + spelling over staged files
  only; commit-msg = commit message lint; push = verify. Wire through the
  existing hook manager; install the stack's usual one only if none exists.
- **CI**: one workflow running `verify` on pull requests
  ([templates/github/guardrails.yml](../../templates/github/guardrails.yml)).
  If CI already exists, add the verify job to it; do not add a parallel
  pipeline.
- **Record**: write `.guardrails.json` mapping every capability to its tool or
  its `off` entry. Add a `CODEOWNERS` line for it (create the file if absent)
  naming the repository owner.
- **Standards page**: copy the plugin's `docs/standards.md` into the
  repository as `docs/guardrails.md`, tuned to it — replace the plugin's
  tool-reference pointer with the tools actually chosen here, and drop or
  rewrite any link that does not resolve inside this repository. The
  repository's docs describe the repository, not the plugin; nothing the
  record, report or PR cites may need the plugin installed to read.
- **Branch review**: when a remote exists and you have permission, require PRs
  and mark the verify check required —
  `gh api repos/{owner}/{repo}/branches/{branch}/protection` or the platform
  equivalent. Never weaken protection that already exists. No permission: put
  the exact commands in the report.

## 4. Verify — every gate must be shown to fail

The wiring is not done until each capability has refused a bad input:

1. Stage a deliberately mis-formatted file → commit refused; formatter fixes
   it → commit passes.
2. Commit message `wip` → refused; conventional message → passes.
3. Stage a fake credential (e.g. an AWS key shape) → refused. Use an obvious
   dummy, and delete it after.
4. Break a test (or add a failing one on a scratch branch) → `verify` and the
   push hook refuse; restore → green.
5. Run the full `verify` clean, and — when a remote exists — push a branch,
   open a PR, and watch the CI check go green before calling CI wired.

Existing repository: `verify` may reveal pre-existing failures. Do not fix the
world in the bootstrap; scope hooks to staged/changed files, get `verify`
green if the fixes are mechanical (formatting), and otherwise record the
failures as the repository's first audit findings.

## 5. Report

End with: capabilities wired and their tools; anything `off` and who owns it;
gates demonstrated failing (quote the refusal); baseline CI state before and
after; remaining gaps with exact commands. On an existing repository, land the
whole change as one PR on a branch — never direct to the default branch.
