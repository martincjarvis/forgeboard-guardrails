---
type: explanation
status: Proposed
decided: 2026-08-02
owner: Toolkit maintainers
summary: File length is enforced at gate 2 over staged content, not at gate 4; gate 4 keeps change size, the one measure that genuinely needs branch scope. Checking at both gates was rejected because gate 4's copy could never fire once gate 2 refuses the commit. The code-shape warn band is removed — a warning is a hint for an agent to act on before it commits, and anything surviving to a gate is an error.
read_when: Asking why file length blocks at the commit gate rather than at task completion, or why the warn band is gone.
---

<!-- cspell:ignore cyclomatic -->

# File length is enforced at the commit gate

## Decision

- **File length is a gate-2 check** (check 18), read over the staged blob for
  production and test files, generated files exempt, no warn band.
- **Gate 4 keeps change size only** — added plus deleted across the branch,
  the one measure no single commit shows.
- **Complexity, function length, parameter count and nesting depth needed no
  move.** Gate 2's check 11 already runs the repository's eslint config over
  staged files, and that config carries `complexity`, `max-lines-per-function`,
  `max-params` and `max-depth` at their error values. Gate 4's own eslint pass
  measured the same thing with the same tool a second time.
- **The warn band is removed**, for file length and the other code-shape
  measures alike.

## Why

Gate 4 exists to measure what no single commit shows — change size, added plus
deleted across a branch. That branch scope is its whole reason for existing.

File length is not that. A file is 900 lines at every moment, not only when
viewed branch-wide. The defect is visible at the commit that causes it, so the
commit is where the gate refuses it: caught there the fix is extracting one
function; caught 500 lines later it is a redesign.

## The warn band goes too

Under a clean-build principle a warning is a hint for an agent to act on _before_
it commits; anything surviving to a gate is an error. Test files therefore block
like any other file rather than warning past the band and carrying on.

`hooks/lib/thresholds.mjs` is the single declaration both the eslint config and
the gates import, and a threshold is the last acceptable value — 15 passes, 16
blocks — the reading eslint's own rule options already take.

## Rejected: check at both gates

Gate 4 could have kept its own copy of the file-length check. Rejected because
that copy could never fire: gate 2 refuses the over-length commit first, so the
gate-4 check reads green on every input it can ever receive. A check wired but
structurally unable to fail is the defect class
[every blocking check proves it refuses](../standards/guardrails/cross-gate-rules.md#every-blocking-check-proves-it-refuses)
exists to catch — the same shape as a check declared but never invoked, both
presenting as green to a reader who checks only the surface. This repository
exists to catch that class; it does not ship a second instance of it.

## Evidence

`scripts/gate-6-pull-request.mjs` reached 798 lines through dozens of commits
that each passed gate 4 — a per-file measure enforced only at a branch-scoped
gate let the file grow unbounded, because no single commit crossed the branch
threshold. Six files sat over the band at the start of this work.

## What would re-open it

- **The move.** Re-opened if file length were shown to need branch scope — that
  is, if a file's length only became a defect in aggregate across a branch
  rather than at each commit. That contradicts what file length is (a per-file
  property, true at every moment), so it would take a different measure, not a
  new reading of this one.
- **The rejected copy.** Re-opened if gate 2 stopped refusing over-length files,
  so a gate-4 copy became load-bearing again. As long as gate 2 refuses first,
  the copy is dead.
- **The warn band.** Re-opened if a reliable, agent-visible warning channel
  existed that gates could depend on agents reading and acting on before
  commit. The model here is the opposite — an agent commits, a reviewer
  verifies by measurement — so a gate sees only what survived that process, and
  what survives is an error.

## References

- [Gate 2 — Commit](../standards/guardrails/gate-2-commit.md) — check 18, where
  file length is now refused.
- [Gate 4 — Task completion](../standards/guardrails/gate-4-task-completion.md) —
  now change size only.
- [Thresholds](../standards/guardrails/thresholds.md) — the band semantics, and
  where the stack's analysers win.
- [Cross-gate rules](../standards/guardrails/cross-gate-rules.md#every-blocking-check-proves-it-refuses) —
  a check that cannot fail is the defect class the rejected alternative would
  have reintroduced.
