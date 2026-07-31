---
type: explanation
status: Accepted
decided: 2026-07-31
owner: Toolkit maintainers
summary: A file declared guardrail-generated in .gitattributes counts toward neither change size nor the length limit, because neither remedy — split it, or justify its size — is available for a file no author can meaningfully edit.
read_when: Asking why a lock file no longer dominates change size, or declaring guardrail-generated for a repository's own generated output.
---

# Generated files are discounted from change size

## Decision

**A file declared `guardrail-generated` counts toward neither change size nor
the length limit.** It keeps its `guardrail-class` for every other check —
secret scanning, licence policy and the advisory scan still read it; only
change size and the length limit stop counting it.

This is not confined to lock files. A code-generated source file — `*.g.cs`,
a protobuf or gRPC client, an OpenAPI-generated client — has the same
property: no author to ask, and any edit discarded by the next generation
run. `package-lock.json` is the worked example, not the whole rule.

## Why

[File classes](../standards/guardrails/file-classes.md) already asked
configuration and tooling to count toward change size, on the grounds that "a
900-line change to how the system is built ... still needs a human to look at
it." That argument is sound for a hand-written build script. It is not sound
for a file nobody wrote by hand:

> It's not like a developer can make a meaningful fix to a file that will be
> re-written the next time it's generated.

Change size's own remedy is stated twice in this corpus — "split it, or
justify its size" (gate-4-task-completion.md), "split the change, or record
why this one is justified" (the same check's warn-band message). Neither
applies to a generated file: a lock file cannot be split, and a justification
recorded today is discarded by the next `npm install`. A blocking check whose
remedy cannot be performed is not a gate, it is a toll payable only in
overrides — and an override that fires on every dependency bump stops being
read, which is the exact failure
[bypass-and-exceptions.md](../standards/guardrails/bypass-and-exceptions.md)
already names about routine exceptions generally.

**The measurement that motivated this.** Iteration 22's bootstrap commit,
change size resolved with `git check-attr` the same way `hooks/gate-4-task-
completion.mjs` resolves it in production: 14,959 counted lines
(configuration 6,521 — `package-lock.json` alone 6,033 of it — tooling 8,237,
production 201, against the 800-line error threshold). `package-lock.json` is
41% of the entire counted change size and 92% of the configuration class on
its own. The gate that asks "is this too much for one person to review" was
dominated by the one file nobody reviews, and every routine `npm update`
inherits the same distortion.

## Rejected alternatives

- **Leave it counted, rely on the `[large-pr]` override.** Defensible on the
  grounds that a dependency change is significant even when its diff is
  unreadable. Rejected because it makes the override routine — every
  dependency bump past the threshold would need one — and an exception that
  fires every time trains people to add it without reading, which is
  precisely what the override exists to prevent
  ([fix 74](../standards/guardrails/cross-gate-rules.md#an-override-answers-a-push-back-it-is-not-a-fix)
  is the standing rule that keeps the override itself from degrading the same
  way).
- **Fold the discount into `guardrail-class` as a sixth value
  (`guardrail-class=generated`).** Rejected because it would strip the file
  of its class for every _other_ check that reads `guardrail-class` — the
  licence scan, the advisory scan and secret scanning would stop seeing a
  lock file
  as configuration, which is an "an exemption hides a code path" failure this
  corpus has already shipped once (audit 12, `check-tooling-class.mjs`'s own
  class-exclusion gap). Declaring it as a **separate** attribute
  (`guardrail-generated`), queried on its own with `git check-attr
guardrail-generated -- <path>`, lets a file carry both facts at once — this
  toolkit's own `package-lock.json` already carries `text`, `eol` and
  `guardrail-class` simultaneously, and this is that same mechanism applied
  to a fourth, independent fact.
- **Reuse GitHub's `linguist-generated` attribute.** The obvious first
  reach, and rejected on the same grounds
  [ADR-0002](0002-analysis-tool-distribution.md) already states for a
  bundled tool: `linguist-generated` means something only where GitHub's
  Linguist runs. A rule that only holds on one platform is a rule this
  toolkit does not control, and `git check-attr` already resolves a
  toolkit-declared attribute identically everywhere git runs, with no
  platform dependency at all.
- **A hardcoded list of generated filenames in the check itself.**
  `package-lock.json` today, `yarn.lock`, `Cargo.lock` and
  `packages.lock.json` tomorrow — a list in a check is a list that goes
  stale, the defect class this series has hit repeatedly. `.gitattributes`
  is already the declared, per-repository source of truth for file facts
  ([ADR-0003](0003-derive-configuration.md)); this decision adds one more
  attribute to it rather than a second, code-level list.

## Consequences

- Re-measured with the discount, iteration 22's own commit drops from 14,959
  counted lines to 8,926 — `package-lock.json`'s 6,033 lines removed, nothing
  else changed. The bulk that remains (8,237 lines of ported tooling) is a
  real finding, addressed by
  [fix 74](../standards/guardrails/cross-gate-rules.md#an-override-answers-a-push-back-it-is-not-a-fix),
  not by this decision.
- A hand-written configuration or tooling file of the same size still counts
  in full — nothing here narrows the existing rule for files an author
  actually wrote.
- A bootstrap must now declare `guardrail-generated` for whatever its stack
  generates, derived from the manifests present, as part of the same step
  that already declares `guardrail-class` patterns.

## References

- [File classes](../standards/guardrails/file-classes.md) — the rule as
  stated for an implementer.
- [ADR-0002](0002-analysis-tool-distribution.md) — the platform-dependency
  reasoning `linguist-generated` was rejected on.
- [ADR-0003](0003-derive-configuration.md) — `.gitattributes` as the declared
  source of file facts.
- [Cross-gate rules](../standards/guardrails/cross-gate-rules.md#an-override-answers-a-push-back-it-is-not-a-fix) —
  fix 74, the standing rule that keeps `[large-pr]` from absorbing what this
  decision already removed.
