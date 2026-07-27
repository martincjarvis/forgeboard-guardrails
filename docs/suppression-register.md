# Suppression register

Every gate suppression in this repository, with the grounds it was accepted on and
the condition that would retire it. The `suppression-register` gate refuses a
suppression that has no row here, so this list cannot silently fall behind the code.

A row authorises **one rule at one path**. The same rule elsewhere needs its own row
— otherwise a single accepted exception quietly licenses that rule across the
repository, which is the broadened annotation ADR-0011 forbids, reached by another
route.

**What belongs here:** anything that turns a gate off for a line or a block —
`nosemgrep`, `eslint-disable`, `secretlint-disable`, `markdownlint-disable`,
`@ts-expect-error`, coverage ignores.

**What does not:** dictionary entries in `cspell.json`. A word the spell gate accepts
turns no check off; it teaches one vocabulary. Nor rules disabled wholesale in a
tool's own configuration — `MD013` in `.markdownlint.jsonc` is a project-wide style
decision documented where it is made, not an exception to a rule the project
otherwise keeps.

## Register

| Code                                                                                 | Scope                             | Justification                                                                                                                                                                                                                                  | Removable when                                                                                                                                   | Approved by   |
| ------------------------------------------------------------------------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| `javascript.ajv.security.audit.ajv-allerrors-true.ajv-allerrors-true`                | `src/config/load.ts`              | The validated input is the repo's own `guardrails.config.json`, not untrusted data. `allErrors` is what lets a misconfiguration report every problem in one run rather than one per attempt.                                                   | The validator is pointed at input the repo does not control. It is not today, and doing so would be a design change rather than a tweak.         | Martin Jarvis |
| `javascript.lang.security.detect-child-process.detect-child-process`                 | `src/exec/commandRunner.ts`       | Running the consuming repo's own declared build and test commands is the feature. They are arbitrary shell strings by design, and whoever can edit `guardrails.config.json` already controls the repo.                                         | Never, while the command-sequence feature exists. Hardening this to an argv array would remove the capability the toolkit is built to provide.   | Martin Jarvis |
| `javascript.lang.security.audit.spawn-shell-true.spawn-shell-true`                   | `src/exec/commandRunner.ts`       | The same single call as the row above — two rules flag one line. The shell is required because the configured commands are shell strings.                                                                                                      | As above.                                                                                                                                        | Martin Jarvis |
| `javascript.lang.security.detect-child-process.detect-child-process`                 | `src/exec/localBin.ts`            | Runs a binary resolved from this package's own `node_modules/.bin` and verified to exist, with an argv array. Nothing is interpolated into a command line.                                                                                     | The binary path comes from configuration rather than from this package's own dependencies.                                                       | Martin Jarvis |
| `javascript.lang.security.audit.spawn-shell-true.spawn-shell-true`                   | `src/exec/localBin.ts`            | The shell is used on Windows only, where these tools are `.cmd` shims that cannot be executed directly. The arguments remain an argv array.                                                                                                    | Node can execute `.cmd` shims without a shell, or the toolkit stops supporting Windows.                                                          | Martin Jarvis |
| `javascript.lang.security.detect-child-process.detect-child-process`                 | `src/exec/runExternalBin.ts`      | An argv array with `shell: false`, so there is no command line for an argument to escape into. The binary name is one of a fixed internal set, currently only `semgrep`.                                                                       | The external-tool set is driven by configuration rather than by the toolkit's own gate definitions.                                              | Martin Jarvis |
| `javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp` | `src/status/ticketId.ts`          | The pattern is the consuming repo's own configured `ticketIdPattern`, matched against a short branch name. A pathological pattern costs that repo its own pre-commit and crosses no privilege boundary.                                        | The pattern is matched against attacker-controlled input, or against something long enough for backtracking to matter.                           | Martin Jarvis |
| `security/detect-unsafe-regex`                                                       | `src/gates/conventionalCommit.ts` | False positive. The pattern is anchored, is a fixed alternation of literal type names, and has one optional group with no nested quantifier, so it cannot backtrack catastrophically.                                                          | The pattern gains a nested quantifier, at which point the finding becomes real and the pattern should change rather than the suppression.        | Martin Jarvis |
| `security/detect-non-literal-regexp`                                                 | `src/status/ticketId.ts`          | The same accepted risk already registered for semgrep on this line, now raised by a second tool: the pattern is the consuming repo's own configured `ticketIdPattern`, matched against a short branch name, and crosses no privilege boundary. | As the semgrep row above: the pattern is matched against attacker-controlled input, or against something long enough for backtracking to matter. | Martin Jarvis |

## Reviewing this list

The **Removable when** column is the point of the exercise. A suppression with no
stated removal condition is permanent by default, and nobody notices when the
condition that justified it stops holding.

Five of these seven are the same two rules on three call sites that all do the same
thing: start a child process to run a tool. If that ever consolidates behind one
runner, the register should shrink with it — a growing list of near-identical rows is
a design signal, not just bookkeeping.
