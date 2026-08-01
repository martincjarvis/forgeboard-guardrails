---
type: reference
summary: The reviewer/implementer loop that hardens this toolkit — bootstrap a fresh repository from an unchanged prompt, audit the result adversarially, fix the corpus, repeat.
read_when: Running another round of toolkit improvement, or deciding whether a change to the loop is a shortcut or a genuine fix.
---

<!-- cspell:ignore opencode oneline -->

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

## Setting the harness up

Two things run for the whole series rather than per round. Neither is optional:
the first is what stops the roles collapsing into one, and the second is what
lets a human supervise an unattended run.

### The standing goal

Set this once, at the start, and re-state it if the session is ever compacted or
resumed. It is what a coordinator reads when it is deciding whether a shortcut is
allowed — and over a long series, it will be tempted.

```markdown
Use a reviewer/implementer pattern to evolve the toolkit until a fresh repository
can be bootstrapped by an unattended implementer session — without tuning the test
prompt and without the implementer asking a clarifying question the skill should
have answered — in line with the standards the toolkit defines. Have a separate
session verify compliance by following the toolkit's own checklists.

After each round, present the checkpoint validations by feature.

Failure looks like: having to tune the prompt to get a good result, or the
implementer asking a question the skill should cover. Any gap the audit finds is
addressed by a separate session, and the next round starts fresh.

Reset the subject repository each round so no round inherits another's state.
```

The two failure conditions are the load-bearing part. Without them stated up
front, a round that "worked after a hint" reads as a success.

### The progress cadence

A round takes one to three hours and produces no output until it finishes. Ask
for a timestamped status on a fixed interval — ten minutes suited this series —
covering what has completed, what is running, and whether it has stalled.

This is not only for the human. Being asked "has it stalled?" every ten minutes
is what turned a vague "the log looks quiet" into the three-signal test in
[Watching an unattended run](#watching-an-unattended-run): the question has to be
answered with evidence each time, and a rule that is merely plausible does not
survive being applied twenty times.

Report the same fields every time so a change is visible without re-reading:
elapsed step count, file count, the log's last write, the CPU rate, and the count
of rounds completed against the prompt hash.

### Roles, sessions and cost

The implementer runs in its own harness. The auditor and the fix agent each get a
fresh session with no memory of the others — an auditor that watched the fix being
written will confirm it works.

A coordinator that has been running for hours accumulates its own beliefs. Every
coordinator error in this series was a claim carried forward without re-checking:
a figure relayed from an earlier audit, a reference imported from a sibling
repository, a skipped check described as a pass. **Re-derive anything you are
about to assert, especially if you are confident.**

## The round

### 1. Reset the subject to a fresh slate

Delete and recreate the repository, do not clean it. A leftover file, a stale
branch or an existing register row silently answers a question the implementer
should have had to answer itself.

### 2. Run the implementer, unattended

No interventions, no answers, no corrections. If it goes wrong, that is the
result.

The implementer's prompt is **the constant of the experiment** and describes only
the project — never the standards, never a gate, never a remedy. Keep it in
version control beside this document, hash it, and change it only by deciding to
start a new series.

```markdown
Bootstrap a new project in the empty repository at <path> (remote: <url>).

The project is <name> — <one sentence on what it does and how it is consumed>.

This repository must be compliant with the guardrail standards, which are
installed at <toolkit path>. Read them and apply them: they define the gates,
the test strategy, the versioning and release model, and the records the
repository must carry.

Constraints:

- <CI platform> for CI, <registry> for publishing.
- There is no cloud environment. Anything that has to be proven must be proven
  locally.
- <the operating systems that must both work>

Raise a pull request with the work when it is done.
```

That is the whole prompt. Everything the implementer needs beyond it is the
corpus's job — which is precisely what the round measures.

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

```markdown
You are the independent auditor for round N. Verify compliance by following the
toolkit's own checklists — [guardrail-standards](../standards/guardrail-standards.md)
and the Verification section of each gate reference under
[standards/guardrails](../standards/guardrails/). You did not implement any of
this. Audit it adversarially. Do not fix anything; report.

### The two repositories

- **Toolkit** (the standards under test): <path>, branch <branch>, HEAD <sha>.
- **Subject** (bootstrapped this round): <path>, branch <branch>, PR #<n>.

Read-only on both. Do not commit, push or edit. <Any PATH the analysers need.>

### What the last fix cycle changed

<One paragraph per fix: what it claimed to do, and where it lives.>

### Established facts — do not re-derive, but challenge if evidence contradicts

<Exit code, commit count, tracked files, whether a clarifying question was asked.
The CI verdict, read from the raw job log — name the run and job id so the
auditor can re-fetch it. The previous round's figures, for comparison.>

### The questions, in priority order

<Two or three that decide whether the round improved, then the standing
regressions. For each, say what would count as evidence either way, and which
outcome would be the serious one.>

### How to report

Lead with the first two. For each question: what you ran, what it output, what it
means. Quote decisive lines exactly; do not paraphrase a verdict into existence.
Distinguish defects in the toolkit's guidance — the deliverable — from defects in
this implementer's execution. Where you find a gap, say concretely what corpus
wording would close it.

If a claim in this brief is wrong, say so plainly and show the evidence.
```

Two details in that template are load-bearing. **Naming the run and job id** lets
the auditor re-fetch the log rather than trust a pasted count — which is how the
truncating-annotations defect was found. And **the standing-regressions list**
carries forward every prior round's fix, so a fix that silently stops working is
caught by the round after it, not the audit that first found it.

### 5. Write a fix brief, then dispatch a fix agent

State the evidence, not the remedy alone. A brief that says "fix X" produces a
narrow patch; one that quotes the failing output produces an understanding.

Name what **not** to do. Half the value of these briefs was in the exclusions:
do not mechanise prose honesty, do not extend a keyword list, do not build a
checker that scores a report.

The brief is a document; the dispatch is short and points at it.

```markdown
You are implementing fix cycle N on the guardrail toolkit at <path>, branch
<branch>, HEAD <sha>.

Read the brief first and follow it exactly: <path to brief>

<One line naming each fix, and which to do first if order matters.>

### Before you begin — this is not optional

1. <Any PATH the analysers need.>
2. Confirm a clean tree at <sha>.
3. `npm install` — a fresh worktree does not carry `node_modules`.
4. `npm test`, `npm run build`, `npm run lint`. Baseline is <N/N>. If the
   baseline is red, stop and report it rather than implementing through it.

**Then reproduce each defect before fixing it.** <The exact command, and what it
must print.> A fix you have not watched fail first is a fix you cannot claim.

### Rules in force

Read [AGENTS.md](../../AGENTS.md) — it governs. In particular: never commit to
`main`; every suppression needs a register row with every column filled except
the approver, and **you may not approve one**; new spell-check tokens go in the
file's own `cspell:ignore` line; no absolute paths, usernames or host details in
any committed file; improvements outside the brief become notes in your report,
not commits.

Do not touch <the subject repository> — an evaluation is reading it.

### When done

<What to quote back. Name the specific wording or number that decides whether the
fix is real.> Include final `npm test` / build / lint results and
`git log --oneline`.
```

The brief carries the reasoning; the dispatch carries the discipline. Keeping
them separate is why a fix agent can be given a five-item brief without the rules
getting lost among the fixes — and why the rules section can simply cite
[AGENTS.md](../../AGENTS.md) rather than drifting from it.

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
