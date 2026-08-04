# Stack-neutral capabilities

These wire the same way whatever the stack.

## `secrets`

Prefer a staged-files scan at commit (Node repos: secretlint via lint-staged;
otherwise gitleaks `protect --staged`) plus the host's own secret scanning
(GitHub: enable secret scanning + push protection —
`gh api -X PATCH repos/{owner}/{repo} -f security_and_analysis...` or note the
setting for the owner).

## `spelling`

cspell works on any tree (it is a dev-tool, not a stack commitment). Seed the
project dictionary during bootstrap — proper nouns, stack terms — so the gate
starts green. A repository that objects records `off` with a reason.

## `commit-messages`

Conventional commits via commitlint (any stack — it needs only Node in the
dev environment) or the stack's equivalent (e.g. `gitlint` in a
Python-only shop). The type set is the conventional default; do not invent
types.

## `ci-verify`

One job, running the repository's own `verify` command on every pull
request. Coverage is made visible on the PR with the platform's own
mechanic — GitHub: append the runner's text summary to
`$GITHUB_STEP_SUMMARY` (see the template's Coverage step); other platforms:
their native report publishing. The enforced floor and the visible figure
come from the same run.

Template:
[templates/github/guardrails.yml](../../../templates/github/guardrails.yml)
for GitHub Actions; translate the same three steps (checkout, toolchain
setup, `verify`) for other platforms. Pin action versions. If a pipeline
already exists, add the verify job into it rather than adding a second
workflow, and keep its existing jobs untouched.

## `supply-chain`

Platform tooling first — each is one toggle, no code:

- **Advisories**: Dependabot alerts + security updates
  (`gh api -X PUT repos/{owner}/{repo}/vulnerability-alerts` and
  `.../automated-security-fixes`), or the platform's equivalent.
- **Release age**: the package manager's own window — npm ≥ 11.6:
  `min-release-age=7` (days) in `.npmrc`
  (`templates/node/npmrc`). Blocks freshly-published versions, the
  supply-chain attack's favourite hour.
- **Static security scan (SAST)**: CodeQL default setup
  (`gh api -X PATCH repos/{owner}/{repo}/code-scanning/default-setup -f state=configured`),
  free on public repositories.

**Backup tools where the platform's are unavailable** (self-hosted git, no
Advanced Security): `osv-scanner` for advisories, `semgrep` with a stack
rule pack for SAST, `lizard` for complexity where the linter has no rule —
each runs fine as a CI step; record whichever is used in
`.guardrails.json`.

**Dependabot config location**: exactly `.github/dependabot.yml` — placed in `.github/workflows/` it is silently ignored and Dependabot never runs; verified the mistake live. Under .NET CPM and for CI action tags, resolve current versions the same way as packages: `dotnet add package` writes the current version into Directory.Packages.props, and an action major is checked against its releases page — both were written from memory in round 2 and were stale.

**Dependabot auto-merge.** Patch/minor updates can merge themselves once
the required `verify` check passes:
[templates/github/dependabot-auto-merge.yml](../../../templates/github/dependabot-auto-merge.yml)
plus the repository setting (`gh api -X PATCH repos/{owner}/{repo} -F allow_auto_merge=true`).
Majors always wait for a human. A required _review_ also blocks
auto-merge — on a solo-maintainer repository pick one: reviews off, or a
ruleset with Dependabot as a bypass actor.

## `branch-review`

- Default branch takes changes by PR only.
- The verify job is a required status check.
- `CODEOWNERS` covers `.guardrails.json` (and itself), so guardrail changes
  and opt-outs get a human review — this is the whole approval system.

GitHub: `gh api repos/{owner}/{repo}/branches/{branch}/protection` with
`required_status_checks` and `required_pull_request_reviews`, or
repository rulesets. **Set `enforce_admins: true`** — without it the owner
bypasses everything, and an agent running with the owner's token is exactly
the actor this capability exists to stop; proven live during E2E, where a
direct push to a "protected" branch succeeded until it was enabled. Never
weaken existing protection; only add. Without admin permission, emit the
exact commands in the report instead.

**Solo maintainer**: GitHub refuses self-approval, so a required review
deadlocks a one-account repository. Drop the review requirement, keep
everything else — PR-only, required `verify` check, `enforce_admins`,
linear history. Ratification still holds: nothing reaches the default
branch except through a PR the human opened or merged deliberately; what
is lost is only the second pair of eyes, and that is a fact about the
team, not the tooling.
