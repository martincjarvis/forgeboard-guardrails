---
type: reference
summary: The logging and diagnostics policy — level mapping, PII, tracing, and which rules are analyser-enforced versus review-enforced.
read_when: Writing or reviewing logging code, or configuring the analysers that enforce it.
---

<!-- cspell:ignore OpenTelemetry OTel ILogger LoggerMessage EventId EventName LogLevel FakeLogger FakeLogCollector FakeLogRecord StructuredState BannedApiAnalyzers BannedSymbols EnforceCodeStyleInBuild Sonar Serilog Aspire dotnet analyser analysers redaction redacted unredacted TRACE DEBUG INFO WARN ERROR FATAL CRITICAL injectable behavioural Microsoft NuGet CA2254 CA1848 CA2017 AddFilter LogInformation -->

# Logging & diagnostics standard

The canonical policy for both stacks: what each rule requires, how it is realized in
.NET 10 LTS and React/TS, and where the enforcement boundary between analysers and
review sits.

## Logging rules

### Distributed tracing

Distributed tracing is provided by **OpenTelemetry**, propagated end-to-end **client → database**. Context (trace and span identifiers) crosses every component boundary, so a request can be reconstructed across the frontend, backend, and data layer without log-correlation guesswork. This is a **presence/integration** concern (Tier 2): the policy requires the instrumentation to be in place, and full verification is integration- and E2E-level, deferred to those layers rather than proven on a snippet.

### Metrics over log messages

Logs record **discrete events**; they are not the channel for rates, gauges, counts, or latencies. Prefer metrics, counters, and histograms for any measurement — a `log.Information("processed {Count} in {Ms}ms", …)` used as a throughput gauge is a policy breach (see the seeded samples), because it bypasses aggregation, sampling, and dashboards and floods the log stream. If a value is measured, it is a metric.

### Level defaults

**TRACE/DEBUG** are for dev runs and diagnostics only and must never ship as the production floor. The default level is **INFO**; configuration (per-category filters, environment overrides) tightens from there. Keep the default stream **low-noise**: auditable events and discrete errors, not routine progress chatter.

### Level mapping

Each discrete event is logged at the level its operational meaning demands. Mis-levelled events are a policy breach — a compensated error at ERROR is as wrong as a startup failure at INFO.

| Situation                                          | Level          |
| -------------------------------------------------- | -------------- |
| Auditable event (no PII)                           | INFO           |
| Compensated error, e.g. each retry                 | WARN           |
| Non-fatal error handled globally (middleware etc.) | ERROR          |
| Startup / unhandled                                | FATAL/CRITICAL |

### Third-party components

Output from external libraries is **capped at WARNING and above** (the "≤ WARNING" nuance lives here in the body, not in the heading). Third-party logs are admitted only at WARN/ERROR so a library's internal noise never dilutes the application's auditable INFO stream. Configure a category filter (`AddFilter("Some.ThirdParty…", Warning)` / per-provider level) rather than admitting third-party categories at INFO or DEBUG.

### PII rule

Auditable **INFO** events carry **no PII**: an order-confirmation audit logs the `OrderId`, never the customer email. More strongly, **PII never appears in log output at any level without explicit redaction** — a redaction layer sits between structured fields and the sink. An analyser cannot know that a `string` is an email or a token; judging that a field is PII, and redacting it, is the `logging-review` skill's job (Tier 1).

### Logging via an injected abstraction

All logging goes through a **DI-provided, configurable abstraction** — `ILogger<T>` (.NET) or an injected logger (React/TS) — **never statics**. `Console.WriteLine`, direct `System.Diagnostics` `Trace`/`Debug` writes, and raw `console.log`/`console.error` are **banned**. The rationale is twofold: _configurability_ (level, sink, redaction, and sampling are all controlled at the composition root) **and testability** (an injected logger can be captured and asserted on; a `Console.WriteLine` cannot). This is the rule that makes every other rule enforceable.

### Effective logging is tested behaviour

Because auditable events and level-mapping are operational requirements, they are asserted in tests, not left incidental. The rule has three parts:

- **Test-scoped capture** — logs emitted during a test run are captured and **associated with that test** via a per-test collector/spy, with no cross-test leakage. .NET: a per-test `FakeLogCollector` (and/or an `ILogger` wired to the test-output sink); React/TS: a per-test logger spy.
- **Positive assertion** — the expected log events are asserted: event identity, level, structured fields present, and **PII absent**.
- **Negative assertion** — **no unexpected ERROR or WARNING** records occur during the run; an unanticipated warning/error fails the test, carrying the repo's 0-warning/0-error posture down to behavioural level.

This is the test-integrity rule applied to logging: a test encodes the requirement and fails when it is unmet, rather than being rewritten to match what the code happens to emit.

## Realization and enforcement

### Per-stack realization

Each stack states, for every rule, what is **mechanically enforced by →** an analyser or lint rule (Tier 0) versus what is **reviewed by →** the `logging-review` skill (Tier 1/2). Tooling targets the **latest LTS** of each stack; concrete package versions are pinned and verified against current releases at implementation time, never copied stale from the spec. The analyser IDs and the testing types below were verified against current .NET 10 documentation at implementation time; where an ID could not be independently confirmed, it is kept as given and noted here.

**.NET (.NET 10 LTS):** `Microsoft.Extensions.Logging` `ILogger<T>` via DI; the `[LoggerMessage]` source generator for high-performance structured logging; the OpenTelemetry .NET SDK for tracing/metrics; `FakeLogger`/`FakeLogCollector` for tests. Tier-0 analysers: `CA2254` (_Template should be a static expression_ — message template must be a constant, not interpolated), `CA1848` (_Use the LoggerMessage delegates_), `CA2017` (_Parameter count mismatch_ — template vs argument count), and `Microsoft.CodeAnalysis.BannedApiAnalyzers` with a `BannedSymbols.txt` banning `System.Console`/`Console.WriteLine`/direct `Trace`/`Debug` writes (enforces _no static logging_). Severities are pinned via `.editorconfig` + `<EnforceCodeStyleInBuild>`. Meziantou/Sonar/Roslynator logging rules are an optional extension.

> **Package ≠ namespace:** the fake-logging types `FakeLogger<T>`, `FakeLogCollector`, and `FakeLogRecord` live in the **namespace `Microsoft.Extensions.Logging.Testing`**, but ship in the **NuGet package `Microsoft.Extensions.Diagnostics.Testing`** (verified current line: `10.7.0`). The `using` must reference the namespace, not the package name — a common compile-error trap. `FakeLogRecord` exposes `Level`, `Id` (with `.Name`), `StructuredState`, and `Message`.

| Rule                            | Mechanically enforced by (Tier 0)          | Reviewed by (Tier 1/2 skill)                                |
| ------------------------------- | ------------------------------------------ | ----------------------------------------------------------- |
| Structured template is constant | `CA2254`                                   | skill spot-check                                            |
| High-perf `LoggerMessage` usage | `CA1848`                                   | skill spot-check                                            |
| Template/argument count         | `CA2017`                                   | skill spot-check                                            |
| No static logging               | `BannedApiAnalyzers` + `BannedSymbols.txt` | skill spot-check                                            |
| Level mapping                   | — (no analyser)                            | skill (active)                                              |
| PII absent at INFO / any level  | — (no analyser)                            | skill (active)                                              |
| Third-party ≤ WARNING           | — (no analyser)                            | skill (active)                                              |
| Metrics over log messages       | — (no analyser)                            | skill (active)                                              |
| Effective logging is tested     | — (no analyser)                            | skill (presence of capture + positive + negative assertion) |
| Distributed tracing client → db | — (integration)                            | skill (presence, Tier 2; verified at integration/E2E)       |

**React/TS (current Node.js LTS, React 19, TypeScript, ESLint 9 flat config):** an injected logger (never raw `console`); OpenTelemetry-JS for tracing/metrics; a logger spy for tests. Tier-0 lint: ESLint **`no-console`** (enforces _no static logging_) and a project rule requiring the logging wrapper with structured-field object arguments. **TypeScript has no direct `CA2254` analogue**, so the review skill carries more of the structured-template weight here — constant-template discipline is enforced by review, not by the compiler.

| Rule                              | Mechanically enforced by (Tier 0) | Reviewed by (Tier 1/2 skill)                                |
| --------------------------------- | --------------------------------- | ----------------------------------------------------------- |
| No static logging                 | ESLint `no-console`               | skill spot-check                                            |
| Logging wrapper + structured args | project ESLint rule               | skill spot-check                                            |
| Structured template is constant   | — (no `CA2254` analogue in TS)    | skill (active — carries the weight)                         |
| Level mapping                     | — (no lint)                       | skill (active)                                              |
| PII absent at INFO / any level    | — (no lint)                       | skill (active)                                              |
| Third-party ≤ WARNING             | — (no lint)                       | skill (active)                                              |
| Metrics over log messages         | — (no lint)                       | skill (active)                                              |
| Effective logging is tested       | — (no lint)                       | skill (presence of capture + positive + negative assertion) |
| Distributed tracing client → db   | — (integration)                   | skill (presence, Tier 2; verified at integration/E2E)       |

### Enforcement boundary

This standard **names and configures** the enforcing analysers. It does **not** wire them into any build gate — that is Stream A / repo-setup work: install the analyser set, pin severities in `.editorconfig`, and turn on `<EnforceCodeStyleInBuild>` so Tier-0 rules fail the build on breach.

Three tiers run through the policy:

| Tier  | Enforced by                                   | Covers                                                                       |
| ----- | --------------------------------------------- | ---------------------------------------------------------------------------- |
| **0** | Analyser / lint, failing the build            | Structured-logging mechanics, no static logging                              |
| **1** | Agent review, demonstrable on a snippet       | Level mapping, PII at INFO, third-party ≤ WARNING, metrics over log messages |
| **2** | Presence check, verified at integration / E2E | OpenTelemetry distributed tracing client → database                          |

_Tiers 1 and 2 are the semantic residue — the judgements no analyser can make. The `logging-review` skill carries them._

## References

- The two stacks this policy realizes for are .NET and React with TypeScript;
  a repository on another stack applies the same tiers through its own
  equivalents.
- The `logging-review` skill references this standard by name and never restates
  the policy.
- [Guardrail standards](guardrail-standards.md) — the gates that carry the
  zero-warning posture this policy extends to behavioural level.
- [Documentation style](docs-style.md) — how this document is structured.
