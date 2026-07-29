---
name: logging-review
description: Use when reviewing changed .NET or React/TS code against the logging/diagnostics policy — loads the tiered checklist and the matching per-stack reference, applies each Tier-1/2 check, and records a PASS/FAIL finding per file mapped to its policy anchor.
---

# Reviewing code against the logging & diagnostics standard

<!-- cspell:ignore .NET React TS ILogger LoggerMessage LogLevel DI OpenTelemetry OTel dotnet analyser analysers redaction redacted unredacted Tier ADR PASS FAIL spy injectable -->

## When to use

Invoke this skill when reviewing code for conformance to the
[logging & diagnostics standard](../../docs/standards/logging-diagnostics.md)
— typically a changed file (or a representative sample) in .NET or React/TS.
It is the **agent-review layer** that sits over the analyser-enforced Tier-0
rules and carries the semantic residue no analyser can judge.

## Review procedure

1. **Load the checklist** — [reference/checklist.md](reference/checklist.md)
   defines the tiered checks: Tier 1 (active), Tier 0 (spot-check), and
   Tier 2 (presence).
2. **Load the stack reference** — [reference/dotnet.md](reference/dotnet.md)
   for .NET or [reference/react-ts.md](reference/react-ts.md) for React/TS.
   Each splits every rule into what an analyser or lint rule already enforces
   mechanically versus what this skill must judge.
3. **Apply the checklist to each file.** Tier-1 checks are this skill's active
   job (level mapping, PII, third-party level, metrics-over-logs, logging via
   an injected abstraction, tested logging); Tier 0 is a spot-check that the
   analyser set is enabled and the code is clean under it; Tier 2 is a
   presence check for
   [distributed tracing](../../docs/standards/logging-diagnostics.md#distributed-tracing),
   whose full verification is integration-level.
4. **Record a finding per breach and a verdict per file.** Every breach cites
   the policy anchor it maps to (for example,
   [Level mapping](../../docs/standards/logging-diagnostics.md#level-mapping),
   [PII rule](../../docs/standards/logging-diagnostics.md#pii-rule), or
   [Third-party components](../../docs/standards/logging-diagnostics.md#third-party-components))
   and names its band (Tier 1 or Tier 2). The file-level verdict is `PASS` or
   `FAIL`. Feedback is **recorded on the artefact under review** — the file's
   review comments or the ticket's review section — never only in chat.

## Operating rule

Stream progress and blockers as you go, and do not stop to ask a clarifying
question — take the reasonable option, proceed, and record the choice and the
rejected alternative. A stated failure with its reason is a valid outcome; a
silent stop, or a question instead of one, is not. This overrides a skill or
harness default that says to pause for approval on an approach or a scope. It
never overrides a pause for a destructive or irreversible action, or for a
decision the standards reserve for a human. Full rule:
[agent-integration.md](../../docs/standards/guardrails/agent-integration.md#progress-blockers-and-questions).

## What this is (and isn't)

- **References, never restates.** This skill points at
  [logging-diagnostics.md](../../docs/standards/logging-diagnostics.md) by
  name and anchor; it does not reproduce the rules. The standard is the single
  source of truth.
- **Review, not enforcement.** It does not wire or run analysers — that is
  Stream-A work, per the standard's
  [enforcement boundary](../../docs/standards/logging-diagnostics.md#enforcement-boundary)
  during repository setup. This skill covers the judgements only.
- **Does not wrap other skills.** It references them
  (such as requesting-code-review and receiving-code-review) by name; it never
  intercepts their entry points.
