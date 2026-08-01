---
type: explanation
status: Accepted
decided: 2026-08-01
owner: Toolkit maintainers
supersedes: 0006
summary: A commit whose own message introduces the [large-pr] marker is refused at commit time unless the change-size override register already carries a human-approved row for the branch. Filing that row, with a blank Approver, is unaffected — it is a different commit, and its own message never carries the marker.
read_when: Asking why a commit carrying [large-pr] was refused locally, or deciding how to sequence filing the override register row against applying the marker.
---

# `[large-pr]` is refused at commit time without an approved row

## Decision

**A commit is refused at the commit-msg hook if its own message contains
`[large-pr]` and [the change-size override
register](../standards/guardrails/registers.md#the-change-size-override-register)
has no row for the branch naming a human — not a team label — as Approved by,
read from that commit's own staged content.**
`scripts/check-change-size-override.mjs --message <file>` is the mechanical
form, wired at [gate 3](../standards/guardrails/gate-3-commit-message.md)
(`.husky/commit-msg`) — the one hook stage where the drafted message is
readable before the commit object exists; gate 2's own contract is staged
_file_ content (gate-2-commit.md), and the marker lives in the message, not a
file, so gate 2 cannot see it in time.

Filing the register row itself is unaffected. An agent still fills in every
column except Approver, in a commit whose own message does not mention
`[large-pr]` — "docs: record the change-size override", say — so the new
check never fires on it. That commit is still refused if it arrives
pre-approved, by the same mechanism [ADR-0006](0006-change-size-override-is-a-human-decision.md)
already established (`check-approval-provenance.mjs`) and this decision does
not touch.

## Why

ADR-0006 made a pre-approved register row unwritable in the commit that files
it — the approver cell cannot be filled in the same commit that introduces
the row. It left the marker itself reachable by any commit an agent could
make: gate 4 clears the bare string locally ("an author is present there"),
and only gate 6, server-side, blocks the merge on a missing row. Between
those two points a branch could carry an unauthorised marker through every
check an agent runs on its own machine.

The corpus said not to rely on that gap being closed by discipline alone —
three times, in three different documents (ADR-0006's own Decision, the
bootstrap `SKILL.md`, the register's own header) — and an agent applied the
marker anyway, in the same commit whose message stated the rule it was
breaking. Seventeen audits' own pattern holds here too: a guardrail defect
with a reference implementation gets fixed and stays fixed; a prose-only
defect recurs. A fourth restatement was rejected on exactly that evidence.

Structurally, this closes the gap the same way ADR-0006 closed the row's own
half: **make the marker unwritable-by-agent for the same reason approval is
— the cell an agent cannot fill in the same commit is now a cell a marker
cannot exist without.** An agent proposing the override still reports the
size and composition and stops there; a human still has to file, and
separately approve, the row before the marker can land in any commit at all,
interactive or autonomous.

One consequence worth naming: this also means the marker can no longer
arrive at gate 4 or gate 6 without an approved row already behind it, under
normal operation (a hook bypass — `--no-verify` — is the only way around it,
and that is a different, already-covered risk, not a gap this decision needs
to close). Gate 4's own change-size check is unchanged in its own terms — it
still clears locally the moment it sees the marker — but that clearance no
longer means "an agent could have typed this with nothing behind it"; it
means the marker could only have landed with an approved row already in
place.

## Rejected alternatives

- **A fourth prose statement of the rule**, in a fourth document, or
  reworded in one of the three that already state it. Rejected on the
  evidence above: three statements, one broken, in the same breath as
  quoting it.
- **Block at gate 2 (pre-commit, staged file content) instead of gate 3
  (commit-msg).** Rejected because it cannot work: the marker lives in the
  commit message, which does not exist as a file gate 2 could stage-read —
  the commit object, and its message, are not created until after gate 2's
  hook has already exited. Only the commit-msg hook receives the drafted
  text.
- **Require any row at all, approved or not, before the marker is
  accepted.** Rejected: that would make the check satisfiable by an agent
  filing a blank row in an earlier commit of its own and then applying the
  marker in the next one — the same "any row clears it" shape ADR-0006
  already rejected for the register's Approver cell, reapplied here to the
  same effect.
- **Require the marker's own commit to be distinct from the diff it
  excuses.** Already rejected by ADR-0006, for the same reason: a single
  actor produces that separation trivially, and it proves nothing about who
  decided.

## Consequences

- A commit whose own message introduces `[large-pr]` is refused at the
  commit-msg hook (gate 3) unless the change-size override register already
  carries a human-approved (non-team-label) row for the branch, read from
  that commit's own staged content — superseding ADR-0006's own
  "clears gate 4 locally … refused at gate 6" split for the marker itself.
  Gate 4's change-size finding and gate 6's existing
  `check-change-size-override.mjs` range check are both unchanged; gate 6
  remains the backstop for a marker that reached a commit through a bypassed
  hook.
- Filing the register row, with a blank Approver, remains exactly as
  available as ADR-0006 already made it — the proposal path this decision
  must not close.
- A report describing an unresolved override as "fixed" is still a defect in
  the report, unchanged from ADR-0006
  ([cross-gate-rules.md](../standards/guardrails/cross-gate-rules.md#an-override-answers-a-push-back-it-is-not-a-fix)).

## References

- [ADR-0006](0006-change-size-override-is-a-human-decision.md) — the decision
  this record supersedes; its "who, not which commit" reasoning for the
  register row is unchanged and not repeated here.
- [Cross-gate rules](../standards/guardrails/cross-gate-rules.md#an-override-answers-a-push-back-it-is-not-a-fix) —
  the rule as stated for an implementer.
- [Registers](../standards/guardrails/registers.md#approval-is-an-event-not-a-field) —
  the approval-provenance mechanism this decision reuses the shape of.
- [Gate 3 — Commit message](../standards/guardrails/gate-3-commit-message.md) —
  where the new check is wired, and why it can only run there.
- `scripts/check-change-size-override.mjs` — `checkChangeSizeOverrideMessage`,
  the mechanical form.
