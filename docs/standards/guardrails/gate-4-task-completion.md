---
type: reference
summary: The branch-scoped size gate — change size, file length, complexity and agent-document length, with push back rather than a warning for production files.
read_when: Finishing a unit of work, or deciding whether a size finding should stop the work or merely print.
---

<!-- cspell:ignore cyclomatic shortstat -->

# Gate 4 — Task completion

Fires when a unit of work is declared finished: an automated worker handing back
a task, or a person about to open a pull request. Same checks, same thresholds,
same verdicts — the trigger differs because the workflows do, not because the
standard does.

Measures the **whole branch against its base**, so it catches accumulation that
no single commit shows. Collects every finding before reporting — no stop at the
first failure, because the author wants the full list once.

| #   | Check               | Type | Measures                                                   | Applies to                            | Warn band                   | Error band | Override        |
| --- | ------------------- | ---- | ---------------------------------------------------------- | ------------------------------------- | --------------------------- | ---------- | --------------- |
| 1   | Change size         | Size | Added + deleted lines across the branch                    | Production and configuration together | Push back                   | Block      | Recorded marker |
| 2   | File length         | Size | Lines per file                                             | Production, test                      | Push back (production only) | Block      | None            |
| 3   | Context-file length | Size | Lines per agent-facing document                            | Agent context                         | Warn                        | Block      | None            |
| 4   | Complexity          | Size | Cyclomatic complexity, function length and parameter count | Production, test                      | Push back (production only) | Block      | None            |

Every row has both bands, with the verdicts the Size type fixes. Only change
size takes an override, and the marker reaches nothing else — a branch may
legitimately be large; a single function may not legitimately be
incomprehensible.

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

It applies to the classes each check already counts, and only those:

| Check                   | Pushes back for                           | Warns for           |
| ----------------------- | ----------------------------------------- | ------------------- |
| Change size             | Production **and** configuration together | —                   |
| File length, complexity | Production files                          | Test files          |
| Context-file length     | —                                         | Agent-context files |

Change size never separates its two counted classes, because it is one number
about one branch: a change of four hundred configuration lines and one of four
hundred production lines both warrant the same question, and a mixed total is
not made safe by its composition. The per-file measures do separate, because a
long test file is repetitive by nature and a long agent document may be complete
rather than bloated — pushing back on those trains the author to dismiss the
check.

Production code is where the per-file measures bite hardest: it is the code that
is read most, changed most, and reviewed under the most pressure.

Test and documentation lines are excluded from change size entirely, for the
same reason in a stronger form: a threshold that punishes tests teaches the
worker to write fewer of them.

**Push back in an unattended run.** [Gate 6](gate-6-pull-request.md) has nobody
to ask. A finding that pushes back locally becomes, server-side, a check for the
recorded answer: the override marker for change size, a resolved decision record
or a register row for anything else. No answer on record is a failure there,
which is what stops push back from degrading into a warning the moment the
author is not watching.

## Agent-facing documents

Documents an agent loads as context are governed by the Agent Skills format, not
by this standard's own invention. The relevant rules, and what the gate checks:

| Rule                                                                                     | Checked as                               |
| ---------------------------------------------------------------------------------------- | ---------------------------------------- |
| Required frontmatter: a name and a description                                           | Present and non-empty                    |
| Name: 1–64 characters, lowercase alphanumeric and single hyphens, matching its directory | Pattern and length                       |
| Description: 1–1024 characters, stating both what it does and when to use it             | Length; the "when" is a review judgement |
| Body under 500 lines and roughly 5,000 tokens                                            | The error threshold above                |
| Detail moved to referenced files, one level deep, never nested chains                    | Reference depth                          |

**Each reference document should have a skill definition beside it.** The
reference states what is true; the skill states what an agent should do about
it, in full, without the agent having to infer procedure from prose written for
someone else. Where only one exists, the usual defect is a reference document
carrying agent instructions as an aside — which is the right place for a pointer
and the wrong place for a procedure.

Two rules the gate cannot check, which the reviewer must:

- **A reference must say when to load it.** "Read the error reference if the API
  returns a non-200 status" is progressive disclosure; "see the references
  folder for details" is a table of contents the agent has no trigger for.
- **Splitting is not the same as shortening.** The limit exists because
  everything in the loaded file competes for the agent's attention. Content that
  the agent would get right without being told should be cut, not relocated.

## Running it by hand

| Check                 | Command                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| Change size           | `git diff --shortstat origin/main...HEAD -- <production and config paths>`                     |
| Per-file line counts  | `git ls-files -- <paths> \| xargs wc -l \| sort -n`                                            |
| Complexity            | `npx eslint --rule '{"complexity":["error",15]}' <paths>` · `lizard -C 15 -L 100 -a 7 <paths>` |
| Agent-document length | `wc -l <agent context paths>`                                                                  |
| Agent frontmatter     | `npx skills-ref validate ./<skill directory>`                                                  |
| Override marker       | `git log origin/main..HEAD --format=%B \| grep '\[large-pr\]'`                                 |

`lizard` covers the languages a single linter does not, and reports complexity,
function length and parameter count in one pass — the three sub-measures of
check 4. Where the stack's own analyser already reports them, prefer that, per
[Thresholds](thresholds.md).

## Verification

- [ ] A branch over the error threshold is blocked, and the override marker unblocks it.
- [ ] A production file in the warn band produces a push back, not a printed line
      the worker walks past.
- [ ] The push back names both options — split, or justify — and the answer is a
      resolved decision record, not a note or a transcript.
- [ ] The same measurement on a test or documentation file warns without pushing back.
- [ ] A function in the complexity warn band pushes back; one above the error
      band blocks, and no marker overrides it.
- [ ] An agent-facing document over the warn limit warns; over the error limit it blocks.
- [ ] Every agent-facing document has a valid name and description in its frontmatter.
- [ ] An over-length agent document is split with a stated load trigger per
      reference, not merely moved.
- [ ] A push back left unanswered fails the pull request pipeline rather than
      passing silently.
- [ ] Tests and documentation do not count toward change size.
- [ ] All findings are reported in one pass, not one per run.
- [ ] Deleted files do not produce a length or complexity finding.

## References

- [Thresholds](thresholds.md) — the bands, and when the stack's analyser overrides them.
- [Agent integration](agent-integration.md) — firing this gate in every harness.
- [File classes](file-classes.md) — which class a file is in, and therefore its verdict.
- [Gate 6 — Pull request pipeline](gate-6-pull-request.md) — where an unanswered
  push back is caught.
- Agent Skills specification (<https://agentskills.io/specification>) — the
  frontmatter fields and the progressive-disclosure recommendation.
- Agent Skills authoring guidance
  (<https://agentskills.io/skill-creation/best-practices>) — the source of the
  cut-before-relocate rule.
