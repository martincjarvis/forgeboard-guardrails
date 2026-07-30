---
type: reference
summary: The gates a guarded repository runs, ordered by how often each fires, with the check types and verdicts every gate shares — an index to the per-gate references.
read_when: Deciding which gate a check belongs in, or starting an audit of a repository's gates.
---

# Guardrail standards

The checks a guarded repository runs, grouped by the gate that fires them and
typed by what each one defends. Tool-independent: a check is named by the
property it enforces, not by the program that enforces it.

This page is the index. Each gate has its own reference, carrying that gate's
checks, its rules and its verification checklist.

## Gates by frequency

Highest priority first. A check placed in a gate that fires more often catches
the defect earlier and cheaper; a check placed too early slows every edit. The
frequency column is the ordering rule for this standard and for any new check.

Gate 0 is the one exception, and it heads the list on lifecycle position rather
than frequency: it runs before the work exists, so every gate below depends on
it having passed.

| Priority | Gate                                                       | Fires                                                    | Blocks?                                                 | Scope of inputs                               |
| -------- | ---------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------- |
| 0        | [Baseline](guardrails/gate-0-baseline.md)                  | Before each unit of work                                 | Yes — the work does not start                           | The rebased workspace                         |
| 1        | [Edit](guardrails/gate-1-edit.md)                          | Every file write                                         | Security findings only, in tracked files                | The one file just written                     |
| 2        | [Commit](guardrails/gate-2-commit.md)                      | Every commit attempt                                     | Yes                                                     | Staged content only                           |
| 3        | [Commit message](guardrails/gate-3-commit-message.md)      | Every commit attempt                                     | Yes                                                     | The message text                              |
| 4        | [Task completion](guardrails/gate-4-task-completion.md)    | An agent task hand-off, or before opening a pull request | Yes                                                     | Whole branch versus base                      |
| 5        | [Push](guardrails/gate-5-push.md)                          | Every push attempt                                       | Yes                                                     | Commit range being pushed                     |
| 6        | [Pull request pipeline](guardrails/gate-6-pull-request.md) | Opening a pull request, and every push to it             | Yes — and this is the verdict the merge policy consults | The merge result, server-side                 |
| 7        | [On demand](guardrails/gate-7-on-demand.md)                | Manual invocation                                        | Reports; caller decides                                 | Whole repository                              |
| 8        | [Release](guardrails/gate-8-release.md)                    | Deploying a merged change                                | Yes — the deployment does not proceed                   | The built artefact and its target environment |

## Verdicts

Four verdicts appear throughout, and two of them need saying up front.

| Verdict       | Means                                                                                                                                                                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pass          | Ran, found nothing                                                                                                                                                                                                                                                            |
| Warn          | Printed; nobody has to respond                                                                                                                                                                                                                                                |
| **Push back** | Stops and asks. The finding goes to the author with its options, and the answer is recorded before the work proceeds — a resolved decision record, or the override marker where one applies. Where no author is present, the check looks for that record and fails without it |
| Block         | Refused outright                                                                                                                                                                                                                                                              |

A **decision record** is the artefact holding one choice, its alternatives and
why — the same thing an architecture decision record holds. It is what push back
resolves into, what a licence exception needs, and what opting out of a check
requires. Registers, by contrast, hold accepted findings one row at a time; both
are set out in [Registers](guardrails/registers.md).

## One word, three meanings

The corpus uses three numbered scales, and they are not related. A reader who
conflates them will reach for the wrong one:

| Term              | Belongs to                                         | Means                                                      |
| ----------------- | -------------------------------------------------- | ---------------------------------------------------------- |
| **Kind** of test  | [Testing strategy](testing-strategy.md)            | Unit, architecture, integration, end-to-end, smoke, health |
| **Tier** 0, 1, 2  | [Logging and diagnostics](logging-diagnostics.md)  | How hard a logging rule is enforced                        |
| **Level** 1, 2, 3 | [Cross-gate rules](guardrails/cross-gate-rules.md) | Where a check's implementation comes from                  |

## Warn means two different things

**Warn** names a designed verdict band in one place and a tool's own severity
setting in another, and they are not the same thing:

| Sense         | Belongs to                                                                                      | Means                                                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Verdict band  | The [verdicts](#verdicts) table above, and [thresholds](guardrails/thresholds.md)               | Printed; nobody has to respond — a designed stopping point, not a failure                                                  |
| Tool severity | A linter's or compiler's own severity setting (eslint's `warn`, a compiler's non-fatal warning) | Not a verdict at all — [a warning is a failure](guardrails/cross-gate-rules.md#a-warning-is-a-failure) still applies to it |

Configuring a rule at a tool's own `warn` severity does not place it in the
verdict band above; it only changes what the tool prints. The rule still has to
fail the run — `--max-warnings 0` for eslint, `-warnaserror` for the .NET
compiler, the stack's own equivalent otherwise — or it is warn-only forever,
however severely it fires.

## Check types

Every check carries one type. The type states what the check defends, and
determines the verdict it is allowed to return.

| Type          | Defends                                          | Verdict discipline                                                                                                                                                                                                                   |
| ------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Format        | Mechanical shape of the source                   | Repair silently; never block on something auto-fixable                                                                                                                                                                               |
| Integrity     | That the gate is judging the true inputs         | Block; an unverifiable result blocks the same as a bad one                                                                                                                                                                           |
| Security      | Secrets, injection, unsafe constructs            | Block; exception only per-rule and recorded                                                                                                                                                                                          |
| Correctness   | Build succeeds, tests pass, coverage holds       | Block                                                                                                                                                                                                                                |
| Policy        | Rules about how work is recorded and branched    | Block                                                                                                                                                                                                                                |
| Documentation | Prose, spelling, links, anchors                  | Repair where unambiguous, else block                                                                                                                                                                                                 |
| Size          | Change size, file length, complexity, file bytes | Every Size check has a warn band and an error band; error blocks. Warn pushes back for the classes named in gate 4 and warns for the rest — except file bytes, which pushes back for every class. Only change size takes an override |
| Evidence      | That a verdict can be checked by someone else    | Publish on failure as well as success; a missing or unreadable artefact fails the gate                                                                                                                                               |

## Shared vocabulary

Every gate reads from these. An auditor loads them once and keeps them open.

| Reference                                                        | Answers                                                                                 |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [Thresholds](guardrails/thresholds.md)                           | Every number, its default, and when the stack's own analyser overrides it               |
| [File classes](guardrails/file-classes.md)                       | What counts as production, test, configuration, documentation, agent context or tooling |
| [Components](guardrails/components.md)                           | What a component is, what the map declares, and the changed-component rule              |
| [Registers](guardrails/registers.md)                             | The three checked-in records, their columns, and what each gate does with them          |
| [Change-triggered checks](guardrails/change-triggered-checks.md) | Which checks run only when their inputs move, and which also run on a schedule          |

## Cross-cutting rules

| Reference                                                    | Covers                                                                                                                        |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| [Cross-gate rules](guardrails/cross-gate-rules.md)           | The rules every gate holds: ordering, tooling preference, evidence, refusals                                                  |
| [Bypass and exceptions](guardrails/bypass-and-exceptions.md) | Bypass flags, opting a check out, and how a suppressed check must report                                                      |
| [Agent integration](guardrails/agent-integration.md)         | The root instruction file, kept equivalent across harnesses, and the hooks each must fire                                     |
| [Diagnostic logs](guardrails/diagnostic-logs.md)             | What local gate runs capture, where it goes, and how long it lives                                                            |
| [Flaky tests](guardrails/flaky-tests.md)                     | Retries, quarantine, and why quarantine is the honest one                                                                     |
| [Placing a new check](guardrails/placing-a-new-check.md)     | The six steps from "we should check X" to a check that gates                                                                  |
| [Branch protection](guardrails/branch-protection.md)         | The host configuration that makes a required status check actually block a merge, and the script that applies and verifies it |

## References

- [Standards index](README.md) — the other standards a guarded repository consumes.
- [Suppression register](../registers/suppression-register.md) — this repository's own
  instance of the register described here.
- [Testing strategy](testing-strategy.md) — the six kinds of test the gates route
  by, the coverage gate's configuration, and the artifact categories.
- [Deployment strategy](deployment-strategy.md) — the release side of the
  component boundary, where per-component versioning is defined, and the source
  of the no-taint rule this standard restates.
