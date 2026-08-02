---
name: guardrail-audit
description: Use when asked to audit, assess, or check a repository's guardrails or standards compliance — reports each capability as present, partial, absent, or off, with a concrete fix per gap.
---

# Guardrail audit

Read-only. Report the state of the eleven capabilities in
[docs/standards.md](../../docs/standards.md) for this repository, ordered so
someone can work top-down. Nothing is changed; the fixes are the ask.

## Method

For each capability, find what implements it and **prove it bites**, in this
order:

1. **The record.** `.guardrails.json`, if present. An `off` entry with `why`
   and `who` is a decision, not a gap — list it in the appendix, not the
   findings. An `off` entry missing either field is a finding.
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
which link), `absent`, `off` (recorded decision).

## Report shape

1. **Verdict line** — e.g. "6 of 10 present, 2 partial, 1 absent, 1 off".
2. **Findings, ordered by leverage** — each: capability, state, evidence
   (quoted command/file), and the exact fix (command or file to add). A
   `partial` whose fix is one line ranks above an `absent` needing a day.
3. **Appendix** — `off` decisions with owner; suppression counts; anything
   working that a reader might not expect.

If asked to fix the findings afterwards, that is
[repository-bootstrap](../repository-bootstrap/SKILL.md) in uplift mode —
bootstrap, not audit, does the writing.
