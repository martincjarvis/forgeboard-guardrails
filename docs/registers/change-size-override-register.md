# Change size override register

Every branch that carried the `[large-pr]` marker into gate 6, the human decision
that accepted the size and what was driving it, and the condition that would let
the row go. The `change size override` check refuses a marker with no matching
row here — see [an override is not a fix](../standards/guardrails/cross-gate-rules.md#an-override-answers-a-push-back-it-is-not-a-fix).

**An agent may fill in every column below except Approver.**
[Gate 4](../standards/guardrails/gate-4-task-completion.md) reports the counted
change size and what makes up the bulk; it does not add `[large-pr]` on its own
authority. The marker is applied by, or on the explicit instruction of, the
human who also fills in this row's Approver cell — in a commit distinct from
the one that files the row, the same two-step every other register in this
repository already requires
([registers.md](../standards/guardrails/registers.md#approval-is-an-event-not-a-field)).

A row missing only its Approver is not refused here — filing it is still
permitted with the row left open, the same split every other register in
this repository already draws. What is refused is pairing the marker with an
unapproved row: a commit whose own message contains `[large-pr]` is refused
at the commit-msg hook unless a human-approved row for the branch already
exists ([ADR-0010](../ADR/0010-large-pr-marker-refused-without-approved-row.md)),
so gate 4 and gate 6 only ever see the marker once that row is already in
place.

## Register

| Branch    | Counted lines | Composition                                                                                                                                                                            | Justification                                                                                                                                                                                                                                                                                                                                               | Removable when                                                                                                                                                               | Approved by |
| --------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `rebuild` | 2124          | 1990 production, 134 configuration. Largest single file `scripts/check-minimum-release-age.mjs` at 344 (a new check). The rest is spread thin — 11 files over 60 lines, none over 200. | Turning on `noImplicitAny` and `noUncheckedIndexedAccess` touches every `.mjs` in the repository at once — 585 type errors, annotations only. Splitting it per file would produce commits that do not build, because the setting is repository-wide. That same pass is what surfaced the `readPrBody` absence defect. Two new gate 6 checks land alongside. | `rebuild` merges. This row is spent then; it does not carry to any later branch, and a further override needs its own row against its own branch and its own counted figure. |             |

The **Removable when** column is the point of the exercise, the same as every
other register here. A row with no stated removal condition is permanent by
default, and nobody notices when the branch that needed it has long since
merged or died.
