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

**Ship the hooks with the plugin where the harness allows it.** A harness whose
plugin format can carry hooks should carry them there rather than have each
repository edit its own settings: one declaration, installed with the plugin,
and nothing to keep in step per repository. Where the harness has no such
mechanism, the wiring is the repository's and belongs in its adoption steps.

**A hook whose tool is missing says so.** It does not pass quietly. An edit-time
scan that cannot run because the scanner is not installed reports that on the
edit it did not scan — the same rule every other gate follows.

**Hooks run on every platform the team uses.** A hook is the one piece of this
standard that executes on a developer's own machine on every edit, so a
shell-specific script silently does nothing for whoever is on another platform —
and a gate that does nothing reports green. Write them in a runtime that is
already required rather than in a shell: no shell invocation, no assumption
about which utilities are on the path, and path handling that survives both
separators.

Test them on each platform in use before trusting them. The failure mode is not
an error — it is a hook that never fires, which looks exactly like a hook that
found nothing.

## Progress, blockers and questions

An agent's session is invisible from the outside except what it reports. This
governs what it reports, and when, while the work is still running — not just
the content of the final report.

**Stream progress as it happens.** State what it is doing now, what it has
finished, and what is blocking it, as the work proceeds. An observer must be
able to tell a working session from a stalled one without inspecting process
state.

**A blocker is reported the moment it is hit**, not saved for the final
report. Held back, it leaves an observer unable to tell "still working" from
"stopped ten minutes ago and hasn't said so."

**An agent does not stop to ask a clarifying question.** Where something is
ambiguous, it takes the reasonable option, proceeds, and records the choice
and the rejected alternative in its report. "I cannot proceed because the
standards do not define X, so I assumed Y" is a blocker plus a decision, and
is correct. "Which should I use, X or Y?" is a clarifying question, and is
not.

This rule exists to make unattended runs deterministic — a run whose
behaviour depends on what someone typed back is not a run you can compare
against another. Two things are not clarifying questions, and the rule does
not forbid either:

- **A decision the standards reserve for a human** — a suppression approval,
  an accepted risk, an opt-out, a conflict between two standing directives.
  Surfacing one is reporting a blocker that needs an owner, not asking the
  corpus to settle something it already settled; the decision is someone
  else's to own. The opt-out conversation a bootstrap skill holds with a
  human sits inside this carve-out.
- **A genuine ambiguity in an interactive session with a human present.**
  The rule does not exist to forbid a human collaborating with a skill in a
  session they are sitting in, where the human can answer cheaply what
  discovery could not resolve. An interactive skill may ask — once, batched,
  with candidates, evidence and the default taken on no answer; an unattended
  one may not.

**Unattended runs are unchanged by the second carve-out.** The evaluation
loop is unattended, and "the run had to answer a clarifying question"
remains one of its stated failure conditions. A carve-out that leaked into
unattended operation would silently invalidate every round the loop has ever
measured. Collapsing the interactive path into the unattended one — take the
documented default, report it, never ask — was the rejected alternative: it
discards the one case where a human is present and able to answer, to spare
a question the human is there precisely to answer.

**Failure to deliver is a valid outcome, provided the reason is stated.** An
agent that stops and says precisely what blocked it has succeeded at
reporting; one that stops and asks a question, or stops silently, has not.

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
- [ ] Every hook runs on each platform the team uses — verified by running it
      there, not by reading it.
- [ ] No hook depends on a shell or on utilities that only one platform ships.
- [ ] A working session reports what it is doing, what it has finished, and
      what is blocking it while the work is in progress, not only at the end.
- [ ] A blocker is reported when it is hit, not held until the final report.
- [ ] An ambiguous requirement in an unattended run is resolved by taking the
      reasonable option and recording the choice and the rejected alternative,
      not by stopping to ask. An interactive run may ask once, batched, on a
      genuine ambiguity discovery could not resolve; an unattended one may not.
- [ ] A decision reserved for a human — a suppression, a risk, an opt-out, a
      conflict between directives — is surfaced as a blocker needing an owner,
      not asked as a clarifying question and not settled by the agent.
- [ ] A session that cannot finish states precisely what blocked it, and does
      not stop silently or ask a clarifying question instead.

## References

- [Gate 1 — Edit](gate-1-edit.md) — what the edit hook must do.
- [Gate 4 — Task completion](gate-4-task-completion.md) — what the hand-off hook
  must measure.
- [Diagnostic logs](diagnostic-logs.md) — the `.logs` default the root file
  overrides.
- [File classes](file-classes.md) — agent-context files, and the limits they are
  held to.
