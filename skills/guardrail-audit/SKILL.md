---
name: guardrail-audit
description: Use when asked to audit, assess, or check a repository's guardrails or standards compliance — reports each capability as present, partial, absent, or off, with a concrete fix per gap.
---

# Guardrail audit

Read-only, and **run manually** — a human invokes it, on demand or before a
release; it is not a scheduled job or a gate. Report the state of the eleven
capabilities in [docs/standards.md](../../docs/standards.md) for this
repository as a **checklist checked with evidence**: every row is ticked or
not, and a ticked row carries the command output or file:line that proves
it — a tick with no evidence beside it is not a tick. Nothing is changed;
the fixes are the ask.

## Method

For each capability, find what implements it and **prove it bites**, in this
order:

1. **The record.** `.guardrails.json`, if present. An `off` entry with `why`
   and `who` is a decision, not a gap — list it in the appendix, not the
   findings. An `off` entry missing either field is a finding. **Provenance:
   compare against the default branch's copy**
   (`git show origin/HEAD:.guardrails.json` or the platform equivalent) — an
   entry that is not on the default branch has not passed human review and is
   a _proposal_: report it in the findings as "proposed off, unratified",
   never in the appendix. Never treat the working branch's record as
   approved.
2. **Behaviour over presence.** A configured tool that nothing invokes is
   `partial`, not `present`. Check the chain: config → invoked by hook or
   verify command → verify command runs in CI → CI check required. Quote the
   file/line for each link; the first missing link sets the state.
3. **Any tool counts.** A local script or unfamiliar tool that demonstrably
   covers the capability is `present` — name it. The standard is the
   capability, not a tool list.
4. **Suppression drift.** Count in-code suppressions (`eslint-disable`,
   `noqa`, `#pragma warning disable`, config-level `off` rules) without a
   stated reason. Report the count and worst examples.

States: `present` (chain complete), `partial` (exists, chain broken — say
which link), `absent`, `off` (recorded decision), `proposed off`
(unratified — see Method 1).

## Adequacy — after the wiring, judge the substance

Wiring proves the gates bite; it says nothing about whether what they guard
is any good. After the capability walk, load the review skills that apply
and run their checklists against the repository, reporting their results as
**adequacy findings** in a separate section:

- **[testing-review](../testing-review/SKILL.md)** — always. Classify the
  suite by tier: unit tests alone satisfy the `tests` gate but fail the
  standard, which wants integration tests and an E2E journey per feature.
  No integration tier, no journey tests → adequacy findings, each naming
  the missing tier and the first journey to write.
- **[logging-review](../logging-review/SKILL.md)** — when the repository
  has production code. Silent production code (no logging to review) is
  itself the finding.
- **[deployment-review](../deployment-review/SKILL.md)** — when the
  repository deploys anywhere.
- **Platform currency** — a stack pinned below the newest LTS is an
  adequacy finding with the upgrade as the fix; an unsupported version
  ranks top.

Adequacy findings are judgements, not gate failures — they rank below a
broken wiring chain but they appear, every audit, until fixed or turned
off by a ratified decision.

## Report shape

1. **Verdict line** — e.g. "6 of 11 present, 2 partial, 1 absent, 1 off, 1
   proposed".
1. **The checklist** — one row per capability and per adequacy item:
   `[x]`/`[ ]`, state, and the evidence (quoted command output or
   file:line) on the same row or directly beneath it. This table is the
   audit; the sections below elaborate it.
1. **Wiring findings, ordered by leverage** — each: capability, state,
   evidence (quoted command/file), and the exact fix (command or file to
   add). A `partial` whose fix is one line ranks above an `absent` needing a
   day.
1. **Adequacy findings** — the review-skill results: missing test tiers and
   journeys, logging gaps, platform currency. Same shape: evidence, then the
   concrete first step.
1. **Appendix** — ratified `off` decisions with owner; suppression counts;
   anything working that a reader might not expect.

If asked to fix the findings afterwards, that is
[repository-bootstrap](../repository-bootstrap/SKILL.md) in uplift mode —
bootstrap, not audit, does the writing.
