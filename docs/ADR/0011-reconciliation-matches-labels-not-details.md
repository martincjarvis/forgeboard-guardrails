---
type: explanation
status: Accepted
decided: 2026-08-01
owner: Toolkit maintainers
summary: The report/CI reconciliation check matches a gate's `<gate>: FAIL <label>` lines and never the indented detail beneath them, so it proves no CI finding is missing from a report and proves nothing about whether a quoted detail is current. Matching the detail lines too was considered and refused as prose-honesty scoring.
read_when: Asking why a report passed reconciliation with a stale figure quoted inside it, or what a clean `check-report-ci-reconciliation.mjs` run actually establishes.
---

# Reconciliation matches a finding's label, never the detail beneath it

## Decision

**`scripts/check-report-ci-reconciliation.mjs` matches a gate's own
`<gate>: FAIL <label>` lines out of a CI job log, and asks only whether each
label appears somewhere — anywhere — in the report text.** The match is a
case-insensitive substring test against the whole report; which section
mentioned the finding is not the check's business. The indented detail lines
beneath a `FAIL` line are never matched, because the line pattern the module
extracts with requires a `<gate>:` prefix followed by the `FAIL` marker,
which only the finding's own headline carries:

```text
gate 6: FAIL cross-stack dependency scan (osv-scanner)     <- matched
        CVE-2026-2327, CVE-2026-59869, CVE-2026-48988      <- never matched
```

The module states the restraint for itself: it "does not judge whether the
report's categorisation of a CI-only finding is right, or whether its prose
is honest — only whether the finding's own label, as CI printed it, appears
anywhere in the report at all."

## Why not match the detail lines too

The alternative was to compare the report's quoted detail against the tool's
own output — the finding's CVE list, its line span, its count — and flag a
difference.

It was refused because **comparing a report's prose against a tool's output
is prose-honesty scoring**, which this corpus declines wherever it has come
up: [docs-style.md](../standards/docs-style.md#standards-in-a-consuming-repository)
refuses "a checker that reads the report's prose and scores its honesty"
outright, and `check-pr-body-artefacts.mjs` already states the same
restraint for its own citation test — it checks that the artefact a finding
points at exists, never whether the sentence pointing at it is truthful.
This module was written to that shape deliberately, one check over.

The reason the restraint holds is that **the integrity of a report's finding
list does not come from grading its sentences. It comes from the list being
the verbatim output of one command** ([ADR-0014](0014-one-command-one-transcript.md)).
A checker that scored quoted detail would be defending a property the
sourcing rule already guarantees for the list itself, while inheriting a new
failure mode: it must model the tool's own output formatting closely enough
to tell a re-wording from a changed value, and every tool version that
reformats its output turns into a finding about the report.

## Consequences

- **Label-level and value-level reconciliation are different claims, and a
  report states which one it made.** A clean run of this check proves no CI
  finding is missing from the report. It proves nothing about any finding's
  detail being current. A report that quotes a tool's output verbatim is
  making the stronger, value-level claim, and that claim is only true if the
  tool was re-run at the commit the report reports on.
- The narrower failure this check cannot catch is a real one, and is closed
  by sequencing rather than by machinery: a report named every CI finding
  correctly and still quoted one's detail stale — `(anonymous)@1594-2939`
  where live CI read `(anonymous)@1602-2947`, the same finding, the same
  label, after a later commit shifted the file by eight lines. The remedy is
  to re-capture every quoted figure after the last commit that could change
  it, per
  [cross-gate-rules.md](../standards/guardrails/cross-gate-rules.md#a-reports-gate-output-is-provisional-until-ci-has-produced-its-own).
  The defect there is the report's claim, not a gap in this check.
- Because the check is a step after CI rather than a precondition, it is
  never wired into gate 6 itself. It runs by hand, or as a CI step reading
  its prior job's log, before the pull request is presented as ready — and
  the report names the command and its exit status, the same as any other
  claim.

## References

- [Cross-gate rules](../standards/guardrails/cross-gate-rules.md#a-reports-gate-output-is-provisional-until-ci-has-produced-its-own) —
  the rule as stated for an implementer, including the level-of-claim
  distinction this record decides.
- [ADR-0014](0014-one-command-one-transcript.md) — where a finding list's
  integrity actually comes from.
- [docs-style.md](../standards/docs-style.md#standards-in-a-consuming-repository) —
  the corpus's standing refusal of prose-honesty scoring.
- `scripts/check-report-ci-reconciliation.mjs` — `extractGateFailLabels` and
  `findUnreconciledCiFindings`, the mechanical form.
