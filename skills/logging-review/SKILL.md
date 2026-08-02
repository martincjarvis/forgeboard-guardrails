---
name: logging-review
description: Use when reviewing changed .NET or React/TS code for logging and diagnostics quality — loads the tiered checklist and the matching per-stack reference, applies each check, and records a PASS/FAIL verdict per file with a finding per breach.
---

# Logging review

<!-- cspell:ignore analyser analysers artefact -->

Review changed .NET or React/TS code (or a representative sample) for logging
and diagnostics quality. This is the agent-review layer that sits over the
analyser- and lint-enforced rules and carries the semantic residue no analyser
can judge.

## Review procedure

1. **Load the checklist** — [reference/checklist.md](reference/checklist.md)
   defines the tiered checks: Tier 1 (active), Tier 0 (spot-check), and Tier 2
   (presence).
2. **Load the stack reference** — [reference/dotnet.md](reference/dotnet.md)
   for .NET or [reference/react-ts.md](reference/react-ts.md) for React/TS.
   Each splits every rule into what an analyser or lint rule already enforces
   mechanically versus what this skill must judge.
3. **Apply the checklist to each file.** Tier-1 checks are this skill's active
   job (level mapping, PII, third-party level, metrics-over-logs, logging via
   an injected abstraction, tested logging); Tier 0 is a spot-check that the
   analyser set is enabled and the code is clean under it; Tier 2 is a
   presence check for distributed tracing, whose full verification is
   integration-level.
4. **Record a finding per breach and a verdict per file.** Every breach names
   the checklist row it breaks and its tier. The file-level verdict is `PASS`
   or `FAIL`. Feedback is recorded on the artefact under review — the file's
   review comments or the ticket's review section — never only in chat.

## Scope

- **Review, not enforcement.** This skill does not wire or run analysers —
  that is [repository-bootstrap](../repository-bootstrap/SKILL.md) work, under
  the `lint` capability in [docs/standards.md](../../docs/standards.md). It
  covers the judgements only.
- **Worked examples.** [samples/](samples/) holds a conformant and a violating
  pair per stack; each sample README shows how to run the conformant tests in
  a scratch project and prove they fail against the violating pair.
