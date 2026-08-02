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

One job, running the repository's own `verify` command on every pull request:
[templates/github/guardrails.yml](../../../templates/github/guardrails.yml)
for GitHub Actions; translate the same three steps (checkout, toolchain
setup, `verify`) for other platforms. Pin action versions. If a pipeline
already exists, add the verify job into it rather than adding a second
workflow, and keep its existing jobs untouched.

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
