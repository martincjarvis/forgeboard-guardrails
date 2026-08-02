# logging-review — the tiered checklist

<!-- cspell:ignore ILogger OpenTelemetry analyser analysers redaction injectable -->

The active content of the `logging-review` skill, loaded by
[../SKILL.md](../SKILL.md). The per-stack concrete enforcers live in
[dotnet.md](dotnet.md) and [react-ts.md](react-ts.md).

## Tier 1 — active checks (the skill's job)

These are the judgements no analyser can make: an analyser cannot know an email
is PII or that a retry belongs at WARN.

| Check                | What to verify                                                                                                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Level mapping        | each discrete event is at the level its operational meaning demands: retry / compensated error = WARN, auditable event (no PII) = INFO, globally-handled non-fatal = ERROR, startup / unhandled = FATAL/CRITICAL |
| PII absent           | no PII in auditable INFO events, and no PII at any level without explicit redaction                                                                                                                              |
| Third-party level    | output from external libraries is admitted only at WARN/ERROR, never at INFO/DEBUG                                                                                                                               |
| Metrics over logs    | rates, gauges, counts, and latencies go to metrics — a log message used as a throughput gauge is a breach                                                                                                        |
| Injected abstraction | logging goes through an injected abstraction (`ILogger<T>` / injected logger); no statics, no `Console`/`console` or raw `Trace`/`Debug`                                                                         |
| Tested logging       | test-scoped capture (per-test collector/spy), a positive assertion (event identity, level, fields, PII absent), and a negative assertion (no unexpected ERROR/WARN)                                              |

## Tier 0 — spot-check (analyser-owned)

Confirm the analyser or lint set is **enabled and the code is clean under it**;
do **not** re-implement the analysers. Spot-check only: constant message
templates, `LoggerMessage` / `[LoggerMessage]` usage, template/argument count
agreement, and that static logging is banned. The concrete rule IDs are in
[dotnet.md](dotnet.md) and [react-ts.md](react-ts.md).

## Tier 2 — presence (integration-level)

Confirm distributed-tracing instrumentation is **present**, propagated
client → database, and flag that **full verification is integration-level** —
span propagation across component boundaries is proven at integration/E2E, not
on a snippet.
