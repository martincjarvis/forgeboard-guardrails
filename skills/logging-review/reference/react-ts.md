# logging-review — React/TS reference

<!-- cspell:ignore OpenTelemetry ESLint analyser analysers redaction Tier -->

The React/TS side of `logging-review`. Load with [checklist.md](checklist.md);
see [../SKILL.md](../SKILL.md) for procedure.

> TypeScript has no direct `CA2254` analogue, so the review skill carries more
> of the structured-template weight here.

## Enforcer split

| Rule                              | Lint-owned (Tier 0)                                                                      | Skill-owned (Tier 1/2) — what to look for                                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| No static logging                 | ESLint `no-console`                                                                      | spot-check that no raw `console.log` / `console.error` slipped in                                                                           |
| Logging wrapper + structured args | project ESLint rule requiring the logging wrapper with structured-field object arguments | spot-check calls pass a structured fields object, not positional interpolation                                                              |
| Structured template is constant   | — (no `CA2254` analogue in TS)                                                           | active — carries the weight: the message is a constant template; fields are a separate structured object, not interpolated into the message |
| Level mapping                     | — (no lint)                                                                              | active: retry/compensated error = WARN, auditable no-PII = INFO, globally-handled non-fatal = ERROR, startup/unhandled = FATAL/CRITICAL     |
| PII absent at INFO / any level    | — (no lint)                                                                              | active: judge whether a field is PII; require redaction at every level                                                                      |
| Third-party ≤ WARNING             | — (no lint)                                                                              | active: third-party logger categories admitted only at WARN/ERROR                                                                           |
| Metrics over log messages         | — (no lint)                                                                              | active: a log used as a count or gauge is a metric breach                                                                                   |
| Effective logging is tested       | — (no lint)                                                                              | presence: per-test logger spy; positive assertion on level/fields/PII-absent; negative assertion on unexpected ERROR/WARN                   |
| Distributed tracing client → db   | — (integration)                                                                          | presence (Tier 2): OpenTelemetry-JS wired; span propagation verified at integration/E2E                                                     |

## React/TS review notes

- The only admitted sink is an injected logger — no raw `console`.
- Because the compiler will not catch a non-constant template, treat the
  message/fields split as a first-class review item.
