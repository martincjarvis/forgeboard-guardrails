# logging-review — .NET reference

<!-- cspell:ignore OpenTelemetry OTel ILogger LoggerMessage LogLevel EventId EventName AddFilter LogInformation LogWarning LogError FakeLogger FakeLogCollector FakeLogRecord StructuredState BannedApiAnalyzers BannedSymbols EnforceCodeStyleInBuild Sonar Serilog Aspire Meziantou Roslynator Microsoft NuGet CA2254 CA1848 CA2017 dotnet analyser analysers redaction redacted unredacted injectable behavioural TRACE DEBUG INFO WARN ERROR FATAL CRITICAL DI Tier -->

The .NET side of `logging-review`. Load with [checklist.md](checklist.md); see
[../SKILL.md](../SKILL.md) for procedure. Every rule below is owned by the
[logging & diagnostics standard](../../../docs/standards/logging-diagnostics.md);
this table states only what to **look for** in review and which tool already
enforces it mechanically. The canonical enforcer IDs live in the standard's
[per-stack realization](../../../docs/standards/logging-diagnostics.md#per-stack-realization).

## Enforcer split

| Rule                            | Analyser-owned (Tier 0)                                                                                                                                 | Skill-owned (Tier 1/2) — what to look for                                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structured template is constant | `CA2254` — template must be a constant, not interpolated                                                                                                | spot-check that no interpolated template slipped past                                                                                                             |
| High-perf `LoggerMessage` usage | `CA1848` — use the source-generated delegate                                                                                                            | spot-check that hot paths use the delegate, not `LogInformation(...)`                                                                                             |
| Template / argument count       | `CA2017` — parameter count mismatch                                                                                                                     | spot-check that the `{Field}` count matches the args                                                                                                              |
| No static logging               | `Microsoft.CodeAnalysis.BannedApiAnalyzers` with a `BannedSymbols.txt` banning `System.Console` / `Console.WriteLine` / direct `Trace` / `Debug` writes | spot-check the ban list covers the static sinks                                                                                                                   |
| Level mapping                   | — (no analyser)                                                                                                                                         | active: retry/compensated error = WARN, auditable no-PII = INFO, globally-handled non-fatal = ERROR, startup/unhandled = FATAL/CRITICAL                           |
| PII absent at INFO / any level  | — (no analyser)                                                                                                                                         | active: judge whether a field is PII (email, token, id); require redaction at every level                                                                         |
| Third-party ≤ WARNING           | — (no analyser)                                                                                                                                         | active: confirm a category filter (`AddFilter("Some.ThirdParty…", Warning)`) admits third-party categories only at WARN/ERROR                                     |
| Metrics over log messages       | — (no analyser)                                                                                                                                         | active: flag a `LogInformation("{Count} processed", n)` used as a throughput gauge — that is a metric                                                             |
| Effective logging is tested     | — (no analyser)                                                                                                                                         | presence: per-test `FakeLogCollector` capture; positive assertion on `Level` / `Id` / `StructuredState` / PII-absent; negative assertion on unexpected ERROR/WARN |
| Distributed tracing client → db | — (integration)                                                                                                                                         | presence (Tier 2): OpenTelemetry SDK wired; span propagation verified at integration/E2E                                                                          |

## .NET review notes

- The only admitted sink is `ILogger<T>` via DI; verify logging is
  [injected, not static](../../../docs/standards/logging-diagnostics.md#logging-via-an-injected-abstraction).
- The `[LoggerMessage]` source generator carries event identity
  (`EventId` / `EventName`) that tests assert on.
- Test capture uses `FakeLogger<T>` / `FakeLogCollector`; assert on
  `FakeLogRecord` fields. The namespace-versus-package trap for the
  fake-logging types is noted in the standard — check the `using` matches the
  namespace, not the package name.
