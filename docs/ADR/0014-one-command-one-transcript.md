---
type: explanation
status: Accepted
decided: 2026-08-01
owner: Toolkit maintainers
summary: A report's list of findings is the verbatim output of one command — the gate — never an assembly of individually chosen checks, and never a platform's summary of that command's output. Checking every source that produces findings and combining them was considered and refused: choosing what to include is where omission enters, and an assembled list can lose a part while a transcript cannot.
read_when: Asking why a report may not build its outstanding-work list by running the checks that seemed relevant, or why a reconciliation reads a raw job log rather than an annotations API.
---

# One command, one transcript

## Decision

**A report's list of findings is the verbatim output of a single command —
the gate — one line per finding, each with the check that produced it.** Not
a concatenation of individually chosen checks' output, and not a platform's
rendering of that command's output.

Three parts, each of which has been broken separately:

- **The set is produced by running the gate**, not by picking which of its
  checks to run. A check that cannot run on this machine is a line in that
  command's own output, reported unavailable — never a line missing because
  an implementer judged it out of scope.
- **The instrument is the command's own transcript** — the job log — not a
  platform's summary of it. `gh api …/check-runs/{id}/annotations` caps at
  ten annotations and drops the rest with no marker that anything was cut.
- **Prose around the list is the implementer's own; the list is not
  summarised from memory.** Any count anywhere in the report names the
  command that produced it, and the environment it ran in.

## Why not check every source and combine

The alternative is the obvious one, and it is what every failure below
actually did: identify the things that produce findings, run each, and
assemble the results.

It is refused because **choosing what to include is where omission enters.**
A list assembled from parts can lose a part; a transcript cannot. Every
individual number in an assembled list can be honest while the list as a
whole understates what the gate found — which is precisely why the defect
survives review. The evidence, in this repository's own history:

- A report claimed gate 6 was red on four findings. The gate's own output
  carried fourteen finding lines. A correction commit fixed part of the
  undercount and still never mentioned the `osv-scanner` failure, because
  the correction was also written from memory rather than read from the
  gate.
- A report citing this rule almost verbatim — "copied from gate output, not
  recalled" — listed 5 of a real 16. It had run two of gate 6's checks by
  hand and never run `check-dependency-advisories.mjs` at all, on the stated
  reason that the tool was "network/PATH-resolved", which is false for that
  script. Two whole categories were missing, each honestly sourced to
  nothing.
- A report built from the annotations endpoint against a run with sixteen
  findings got ten — the exit-0 class in a new place: an instrument that
  produces success-shaped output while omitting data.

Each of these is an assembly that lost a part. None would have been possible
from a transcript, because there is nothing in a transcript to choose.

**A weaker version was also rejected: name the command and let the set stay
assembled.** Naming the command turns a claim into something a reader can
re-run, and it is required — but the second failure above named its command
and still lost eleven findings, because naming is not sourcing. The list
itself has to be the output.

## Consequences

- This rule is the premise several others rest on, which is why it is worth
  its own record rather than a paragraph in each:
  - A pull request is not opened until the gate-6 surface — the gate, run as
    one command — is clean
    ([cross-gate-rules.md](../standards/guardrails/cross-gate-rules.md#a-pull-request-is-not-opened-until-the-gate-6-surface-is-clean-locally)).
  - A report's outstanding-work list, and every other artefact stating what
    remains, derives from that same single command or cites the report
    rather than recomputing the set
    ([docs-style.md](../standards/docs-style.md#standards-in-a-consuming-repository)).
  - Reconciliation against CI reads the job log, never the annotations API
    ([cross-gate-rules.md](../standards/guardrails/cross-gate-rules.md#a-reports-gate-output-is-provisional-until-ci-has-produced-its-own)).
  - The reconciliation check itself does not grade the report's prose,
    because the list's integrity comes from this sourcing rule rather than
    from scoring sentences ([ADR-0011](0011-reconciliation-matches-labels-not-details.md)).
- "The gate" means gate 6 as well, not only whichever gate is easiest to
  quote. A report that gave gate 7 a fenced verbatim block and gate 6 a
  paraphrase had no gate-6 transcript at all — which is also why a skip line
  that existed only in that transcript never appeared anywhere in the
  report.
- The rule is unscoped: it governs every finding list and every count in the
  report, not only the outstanding-work section. Applying the remedy to the
  section a defect was found in, rather than to the habit that produced it,
  is how the identical defect surfaced one section over.

## References

- [Cross-gate rules](../standards/guardrails/cross-gate-rules.md#never-claim-more-than-was-checked) —
  the rule as stated for an implementer, with the failures above in full.
- [docs-style.md](../standards/docs-style.md#standards-in-a-consuming-repository) —
  the same rule applied to a bootstrap report's outstanding-work list.
- [ADR-0011](0011-reconciliation-matches-labels-not-details.md) — the
  reconciliation restraint this rule is the reason for.
