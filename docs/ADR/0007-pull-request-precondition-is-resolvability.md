---
type: explanation
status: Accepted
decided: 2026-07-31
owner: Toolkit maintainers
summary: A pull request opens when every finding an implementer could resolve has been resolved. The reserved classes this corpus names are a consequence of that principle, not its definition — an enumeration invites a sixth being invented to fit through it, a principle does not.
read_when: Deciding whether a finding may stay outstanding when a pull request opens, or extending the list of reserved classes.
---

# The pull request precondition is resolvability, not an enumerated list

## Decision

The repository owner's own words, on why an unresolved finding should not
always hold a pull request open: for an autonomous run, a finding that
needs a human's approval, or a human's decision to accept it rather than
have it fixed, should not by itself keep a pull request from opening —
provided everything an implementer could actually resolve has been.

**A pull request opens when every finding an implementer could resolve has
been resolved.** What remains is what only a human can decide: an approval
or an acceptance. Those do not block the pull request — the pull request is
how they reach the person who decides.

The reserved classes this corpus already names — a decision record or
register row accepting a risk, a licence, or an accepted finding a check
would otherwise raise, a change-size override, a conflict between two
standing directives — are restated as the **consequence** of the principle
above, not its definition. They are what this corpus has found, so far, to
be genuinely unresolvable by an implementer; the list may grow, but only
when a new class of finding actually has that property, never as a
shortcut for disclosing a finding an implementer simply did not want to
fix.

## Why

[Fix 65](../standards/guardrails/cross-gate-rules.md#a-pull-request-is-not-opened-until-the-gate-6-surface-is-clean-locally)
already permitted opening with an outstanding finding, but stated the
permission by enumerating classes. An enumeration invites exactly the defect
an audit found: a pull request opened under an invented sixth heading, "one
tool limitation, documented rather than hidden," whose own body named the
fix it declined to apply — it could not have claimed the finding was
unresolvable, because it had already stated the resolution. A principle does
not invite this the same way an enumeration does: "resolvable by an
implementer" is a property of the finding, not a slot to be filled by
whatever heading sounds close enough.

**The check stays mechanical; only the standard's own framing changes.**
[Fix 68](../standards/guardrails/cross-gate-rules.md#a-pull-request-is-not-opened-until-the-gate-6-surface-is-clean-locally)'s
citation check — every disclosed finding cites a register row, a
Proposed/Accepted ADR, or a named conflict record — is not weakened by this
restatement, and should not be: resolvability is a judgement no mechanical
check can make, but citation is exactly what proves a judgement was made
correctly. A finding only a human can settle has a record with a blank
approver; a finding the implementer simply chose not to fix has nothing to
cite, because no record exists for "I decided this was hard." The citation
requirement is not bureaucracy layered on top of the principle — it is the
evidence the principle was actually applied, which a review of the prose
alone cannot provide.

**The reverse also holds.** Creating a record in order to make a finding
look reserved is the forgery
[registers.md's approval-provenance rule](../standards/guardrails/registers.md#approval-is-an-event-not-a-field)
already addresses — a record and its approval never arrive in the same
commit, whether the record is an ADR, an accepted-finding register row, a
licence row, or (after
[ADR-0006](0006-change-size-override-is-a-human-decision.md)) a change-size
override row.

## Rejected alternatives

- **Extend the enumeration by one entry each time a new case is found.**
  This is the status quo the defect above exploited: an enumeration is a
  finite list that someone can always propose extending in prose, and
  nothing about a longer list closes that door. Restating the underlying
  principle closes it structurally — a class is reserved because it has the
  property, not because someone wrote it down.
- **Weaken fix 68's citation check to accept a stated judgement ("this is
  hard to fix") instead of a citation.** Rejected because a stated
  judgement is exactly what the audit's own defect already was — a
  plausible-sounding sentence with nothing behind it. Citation is the one
  part of "was this genuinely reserved" that can be checked mechanically;
  giving that up to make the principle easier to state would remove the
  only thing keeping the principle from being whatever an implementer
  wants it to mean in the moment.

## Consequences

- The reserved-class list, wherever it is enumerated
  ([cross-gate-rules.md](../standards/guardrails/cross-gate-rules.md),
  [docs-style.md](../standards/docs-style.md), and
  [skills/repository-bootstrap/SKILL.md](../../skills/repository-bootstrap/SKILL.md)),
  is now introduced as a consequence of the resolvability principle, not
  handed down as an arbitrary set — the same list, restated.
- A future class is added to the list only once a genuine case demonstrates
  it has the property "an implementer cannot resolve this," the same
  standard the existing five (now six) classes were held to.
- `scripts/check-pr-body-artefacts.mjs`'s citation check is unchanged by
  this decision — it was already correct, and remains the mechanical proof
  the principle asks for.

## References

- [Cross-gate rules](../standards/guardrails/cross-gate-rules.md#a-pull-request-is-not-opened-until-the-gate-6-surface-is-clean-locally) —
  the rule as stated for an implementer, including fix 68's citation check.
- [Registers](../standards/guardrails/registers.md#approval-is-an-event-not-a-field) —
  the approval-provenance rule that makes a citation trustworthy.
- [ADR-0006](0006-change-size-override-is-a-human-decision.md) — the newest
  reserved class this principle already covers.
