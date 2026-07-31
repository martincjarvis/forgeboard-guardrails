---
type: explanation
status: Accepted
decided: 2026-07-31
owner: Toolkit maintainers
summary: An agent reports a change-size finding and the composition driving it; it never applies the [large-pr] override on its own authority. The override is a resolved decision record — a human-approved row in the change-size override register — never the bare marker string.
read_when: Asking why gate 6 refuses a [large-pr] marker with no register row behind it, or deciding how an autonomous run should handle an oversized branch.
---

<!-- cspell:ignore Uncustomised -->

# `[large-pr]` is a human decision, not an agent default

## Decision

**An agent never writes `[large-pr]` on its own authority.** It reports the
counted change size and names what makes up the bulk — [gate
4](../standards/guardrails/gate-4-task-completion.md) already does this in
its own output. The marker is applied by, or on the explicit instruction of,
a human, who also fills in the Approved by cell of the matching row in [the
change-size override register](../standards/guardrails/registers.md#the-change-size-override-register).

> Uncustomised tooling shouldn't be counted, but we can't tell that and this
> is an exceptional case. `[large-pr]` would be appropriate, but it should be
> an interactive human decision — not a plugin default or agent-decided
> flag. So agents should report it and prompt for a decision.

In an interactive session, the agent asks. In an autonomous run there is
nobody to ask, so the pull request carries the request instead — the
measured size and its composition, named in the body as an outstanding,
reserved-for-a-human finding — and the human answers by filling in the
register row or by asking for the change to be split.

## Why

Gate 4's own change-size check, before this decision, asked only
`log.stdout.includes("[large-pr]")` — pure string presence, satisfied by any
commit, any author, no reason and no approver. An audit found the marker two
commits after the diff it excused, which already satisfies that check and
would satisfy a naive fix requiring the two to sit in different commits, too:
that separation was already true and meant nothing. The property that
actually distinguishes a human's decision from an agent's own is **who**, not
**which commit** — and nothing about a commit's position in history can
prove who typed it.

This corpus already has a mechanism for exactly this shape of decision:
[the registers](../standards/guardrails/registers.md) this repository
already keeps for an accepted finding, where an agent fills in every column
except the approver, a blank approver pushes back at the commit gate, and
gate 6 blocks the merge on it because nobody is present
server-side to answer a push back. Reusing it, rather than inventing a
parallel mechanism, means the change-size override inherits a property
already proven elsewhere in this repository's own history: [approval is an
event, not a
field](../standards/guardrails/registers.md#approval-is-an-event-not-a-field) —
a row that arrives already approved, in the commit that files it, is refused,
so the only row that clears the merge gate is one where the approval
genuinely happened in a separate, later commit. That is the mechanical
answer to "who, not which commit": it cannot verify identity, but it can —
and does — verify that two distinct commit events occurred, which is the
same proxy this corpus already trusts for every other reserved-class
decision.

## Rejected alternatives

- **Detect tooling nobody has customised and exempt it automatically.** A
  ported file that has been adapted and one that has not are the same bytes
  to a checker. Building a heuristic here repeats the vocabulary-matching
  mistake
  an earlier fix already removed once — a detector that reads "has this file
  been edited" cannot tell a cosmetic rename from a substantive change, and
  a repository that games the heuristic teaches nothing.
- **Require the marker in a commit distinct from the diff it excuses.**
  Already true in the case that motivated this decision, and it changed
  nothing — a single actor produces that shape trivially. This is not a
  weaker version of the chosen fix; it is a different property that happens
  to look similar and catches nothing the chosen fix does not already catch
  by a more direct route.
- **Leave the check as bare marker detection, and rely on code review to
  catch an unjustified one.** Rejected because gate 6 is the point where
  this corpus already promises no author is present to answer a push back —
  deferring to review contradicts that promise for this one check while
  every other reserved-class finding already gets a mechanical gate.

## Consequences

- A branch carrying `[large-pr]` with no matching register row clears gate 4
  locally (an author is present there) but is refused at gate 6, the same
  split every other register row missing only its approver already has.
- A bootstrap that trips change size on ported tooling reports the finding
  and proposes the override; it does not apply it, and the pull request
  carries the request to the human who can.
- A report describing an unresolved override as "fixed" is a defect in the
  report, not a smaller version of the truth — see
  [cross-gate-rules.md](../standards/guardrails/cross-gate-rules.md#an-override-answers-a-push-back-it-is-not-a-fix).

## References

- [Cross-gate rules](../standards/guardrails/cross-gate-rules.md#an-override-answers-a-push-back-it-is-not-a-fix) —
  the rule as stated for an implementer.
- [Registers](../standards/guardrails/registers.md#the-change-size-override-register) —
  the register this decision reuses the shape of.
- [Gate 4 — Task completion](../standards/guardrails/gate-4-task-completion.md) —
  where the finding is reported.
- [ADR-0005](0005-generated-files-discounted-from-change-size.md) — the
  companion decision that shrinks the finding before this one is ever
  reached.
