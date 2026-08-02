# Minimum release age register

Every dependency admitted past the minimum-release-age window, the human decision
that accepted the exception, and the publish date that lets staleness be checked
without a network call. The `minimum release age` check
([gate 6](../standards/guardrails/gate-6-pull-request.md)) refuses a dependency
whose resolved version was published inside the window unless a human-approved
row here names it.

The window itself is declared in `.npmrc` as `min-release-age` (npm's own
setting, read by `npm config get min-release-age`) — the rule lives there, not
in this register. This register holds only the exceptions.

**An agent may fill in every column below except Approved by.** The exception
is an accepted risk, and accepting a risk is a decision a human owns
([registers.md](../standards/guardrails/registers.md#approval-is-an-event-not-a-field)).
A row missing only its Approver is not refused here — filing it is still
permitted with the row left open — but it does not admit the dependency at
gate 6 until a human fills that cell in, in a commit distinct from the one that
filed the row.

A row is **self-expiring**: the version it excepts is pinned, so once enough
time has passed the dependency passes the window on its own and the row has no
job left. The staleness check reports any row whose Published date is older than
the window, so an exception cannot silently accumulate into a permanent
exemption. The **Published** column is what makes that checkable offline, which
is why it is a column rather than a value the check re-fetches every run.

## Register

| Dependency          | Version | Published  | Justification                                                                                                                                                                                 | Removable when                                                        | Approved by |
| ------------------- | ------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------- |
| `markdownlint-cli2` | 0.23.2  | 2026-07-27 | Direct dev dependency, resolved by `npm install` while the eslint uplift was in progress. Not chosen for this branch and not needed by it — the lockfile simply moved to the current release. | 2026-08-03, when it passes the 7-day window. Remove the row that day. |             |
| `minimatch`         | 10.2.6  | 2026-07-27 | Transitive, reached through the markdown and lint tooling. No direct dependency names it, so pinning it back would mean overriding a resolution nothing in this branch asked to change.       | 2026-08-03, when it passes the 7-day window. Remove the row that day. |             |
| `brace-expansion`   | 2.1.3   | 2026-07-28 | Transitive, reached through the same tooling as `minimatch`. Same reasoning: no direct dependency names it.                                                                                   | 2026-08-04, when it passes the 7-day window. Remove the row that day. |             |

The **Removable when** column is the point of the exercise, the same as every
other register here. For this register it is mechanical: once the version's
publish date is older than the `min-release-age` window, the row must go — the
staleness check named above enforces it rather than trusting anyone to revisit.
