---
type: reference
summary: The expensive local tests, run once per push — coverage and integration; the cross-file documentation checks (repo-wide markdown lint and link integrity); and the cross-stack dependency scan. End-to-end needs a deployment and runs later.
read_when: Deciding which kind of test something is, or why an end-to-end test must not run at push time.
---

<!-- cspell:ignore oneline govulncheck -->

# Gate 5 — Push

The expensive tests live here. They run once per push rather than once per
commit, and they judge the whole range being pushed.

| #   | Check                                     | Type          | Runs for                    | Fails when                                                         |
| --- | ----------------------------------------- | ------------- | --------------------------- | ------------------------------------------------------------------ |
| 1   | Coverage                                  | Correctness   | The repository              | The coverage command exits non-zero                                |
| 2   | Integration tests                         | Correctness   | Changed components only     | An integration test for a changed component fails                  |
| 3   | Cross-stack dependency scan (osv-scanner) | Security      | The resolved dependency set | osv-scanner reports an advisory with no accepted record            |
| 4   | Branch behind its base                    | Policy        | The branch being pushed     | `git rev-list --count HEAD..<base>` is greater than zero           |
| 5   | Markdown lint (repo-wide)                 | Documentation | Every tracked markdown file | A structural prose rule is violated in any tracked file            |
| 6   | Link and anchor integrity                 | Documentation | The documentation corpus    | A link resolves to nothing, or names a heading that does not exist |

Check 4 is not about correctness — the merge would have been refused anyway,
because [gate 6's own merge policy](gate-6-pull-request.md#63-merge-policy)
already requires the branch to be up to date with its base before it can
merge. It is about not spending a pipeline run finding that out: the cost of
being wrong is one rebase, the cost of being right and not checking is a
wasted run and a pull request whose result is about to change under the
reviewer. **Refuses rather than warns** —
[no gate emits a warning it does not treat as a
failure](cross-gate-rules.md#a-warning-is-a-failure) — and names the exact
remedy, `git rebase <base>`, rather than leaving the author to work out what
"behind" means to do about it.

The base is **derived**, the same `resolveBase()` (`scripts/lib.mjs`) every
other check in this corpus uses, never a hardcoded `main`; an unresolvable
base is a visible skip naming the remedy, the same convention
`check-protected-branch.mjs` and [gate 0](gate-0-baseline.md) already follow,
not a silent pass. It **fetches first** so the comparison is against a
current ref, not a stale one; where the fetch itself fails — no network, an
unreachable remote — the check still runs against whatever `origin/<base>`
already resolves to locally, and says so in the finding rather than
presenting a possibly-stale comparison as a settled one. Pushing while
offline is not this check's business to refuse; being honest about what it
compared against is.

Check 3 is not component-scoped like check 2 — it reads the resolved
dependency set, the same repository-wide shape check 1 already has, not the
files the push touched. Placed here rather than gate 2 because it is
network-bound (it queries the OSV database), and gates 1 and 2 fire on every
edit or commit ([placing-a-new-check](placing-a-new-check.md)). It does not
replace a stack's own scanner (`govulncheck`, `cargo audit`, and so on) —
those stay where they are faster or more precise; this is the
general-purpose backstop that runs regardless
([cross-gate rules](cross-gate-rules.md#checks-are-tiered-by-cost-and-the-tier-decides-the-gate)).
External, resolved from `PATH`, never bundled — the same treatment as
semgrep and lizard ([ADR-0002](../../ADR/0002-analysis-tool-distribution.md)).

Checks 5 and 6 are the cross-file half of the documentation gate, and they
live here for the same reason: neither can be judged from a single staged file.
Check 5 sweeps the structural prose rules (heading style, fence languages,
spacing) across every tracked markdown file — the same rules [gate 2's check
5](gate-2-commit.md) applies per-file to the staged subset — because a pushed
series is where the complete set exists. Check 6 reads link and anchor
integrity over the whole corpus: when a file moves, the broken links live in
files nobody staged this commit, so the commit gate is the wrong place for it.

The two scopes are chosen at the call site, not held in shared configuration.
`.markdownlint-cli2.jsonc` carries the `ignores` only; gate 2's lint-staged
passes the staged paths (per-file), and check 5 passes the `**/*.md` glob
itself. A `globs` entry in the shared config is combined with lint-staged's
arguments and widens every commit to the whole tree — the defect the split
closed ([scope-split spec](../../specs/2026-08-01-markdown-gate-scope-design.md)).
An intermediate commit in a series may carry a broken cross-document link and
remain pushable, provided the series ends consistent — already true of every
other change-scoped gate, so consistent rather than new.

The command that owns the coverage floor also runs the unit suite, so a
non-zero exit has three possible causes, not one: a failing unit test, a
genuine coverage shortfall, or the command itself failing to run. The gate
distinguishes them from the command's own output rather than reporting one
compound finding that cannot name its own cause — the test runner's own
summary line names a failure count regardless of what coverage did, and the
coverage tool's own threshold message only prints once the suite passed and
coverage alone fell short. Where none of that is present but the command
still exited non-zero, it is reported as exactly that: the command did not
run to completion, never guessed as a shortfall.

## Why end-to-end tests are not here

An end-to-end test is black box against a **deployed** environment, so it cannot
run at push time by definition — there is nothing deployed. It runs where a
deployment exists: against an ephemeral environment in the
[pipeline](gate-6-pull-request.md), or after a real deployment at
[gate 8](gate-8-release.md).

What runs here is **integration**: orchestration across code this repository
owns, with externals stubbed. It may stand up a real database or broker in a
disposable container — that is still integration, because everything being
exercised is yours and nothing is deployed.

Three reasons the boundary is a hard line rather than a preference. A deployment
makes a developer's push depend on infrastructure being available and on their
holding credentials for it. Its runtime is minutes to tens of minutes, which
pushes people toward bypassing the gate. And it is shared state — two pushes
racing on one environment produce failures that belong to neither change.

## Running it by hand

| Check                       | Node                                     | .NET                                               |
| --------------------------- | ---------------------------------------- | -------------------------------------------------- |
| Coverage                    | `npm test -- --coverage`                 | `dotnet test --collect:"XPlat Code Coverage"`      |
| Integration tests           | `npm run test:integration`               | `dotnet test --filter Category=Integration`        |
| End-to-end tests            | `npx playwright test`                    | `dotnet test --filter Category=EndToEnd`           |
| Cross-stack dependency scan | `osv-scanner --format json -r .`         | `osv-scanner --format json -r .`                   |
| Markdown lint (repo-wide)   | `npm run lint:md`                        | `markdownlint-cli2 "**/*.md"` (or the stack's own) |
| Link and anchor integrity   | `node scripts/check-links.mjs`           | the repository's own docs command                  |
| Branch behind its base      | `git rev-list --count HEAD..origin/main` | `git rev-list --count HEAD..origin/main`           |
| The pushed range            | `git log --oneline origin/main..HEAD`    | —                                                  |

The offline test is the one worth running deliberately: disable network access,
clear any infrastructure credentials, and run the suite. Anything that fails was
reaching outside the repository's own boundary and is not an integration test.

## Verification

- [ ] Coverage below the floor blocks the push, reported as a coverage
      finding, not folded into a compound "test or coverage" verdict.
- [ ] A failing unit test surfacing here is reported as a test failure, not
      misattributed to coverage merely because they share one command.
- [ ] A broken coverage command blocks the push without claiming a shortfall.
- [ ] A check with no command configured reports a visible skip, never a silent pass.
- [ ] Only components touched by the pushed range run their tests.
- [ ] A failing integration test blocks the push, and the failure names the
      component and the test.
- [ ] Every test in this gate passes with no deployed environment reachable and
      no infrastructure credentials present.
- [ ] No test in this gate provisions, deploys to, or reads a shared environment.
- [ ] Integration tests that need a database or broker get it from a disposable
      container the run creates and destroys.
- [ ] End-to-end tests exist, and run at gate 6 or gate 8 rather than here.
- [ ] The cross-stack dependency scan reports a visible, named skip when
      osv-scanner is not on `PATH` — never a silent pass.
- [ ] The cross-stack dependency scan still runs for a stack that already has
      its own specialised advisory scanner, rather than being excluded from it.
- [ ] osv-scanner's own exit code is never the finding by itself: the check
      parses its structured `--format json` output for a named advisory id.
      A non-zero exit with none reports unavailable — the same visible,
      named skip as the tool being absent — never a finding with no
      identifier in it ([cross-gate-rules.md](cross-gate-rules.md#a-refusal-is-a-diagnosis)).
- [ ] A push from a branch behind its base is refused, and the message names
      the distance and the remedy (`git rebase <base>`), not merely that a
      problem exists.
- [ ] The base is derived (`resolveBase()`), never a hardcoded `main`; an
      unresolvable base is a visible skip naming the remedy, not a silent
      pass.
- [ ] The check fetches first; where the fetch fails, the comparison still
      runs and the result says it may be stale, rather than refusing to
      compare at all or presenting a stale comparison as current.
- [ ] A branch level with, or ahead of, its base passes this check.
- [ ] A markdown file breaking a structural prose rule is refused at push, even
      when the committing series never staged it on a single commit — the
      repo-wide sweep runs here, where the complete set exists.
- [ ] A broken cross-document link — one document pointing at a heading another
      does not expose — is refused at push, naming the file and the anchor that
      does not resolve.
- [ ] A series whose final state is consistent is pushable, even if an
      intermediate commit carried a link that did not yet resolve.
- [ ] A renamed document leaves no dead link anywhere in the corpus at push.

## References

- [Components](components.md) — what scopes check 2; check 3 is
  repository-wide instead, like check 1.
- [Gate 6 — Pull request pipeline](gate-6-pull-request.md) — changed-line
  coverage, and where deployment-dependent tests may run.
- [Gate 8 — Release](gate-8-release.md) — where they run otherwise.
- [Testing strategy](../testing-strategy.md) — what belongs in each kind this
  gate runs, and how the coverage command is configured.
