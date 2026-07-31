# Change size override register

Every branch that carried the `[large-pr]` marker into gate 6, the human decision
that accepted the size and what was driving it, and the condition that would let
the row go. The `change size override` check refuses a marker with no matching
row here — see [fix 74](../standards/guardrails/cross-gate-rules.md#an-override-answers-a-push-back-it-is-not-a-fix).

**An agent may fill in every column below except Approver.**
[Gate 4](../standards/guardrails/gate-4-task-completion.md) reports the counted
change size and what makes up the bulk; it does not add `[large-pr]` on its own
authority. The marker is applied by, or on the explicit instruction of, the
human who also fills in this row's Approver cell — in a commit distinct from
the one that files the row, the same two-step every other register in this
repository already requires
([registers.md](../standards/guardrails/registers.md#approval-is-an-event-not-a-field)).

A row missing only its Approver is not refused here — gate 4 lets the branch
proceed locally with the row still open, and gate 6 is what blocks the merge on
it, the same split every other register in this repository already draws.

## Register

| Branch     | Counted lines | Composition | Justification | Removable when | Approved by |
| ---------- | ------------- | ----------- | ------------- | -------------- | ----------- |
| _none yet_ |               |             |               |                |             |

The **Removable when** column is the point of the exercise, the same as every
other register here. A row with no stated removal condition is permanent by
default, and nobody notices when the branch that needed it has long since
merged or died.
