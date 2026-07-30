---
type: reference
summary: How a required status check actually blocks a merge — the branch-protection configuration gate 6 depends on, the script that applies it, and the check that makes its absence a finding.
read_when: Setting up gate 6 on a new repository, auditing whether a required check truly blocks, or investigating a pull request that merged despite a red check.
---

<!-- cspell:ignore idempotently -->

# Branch protection

[Gate 6](gate-6-pull-request.md) states the merge policy — required status
checks, required review, no self-approval, stale-approval dismissal,
conversation resolution, no admin override, no force push, no deletion,
required history shape — as _"evidence and verdicts are inert unless the
platform refuses the merge."_ That sentence names the principle and supplies
no mechanism: nothing in this toolkit ever configured the platform, and
nothing ever checked whether someone else had. Every audit of this toolkit
that looked found the same gap: a red `gate 6` check, or a red platform-native
scanner check built from the SARIF gate 6 uploads, blocked nothing, because
branch protection was never turned on.

**Why it recurred.** No committed script can reach into a host's settings —
that is what makes it host configuration rather than code — so the standard
had prose and nothing that acted on it. This document and the two scripts
beside it close that: one applies the configuration, the other makes its
absence, or its drift from what gate 6 actually runs, a finding rather than a
silent pass.

## The two halves

| Half                      | What it does                                                                                          | Where                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Supply the mechanism      | Configures branch protection on the default branch, idempotently, from a local authenticated session  | `scripts/configure-branch-protection.mjs`                       |
| Make the absence blocking | Reads live protection back and reports every gap as a finding, never a silent skip for "unconfigured" | `scripts/check-branch-protection.mjs`, wired into gate 7 and CI |

Both read the same two things, so they can never drift from each other or
from what gate 6 actually runs:

- **The branch** — `origin/HEAD`, the same derivation every other gate in
  this toolkit uses ([`resolveBase`](../../../hooks/lib/run.mjs)). Never
  hardcoded to `main`: a repository whose default branch is named anything
  else configures and checks the branch it actually has, not a guess.
- **The required status check contexts** — derived from
  `.github/workflows/pull-request.yml`'s own job name(s), expanded across
  any matrix a job's name interpolates
  (`deriveRequiredContexts` in `scripts/check-branch-protection.mjs`). Not
  hand-typed: a matrix job's reported context (`gate 6 (ubuntu-latest)`,
  `gate 6 (windows-latest)`) has to match branch protection's required list
  character for character, and a workflow that gains a job or a matrix leg
  changes what is required automatically the next time either script runs —
  nobody has to remember to update a second, hand-maintained list.

## Configuring it: `scripts/configure-branch-protection.mjs`

Run with `node scripts/configure-branch-protection.mjs`, using the `gh` CLI
session already authenticated on the machine running it (an agent's own
session during [repository bootstrap](../../../skills/repository-bootstrap/SKILL.md),
or a maintainer's). It:

1. **Visibly skips, never guesses**, when `gh` is not on `PATH` or is not
   authenticated (checked with `gh api user`, not `gh auth status` — see
   below), when there is no GitHub remote to resolve, or when
   `.github/workflows/pull-request.yml` does not exist yet. Every skip names
   the reason on stderr.
2. **Refuses to configure protection with an empty required-checks list.**
   Deriving zero contexts from the workflow is treated as a defect in the
   derivation, not "protect the branch with nothing required" — the one
   failure mode that would look like success.
3. **Applies one full-replace `PUT`** to
   `repos/:owner/:repo/branches/<branch>/protection`: required status
   checks (`strict: true`, one entry per derived context), `enforce_admins`,
   one required approving review with stale approvals dismissed,
   conversation resolution required, force pushes and branch deletion
   refused, and a required linear history. The endpoint replaces the whole
   configuration on every call, which is what makes the script **idempotent**
   — running it again applies the same intended state, and running it after
   the workflow gains a job or a matrix leg picks up the new required check
   without anyone editing a second file by hand.
4. **Never claims success without checking.** After the `PUT`, it re-reads
   branch protection and runs the identical verdict function
   `check-branch-protection.mjs` uses (`evaluateBranchProtection`) against
   what actually came back. A plan restriction or a partial write that
   silently dropped one field is reported, not assumed from the `PUT`'s own 200.

`gh api repos/:owner/:repo/...` — the `:owner`/`:repo` placeholders resolve
from the current checkout's GitHub remote; no separate lookup is needed, and
none is hardcoded.

### `gh auth status` is the wrong authentication probe

Verified directly, not assumed: on a machine with more than one `gh` account
in its keyring, `gh auth status` exits non-zero the moment **any** account is
stale — even when the active account this process would actually use is
fine. Both scripts probe with `gh api user` instead, which exits 0 exactly
when the identity this process will actually authenticate as resolves.

### A private repository without GitHub Pro cannot be protected

GitHub gates the branch-protection API behind GitHub Pro (or the repository
being public) on the free plan — verified on this toolkit's own repository:
`gh api repos/:owner/:repo/branches/main/protection` returned `403 Upgrade to
GitHub Pro or make this repository public to enable this feature`. Neither
script treats that as "unconfigured": a 403 is a **visible skip** naming the
cause, because the token genuinely cannot tell, and reporting it as a finding
would be indistinguishable from a repository that could be protected and
simply was not.

## Verifying it: `scripts/check-branch-protection.mjs`

Wired into [gate 7](gate-7-on-demand.md) (the local `gh` session a human or
agent running it already has) and a scheduled CI workflow
(`.github/workflows/branch-protection-audit.yml`, which needs a repository
secret carrying a personal access token with repository admin read — the
default `GITHUB_TOKEN` cannot read branch protection at all, the same
restriction the configuration half hits on a private free-plan repository).

Three states, the same discipline as every check in this toolkit:

| State                                                              | Reported as                                                                              |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `gh` missing, unauthenticated, no GitHub remote, or a 403          | A visible **skip**, naming the reason — never a finding standing in for "could not tell" |
| Branch protection genuinely unconfigured (404)                     | A **finding** — the exact gap audit 8 found                                              |
| Configured, but missing a required check, or any of policies 16-24 | One **finding per gap**, naming what is missing                                          |
| Fully agrees with what gate 6 actually runs                        | A pass                                                                                   |

The pure verdict (`evaluateBranchProtection`) and the workflow-parsing
(`deriveRequiredContexts`) are exported and unit-tested directly against
constructed fixtures — the live-`gh` orchestration around them
(`checkBranchProtection`) takes its four collaborators (`have`, `run`,
`resolveBase`, `readFile`) as injectable parameters, so every skip path and
the unconfigured-finding path are proven without a live `gh` session or
network access in the test suite itself
(`hooks/test/hooks.test.mjs`).

## A deliberate simplification

`deriveRequiredContexts` supports a single-axis `matrix.<key>: [a, b, ...]`
job — this toolkit's own `pull-request.yml`, and the common one-dimensional
case (`matrix.os`, `matrix.node-version`). A job whose name interpolates two
matrix axes, or a matrix built from `include`/`exclude` rather than a flat
list, is not expanded correctly. Upgrading that is deferred until a workflow
actually needs it, rather than reaching for a YAML-parsing dependency to
parse a handful of files this toolkit itself writes — this toolkit bundles no
tooling it can resolve from `PATH` or write directly instead
([ADR-0002](../../ADR/0002-analysis-tool-distribution.md)), and a YAML
parser for a file format this small is exactly the "write it directly"
side of that line, not a gap the line was written to fill.

## Running it by hand

| Purpose                                                            | Command                                                  |
| ------------------------------------------------------------------ | -------------------------------------------------------- |
| Configure branch protection                                        | `node scripts/configure-branch-protection.mjs`           |
| Inspect the live configuration                                     | `gh api repos/:owner/:repo/branches/<branch>/protection` |
| Run the audit standalone (exits non-zero on a gap)                 | `node scripts/check-branch-protection.mjs`               |
| Confirm an authenticated identity, ignoring stale keyring accounts | `gh api user`                                            |

## Verification

- [ ] `gh api repos/:owner/:repo/branches/<default-branch>/protection`
      returns 200, not 404.
- [ ] Every job name `.github/workflows/pull-request.yml` reports, matrix
      legs expanded, appears character for character in
      `required_status_checks`.
- [ ] `enforce_admins.enabled` is `true`.
- [ ] `required_pull_request_reviews.required_approving_review_count` is at
      least 1, and `dismiss_stale_reviews` is `true`.
- [ ] `required_conversation_resolution.enabled` is `true`.
- [ ] `allow_force_pushes.enabled` and `allow_deletions.enabled` are both
      `false`.
- [ ] `required_linear_history.enabled` is `true`.
- [ ] Re-running `configure-branch-protection.mjs` a second time changes
      nothing (idempotent).
- [ ] A workflow file with a mutable action tag or a hand-typed check name
      that no longer matches the job's real reported context is caught by
      re-running `check-branch-protection.mjs`, not discovered the next time
      a pull request merges anyway.
- [ ] `configure-branch-protection.mjs` refuses to run with an empty derived
      required-checks list rather than protecting the branch with nothing
      required.

## References

- [Gate 6 — Pull request pipeline](gate-6-pull-request.md) — the merge
  policy (16-24) this configures and verifies.
- [Cross-gate rules](cross-gate-rules.md) — "every blocking local check has a
  named required status check server-side," the rule this closes.
- [Skills: repository bootstrap](../../../skills/repository-bootstrap/SKILL.md) —
  where configuring protection is a named adoption step.
