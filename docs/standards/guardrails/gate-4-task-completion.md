---
type: reference
summary: The branch-scoped size gate — change size only, the one measure no single commit shows.
read_when: Finishing a unit of work, or deciding whether a change-size finding should stop the work.
---

<!-- cspell:ignore shortstat symref -->

# Gate 4 — Task completion

Fires when a unit of work is declared finished: an automated worker handing back
a task, or a person about to open a pull request. Same checks, same thresholds,
same verdicts — the trigger differs because the workflows do, not because the
standard does.

Measures the **whole branch against its base**, so it catches accumulation that
no single commit shows. Collects every finding before reporting — no stop at the
first failure, because the author wants the full list once.

| #   | Check       | Type | Measures                                | Applies to                                     | Warn band | Error band | Override        |
| --- | ----------- | ---- | --------------------------------------- | ---------------------------------------------- | --------- | ---------- | --------------- |
| 1   | Change size | Size | Added + deleted lines across the branch | Production, configuration and tooling together | Push back | Block      | Recorded marker |

Change size is the one measure that needs this gate's branch scope: added plus
deleted across the whole branch is a number no single commit shows. Per-file and
per-function measures do not need it, and they are not here:

- **File length** is enforced at [gate 2, check 18](gate-2-commit.md), over the
  staged blob — a file is over its limit at every moment, not only across a
  branch, so the commit that causes it is where it is refused
  ([ADR-0019](../../ADR/0019-file-length-at-commit.md)).
- **Complexity, function length, parameter count and nesting depth** are
  enforced by [gate 2's check 11](gate-2-commit.md), which runs the repository's
  eslint config over staged files. That config carries `complexity`,
  `max-lines-per-function`, `max-params` and `max-depth` at their error values
  ([thresholds](thresholds.md#the-stacks-analysers-win)). A second pass here
  measured the same thing with the same tool a second time.
- **Agent-context length** — lines per agent-facing document — is implemented in
  [gate 6](gate-6-pull-request.md) (`scripts/gate-6-pull-request.mjs`), where
  its finding reads `gate 4 — agent-context length`. That label is a misnomer
  this record corrects: the check runs at gate 6, against `HEAD:<file>`, not at
  gate 4. Moving the code is a separate question.

A second copy of any of these at gate 4 could never fire, because gate 2 already
refused the commit — a check that reads green while unable to fail, which is the
defect class this repository exists to catch.

**The base is derived (`resolveBase()`), or given.** Invoked with no
argument — the Stop hook, on every hand-off — it derives the base from
`origin/HEAD` the same as every other local gate. Invoked with a base
already resolved by a caller (`hooks/gate-4-task-completion.mjs <base>`),
that value wins outright and `resolveBase()` is never consulted.
[Gate 6](gate-6-pull-request.md) takes this path, passing the base it
already resolved from `GITHUB_BASE_REF` rather than letting the subprocess
re-derive one that needs `origin/HEAD` — a symref a CI checkout may never
set ([a check that skips on every surface it runs on has not been
skipped](cross-gate-rules.md#a-check-that-skips-on-every-surface-it-runs-on-has-not-been-skipped)).

**One more fact, not a refusal: how many commits on the branch are not on the
remote.** The hook reports it for the reviewer the work is handed back to — the
same shape as the size fact — and stops there. It does not push:
pushing would act on the agent's own claim of completion (the claim this
workflow does not trust — the agent commits, a reviewer verifies by
measurement, then pushes), it is outward-facing and irreversible, and gate 4
taking gate 5's action collapses two gates. Where the fact cannot be
established — no remote configured, no upstream tracking branch, a detached
HEAD — it is a skip with a reason, never a silent zero, so "cannot tell" does
not read as "nothing to push".

## Push back is not a warning

Push back is defined in
[the verdict table](../guardrail-standards.md#verdicts): it stops and asks, and
the answer is a resolved decision record. Two things that table cannot carry:

**The options are named, both of them** — split it, or state why this one is
justified. A push back that offers only the first is an instruction wearing a
question.

**Resolved, not open.** An open record is a question still being asked; the gate
is satisfied by the decision, not by the discussion. An answer anywhere else —
a commit message note, a comment, a chat transcript — cannot be found by the
reviewer or the pipeline, which leaves the push back indistinguishable from a
warning that was ignored.

Change size counts production, configuration **and** tooling together as one
number, because it is one number about one branch: a change of four hundred
configuration lines and one of four hundred production lines both warrant the
same question, and a mixed total is not made safe by its composition. Test and
documentation lines are excluded entirely, for a stronger reason: a threshold
that punishes tests teaches the worker to write fewer of them.

**Push back in an unattended run.** [Gate 6](gate-6-pull-request.md) has nobody
to ask. A finding that pushes back locally becomes, server-side, a check for the
recorded answer: for change size, a human-approved row in [the change-size
override register](registers.md#the-change-size-override-register), matched by
branch — the bare `[large-pr]` string is not enough on its own
([an override is not a fix](cross-gate-rules.md#an-override-answers-a-push-back-it-is-not-a-fix)).
No answer on record is a failure there, which is what stops push back from
degrading into a warning the moment the author is not watching.

**An agent never applies the override marker on its own authority.** It
reports the counted size and what makes up the bulk — this check's own output
already does that — and the marker is applied by, or on the explicit
instruction of, the human who also fills in the register row's Approved by
cell. Locally, the bare marker still clears this check for an author present
to have typed it; the register requirement above is the unattended half.

## Running it by hand

| Check           | Command                                                                                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change size     | `git diff --shortstat origin/main...HEAD -- <production, config and tooling paths>`                                                                                                           |
| Override marker | `git log origin/main..HEAD --format=%B \| grep '\[large-pr\]'` (clears this check locally; gate 6 additionally requires a human-approved row — `node scripts/check-change-size-override.mjs`) |

`lizard` — the general-purpose complexity backstop — runs at
[gate 7](gate-7-on-demand.md) with the other heavyweight checks rather than on
every hand-off
([cost tiers](cross-gate-rules.md#checks-are-tiered-by-cost-and-the-tier-decides-the-gate)).

## Verification

- [ ] A branch over the error threshold is blocked, and the override marker
      unblocks it locally — for an author present to have typed it.
- [ ] The bare marker does not unblock the merge at gate 6 without a
      human-approved row in the change-size override register, matched by
      branch ([an override is not a fix](cross-gate-rules.md#an-override-answers-a-push-back-it-is-not-a-fix)).
- [ ] An agent reports the counted size and what makes up the bulk; it does
      not apply the override marker on its own authority.
- [ ] A branch whose size comes entirely from `tooling` files still pushes
      back in the warn band — change size does not exempt any counted class
      from the question.
- [ ] The push back names both options — split, or justify — and the answer is a
      resolved decision record, not a note or a transcript.
- [ ] A push back left unanswered fails the pull request pipeline rather than
      passing silently.
- [ ] Tests and documentation do not count toward change size.
- [ ] All findings are reported in one pass, not one per run.

## References

- [Thresholds](thresholds.md) — the bands, and when the stack's analyser overrides them.
- [Gate 2 — Commit](gate-2-commit.md) — where file length and complexity are
  refused, at the commit that causes them.
- [Agent integration](agent-integration.md) — firing this gate in every harness.
- [File classes](file-classes.md) — which class a file is in, and therefore its verdict.
- [Gate 6 — Pull request pipeline](gate-6-pull-request.md) — where an unanswered
  push back is caught, and where the agent-context length check actually runs.
- [Registers](registers.md#the-change-size-override-register) — the
  change-size override register the merge gate checks.
- [Cross-gate rules](cross-gate-rules.md#an-override-answers-a-push-back-it-is-not-a-fix) —
  why the marker alone is not enough server-side.
- [ADR-0019](../../ADR/0019-file-length-at-commit.md) — why file length moved to
  gate 2, and why a gate-4 copy was rejected.
