---
name: guardrail-audit
description: Use when auditing a repository against the guardrail standards, adopting guardrails in an existing repository, or asked which gates and checks a repository is missing. Walks the nine gates, reports what is present, absent, partial or suppressed, and proposes a concrete tool per gap using the stack's own tooling first.
---

<!-- cspell:ignore pyproject -->

# Guardrail audit

Evaluate a repository against the guardrail standards and drive it to
compliance. The standard states what must be true; this states what to do about
it.

The standard lives at `docs/standards/guardrail-standards.md` with its
references under `docs/standards/guardrails/`. **Load one gate's reference at a
time**, when you reach that gate — not all of them up front.

## Before you start

1. **Establish the stacks.** Look for manifests: `package.json`, `*.csproj` or
   `*.sln`, `pyproject.toml`, `go.mod`, `Cargo.toml`. A repository may have
   several; each needs its own answer for the build, lint, test and analyser
   checks.
2. **Establish the host.** `git remote -v` tells you which platform's
   capabilities are available. Read `references/platforms.md` when you reach
   gate 6 or gate 7.
3. **Establish what already exists.** Before proposing anything:
   - `git config --get core.hooksPath` and list that directory
   - the pipeline definitions under `.github/workflows/`, `azure-pipelines.yml`
     or equivalent
   - what the gates will derive from: the project graph, the task names, the
     analysers' configuration, and `.gitattributes` — plus any override the
     repository has written
   - existing registers, and any decision records under `docs/ADR/` or
     equivalent

**Read the opt-out records first.** A check excluded by a decision record is not
a finding — re-raising it every audit is the failure mode the standard names
explicitly. Note it as suppressed and move on.

## The audit

Walk the gates in order. For each gate, load its reference, work its
verification checklist, and record one state per check.

| State          | Means                                                                        |
| -------------- | ---------------------------------------------------------------------------- |
| **Present**    | The check runs, blocks as its type requires, and you saw it                  |
| **Partial**    | It runs but does not block, or blocks locally with no server-side equivalent |
| **Absent**     | Nothing enforces it                                                          |
| **Suppressed** | Excluded by a decision record — name the record                              |
| **Unknown**    | You could not determine it. Say so rather than guessing                      |

| Gate | Reference                                             | Load it when                           |
| ---- | ----------------------------------------------------- | -------------------------------------- |
| 0    | `docs/standards/guardrails/gate-0-baseline.md`        | Checking what runs before work starts  |
| 1    | `docs/standards/guardrails/gate-1-edit.md`            | Checking editor or agent write hooks   |
| 2    | `docs/standards/guardrails/gate-2-commit.md`          | Checking commit-time enforcement       |
| 3    | `docs/standards/guardrails/gate-3-commit-message.md`  | Checking message format and versioning |
| 4    | `docs/standards/guardrails/gate-4-task-completion.md` | Checking branch-level size limits      |
| 5    | `docs/standards/guardrails/gate-5-push.md`            | Checking the slower test tiers         |
| 6    | `docs/standards/guardrails/gate-6-pull-request.md`    | Checking the pipeline and merge policy |
| 7    | `docs/standards/guardrails/gate-7-on-demand.md`       | Checking whole-repository sweeps       |
| 8    | `docs/standards/guardrails/gate-8-release.md`         | Checking the release pipeline          |

Shared vocabulary, loaded when a gate depends on it:

| Reference                                              | Load it when                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------ |
| `docs/standards/guardrails/components.md`              | Any gate scopes work by component, or the map looks wrong                |
| `docs/standards/guardrails/thresholds.md`              | A number is in question, or a repository has none                        |
| `docs/standards/guardrails/file-classes.md`            | A check's verdict depends on what kind of file it is                     |
| `docs/standards/guardrails/registers.md`               | Auditing what a repository has accepted                                  |
| `docs/standards/guardrails/change-triggered-checks.md` | A check reported nothing and you need to know whether that is correct    |
| `docs/standards/guardrails/cross-gate-rules.md`        | Judging whether a gate is defective in a way its checks would not reveal |
| `docs/standards/guardrails/bypass-and-exceptions.md`   | A check is off, or an exception needs recording                          |

## Adapt to what is there

**Start from the tools the repository already uses.** Read its manifests, its
pipeline definitions and its hook scripts before forming any opinion about what
it should use. The audit's question is whether each check is enforced, not
whether it is enforced with your preferred tool.

A tool that meets the standard is not a finding, however you would have chosen
differently. Replacing it costs the team a migration, a retraining, and a period
where the thing that used to work does not — for a result the standard already
considered satisfied.

Propose a different tool only when one of these is true:

- **It cannot meet the standard.** Name the check it fails and why, not a
  preference.
- **It is unmaintained**, and that is demonstrable rather than an impression.
- **The repository is new**, so nothing is being replaced and nothing is being
  migrated.

Where none holds, record what is in use and audit against it.

## Verifying rather than assuming

A check listed in configuration is not a check that works. For anything you
report as **Present**, you must have seen one of:

- the command run and fail on something it should fail on, or
- the check's own output in a gate run, naming the file it judged.

Configuration alone is **Partial** at best. The standard's own phrasing applies
to you: state only what you actually checked.

The highest-value probes, in order:

1. **Break one check deliberately and commit.** A planted credential, a
   deliberate lint error, an over-long line. The gate either refuses or it does
   not. Undo afterwards.
2. **Remove the local hooks and push.** Everything that still catches the
   problem is genuinely enforced; everything that stops catching it was local
   only, which the standard classes as advisory.
3. **Run the repository-wide sweeps.** Gates 1 and 2 only ever saw files
   somebody touched. What is already in the tree, or already in the history, has
   never been examined.

## Reporting

Report per gate, most severe first. For each finding:

```text
Gate <n> check <m> — <check name>
State:    Absent | Partial | Unknown
Evidence: what you ran, and what it did
Risk:     what reaches production because this does not run
Fix:      the specific tool and invocation, from the stack reference
```

Rank by what the gap admits, not by how easy it is to close. A missing secret
scan outranks a missing spell check regardless of effort.

**Do not fix anything during an audit unless asked.** The audit's output is a
list; applying it is a separate decision with its own review.

## Proposing a fix

When asked to close a gap, follow the tooling ladder in
`docs/standards/guardrails/cross-gate-rules.md`:

1. **A capability the host already offers.** Read `references/platforms.md`.
   Enabling one is a configuration change, not a dependency.
2. **An established tool.** Read the stack reference below for the default this
   skill recommends, and why.
3. **Something written here.** Only for a gap the first two do not cover, and it
   needs a recorded reason.

| Reference                      | Load it when                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| `references/tooling-shared.md` | The check is stack-independent — format, spelling, secrets, prose, cross-language analysis |
| `references/tooling-node.md`   | The repository has a `package.json`                                                        |
| `references/tooling-dotnet.md` | The repository has a `.csproj` or `.sln`                                                   |
| `references/platforms.md`      | Proposing anything at gate 6, gate 7 or gate 8                                             |

## A stack with no reference

There are references for some stacks and not others. **A stack with no reference
is not unsupported** — it is one where you derive the answer from the ladder
rather than reading it off. Do that deliberately, in this order:

1. **The stack's own tool, where it has one.** Its formatter, its linter, its
   type checker, its test runner, its lock file. These beat anything external
   because they understand the language.
2. **The Node ecosystem as the fallback**, for every check the stack has no
   answer to — the formatter for non-code files, the prose lint, the spell
   check, the secret scan, the commit-message check. Take it rather than
   inventing something, so two repositories on the same stack converge.
3. **Only for a new repository, consider a stack-native alternative** to the
   fallback — and only where the team has said the fallback is unacceptable to
   them. For anything already running, see the rule below.

**Record what you derived.** A stack without a reference will be met again, and
the second derivation should not have to start over — or worse, land somewhere
different. The output of deriving is a decision record naming the tool chosen
per check and why, which is the thing a reference would have been.

Prefer the stack's own tool where one exists; fall back to the Node ecosystem
where none does. One implementation of a stack-independent check across every repository is
worth more than a per-stack choice.

## Rules you do not get to relax

- **Never approve an exception.** Fill in every column of a register row except
  the approver, and put that to a human. The same applies to a decision record:
  draft it, do not resolve it.
- **A push back is answered with a resolved decision record**, not a commit
  message note and not a conversation.
- **Do not propose raising a threshold to admit the change in hand.** That is
  the failure mode the standard exists to catch. Propose splitting the work, or
  draft the record that argues for the exception.
- **Do not re-raise an opted-out check.** Report it as suppressed, naming its
  record. Do flag an opt-out whose removal condition has since become true —
  that is a finding.
- **Report Unknown rather than guessing.** A gate you could not exercise is not
  a gate you can vouch for.

## Adopting guardrails in a repository that has none

Order matters, because early gates are cheap to add and worthless if the
repository is already dirty.

1. **Run gate 7 first** — the whole-repository and history sweeps. Fix or
   register what they find before adding gates that only see new changes.
   Otherwise the guardrails certify a repository nobody has ever examined.
2. **Declare the vocabulary**: the component map, the file-class patterns, the
   thresholds. Every later gate reads them.
3. **Gate 6 before the local gates.** The server-side gate is the one that
   cannot be skipped; local gates without it are a convention. Adding it first
   also means the local gates can be introduced one at a time without a window
   where nothing enforces.
4. **Then gates 2 and 3**, which catch the most per unit of effort.
5. **Then 0, 1, 4, 5**, in whatever order suits the team.
6. **Gate 8 last**, when there is a release pipeline to gate.

Add each gate's checks in the order the gate reference lists them: the ordering
is part of the contract, not a presentation choice.

## References

- `docs/standards/guardrail-standards.md` — the standard this skill applies.
- `references/tooling-shared.md` — stack-independent defaults.
- `references/tooling-node.md` — Node defaults.
- `references/tooling-dotnet.md` — .NET defaults.
- `references/platforms.md` — what each host provides, and what to enable.
