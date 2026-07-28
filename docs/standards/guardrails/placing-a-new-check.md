---
type: how-to
summary: Six steps from "we should check X" to a check that actually gates — naming the property, finding an existing tool, choosing the gate, and making it required.
read_when: Adding a check to a repository's gates.
---

# Placing a new check

1. **Name the property it defends**, and take its type from
   [the check types](../guardrail-standards.md#check-types). Then look for an
   existing tool that already enforces it, before writing anything — the
   [tooling ladder](cross-gate-rules.md) starts with what the hosting platform
   already offers.
2. **Put it in the highest-frequency gate whose inputs are sufficient.** A check
   needing the whole branch cannot live in the commit gate; one needing only the
   file being written belongs in the edit gate.
3. **Give it a verdict consistent with its type**, and a refusal message that
   diagnoses: the check, the path, the offending content, and what clears it.
4. **If it blocks, add it to the pull request pipeline and to the required
   status checks.** Those are two separate acts, and a blocking check with no
   server-side equivalent is advisory whatever it says locally.
5. **Decide what evidence it publishes**, and in what format the host ingests
   without conversion.
6. **Add its row to the gate's table and its line to that gate's checklist.** A
   check with no checklist line is one nobody will ever verify is still working.

## Verification

- [ ] The new check has a type, and its verdict matches that type's discipline.
- [ ] An existing tool was looked for, and a bespoke check has a recorded reason.
- [ ] It sits in the earliest gate whose inputs are sufficient.
- [ ] If it blocks, it is both re-run server-side and named in the required list.
- [ ] It appears in a gate table and in that gate's verification checklist.

## References

- [Guardrail standards](../guardrail-standards.md) — the gate index and check types.
- [Cross-gate rules](cross-gate-rules.md) — the tooling ladder and the local-versus-server rule.
- [Thresholds](thresholds.md) — where any number it introduces belongs.
