# logging-review — the tiered checklist

<!-- cspell:ignore .NET React TS ILogger LoggerMessage LogLevel DI OpenTelemetry OTel dotnet analyser analysers redaction redacted unredacted Tier injectable TRACE DEBUG INFO WARN ERROR FATAL CRITICAL -->

This checklist is the active content of the `logging-review` skill, loaded by
[../SKILL.md](../SKILL.md). The per-stack concrete enforcers live in
[dotnet.md](dotnet.md) and [react-ts.md](react-ts.md). Every check maps to its
anchor in the
[logging & diagnostics standard](../../../docs/standards/logging-diagnostics.md);
the tiers mirror the standard's
[enforcement boundary](../../../docs/standards/logging-diagnostics.md#enforcement-boundary).

## Tier 1 — active checks (the skill's job)

These are the judgements no analyser can make.

> an analyser cannot know an email is PII or that a retry belongs at WARN — this is the skill's job.

| Check                | What to verify                                                                                                                                                                                                   | Policy anchor                                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Level mapping        | each discrete event is at the level its operational meaning demands: retry / compensated error = WARN, auditable event (no PII) = INFO, globally-handled non-fatal = ERROR, startup / unhandled = FATAL/CRITICAL | [Level mapping](../../../docs/standards/logging-diagnostics.md#level-mapping)                                                 |
| PII absent           | no PII in auditable INFO events, and no PII at any level without explicit redaction                                                                                                                              | [PII rule](../../../docs/standards/logging-diagnostics.md#pii-rule)                                                           |
| Third-party level    | output from external libraries is admitted only at WARN/ERROR (≤ WARNING), never at INFO/DEBUG                                                                                                                   | [Third-party components](../../../docs/standards/logging-diagnostics.md#third-party-components)                               |
| Metrics over logs    | rates, gauges, counts, and latencies go to metrics — a log message used as a throughput gauge is a breach                                                                                                        | [Metrics over log messages](../../../docs/standards/logging-diagnostics.md#metrics-over-log-messages)                         |
| Injected abstraction | logging goes through a DI-provided / injected abstraction (`ILogger<T>` / injected logger); no statics, no `Console`/`console` or raw `Trace`/`Debug`                                                            | [Logging via an injected abstraction](../../../docs/standards/logging-diagnostics.md#logging-via-an-injected-abstraction)     |
| Tested logging       | test-scoped capture (per-test collector/spy), a positive assertion (event identity, level, fields, PII absent), and a negative assertion (no unexpected ERROR/WARN)                                              | [Effective logging is tested behaviour](../../../docs/standards/logging-diagnostics.md#effective-logging-is-tested-behaviour) |

## Tier 0 — spot-check (analyser-owned)

Confirm the analyser or lint set is **enabled and the code is clean under
it**; do **not** re-implement the analysers. Spot-check only: constant message
templates, `LoggerMessage` / `[LoggerMessage]` usage, template/argument count
agreement, and that the banned-static-logging analyser is active. These map to
the Tier-0 column of
[per-stack realization](../../../docs/standards/logging-diagnostics.md#per-stack-realization);
the concrete IDs are in [dotnet.md](dotnet.md) and [react-ts.md](react-ts.md).

## Tier 2 — presence (integration-level)

Confirm instrumentation is **present** for
[distributed tracing](../../../docs/standards/logging-diagnostics.md#distributed-tracing)
propagated client → database, and flag that **full verification is
integration-level** — span propagation across component boundaries is proven
at integration/E2E, not on a snippet. This mirrors the standard's stance that
tracing is a presence/integration concern.
