---
type: reference
summary: The reviewer/implementer loop that hardens this toolkit — bootstrap a fresh repository from an unchanged prompt, audit the result adversarially, fix the corpus, repeat.
read_when: Running another round of toolkit improvement, or deciding whether a change to the loop is a shortcut or a genuine fix.
---

<!-- cspell:ignore opencode -->

# The toolkit improvement loop

This is the procedure that took the toolkit from a corpus nobody had tested to one
that survives an unattended bootstrap. It is written to be repeatable by someone
who was not there.

The loop is three roles that never merge:

| Role            | Does                                                           | Must not                               |
| --------------- | -------------------------------------------------------------- | -------------------------------------- |
| **Implementer** | Bootstraps a fresh repository from the test prompt, unattended | Ever be given a hint the prompt lacks  |
| **Auditor**     | Verifies the result against the toolkit's own checklists       | Fix anything, or trust the coordinator |
| **Fix agent**   | Changes the corpus in response to the audit                    | Touch the subject repository           |

Keeping them separate is the whole design. A coordinator who audits their own
run will confirm what they expected; an implementer who is told what to fix
proves nothing about the corpus.

## What success and failure mean

**Success** is a bootstrap that needs no help: the implementer reads the standards,
builds a compliant repository, resolves everything it can resolve, and puts only
genuine human decisions to a human.

**Failure has exactly two shapes**, and both invalidate the round:

- **The test prompt had to be tuned** to get a good result. The prompt describes
  the project; it never describes the standards. If a run only succeeds once the
  prompt explains something, that explanation belongs in the corpus.
- **The implementer asked a clarifying question** that the skill should have
  answered. Record the question — it names the gap precisely.

Hash the prompt at the start of the series and check it every round. A prompt
that drifts makes every earlier measurement meaningless.

## The round

### 1. Reset the subject to a fresh slate

Delete and recreate the repository, do not clean it. A leftover file, a stale
branch or an existing register row silently answers a question the implementer
should have had to answer itself.

### 2. Run the implementer, unattended

No interventions, no answers, no corrections. If it goes wrong, that is the
result.

### 3. Read the verdict from the raw job log

Never the platform's summary view. GitHub's check-runs annotations endpoint
**caps at 10 and truncates silently** — it reported 10 findings where the log had
16, and the count was believed for several rounds. A platform view may paginate,
cap or deduplicate; a command's transcript does not.

### 4. Audit adversarially, in a separate session

Give the auditor the established facts so it does not re-derive them, and tell it
plainly to challenge them. Ask it to distinguish **defects in the corpus** — which
are the deliverable — from **defects in this implementer's execution**, which
matter only where the corpus permitted them.

End the brief with an invitation to correct you. In this series every one of the
coordinator's mistakes was caught by an auditor and none by the coordinator:
a claim relayed from another audit without checking, a skipped check described as
a pass, a false attribution of a defect to the wrong cycle.

### 5. Write a fix brief, then dispatch a fix agent

State the evidence, not the remedy alone. A brief that says "fix X" produces a
narrow patch; one that quotes the failing output produces an understanding.

Name what **not** to do. Half the value of these briefs was in the exclusions:
do not mechanise prose honesty, do not extend a keyword list, do not build a
checker that scores a report.

### 6. Verify, then repeat

Suite, build, lint, and the toolkit's own gates, before the next round starts.

## Rules the loop earned

Each of these cost at least one round to learn.

**A reference implementation is fixed; prose recurs.** Twenty-two audits, no
exceptions. A defect given a working check is gone next round. A defect given a
paragraph comes back — three times over, in one case, before it was given code.

**A check needs a negative fixture built from real output.** The most expensive
defect in the series was a reconciliation check whose matcher could not parse a
real job log: it read **0 findings from 9**, and returned success against a report
that said nothing at all. It survived because its tests used hand-written strings.
Three other fixes rested on it. **Watch a check fail before you claim it works.**

**A rule the toolkit exempts itself from is a rule nobody has tested.** This
happened three times: a residue checker that skipped its own repository shipped
broken; a gate that re-derived its base skipped in CI unconditionally; a test
suite claiming "N/N passing" had never run in the environment its gates run in.
**Run the toolkit's own gates on the toolkit, in CI, on a real pull request.**

**Derive a fact, do not type it.** A typed field drifts from what it describes; a
derived one cannot. Approval became an event with a git trace rather than a field
someone fills. Report contents became one command's transcript rather than an
assembly of chosen parts.

**Approval is reserved, and reservation must be structural.** Stating "an agent
may never do X" three times, once in bold, did not stop an agent doing X. Making
the gate refuse it did.

**A number is re-run, not re-explained.** A figure captured once and quoted later
goes stale silently. Worse, an implementer that notices a discrepancy will invent
a cause for it — a wrong explanation is believed, an unexplained gap gets
investigated.

**Resolvability, not a list.** A pull request opens when everything the
implementer _could_ resolve has been resolved. Enumerating the exceptions invites
a new one to be invented; the principle does not.

## Watching an unattended run

Distinguishing a hung process from a working one is harder than it looks, and
getting it wrong is expensive in both directions.

**Three signals, all of them, sustained past ten minutes**: the log has not
written, no files have changed, and CPU is at the idle floor. Sample CPU as a
**rate** — a working process reads 2–4 s per 15 s, a hung one reads 0.1–0.5 s.
Cumulative CPU cannot tell a busy process from one that has been busy.

Two of three is not enough. Bulk file writes look exactly like a hang: I/O-blocked
processes read at the idle floor while doing real work. A corpus write that looked
dead for two minutes was writing 158 files.

Prefer waiting. A premature kill discards a healthy run at its most expensive
moment; a late kill costs only elapsed time.

## Handling the reserved decisions

Some findings are not the implementer's to close — a licence acceptance, a
suppression approval, an accepted risk, a change-size override, a conflict between
standing directives. These reach a human through the pull request, with every
column filled except the approval.

**Do not approve them on the human's behalf**, and do not let a round stall
waiting. They are evidence the reservation mechanism works.

## What to leave alone

**Do not patch the subject repository.** It is the measurement. Fixing it by hand
destroys the only evidence the round produces, and the next reset discards the fix
anyway.

**Do not fold noticed improvements into the current brief.** They become the next
one. A cycle that grows past its brief cannot be attributed.
