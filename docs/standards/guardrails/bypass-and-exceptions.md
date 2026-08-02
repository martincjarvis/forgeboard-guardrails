---
type: reference
summary: Bypass flags are not an exception mechanism; an accepted finding is a register row, opting a check out is a decision record, and a suppressed check must still report.
read_when: Accepting a finding, turning a check off, or auditing what a repository has stopped looking at.
---

# Bypass and exceptions

**Bypass flags are not an exception mechanism.** Gates 0–5 run on the author's
machine and are all skippable — gate 0 by simply not doing it, gates 2–5 by a
flag that disables hooks. Prose forbidding it enforces nothing. Two controls do:
a denied-command policy for automated workers, and
[gate 6](gate-6-pull-request.md), which runs where the flag has no reach. A
repository with local gates and no server-side gate has documented its
intentions, not enforced them.

## The denied-command policy, and what it is worth

Where automated workers run behind a permission layer, deny the bypass flags at
that layer: the flag that skips hooks on commit, the same flag on push, and any
equivalent that disables the hook path by configuration for a single invocation.
It is worth configuring because it catches the overwhelmingly common case — a
worker reaching for the flag because a gate is inconvenient — at the moment of
the attempt, with an explanation.

Its ceiling is worth stating just as plainly, because a control people
overestimate is worse than one they know the limits of. The deny list matches on
the command text, so an alias, an environment variable, or a differently spelled
equivalent defeats it. It governs workers behind that permission layer and
nobody else — a person at a terminal is unaffected. **It is a guard rail, not a
wall**, and the wall is gate 6.

## Opting out of a check is a decision record, not a register row

The [register](registers.md) holds accepted _findings_ — this rule at this path.
Turning a check off for the repository is a different act with a different blast
radius: it silences everything that check would ever have said, including
findings nobody has seen yet. That is a decision, it outlives the change that
prompted it, and it needs what a decision record holds — what was excluded, why,
what was weighed against it, and what would bring it back.

The record has a second job, which is to stop the same argument being had
repeatedly. **A subsequent review reads the opt-out records and does not
re-raise what they cover.** An auditor, a reviewer or an agent that flags an
already-excluded check every pass trains everyone to skim its output, and the
finding that mattered goes past with the rest.

**Moving the decision from a register row to a decision record does not move
who may accept it.** A decision record has no approver column on its face —
an ADR's own frontmatter is `status`, `decided`, `owner`, `supersedes` — and
that gap is exactly the route this section exists to close: an opt-out (or a
risk, or a licence outside the allow list) accepted through an ADR needs the
same human a register row's Approver column would have required, named in the
record's own `approver` field ([ADR frontmatter](../../ADR/README.md)). The
requirement is on the decision, not on which of the two artefacts holds it.

## A suppressed check still reports

It is never silently absent from the run. Every gate run states, for each check
it did not enforce, which of the three it was:

| State      | Means                                              | Reported as                      |
| ---------- | -------------------------------------------------- | -------------------------------- |
| Passed     | Ran, found nothing                                 | A pass                           |
| Skipped    | Its inputs did not change, or it is not configured | A skip, with the reason          |
| Suppressed | Excluded by decision                               | A suppression, naming the record |

The difference matters because only one of the three is a standing decision
somebody made. A suppressed check that reports as a pass is a lie the whole
standard is built to prevent; one that reports as absent is how a repository
loses track of what it decided not to look at.

## Fix it, restructure it, or suppress it — in that order

**The rules are there for a reason, and a suppression is a claim that this one
instance is the exception.** "Strongly discourage suppressing" is not
enforceable as prose; three things are.

**A fixed preference order, not a choice each time.** Fix the finding first.
Where the finding itself cannot be fixed without changing what the code does,
restructure to avoid the pattern second. Suppress with a justification only
once both are genuinely unavailable, and the register row says why fixing was
not possible — not merely why suppressing is tolerable, which is a different
and weaker claim. An earlier cycle did this unprompted for `hooks/lib/run.mjs`:
it tried `spawnSync(fullPathTo("npm.cmd"), args, { shell: false })` before
registering anything, found Windows returns `EINVAL` regardless of how precise
the path is, and only then suppressed — with that attempt recorded in the
row's own justification.

**Moving the finding is not fixing it.** Hoisting `shell: true` into a
variable, renaming a parameter, or wrapping the flagged call in another
function that still does the same thing removes the analyser's match without
changing the risk the rule is warning about. A change that makes a finding
disappear without changing what the code actually does is evasion, not a fix,
and is refused the same as an unregistered suppression — the analyser stops
complaining, but nothing the rule cared about is different.

**Multiple rules at one site escalate the priority to fix, they do not
average it out.** When two or more independent rules — or two analysers
naming the same defect differently — fire at one line, that is corroborating
evidence, not noise to be waited out. The finding reports the count, so a
reviewer sees it without counting rows themselves, and the justification for
suppressing states why fixing is not possible for _each_ rule named, not a
single justification asserted to cover all of them.

**The register is the visible artefact, and stays the only one.** It already
carries every suppression with its justification, reviewed at review time —
that is the control. Do not add a suppression _count_ metric or a trend chart
on top of it: a number nobody is asked to act on is decorative, and this
standard already refuses decorative evidence elsewhere (evidence that is
published but never consumed is the same failure by another route).

## Exceptions are per-rule, per-path and recorded

A suppression **names every rule it silences**, and each named rule has its own
row in the [suppression register](registers.md). This is not a limit of one
suppression per line — two analysers routinely flag the same defect under
different rule identifiers, and one analyser can fire several rules at one
site (`hooks/lib/run.mjs`'s own `nosemgrep` marker is exactly that case: one
line, two rules, two register rows). That is correct and stays legal. What is
forbidden is the **blanket** suppression: a marker that names no rule at all
silences everything at that site and is refused, as is a rule disabled in
configuration or a gate switched off wholesale.

`@ts-expect-error` and `@ts-ignore` are a known limitation of the per-rule
form: TypeScript has no way to name which diagnostic a directive silences, so
both are inherently blanket at the language level. Each occurrence still needs
its own complete register row, naming the diagnostic it suppresses in the
row's justification — the per-rule requirement is answered in the row, not in
the marker, for these two.

**No worker approves its own exception.** The approver column is a human's —
and where the exception is accepted by decision record rather than register
row, so is the record's own `approver` field.

## Running it by hand

| Purpose                                  | Command                                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------------------- |
| Find inline suppressions                 | `git grep -nE 'eslint-disable\|nosemgrep\|ts-expect-error\|pragma warning disable'` |
| Confirm each has a register row          | Compare that list against the register, by rule and path                            |
| Confirm the hooks are actually installed | `git config --get core.hooksPath` and list that directory                           |
| Confirm a bypass is refused              | Attempt a commit with the hook-skipping flag as a worker would                      |

The last one is the only test of the denied-command policy that means anything:
configuration that has never been exercised is a claim.

## Verification

- [ ] A bypass flag is denied at the permission layer for automated workers.
- [ ] The server-side gate refuses a change whose local hooks were skipped.
- [ ] Every inline suppression has a complete register row, one row per rule
      it names — a marker naming two rules needs two rows, not one.
- [ ] No suppression silences a rule it does not name. A marker naming no
      rule at all (a blanket suppression) is refused, not merely flagged.
- [ ] Every opted-out check has a decision record, and the run names it.
- [ ] A suppressed check reports as suppressed, never as a pass and never as absent.
- [ ] A previously excluded check is not re-raised on the next review.
- [ ] No automated worker appears in an approver column.
- [ ] A decision record accepting a risk, a licence, a suppression or an
      opt-out names a human in its own `approver` field, whatever its `owner`
      is — `status: Accepted` with that field empty or naming a team is
      refused, not merely reviewed on trust.
- [ ] A justification that only restates why suppressing is tolerable, with
      no attempt at fixing or restructuring recorded, is treated as
      incomplete — the row states why fixing was not possible.
- [ ] A change that silences a finding without changing what the code does —
      moving the pattern rather than removing it — is refused, the same as an
      unregistered suppression.
- [ ] A site where more than one rule fires reports the count, and the
      justification addresses each rule named, not one blanket sentence.
- [ ] No suppression count, trend chart or similar metric exists alongside
      the register — the register itself, read at review time, is the
      control.

## References

- [Registers](registers.md) — the row an accepted finding needs.
- [Cross-gate rules](cross-gate-rules.md) — the three-state reporting rule and
  the decision-record split.
- [Gate 6 — Pull request pipeline](gate-6-pull-request.md) — the control that
  actually holds.
- [Gate 7 — On demand](gate-7-on-demand.md) — where opt-out records are audited.
