<!-- cspell:ignore unattributed -->

# Third-party attribution register

Every defect this repository has attributed to a third-party tool rather than
fixed as its own — recorded as _verified_ only where the row carries a link to
an **open** upstream ticket that resolves. The rule this register exists to
enforce, and the reasoning behind it, live in
[cross-gate-rules.md](../standards/guardrails/cross-gate-rules.md#a-third-party-attribution-is-a-claim-and-it-needs-an-open-ticket):
_"it is a tool bug" is the cheapest available excuse for not fixing your own
code_, and an unverified attribution silently moves our defect onto someone
else's backlog where nobody is working it. Until an open ticket exists, the
defect is assumed to be ours, and we resolve it.

A closed upstream ticket does not verify a live defect. If the ticket is closed
the fix may already be released, which makes a closed link a prompt to upgrade
rather than an excuse to keep the workaround. The **Ticket state** column is
recorded, not fetched: the check verifies the row carries a URL and a state
offline, and whether the ticket is still open is freshness a human checks at
review.

A row may instead record a defect we **treat as ours** — measured against a
third-party tool, but with no upstream attribution claimed. Such a row carries
`unattributed` in its **Upstream ticket** cell, which is the explicit sentinel
that distinguishes "we are working this as ours" from "we claimed a tool bug and
forgot the link" (the empty cell the register refuses).

Every row also carries a removal condition that is not "never", and — once a
human has looked at it — that human's name in **Approved by**. A row missing
only the approver is not refused here: gate 2 lets it through as a push back,
and gate 6 blocks the merge on it, the same split every other register holds.

## Register

| Tool                                                                                                                                                                                                                                              | Version | Symptom | Upstream ticket | Ticket state | Minimal reproduction | Date verified | Removable when | Approved by |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------- | --------------- | ------------ | -------------------- | ------------- | -------------- | ----------- |
| _No rows — no defect is currently attributed to a third-party tool. A defect measured against a tool but treated as ours carries `unattributed`, and is recorded here only when its measurement needs to outlive the commit that established it._ |         |         |                 |              |                      |               |                |             |

The register's shape is fixed by
[registers.md](../standards/guardrails/registers.md#the-third-party-attribution-register);
the check that enforces it is `scripts/check-third-party-attribution.mjs`,
wired at the commit gate.
