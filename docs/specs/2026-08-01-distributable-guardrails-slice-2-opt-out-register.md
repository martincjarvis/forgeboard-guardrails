---
type: reference
summary: The opt-out register — one row per capability, in .guardrails/, indexing the decision record that reasons it, taking effect only once it is on the protected default branch, admitted there by a pull request review the row itself names.
read_when: Implementing slice 2, filing or approving an opt-out, deciding whether something is an opt-out or a suppression, or judging whether a proposed enforcement route can be evaded by an agent.
---

<!-- cspell:ignore unmergeable -->

# Slice 2 — the opt-out register

The register that records a capability this repository does not implement, who
decided that, and where the reasoning for it lives.

## An opt-out is configuration, not a suppression

**They are two different acts, not two strengths of one act**, and everything
below follows from which of them is in front of you.

A **suppression** tolerates a violation that exists. The check applies here, it
found something real, and the row records that this one instance is accepted
anyway. The check goes on running and goes on reporting — [a suppressed check
still
reports](../standards/guardrails/bypass-and-exceptions.md#a-suppressed-check-still-reports)
is right as written, because the standing reminder _is_ the point: somebody may
one day be able to fix it.

An **opt-out** asserts that the whole class of check is not relevant to this
repository. Nothing is being tolerated, because nothing was found and nothing
could be: an image scan in a repository that builds no image has no violation to
report, this run or any other. It is **configuration** — a statement about what
this repository is, of the same kind as declaring its stack — and not an
exception to anything.

> **The test, in one question: is there a violation?** A check found something
> and the answer is to accept it: suppression, whatever its blast radius. The
> check could never have found anything here: opt-out, however inconvenient the
> check also happens to be.

Two consequences carry the rest of this spec, and neither is a preference:

- **A disabled capability is silent.** There is no violation, so there is
  nothing to remind anyone of, and a standing notice on every run forever is
  pure noise — see [Silence](#silence).
- **The decision is reasoned, not justified.** A suppression row argues why
  fixing was unavailable. An opt-out argues why the class does not apply, which
  is a larger claim about the repository and outlives every change that prompts
  it — which is what a decision record is for, and why every row cites one.

The misfiling this prevents, and the routing when it happens, is in
[Suppression, opt-out, or neither](#suppression-opt-out-or-neither).

## Depends on slice 1

This spec consumes three things slice 1 defines and defines none of them itself:

| From slice 1                                                                                               | Used here as                                                                                                 |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| The capability vocabulary                                                                                  | The Capability column's permitted values, and the key every finding already carries so it can be filtered    |
| The `.guardrails/` layout                                                                                  | Where the register file and the scripts below live                                                           |
| [The `docs/ADR/` convention](2026-08-01-distributable-guardrails-slice-1-foundations.md#what-is-not-in-it) | What every row's Decision record cell cites into, and what its absence means before a repository's first row |

Two properties of that vocabulary are load-bearing here, and slice 1 owns both:
a capability identifier is **stable** (a renamed capability silently invalidates
every row filed against it), and it is **resolvable by a script** from a list
the repository holds, so an unknown identifier is a finding rather than a
silent no-op.

**Every path this spec names follows slice 1's layout, which is flat.** The
register and both scripts below are siblings of every other `.mjs` file in
`.guardrails/` — there is no `.guardrails/scripts/`, and the toolkit's own
`scripts/` directory no longer holds the checks this spec reuses. That is not
cosmetic: slice 1 makes the copy byte-identical to its source so slice 4's
backfill is a file comparison, and a subdirectory invented here would reinstate
the path rewriting it exists to avoid.

## The register

**`.guardrails/opt-out-register.md`.** One file, one table, one row per
capability.

**It arrives by being written, never by being copied.** Bootstrap copies the
scripts and the `README.md` byte-identical and
[copies this file to nobody](2026-08-01-distributable-guardrails-slice-3-bootstrap-skill.md#what-bootstrap-copies-and-what-it-writes):
the plugin's own register holds the toolkit's own rows, and a copy would import
them into every consumer as approved decisions nobody there made. A repository's
register is created by the first row filed in it — the same first-need
convention `docs/ADR/` follows — so a repository that has never opted out of
anything has no register, which is the correct representation of no opt-outs and
is why [the reader](#the-reader) treats an absent register as the empty set
rather than as an error.

| Column          | Holds                                                                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Capability      | Exactly one capability identifier from slice 1's vocabulary — never a gate, never a list, never a wildcard, and never one of [the two excluded](#two-capabilities-that-may-not-be-opted-out) |
| Filed           | The ISO date the row was proposed. Never edited afterwards — with Capability it forms the row identity every register check already reads                                                    |
| Justification   | The property of the repository that makes the capability inapplicable, in one sentence — the fact, not the argument for it. "This repository builds no container image"                      |
| Decision record | The ADR carrying the reasoning, cited as `ADR-nnnn`. Required on every row — see [the row indexes; the ADR reasons](#the-row-indexes-the-adr-reasons)                                        |
| Removable when  | What would have to become true for the row to go, stated so the audit can evaluate it against the repository. Never "never"                                                                  |
| Approved by     | The human who accepted it, named. Verified at admission against the review that let the row onto the protected branch — see [Enforcement](#enforcement)                                      |

Identity is the first two cells, per
[registers.md](../standards/guardrails/registers.md#approval-is-an-event-not-a-field),
which is why the second column has to be something nobody rewords. Everything
after the identity may be edited freely without the row becoming a different
row.

### The row indexes; the ADR reasons

**Every opt-out is both artefacts, and neither is optional.** The row exists so
that nothing — no gate, no audit, no person — has to open an ADR to learn what
is disabled here. The ADR exists so that nobody has to reconstruct why from a
table cell.

This is not a new pattern. It is the one
[ADR-0004](../ADR/0004-development-scope-licence-acceptances.md) and the
[dependency licence register](../standards/guardrails/registers.md#the-dependency-licence-register)
already run together: the row names the decision record in its own **Decision
record** column, and the ADR carries the grounds, what acceptance commits the
repository to, and the rejected alternative — per dependency there, per
capability here. This register mirrors that relationship rather than inventing a
second one, down to the column's name, which is what lets `citedAdrNumbers` find
it without being taught a new one (see [Enforcement](#what-is-refused-where)).

The one difference is that the licence register requires the column only for a
licence that fails the table's decision rule. **Here it is required on every
row.** There is no equivalent of a licence that passes on its own: a capability
never becomes inapplicable mechanically, so the argument that it is inapplicable
here is the entire content of the decision, and a row with no record is a
decision nobody wrote down.

**Which facts live where, so that no fact is stated twice.** One rule settles
every cell:

> A cell holds what a check or the audit **reads mechanically**. The record
> holds everything a human **reads in order to decide**.

| Fact                                                                                                                                                           | Lives in | Because                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which capability is off                                                                                                                                        | The row  | The reader keys the disabled set on it — the whole reason the register is an index and not a narrative                                            |
| When it was filed                                                                                                                                              | The row  | Row identity, and how long the capability has been off                                                                                            |
| The repository property that makes it inapplicable                                                                                                             | The row  | One checkable fact, so a reviewer can judge the row in the diff. Whether that fact is _sufficient_ is the record's argument, not the cell's       |
| The condition that would end it                                                                                                                                | The row  | Slice 4 evaluates it on every audit to detect a stale row, and registers.md requires a removal condition of every register                        |
| Which decision record reasons it                                                                                                                               | The row  | The pointer, so the reasoning is reachable without a search                                                                                       |
| Who approved it                                                                                                                                                | The row  | The admission check matches this cell against the review that admitted the row                                                                    |
| **What is lost** — the class of defect that now goes undetected                                                                                                | The ADR  | The cost side of the trade, and it takes more than a cell to state honestly. Approving the pair is approving this                                 |
| **What was weighed and rejected** — implementing it anyway, implementing it partially, suppressing per site, changing the repository so the capability applies | The ADR  | A rejected alternative that was never written down cannot be re-argued later without reconstructing it from scratch                               |
| **What bringing the capability back would involve**                                                                                                            | The ADR  | The row's cell says _when_; the record says what it would then take, and why that condition is the right one. A condition is not its own argument |

**A cell that grows past a sentence is holding something that belongs in the
record.** That is the drift signal, and it is the only one needed: the register
is read as a table, and a table whose cells hold paragraphs is a decision record
with a worse layout.

Filing an ADR does not move who may approve it. An ADR reading as an opt-out
already needs a human `approver` in its own frontmatter
(`.guardrails/check-adr-approver.mjs`, `acceptsRiskLicenceSuppressionOrOptOut`),
and the citation makes that unconditional rather than dependent on wording: an
ADR any register row cites in its Decision record column is reserved-class
whatever its prose says (fix 54).

### Neither artefact works alone

Both directions are failures, and each is caught somewhere different:

| State                                                                       | What it means                                                                                                     | What happens                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A row citing an ADR that does not exist, or whose citation does not resolve | The index points at nothing. Either the record was never written, or it was removed or renamed underneath the row | **Refused at gate 2** as a malformed row, and **ignored by the reader**, so the capability stays enabled until the record is there. Both, not either — the same pairing every other malformed-row case here uses                  |
| An ADR recording an opt-out with no row citing it                           | The reasoning exists and nothing indexes it. The capability is _not_ disabled, whatever the ADR says              | **The capability is enabled** — the reader reads the register and nothing else. The **audit reports it**: the capability's real state, plus the record no row indexes, with the remedy being to file the row or supersede the ADR |

**The asymmetry is deliberate and is the point of the split.** A row with no
record disables a capability on reasoning nobody can read, so it is refused
outright. A record with no row disables nothing, so it is a reporting matter, not
a gate one — and the gate could not tell an orphan from an ADR whose row lands in
the next commit anyway, which is exactly the false refusal
[a refusal is a diagnosis](../standards/guardrails/cross-gate-rules.md#a-refusal-is-a-diagnosis)
warns against.

## Two capabilities that may not be opted out

Slice 1 put the question here and this is the answer: **`approval-provenance`
and `refusal-proof` are excluded from this register by construction.** A row
naming either is not a row a human may approve — it is a malformed row, refused
at gate 2 and ignored by the reader, on the same footing as a row naming a
capability that does not exist.

They are excluded for the same reason, arrived at from two directions:

- **`approval-provenance` is what makes this register's own approvals
  trustworthy.** It is the check that an approval arrived as an event in a
  commit separate from the thing it approves. A register that can disable the
  check proving its rows were approved separately is self-defeating: the first
  row it would be used for is its own. Every other control in this corpus that
  rests on a human's decision rests on that separation, so switching it off
  buys silence across every register at once, bought with one row nobody can
  afterwards prove was approved properly.
- **`refusal-proof` is what proves a blocking check can fail.** Every negative
  fixture in the corpus exists because a check that reads green while being
  unable to fail is this series' most expensive recurring defect, found ten
  audits running. Disabling it does not remove one check's evidence; it removes
  the evidence for all of them simultaneously, and reintroduces the whole class
  in a form nothing left running can detect.

The general rule underneath both, so a later capability is judged by it rather
than by this list: **a capability whose subject is another capability's
evidence cannot be opted out.** Opting out of an ordinary capability trades a
known class of defect for a stated reason, and the register records the trade.
Opting out of an evidence capability trades away the ability to know what any
other row cost — including its own — which is not a trade a human can be shown
the price of, and therefore not one this register can ask them to approve.

**This is a constraint on the vocabulary, not a hole in it.** Both remain
ordinary capabilities in slice 1's list: findings still carry their ids, the
audit still reports their state, and the ids are what the exclusion is written
against. What is refused is one row, in one register.

## What approval commits the human to

Signing the Approved by cell is a statement that, from the merge onward:

- Every check belonging to that capability stops running in this repository, in
  every gate, for every developer, including checks that do not exist yet.
- Nothing will report that they are not running. The register, the record it
  cites and the audit are the only places the decision remains visible — by
  design, because there is no violation to report and a standing notice about
  one would be false as well as noisy.
- The defect class the record names is accepted, not deferred — there is no
  ticket behind the row, only the removal condition.

That is a larger commitment than any other register in this corpus asks for. A
suppression row accepts one finding that somebody has already read; this row
accepts every finding a capability would ever have produced, unread.

## Lifecycle

| Step        | Who      | When                                                                                                                                                                                                                               |
| ----------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Propose     | An agent | Only during **interactive** bootstrap, from what the human named in the opt-out conversation. Never afterwards, in any mode. The proposal is the row **and** a `Proposed` ADR, drafted together — neither is a proposal on its own |
| Propose     | A human  | At any time, by writing the record and the row that cites it                                                                                                                                                                       |
| Approve     | A human  | By approving the pull request that carries the row, having filled or confirmed the Approved by cell                                                                                                                                |
| Take effect | Nobody   | On merge to the protected default branch, and not before                                                                                                                                                                           |
| Remove      | Anyone   | By deleting the row. No approval required — removal only ever turns checks back on                                                                                                                                                 |

**The two artefacts move through this together, and approval touches both in the
same event.** The record arrives `Proposed` with no `approver` and the row
arrives with Approved by blank, in the commit that files them; the approving
commit flips the record to `Accepted` with a human named and fills the cell. That
is not an extra rule — it is
[approval is an event](../standards/guardrails/registers.md#approval-is-an-event-not-a-field)
applied to each artefact by the check that already covers it, and filing them in
one commit is legitimate precisely because neither carries an approval yet.

**An unattended bootstrap implements every capability** unless the prompt itself
names opt-outs, in which case those rows are filed with Approved by blank and
their records `Proposed`, the same as any other reserved-class finding an
unattended run cannot resolve.

**A proposed row does nothing.** The lifecycle rule above ("never afterwards")
is a convention, and this spec does not pretend to enforce it mechanically —
there is no signal at commit time that distinguishes a bootstrap session from
any other. It does not need one: a row an agent files outside bootstrap has
exactly the same effect as a row it files inside bootstrap, which is none, until
a human approves the pull request carrying it. The convention governs when it is
_appropriate_ to propose; the enforcement below governs what a proposal can
_do_.

**A filed row is a legitimate pull-request citation, and not an escape hatch.**
`.guardrails/check-pr-body-artefacts.mjs` accepts a register row's identity as the
artefact reserving a disclosed finding, and an unapproved opt-out row is exactly
that. The pull request may therefore open with the capability's findings
disclosed and unfixed. It may not merge: gate 6 blocks on the blank approver,
the same split every other register already has, and until the merge the
capability's checks keep running and keep reporting. The most an agent achieves
by filing a row to make an inconvenient finding citable is an unmergeable pull
request that still shows the finding.

## Enforcement

Two facts carry this, and an agent can produce neither of them with commits:

1. **A row has effect only where it is read from, and it is read from the
   protected default branch.** Every gate resolves opt-outs by
   `git show <default-branch-ref>:.guardrails/opt-out-register.md`, never from
   the working tree, the index, or the current branch.
2. **A row reaches the protected default branch only through a pull request
   carrying an approving review from the human the row names.** Gate 6 refuses
   the merge otherwise.

Stated against the failure condition the overarching design sets — _any sequence
of agent-only commits that ends with a capability disabled_ — the sequence has no
length that works, because what disables a capability is not a commit. It is a
merge into a branch whose protection requires a review event, and a review is not
something a commit can contain. Approval provenance (fix 49) proves two commits
happened; two commits are trivially within an agent's reach, which is why this
register does not rest on it. The review record is not.

### The reader

`disabledCapabilities()` in `.guardrails/opt-outs.mjs`, called by every
gate, is the only thing that decides whether a capability is off. It returns a
set, and a row contributes to that set only when **all** of the following hold:

| Condition                                                                  | Fails to        |
| -------------------------------------------------------------------------- | --------------- |
| The default-branch ref resolves (`origin/HEAD`, or the configured default) | The empty set   |
| The register exists at that ref                                            | The empty set   |
| The row's Capability resolves in slice 1's vocabulary                      | Ignore that row |
| The row's Capability is not `approval-provenance` or `refusal-proof`       | Ignore that row |
| Every cell is non-empty and Removable when is not "never"                  | Ignore that row |
| Approved by is non-empty and is not a team label (`looksLikeTeamLabel`)    | Ignore that row |
| The Decision record cell cites an ADR that **exists at the same ref**      | Ignore that row |

Every failure direction yields **fewer** disabled capabilities, never more. A
missing ref, a remote nobody fetched, a corrupted table, a renamed capability, a
citation pointing at nothing and an unreadable file all end in the same place:
the check runs. There is no input to this function that turns a capability off by
being malformed.

**The citation is resolved at the default-branch ref too**, never against the
working tree, for the same reason the register is: a record an agent can produce
locally would otherwise satisfy a row that has already been merged. It is one
more `git show` at the ref already open, and it fails in the safe direction.

Verification of the approver's identity deliberately does **not** happen here.
The reader runs on every developer's machine, offline, on every gate; it trusts
the protected branch, and the protected branch is what admission control below
guards. Verification at admission, cheap trust at read time.

### What is refused, where

| Route                                                                                                           | Refused at                         | By                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| A row that arrives already approved in the commit that files it                                                 | Gate 2 and gate 6                  | `check-approval-provenance.mjs`, once `isRegisterPath` also matches `.guardrails/opt-out-register.md`               |
| A malformed row — missing cell, "never" removal, multiple capabilities, unknown capability, team-label approver | Gate 2 (block)                     | `checkOptOutRegisterStaged` in `.guardrails/check-opt-out-register.mjs`                                             |
| A row naming `approval-provenance` or `refusal-proof`                                                           | Gate 2 (block)                     | The same check, from the excluded set — see [the exclusion](#two-capabilities-that-may-not-be-opted-out)            |
| A row with a blank Decision record cell, or citing an ADR that does not resolve                                 | Gate 2 (block)                     | The same check — a malformed row, and [ignored by the reader](#the-reader) as well, not instead                     |
| An ADR the register cites whose `status` is `Accepted` with no human `approver`                                 | Gate 2 and gate 6                  | `check-adr-approver.mjs` unchanged, once `adrNumbersCitedByRegisters` also reads `.guardrails/opt-out-register.md`  |
| A row complete but for its approver                                                                             | Gate 2 (push back), gate 6 (block) | The same two-verdict split registers.md already defines for every other register                                    |
| A row whose Approved by does not match a human who approved this pull request                                   | Gate 6 (block)                     | `checkOptOutAdmission(range)` — see below                                                                           |
| A merge that would land any register change while branch protection does not require a review                   | Gate 6 (block)                     | `check-branch-protection.mjs`'s existing `required_approving_review_count >= 1` result, consulted as a precondition |
| A finding disclosed in the pull request body citing an unapproved row                                           | Gate 6 (block, on the row)         | `check-pr-body-artefacts.mjs` accepts the citation; the blank approver still blocks                                 |

**Two of those reuse existing code and one of them needs no code at all.**
`citedAdrNumbers` already locates a Decision record column **by header name, not
by index**, and its own comment already says another register's column order is
not its business — so it reads this register's rows the day the column is named.
What it needs is the directory: `adrNumbersCitedByRegisters` scans
`docs/registers/` only, and gains `.guardrails/opt-out-register.md` as a second
location. That is the whole change, and it is why this spec names the column
`Decision record` rather than something that reads better in isolation.

`checkOptOutAdmission(range)` compares the register at the merge base against
the register at the branch head. For every row whose identity is new, or whose
Capability or Approved by cell changed:

- The pull request must carry an `APPROVED` review, from an account that is not
  the pull request's own author, whose login or profile name matches the row's
  Approved by cell, case-insensitively. A mismatch is a finding naming both the
  cell and the reviewers found — never a silent pass.
- If the platform cannot be queried at all, that is a **finding, not a skip**.
  A register change is rare and the strong check is available exactly where it
  matters; the fail-safe direction here is refusing the merge, the same
  reasoning `findChangeSizeOverrideFindings` already applies to an unresolvable
  branch name.

Filling the Approved by cell before the review is permitted, and is the expected
order — branch protection dismisses stale reviews on a new push, so a cell filled
after the approval would dismiss the very approval it records. The name is inert
until a matching review exists, so writing it early buys nothing.

### Evasion routes, and why each closes

| An agent could…                                                        | What actually happens                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Edit the register directly and commit it                               | Nothing. The reader never reads the working tree                                                                                                                                                                                                                      |
| Create the register for the first time, fully approved                 | Nothing, twice over: the file is not on the default branch, and the row is refused by approval provenance for arriving pre-approved                                                                                                                                   |
| File the row blank in one commit and approve it in a second            | Nothing. Two commits satisfy fix 49 and are still commits; the row is still not on the default branch                                                                                                                                                                 |
| Commit with `--no-verify`                                              | Gate 6 runs where the flag has no reach ([bypass-and-exceptions](../standards/guardrails/bypass-and-exceptions.md)), and the merge is the thing that matters                                                                                                          |
| Push straight to the default branch                                    | Branch protection refuses. If it does not, `check-branch-protection.mjs` reports protection as absent and the reader returns the empty set                                                                                                                            |
| Approve its own pull request                                           | The platform refuses a self-approval, and the admission check independently requires the reviewer not to be the author                                                                                                                                                |
| Rename or relocate the register so the reader reads a file it controls | Any path the reader is redirected to is still read at the default-branch ref. Redirection changes which file must be merged, not whether it must be                                                                                                                   |
| Write the decision record itself and cite it                           | Writing it is legitimate and expected — drafting is not approving. It is `Proposed` until a human accepts it in a separate commit, and a record arriving `Accepted` with an approver in the commit that created it is refused by the same provenance check the row is |
| Delete the record after the row has merged, leaving the row behind     | The citation stops resolving, so the reader drops the row and the capability turns **back on**. Deleting the reasoning cannot buy silence; it is the same fail-safe direction as deleting the register                                                                |
| Widen a row — a wildcard capability, a whole gate                      | Refused at gate 2 as a malformed row, and ignored by the reader for failing to resolve                                                                                                                                                                                |
| Opt out of `refusal-proof`, so a check that cannot fail goes unnoticed | Refused. Neither it nor `approval-provenance` may be named in a row, at either gate or by the reader — see [the exclusion](#two-capabilities-that-may-not-be-opted-out)                                                                                               |
| Delete the capability's check instead of opting out                    | Out of this register's reach, and the more likely attack. `check-script-wiring.mjs` reports an unwired check, and slice 4's drift comparison against the plugin reference reports the missing one — see [Removal](#removal-and-backfill)                              |

**The residual risk, named.** An agent holding a human's platform credential can
produce a review as that human. That is credential compromise, not a gap in this
design, and it is the same boundary every other control in this corpus already
sits behind. Nothing checkable inside a repository distinguishes a human at a
keyboard from a process holding their token.

## Silence

A capability in `disabledCapabilities()` is **absent from gate output
entirely**. Concretely:

- A check whose entire capability is disabled is not invoked. It contributes no
  line to gate output, no timing, no `SKIP`.
- A finding produced by a check spanning several capabilities is dropped if its
  own capability is disabled. This is filtered in one place — the shared
  `report()` in `lib.mjs`, which already sees every finding and every skip —
  not per check, so a check added later inherits the behaviour without knowing
  the register exists.
- **There is no once-per-run header line either.** Slice 1 proposed one as a
  middle course between reporting per check and reporting nothing; it is
  superseded. A standing notice printed once a run is still a standing notice on
  every run forever, and it says something untrue — that something here needs
  attention.
- Gate output is identical to a repository that never had the capability. A
  reader cannot tell the difference from one run, and is not meant to.

**This does not depart from
[a suppressed check still reports](../standards/guardrails/bypass-and-exceptions.md#a-suppressed-check-still-reports).**
That rule governs suppressions, and it is right on its own terms: a suppression
tolerates a violation that exists, the reminder is what stops the tolerance
becoming permanent, and a suppressed check reporting as a pass or as absent is
the failure the rule was written against. An opt-out is not a suppression — see
[the distinction](#an-opt-out-is-configuration-not-a-suppression) — and the
three-state table has no state for it, because a check that could never fire here
is not a check that was excluded from a run.

**The reason the rule exists is met by different means, not waived.** What the
three states protect against is a repository losing track of what it stopped
looking at. Here that is answered by artefacts a person actually reads: the
register arriving as a row in a diff, the record it cites, and the audit
reporting every opted-out capability on every run with its row and its approver.
Those are the visibility; gate output is not, and loading it with notices that
never change is how a gate's output becomes something people skim — the failure
that same section names.

The amendment this implies for `bypass-and-exceptions.md` is specified in
[The standards amendment this requires](#the-standards-amendment-this-requires).
Making it is out of scope for this slice.

## Removal and backfill

Deleting a row is the opt-back-in, and it needs no approval: removal only ever
causes more checks to run.

Removal is detected on the default branch's own history, which is intact because
this corpus merges by rebase and fast-forward and never squashes. The contract
slice 4 consumes:

```text
removedOptOutRows(defaultBranchRef) -> [{
  capability,     // the row's Capability cell
  filed,          // its Filed cell — how long the capability was off
  approvedBy,     // the Approved by cell as it stood when the row was removed
  decisionRecord, // its Decision record cell — the reasoning being reversed
  removedIn,      // the commit sha that removed it
  removedAt,      // that commit's author date
}]
```

Implemented by walking `git log --follow -p <defaultBranchRef> --
.guardrails/opt-out-register.md` and reporting every row identity present in an
earlier revision and absent from the current one.

**What the audit must report**, for each entry:

- The capability, as a **gap awaiting backfill** — not as an ordinary missing
  capability. The distinction is the point: this repository once decided the
  capability did not apply, and that decision has been reversed.
- When it was opted out, by whom, and when the row was removed.
- The decision record the removed row cited — the reasoning that has just been
  reversed, and the artefact that says what bringing the capability back
  involves. Removing the row does not supersede the record, and a reader looking
  at a backfill wants the argument it is undoing.
- What to restore, named concretely from the plugin reference, per slice 4's own
  backfill contract.

**A gap stops being reported once the capability is implemented**, not once
somebody acknowledges it. There is no second register recording that a backfill
is in progress; the implementation is the acknowledgement.

**The audit also reads the register for its ordinary run**: a capability with a
row in effect — approved, and its citation resolving — is reported as
`opted out`, naming the row and the record, never as a gap, and never re-raised —
[bypass-and-exceptions](../standards/guardrails/bypass-and-exceptions.md)'s "a
subsequent review does not re-raise what they cover". A capability with an
absent implementation **and** no row is an ordinary gap. A row that exists
locally but is not yet on the default branch is reported as **proposed, not in
effect**, so a human can see what is waiting on them.

## Suppression, opt-out, or neither

**The categorical difference is the first row of this table, and every other row
follows from it.** Two artefacts that both make a check stop firing are not
therefore the same kind of thing.

|                | Suppression register row                                                    | Opt-out register row + decision record                                                         |
| -------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Asserts        | A violation exists here and is tolerated                                    | No violation of this class can arise here — the check is not relevant to this repository       |
| Is             | An exception                                                                | Configuration                                                                                  |
| Silences       | One finding, of one rule, at one path                                       | Every finding a capability would ever produce, repository-wide, including ones nobody has seen |
| Keyed on       | Rule and path                                                               | Capability                                                                                     |
| Lives in       | `docs/registers/`                                                           | `.guardrails/`, with the reasoning in the ADR the row cites                                    |
| Reports itself | Yes — reports as suppressed on every run, because the reminder is the point | No — silent, because there is nothing to be reminded of                                        |
| Takes effect   | When the commit lands                                                       | When the merge lands on the protected default branch                                           |
| Precondition   | Fixing and restructuring were both genuinely unavailable                    | The capability does not apply to this repository at all                                        |

**The misfiling to prevent, in both directions**, and the one question that
settles it is the one above: **is there a violation?**

A capability that applies and is inconvenient at forty sites is forty
suppression rows, not one opt-out. The findings are real — "there are too many
of them" is a statement about the repository's state, not about the capability's
applicability — and an opt-out filed on that basis buries forty unread defects
under a claim, in a decision record, that could not survive being written down.
This is the direction that matters, because it is the one where the silence
this register grants is exactly what makes the misfiling attractive.

A capability that genuinely cannot apply — no container image, so no image scan
— is one opt-out row and one record, not a suppression per site. Suppressions
filed to route around an inapplicable capability leave the capability nominally
enabled, its register unreadable, and every one of those rows asserting a
tolerated violation where there was never a violation at all.

**Neither, first.** [Fix it, restructure it, or suppress
it](../standards/guardrails/bypass-and-exceptions.md#fix-it-restructure-it-or-suppress-it--in-that-order)
is unchanged and comes before either register. An opt-out is not a fourth
option on that ladder; it is what you file when the ladder does not apply
because the finding could never have arisen here.

## The standards amendment this requires

**Specified here, made elsewhere.** Changing a standard's content is out of
scope for this slice; leaving the corpus contradicting itself is worse than
either, so what the amendment has to say is written down where the reviewer of
this spec can judge it.

Both statements the corpus makes today are **half right**, which is why neither
can simply be deleted. Each was written when an opt-out was one artefact, and
each got the half it could see.

| Document                                                                                                                                                  | Says today                                                                                     | Half that is right                                                                     | Amendment                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [bypass-and-exceptions.md](../standards/guardrails/bypass-and-exceptions.md#opting-out-of-a-check-is-a-decision-record-not-a-register-row), section title | "Opting out of a check is a decision record, not a register row"                               | An opt-out needs what a decision record holds, and a register row alone cannot hold it | Retitle to say it is **both**: the decision record remains required and carries the reasoning; a register row indexes it so a gate can read what is off without opening it. The section's argument for why an opt-out is not an accepted-finding row survives unchanged |
| [registers.md](../standards/guardrails/registers.md#a-register-row-or-a-decision-record), "A register row or a decision record?"                          | "Excluding a check from the repository … is a decision record, because it outlives the change" | The reasoning does outlive the change, so a record is required                         | State that a capability-level opt-out is the one case answered by both artefacts, and name where each lives — the row keyed on capability in `.guardrails/`, the record in `docs/ADR/` — with the field split above as the reason neither duplicates the other          |
| [bypass-and-exceptions.md](../standards/guardrails/bypass-and-exceptions.md#a-suppressed-check-still-reports), "A suppressed check still reports"         | Three states, none of them absent from the run                                                 | Exactly right for a suppression, which tolerates a violation that exists               | Scope the rule to suppressions, and add that a capability-level opt-out is not one of the three states: it asserts the class of check does not apply, so it is absent from gate output by design and visible in the register, the record and the audit instead          |
| The same document's verification list                                                                                                                     | "Every opted-out check has a decision record, **and the run names it**"                        | The record requirement                                                                 | Keep the record; replace "the run names it" with the register row indexing it and the audit naming it — the run is silent, so a checkpoint requiring the run to speak can only be met by reintroducing the noise this decision removes                                  |

**Not amended, and worth saying so**: "a subsequent review does not re-raise
what they cover" is correct as written and is what slice 4 implements; "no
worker approves its own exception" is correct and this spec strengthens it; and
[fix it, restructure it, or suppress it](../standards/guardrails/bypass-and-exceptions.md#fix-it-restructure-it-or-suppress-it--in-that-order)
is untouched, because an opt-out was never a rung on that ladder.

## Verification

- [ ] A sequence of agent-authored commits — filing the row, approving it,
      editing the file, creating the register from nothing — leaves every
      capability enabled, demonstrated by running a gate after each commit.
- [ ] A row approved and merged to the default branch disables its capability
      for a developer who has never seen the pull request.
- [ ] A gate run with a capability disabled contains no line naming it — not a
      finding, not a `SKIP`, not a timing, and no header line either. Byte-for-byte
      identical, against the same run with the capability never named at all.
- [ ] A row with a blank Decision record cell, and a row citing an ADR that does
      not exist, are each refused at gate 2 **and** ignored by the reader.
- [ ] An ADR recording an opt-out that no row cites disables nothing — a gate run
      is unchanged by its presence — and the audit reports it.
- [ ] Deleting the cited ADR from the default branch re-enables the capability,
      with the row still in place.
- [ ] An ADR cited by an opt-out row, `Accepted` with no human `approver`, is
      refused — the citation route, not the vocabulary fallback, so a record whose
      prose never uses the word "opt-out" is still caught.
- [ ] A row naming an approver nobody reviewed as blocks the merge, naming both
      the cell and the reviewers found.
- [ ] A row whose capability identifier does not resolve is refused at gate 2
      **and** ignored by the reader — both, not either.
- [ ] A row naming `approval-provenance`, and a row naming `refusal-proof`, are
      each refused at gate 2 **and** ignored by the reader, including when the
      row is otherwise complete and approved by a human on the default branch.
- [ ] Deleting an approved row from the default branch produces an audit finding
      naming the capability, when it was opted out, by whom, the record it cited,
      and what to restore.
- [ ] The register is checked with the platform unreachable, and the merge is
      refused rather than skipped.
- [ ] `check-suppressions.mjs` does not flag the register's own text — a
      justification quoting a marker name needs the same split-literal treatment
      `check-adr-approver.mjs` already applies to its own marker list.

## Questions

The row-versus-record question and the reporting question that stood here are
both decided: an opt-out is a register row **and** a decision record, and a
disabled capability is silent in gate output. What each artefact holds is in
[the row indexes; the ADR reasons](#the-row-indexes-the-adr-reasons); what the
standards have to say instead is in
[the amendment](#the-standards-amendment-this-requires).

Two more standing here are decided too, by
[the same convention, stated once in slice 1](2026-08-01-distributable-guardrails-slice-1-foundations.md#what-is-not-in-it):
`docs/ADR/` is created by the first decision record that needs it, whatever
kind, not by bootstrap and not as a special case for an opt-out.

- **Where the record lives in a consuming repository that has no `docs/ADR/`
  yet.** Nowhere else. Bootstrap introduces no convention of its own — the
  opt-out conversation's own `Proposed` record creates `docs/ADR/` when it is
  filed, the same as a licence acceptance or an accepted advisory would if
  either arrived first. There is no dependency on slice 3 to create the
  directory ahead of time; there is nothing for it to create early.
- **Whether the audit can report a record no row indexes, in a repository
  that never adopted ADRs.** Yes, and the absence is not a blind spot: an
  absent `docs/ADR/` resolves to no records at all, so there is nothing to be
  orphaned — a record that does not exist cannot be orphaned. The checks that
  read the directory already treat its absence as the empty set (see the
  convention cited above), so [the finding this describes](#neither-artefact-works-alone)
  needs no extra guard for a repository that has never adopted ADRs; it
  simply never fires there.

What remains open:

1. **Which ref is "the protected default branch" on a repository with no
   remote?** This spec fails closed (no ref, no opt-outs), which is correct for
   safety and means a purely local repository can never opt out of anything. Is
   that acceptable, or does a local-only repository need a different admission
   route? No route that stays inside git alone is known to me.
2. **Does an opt-out row need a component scope in a multi-component
   repository?** This spec says no — a capability is disabled repository-wide —
   on the grounds that a per-component opt-out is a second, finer-grained
   mechanism nobody has asked for yet. If slice 1's capabilities turn out to be
   component-scoped, this is wrong and the schema needs a column.
3. **Reviewer identity matching is a string comparison** between the Approved by
   cell and a platform login or profile name. It is the weakest link in the
   admission check. A stricter form — the cell holds the login — reads worse in
   a document humans consult. Left as the loose form deliberately; flagging it
   in case the reviewer disagrees.

## References

- [Distributable guardrails — overarching design](2026-08-01-distributable-guardrails-design.md) —
  the scope this slice sits inside, and the failure condition it is judged against.
- [Registers](../standards/guardrails/registers.md) — the shared column set,
  the gate 2 / gate 6 approver split, and approval as an event.
- [Bypass and exceptions](../standards/guardrails/bypass-and-exceptions.md) —
  the three-state reporting rule, correct for suppressions and inapplicable to an
  opt-out, and the decision-record sentence the amendment above completes.
- [ADR-0004](../ADR/0004-development-scope-licence-acceptances.md) — the
  row-cites-record pattern this register mirrors: what the Decision record column
  points at, and what the record carries that a cell cannot.
- [Dependency licence register](../registers/dependency-licence-register.md) —
  the same pattern from the register's side, and the column name `citedAdrNumbers`
  already looks for.
- [ADR-0010](../ADR/0010-large-pr-marker-refused-without-approved-row.md) —
  refusing the act structurally at the earliest gate that can see it, rather than
  restating the rule a fourth time.
- [ADR-0006](../ADR/0006-change-size-override-is-a-human-decision.md) — "who, not
  which commit", and the limit of what commit separation can prove.
- [Slice 1 — Foundations](2026-08-01-distributable-guardrails-slice-1-foundations.md) — the capability
  vocabulary this register's Capability column takes its permitted values from,
  and the flat `.guardrails/` layout every path here follows.
- `.guardrails/check-approval-provenance.mjs` — the generic register reader and
  the provenance rule this register reuses rather than re-implementing.
- `.guardrails/check-branch-protection.mjs` — the existing check whose result
  the reader and the admission check both depend on.
