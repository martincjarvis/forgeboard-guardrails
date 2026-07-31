---
type: explanation
status: Proposed
decided:
owner: Toolkit maintainers
summary: hooks/test/hooks.test.mjs is split by subject area into an entry point plus per-area files, because lizard's function-span detection merges adjacent functions into one over-length block once the file reaches a certain size, and gate 6 — unlike gate 7's identical, report-only invocation of the same scan — hard-blocks on the artefact with no suppression path. Warn-not-block at gate 6, and a tool-artefact register row, are named and rejected.
read_when: Asking why hooks/test/hooks.test.mjs is a thin entry point rather than the whole suite, or why a check copied between gates needs its severity model stated alongside it.
---

<!-- cspell:ignore misparse misparses misparsed -->

# The ported test suite is split by subject area, not left to grow into a false block

## The problem

`hooks/test/hooks.test.mjs` ships verbatim to every consuming repository —
[repository-bootstrap](../../skills/repository-bootstrap/SKILL.md) copies it
on commit one — and once the file reached its pre-split size, lizard's
function-span detection misparsed it: a stretch of ordinary, independent
`test(...)` calls was reported as one function spanning hundreds of lines,
tripping the file-length warning
(`docs/standards/guardrails/gate-7-on-demand.md`'s repository-wide scan:
`lizard -C 15 -L 100 -a 7`). `scripts/gate-7-on-demand.mjs` documents this
exact failure mode in its own comment: lizard's function-span detection does
fail here, and when it does, the remainder of the file is attributed to one
function. Gate 7 is report-only (`process.exit(0)` unconditionally) so the
artefact was visible but harmless there.

`scripts/gate-6-pull-request.mjs` reuses the identical lizard invocation —
deliberately, its own comment says "reused directly here rather than
invented twice" — but gate 6 **hard-blocks** on a non-zero lizard exit, and
there is no suppression path for it: the register mechanism
([registers.md](../standards/guardrails/registers.md)) covers findings a
human can mark inline (`nosemgrep`, `eslint-disable`), and a tool-parsing
artefact with no offending line to mark has nothing to attach a marker to.

Because `hooks/test/hooks.test.mjs` is ported into every consuming
repository's first commit, this was not a defect in the toolkit's own
history alone — it was a false block waiting in every future bootstrap,
tripped the first time a consuming repository's commit touched the file.

## Decision

**Split `hooks/test/hooks.test.mjs` by subject area.** `hooks/test/`
now holds:

- `hooks.test.mjs` — the suite's entry point. Imports every file below for
  its side effect of registering tests with `node:test`; carries no tests of
  its own.
- `support.mjs` — shared, non-test helpers (the throwaway git-repository
  builder, process wrappers, and the suppression-marker constants built by
  concatenation so they do not flag this suite's own source).
- Eleven subject-area files, each named for the gate or check it exercises
  (`gate-1-4-task-completion.test.mjs`,
  `gate-6-dependency-advisories-and-licence-policy.test.mjs`,
  `standards-instantiation.test.mjs`, and so on — see
  [hooks/README.md](../../hooks/README.md) for the full index).

`npm test`, `npm run test:coverage`, `scripts/gate-0-baseline.mjs`,
`scripts/pre-commit.mjs`, `scripts/gate-6-pull-request.mjs` and
`scripts/check-script-wiring.mjs`'s wiring declaration all still invoke or
name `hooks/test/hooks.test.mjs` — unchanged. The split is invisible to
every one of those call sites because the entry point's filename and role
(the thing you run to run the suite) did not change, only what it contains.

## Why not the two rejected alternatives

**Rejected: make the gate-6 lizard finding warn, not block.** This was
raised and would have worked, narrowly — it also throws away gate 6's
complexity/length backstop for every genuine finding of the same shape, not
only this artefact, because the check cannot distinguish "lizard merged
several functions into one bogus span" from "lizard correctly found one
enormous function." Softening the severity for everyone to unblock one
false positive is exactly the shape [ADR-0007](0007-pull-request-precondition-is-resolvability.md)
already rejected once for a different check: a general weakening to route
around a specific case.

**Rejected: add a tool-artefact register row.** The suppression register
exists for a finding a human can mark and point at
([registers.md](../standards/guardrails/registers.md)) — a line, a rule, a
reason. A parser misattributing 500 lines to one function has no such line;
a row here would have to name the whole file, forever, with nothing for a
future person to verify against except "lizard still does this" — an
opt-out with no removal condition anyone could check mechanically, the
shape [bypass-and-exceptions.md](../standards/guardrails/bypass-and-exceptions.md)
warns is how an exception stops being read.

Splitting the file was chosen because it is the only one of the three that
fixes the artefact rather than routing around it: the file that reached the
size lizard misparses no longer exists, on its own terms, without weakening
what gate 6 checks for anyone else.

## The objection, and how this decision was verified against it

An objection was raised and overruled, and it dictates how this fix was
checked, not just what it changed:

> The trigger is **cumulative file state**, not any one block. Isolating
> lines 1602–1629 alone into a standalone file did not reproduce the
> misparse. Splitting therefore fixes the file as it is today without
> establishing that it stays fixed as the suite grows.

So "the finding is gone" was not treated as sufficient evidence. Each of the
resulting files was run through `lizard -C 15 -L 100 -a 7` individually — the
exact invocation gate 6 and gate 7 both use — and every one reports `No
thresholds exceeded`. The objection also proved out empirically during the
split itself: one candidate grouping (dependency-advisories, licence-table
and licence-policy, licence completeness, and a register-row-decision
section, combined into a single ~540-line file) reproduced a _new_ merged
span on its own, smaller than the original file and containing none of the
originally-flagged lines — direct confirmation that the trigger is a
property of accumulated content within a file, not of any specific line
range. That file was split again, along its own next natural subject seam,
until each side scanned clean. **No file in the resulting split is treated
as permanently safe by virtue of being smaller** — each was verified
individually, and the margin below the threshold (below, per file) is the
evidence, not the split itself.

| File                                                       | Max function length (of 100-line warn threshold) | Max CCN (of 15) |
| ---------------------------------------------------------- | ------------------------------------------------ | --------------- |
| `gate-1-4-task-completion.test.mjs`                        | 32 (margin 68)                                   | 3 (margin 12)   |
| `gate-2-commit.test.mjs`                                   | 73 (margin 27)                                   | 1 (margin 14)   |
| `gate-6-dependency-advisories-and-licence-policy.test.mjs` | 48 (margin 52)                                   | 2 (margin 13)   |
| `gate-6-licence-register-row-decisions.test.mjs`           | 21 (margin 79)                                   | 1 (margin 14)   |
| `adr-approver-and-citations.test.mjs`                      | 46 (margin 54)                                   | 1 (margin 14)   |
| `links-and-suppressions.test.mjs`                          | 63 (margin 37)                                   | 1 (margin 14)   |
| `gate-5-push-and-scans.test.mjs`                           | 49 (margin 51)                                   | 4 (margin 11)   |
| `branch-and-repository-policy.test.mjs`                    | 49 (margin 51)                                   | 8 (margin 7)    |
| `gate-7-wiring-audits.test.mjs`                            | 48 (margin 52)                                   | 1 (margin 14)   |
| `standards-instantiation.test.mjs`                         | 98 (margin 2)                                    | 3 (margin 12)   |
| `tooling-class.test.mjs`                                   | 24 (margin 76)                                   | 6 (margin 9)    |
| `approval-provenance-and-pr-body.test.mjs`                 | 40 (margin 60)                                   | 3 (margin 12)   |
| `support.mjs`                                              | 16 (margin 84)                                   | 3 (margin 12)   |
| `hooks.test.mjs` (entry point)                             | 0 — no functions, import statements only         | —               |

`standards-instantiation.test.mjs`'s margin (2 lines) is the tightest of the
set, and is a genuine single test — a `findMultiComponentContent` case with
six nested, awaited `t.test()` subtests
([fix 58](../standards/guardrails/flaky-tests.md)'s nesting pattern) — not a
merge artefact; verified by reading the function's own source, not inferred
from the line count. The next person adding a seventh subtest there will
trip a real, deserved length warning, correctly, rather than the artefact
this record fixes.

The suite's test count is unchanged: 289 before the split, 289 after —
`node --test hooks/test/hooks.test.mjs` collects every `test()` and nested
`t.test()` across all twelve loaded files exactly as it did from the one
file before.

## The residual: a corpus rule this split does not close

Splitting fixes this file. It does not fix the rule underneath it, which is
now stated so the next check reused across gates does not repeat the gap:

**A check copied between gates carries its severity model with it, or the
difference is stated and justified.** Gate 6 took gate 7's lizard invocation
— deliberately, "reused directly here rather than invented twice" — without
also taking gate 7's report-only tolerance for exactly this parser failure
mode, and nothing recorded that difference as a decision at the time. See
[cross-gate rules](../standards/guardrails/cross-gate-rules.md#a-check-reused-across-gates-carries-its-severity-model-with-it)
for the rule as stated for an implementer.

## Consequences

- Every future bootstrap ports the split files, not the single oversized
  one — commit one no longer carries a file at the size where this artefact
  recurs.
- Adding a test to an existing subject area is a normal edit to that file.
  Adding a new subject area is a new file, imported by `hooks.test.mjs`
  alongside the others — the seam is the mechanism for staying split, not a
  one-time line count nobody revisits.
- Gate 6's lizard invocation keeps its full severity for every other
  finding; nothing about this fix narrows what it catches.
- The residual corpus rule applies to the next check reused across more
  than one gate, not only to this one.

## References

- [Gate 7 — On demand](../standards/guardrails/gate-7-on-demand.md) — the
  repository-wide scan, and its own comment naming this failure mode.
- [Gate 6 — Pull request pipeline](../standards/guardrails/gate-6-pull-request.md) —
  the reused invocation that hard-blocks.
- [Cross-gate rules](../standards/guardrails/cross-gate-rules.md#a-check-reused-across-gates-carries-its-severity-model-with-it) —
  the corpus rule this record states.
- [hooks/README.md](../../hooks/README.md) — the split file index.
- [Registers](../standards/guardrails/registers.md) — why a tool-parsing
  artefact has no register row to carry.
