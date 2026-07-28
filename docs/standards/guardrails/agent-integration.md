---
type: reference
summary: How the gates reach an agent — the root instruction file every harness reads, kept equivalent across harnesses, and the edit and task-completion hooks each must fire.
read_when: Adopting the toolkit in a repository agents work in, or adding support for another agent harness.
---

# Agent integration

Two of the nine gates are the agent's rather than git's: the
[edit gate](gate-1-edit.md) fires on every file write, and the
[task-completion gate](gate-4-task-completion.md) fires when work is handed
back. Neither is a git hook, so neither exists unless the harness the agent runs
in is wired to fire it.

A repository is worked in by more than one harness — different people, different
tools, the same repository. **What the gates require must not depend on
which one somebody happened to open.**

## The root instruction file

Every harness reads an instruction file from the repository root, and they do
not agree on its name. `AGENTS.md` is the emerging cross-tool convention;
`CLAUDE.md` is Claude Code's; others read their own.

The rule is **parity, not preference**: whatever set of files the harnesses in
use read, an agent must get the same rules from whichever one it loads. A
repository whose `CLAUDE.md` carries operating rules its `AGENTS.md` omits has
two standards and no way to tell which applied to a given change.

Parity is achieved by having **one canonical file and thin pointers**, not by
maintaining copies:

- One file holds the content. `AGENTS.md` is the sensible default, being the
  broadest convention.
- Every other name a harness in use reads is a short file that points at it and
  carries nothing of its own.

Copies drift within a week and nothing detects it. A pointer cannot drift,
because there is nothing in it to go stale.

**What the root file must carry**, from the standards' side:

- The `.logs` location, where a repository overrides the default.
- Whatever operating rules the repository holds agents to.
- A pointer to the standards themselves, so an agent can find the gate it is
  about to trip before tripping it.

## Hooks, per harness

Each harness names its hook points differently. The requirement is behavioural,
so it is stated as behaviour:

| Requirement                                                                                                          | Corresponds to |
| -------------------------------------------------------------------------------------------------------------------- | -------------- |
| After a file is written, the file is formatted and security-scanned, and a finding in a tracked file fails the write | Gate 1         |
| Before work is handed back, the whole branch is measured against its base and the findings reported in one pass      | Gate 4         |

**Every harness in use gets both, or the gates are advisory.** An agent working
in an unwired harness writes past exactly the checks that exist to catch it
early, and the first thing that notices is the commit gate — which is the
outcome gate 1 exists to prevent.

Where a harness cannot fire one of them, that is a **recorded gap**, not a
silent difference: the repository knows one of its harnesses is weaker, and the
commit gate is doing that work instead.

## Verification

- [ ] Every harness in use reads a root instruction file, and all of them
      resolve to the same content.
- [ ] Only one of those files holds content; the rest are pointers.
- [ ] The root file names the `.logs` location where it differs from the default.
- [ ] Each harness in use fires an edit-time check and a task-completion check.
- [ ] A security finding written into a tracked file fails the write in **every**
      harness, not just the one it was configured in first.
- [ ] A harness that cannot fire a hook has that recorded, naming which gate is
      covering for it.

## References

- [Gate 1 — Edit](gate-1-edit.md) — what the edit hook must do.
- [Gate 4 — Task completion](gate-4-task-completion.md) — what the hand-off hook
  must measure.
- [Diagnostic logs](diagnostic-logs.md) — the `.logs` default the root file
  overrides.
- [File classes](file-classes.md) — agent-context files, and the limits they are
  held to.
