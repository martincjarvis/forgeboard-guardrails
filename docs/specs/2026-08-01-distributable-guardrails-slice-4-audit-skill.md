---
type: reference
summary: Slice 4 of the distributable-guardrails design — reworks the guardrail-audit skill to be opt-out aware, to detect a removed opt-out row as an uplift migration, and to produce a report ordered by urgency rather than a list that prioritises nothing.
read_when: Implementing or reviewing slice 4, or judging whether an audit-skill change belongs to this slice.
---

# Slice 4 — the audit skill

Rework `guardrail-audit` so an approved opt-out is never re-raised, a removed
opt-out is caught and named as a concrete restore, and the report a reader
gets back is ordered by what matters rather than by gate number.

## Scope and dependencies

This slice reworks one skill: `skills/guardrail-audit/SKILL.md` and, only
where the report or state model requires it, its four `references/` files.
It does not touch the nine gates, add a capability, or change any standard's
content — those stay exactly as the [overarching
design](2026-08-01-distributable-guardrails-design.md) fixes them.

Two vocabularies this spec consumes rather than defines, because inventing
either here would either duplicate or contradict the slice actually
specifying it:

| Depends on  | For                                                                                                                                                    | Named, not invented, here                                                                                                                                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slice 1** | The capability list, what each capability spans, the four places a gate fires (git hooks, agent hooks, CI, by hand), and the enforcement map's columns | Findings below key on **capability**, never on a check number. Where a capability's requirement, its exact id, or its gate membership is referenced, it is Slice 1's catalogue that resolves it — this spec describes the shape the audit reads that catalogue into, not its contents. |
| **Slice 2** | The opt-out register's location, columns, approval rule, the `removedOptOutRows()` contract and the meaning of a removed row                           | This spec describes what the audit does with an opt-out row once read, never what the row's schema is. Removal detection is not derived here either: Slice 2 supplies it as a function and names it "the contract slice 4 consumes", so this spec calls it.                            |

Everything else this skill already does and this spec does not mention —
establishing the stacks, reading pipeline definitions, the tooling ladder in
`references/tooling-shared.md`, `tooling-node.md`, `tooling-dotnet.md` and
`platforms.md` — is unchanged. Those four reference files are not reworked by
this slice.

**One existing section is removed, not reworked: "Adopting guardrails in a
repository that has none."** That section orders _implementation_ — which
gate to add first, in what sequence — and the audit's own rules already say
"do not fix anything during an audit unless asked." Slice 3 owns bootstrap,
including a repository it has never run against — a never-seen-the-toolkit
repository is now a bootstrap **path**, not an audit special case. The audit's job for that repository is the same walk it runs
for any other: report every capability's state. Where the report's ordering
implies a sequence a human might implement in, [The report](#the-report)
covers that — it does not need a second, separate ordering section.

## The five states, and the two that are not among them

The design fixes the report's vocabulary as states, not booleans: **present,
absent, partial, suppressed, opted out**. The existing skill's states map
onto these with one renaming and one splitting-apart, because the current
skill conflates two things the new design keeps separate — a single
suppressed _finding_ (one rule, one path, from the ordinary suppression
register) and an entire _capability_ excluded by an approved opt-out row
(Slice 2's register). Re-raising an opted-out capability is the failure the
brief names explicitly, and a state model that cannot tell the two apart
cannot avoid it.

| State          | Means                                                                                             | What the audit must have seen before reporting it                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Present**    | The capability's requirement is enforced and blocks as its gate membership requires               | A live refusal — the capability's own negative probe was tried and something in the pipeline stopped it — or, failing that, the check's own output naming the file it judged in an ordinary run |
| **Partial**    | It runs but does not block, or blocks locally with no gate-6 equivalent                           | Configuration or a job definition showing the check runs, without a refusal seen, or a local-only hook with nothing named at gate 6                                                             |
| **Absent**     | Nothing enforces it, and no opted-out row covers it                                               | A negative probe was tried and nothing stopped it, or no mechanism — of any name — could be found at all                                                                                        |
| **Suppressed** | One specific finding, at one rule and one path, is excluded via the ordinary suppression register | The register row was read; the finding it names is the one not firing. The capability's mechanism otherwise runs — this is not a capability-level exclusion                                     |
| **Opted out**  | The whole capability is excluded via an **approved** row in Slice 2's opt-out register            | The row was read, its approver is filled, it names this capability, and the decision record it cites resolves                                                                                   |
| **Tuned out**  | Nothing implements it, and the enforcement map records that discovery derived it does not apply   | The map's row for this capability, plus its `Derived from` command re-run and still producing the fact the row states                                                                           |
| **Unknown**    | The audit could not determine the state at all                                                    | Nothing — and that absence of evidence is the entire report for that line                                                                                                                       |

**Tuned out is the answer to "a successful uplift is never quiet".** Slice 3
derives that a capability cannot apply here — `package.json` declaring
`private: true`, so nothing publishes to a registry — and files no opt-out row,
deliberately: tuning is derived from the manifests with no human involved, and
an opt-out is a human's decision about the repository. An audit with no state
for that reports Absent, and this slice's own success criterion — an audit of a
compliant repository is quiet — becomes unreachable for **any** repository with
a tuning decision. That is not a demanding criterion; it is one nothing can
satisfy.

It is read from
[the enforcement map](2026-08-01-distributable-guardrails-slice-1-foundations.md#the-enforcement-map),
and it is **re-derived, never taken on trust**: the map records what was true
when bootstrap ran, so the audit re-runs the row's `Derived from` command and
compares. Two outcomes, the same shape an opt-out already has:

- The fact still holds → **Tuned out**, one line in the evidence appendix,
  naming the repository fact and the command that proves it. Not actionable.
- The fact no longer holds — `private: true` is gone, the stack the row named
  has been added — → **Stale tuning**, an actionable finding ranked with Stale
  opt-out, naming the map row, the command, and what its output says now.

**This grants no silence an agent can help itself to.** A capability with no map
row is Absent as before; a row whose command cannot be re-run is Unknown, not
Tuned out; and a row whose own recorded evidence contradicts it is Stale tuning,
which is a finding. The two alternatives were rejected on their own terms:
giving a tuning decision an opt-out row would make an agent the author of the
artefact the design reserves for a human, and accepting Absent would leave one
of the two branches of slice 3's criterion 12 — a capability not implemented has
_either_ a row _or_ an evidenced tuning decision — invisible to the only skill
that reads the outcome.

**Unknown is retained beyond the design's five, deliberately.** It is not a
compliance state competing with the other five for a place in the ranking —
it is what the audit reports when it did not check, the same discipline
[cross-gate-rules.md: never claim more than was
checked](../standards/guardrails/cross-gate-rules.md#never-claim-more-than-was-checked)
already holds a gate to. Folding "could not verify" into Absent overstates
what was found; folding it into Present overstates what was confirmed.
Removing it entirely would mean guessing, which the current skill already
forbids ("Report Unknown rather than guessing") and nothing in the design
argues against.

**A proposed opt-out row — one with every column filled except the human
approver — is not the Opted-out state.** Per the design, an agent may only
propose an opt-out during interactive bootstrap, and Slice 2's approval rule
means a row with a blank approver has not taken effect. The audit reports the
capability's _actual_ state (ordinarily Absent or Partial, since nothing was
implemented for it) and adds a note that a proposed row already exists at
the register path — so a reviewer sees a pending decision waiting on them,
rather than the audit either hiding the gap or repeating a finding the row
is already trying to close.

**A row that is approved but stale is a finding of its own, distinct from
removal.** Slice 2's row carries a `Removable when` cell — required non-empty,
and never the word "never", enforced at gate 2 — so the removal condition is
there to read rather than assumed by analogy with the other registers. Where
the audit can determine that condition has since become true — the tool it
excused now ships an equivalent, the repository dropped the stack the opt-out
named — that is reported as **Stale opt-out**, not folded into Opted out. The row still exists, so this is not
the backfill case below; it is a decision the repository accepted that no
longer matches the facts it was accepted under.

## Recognising a capability regardless of the tool

The third failure mode the brief names — reporting a capability Absent
because it is met by a tool the audit did not recognise — is a search-method
defect, not a preference one. The existing skill already refuses to prefer
its own tool choice over a working one ("A tool that meets the standard is
not a finding, however you would have chosen differently") — **that rule
survives unchanged.** What it does not yet say is how the audit finds the
working tool in the first place, and an audit that only looks for a fixed
list of expected tool names will not find what it did not expect.

The fix is to make evidence-gathering behavioural first, enumerative second:

1. **Start from the capability's requirement**, read from Slice 1's
   catalogue — what must be true, stated independently of any tool — not
   from a expected command name.
2. **Probe for it**, the same three probes the current skill already
   specifies (plant a violation and commit; strip local hooks and push; run
   the repository-wide sweep). Run the probe regardless of what
   configuration suggests is or is not present — a probe that fails to find
   a blocker is itself the Absent evidence; one that finds a blocker
   identifies Present without ever having needed to know the tool's name in
   advance.
3. **Name the tool from the refusal's own output**, once one fires — the
   error message, the exit reason, the hook's own banner — never from a
   pre-supposed list. This is the step that closes the failure mode: the
   audit does not ask "did I find `eslint`", it asks "did anything refuse
   this, and if so, what does it call itself."
4. **Where a live probe is unsafe or cannot run** (gate 8's release
   pipeline; a capability that would need a real credential leak to trigger)
   fall back to reading job and hook definitions structurally: any step
   whose exit code the job depends on, and whose behaviour plausibly
   matches the capability's requirement, counts as candidate evidence —
   whatever it is named — and is reported Partial at best without a live
   refusal, per the existing "Verifying rather than assuming" section, which
   is otherwise unchanged.
5. **Never conclude Absent from a missing expected artefact alone** — a
   missing `eslint.config.js` is not evidence formatting is unenforced if
   the stack's own compiler or a differently named tool already does the
   job. Absent is reached only by a probe that found nothing, or a search
   across every job, hook and platform capability (`references/platforms.md`)
   that also found nothing.

This does not add a step to the audit; it reorders two the skill already
has. The tool identification the skill currently treats as a byproduct of
knowing what to look for becomes the byproduct of watching what actually
fires.

## Opt-out awareness

**The audit is where an opted-out capability is visible, and that is not a
nicety.** A disabled capability is absent from gate output entirely — no finding,
no `SKIP`, not even a once-per-run header line — because an opt-out asserts the
class of check does not apply here, so there is no violation to report and a
standing notice would be noise
([Slice 2](2026-08-01-distributable-guardrails-slice-2-opt-out-register.md#silence)). The compensating
controls are the register arriving as a row in a diff and **this report**, which
names every opted-out capability, its row and its record on every run. A report
that quietly drops them, or summarises them as a count, removes the only
recurring visibility the decision has.

**Read the opt-out register before anything else, the same position the
current skill already gives it** ("Read the opt-out records first"), now
naming Slice 2's register specifically rather than "a decision record" in
general — the ordinary suppression register and Slice 2's opt-out register
are two different artefacts read for two different purposes, per the state
table above. **The register is the index; the record it cites is the
reasoning** — the audit reads the row to know what is off and cites the record so
a reader can find out why, and it does not restate the record's argument in the
finding.

For each capability the register names, resolve one of these outcomes before
walking that capability at all:

| Row found                                             | Approver | Decision record   | `Removable when` | Audit reports                                                                                                                                                                  |
| ----------------------------------------------------- | -------- | ----------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Yes                                                   | Filled   | Resolves          | Not yet true     | **Opted out** — no finding, no probe needed                                                                                                                                    |
| Yes                                                   | Filled   | Resolves          | Now true         | **Stale opt-out** — a finding, naming the row, the record and what changed                                                                                                     |
| Yes                                                   | Filled   | Blank, or missing | —                | The capability's **real state**, because the row has no effect — Slice 2's reader drops it, so the checks are running. The finding names the unresolved citation as the reason |
| Yes                                                   | Blank    | —                 | —                | The capability's real state (ordinarily Absent or Partial), plus a note that a proposed row exists, unapproved                                                                 |
| No, but `removedOptOutRows()` returns an entry for it | —        | —                 | —                | **Backfill needed** — see below, never ordinary Absent                                                                                                                         |
| No, but a decision record recording an opt-out exists | —        | —                 | —                | The capability's real state, plus **a record no row indexes** — the reasoning exists and nothing disables anything. Remedy: file the row, or supersede the record              |

**The last two are different and must not be merged.** A removed row is a
decision that was reversed, and it is a state of its own (Backfill needed).
A record no row indexes is a decision nobody wired up, and it may never have been
approved at all — so it is a **note on the capability's own state**, the same
shape the proposed-row note already takes, and not a seventh state.
`removedOptOutRows()` tells them apart: an entry there means the row existed
once, and no entry means it never did.

The unresolved-citation row is a note too, on the same footing — the capability
is Absent or Partial or Present on its own evidence, and the note explains why
the row a reader can see in the register is not doing anything.

**A record no row indexes requires scanning `docs/ADR/`, which the audit does
not assume exists.** A repository that never adopted ADRs has no `docs/ADR/`
to scan, and that resolves to no records — the [convention stated once in
slice 1](2026-08-01-distributable-guardrails-slice-1-foundations.md#what-is-not-in-it), the same one
`.guardrails/check-adr-approver.mjs` and its siblings already apply. No
records means no orphans, which is the correct answer, not a gap the audit
silently has: a record that does not exist cannot be orphaned, so this row of
the table is simply never reached there.

**Do not re-raise a capability an approved row covers.** This is the rule
the brief quotes the skill's own text warning against, and it survives
unchanged in substance: the failure mode named is "re-raising it every
audit," and the fix is the lookup above running before the walk, not after —
an opted-out capability is never probed, so there is nothing left to
re-raise.

## Backfill on removal — an uplift migration, not a fresh bootstrap

**Detecting removal.** A capability with no current opt-out row is
ordinarily just Absent — a gap nobody has decided about either way. It is
**Backfill needed** instead when the register's own history shows an
approved row for that capability existed and no longer does: the repository
opted out once, on purpose, with a human's approval, and something removed
that row since. This is a strictly stronger claim than "the capability is
unimplemented," and the report must not collapse it into an ordinary gap —
the whole point of naming it separately is that a human decision was
reversed, silently, and the audit is the only place that gets noticed.

**How the audit determines this — it calls Slice 2's contract and derives
nothing.** Slice 2 supplies `removedOptOutRows(defaultBranchRef)`, which walks
the register's own history on the default branch and returns one entry per row
that a previous revision held and the current one does not:

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

Every field the Backfill-needed finding reports is in that return value, so the
audit reads the history through Slice 2's function rather than running its own
`git log -p` over the register file. This is the "read the gate's own output,
never re-derive it" discipline
[cross-gate-rules.md](../standards/guardrails/cross-gate-rules.md#never-claim-more-than-was-checked)
already holds for every other quoted figure, and here it also avoids two
parsers for one table format: a second reader of the register's rows would
disagree with Slice 2's the first time a cell gained a comma.

The one thing this spec does add is what the audit does when the function
returns an entry for a capability that **also** has a current row — a row
removed and later re-filed. That is not a backfill: the capability is opted out
now, and the earlier removal is history. It is reported through the ordinary
Opted-out state, and the removed entry is dropped.

**What backfill produces, concretely.** A Backfill-needed finding's Fix field
is not "propose a tool" — the repository already made that choice once, and
re-deriving it from the tooling ladder is the bootstrap path, which this is
explicitly not. Instead:

1. **Check whether the capability's prior implementation is still visible in
   this repository's own history** — the commit that added the opt-out row
   often removed or disabled the matching gate script, hook wiring, or
   pipeline step in the same or an adjacent commit. Where it is, name that
   commit and the exact path it removed as the primary restore candidate.
2. **Where no prior implementation is recoverable from history** (the
   capability was opted out before this repository ever implemented it, or
   the commit trail does not show one), name the plugin's own canonical
   template for that capability — the same source Slice 3's bootstrap copies
   from into `.guardrails/` — and specify that it is tuned to match the
   stack choices `.guardrails/` already carries for every other capability,
   not re-derived from the tooling ladder as if this were a new repository.
   A repository that tunes every other check to its own stack's native tool
   does not get a Node fallback pasted in for the one capability that lapsed.
3. **Name the exact destination**: the path under `.guardrails/` the restored
   script or configuration lands at, and which of the four firing points
   (Slice 1's grouping) it needs wiring into.

**This is what distinguishes backfill from bootstrap.** Bootstrap meets an
absent capability with no prior state and derives an answer through the
tooling ladder — a fresh choice, made once, for a repository that has never
had an opinion. Backfill meets a capability the repository already had an
opinion about, twice over: once when it was implemented, and again when it
was deliberately opted out. The audit's job is to point at what already
existed, not to open a design question that was already closed.

### Who performs the backfill

**This skill does, and only when asked.** The design's decision table says the
auditor _"reports the gap **and** backfills from the plugin reference, as an
uplift"_, and slice 3 routes a single-capability restore here; this section
claims that half rather than leaving it to fall between the two skills.

The audit's standing rule — _"do not fix anything during an audit unless
asked"_ — is unchanged and is what makes this workable:

- **An audit run never backfills.** It produces the Backfill-needed finding,
  whose Fix field already names the exact path, the source and the firing point
  to wire it into. That finding is the ask, phrased so it can be granted.
- **A request to restore that capability is a second invocation**, and it is the
  one the activation table sends here rather than to bootstrap. It restores what
  the finding names, wires it at the firing point the finding names, and reports
  what it wrote. It re-derives nothing through the tooling ladder — that is the
  bootstrap path this section exists to be distinct from.
- **It still writes to neither register.** Restoring the implementation is the
  opt-back-in taking effect; the row is already gone, and the decision record it
  cited stays where it is. Nothing about a backfill needs an approval, because
  it only ever causes more checks to run.

Success is that a Backfill-needed finding and the act that closes it are the
same vocabulary: the paths the finding named are the paths that exist
afterwards. Failure is a repository where every audit reports the same backfill
and no invocation can perform it.

## An existing `.guardrails/` from an older plugin

**This case is slice 4's, and slice 3 says so.** Bootstrap does not fire on a
populated `.guardrails/` at all — slice 1's `isPopulated()` is the test and
slice 3's activation table defers on it — so an upgrade across a plugin layout
change never reaches the bootstrap skill. It reaches the audit, which already
holds the only comparison the case needs: the repository's `.guardrails/`
against the plugin's reference. Assigning it anywhere else would give two
skills a reason to write to one directory, which is how the divergent-conflict
class in slice 3 starts.

**The comparison is a file comparison, not a diff.** Slice 1's layout is flat
and slice 3's copy rewrites no path, so a file at `.guardrails/<name>.mjs` and
the plugin's `<name>.mjs` are comparable byte for byte. Three classes fall out,
and each is reported differently:

| Class        | Is                                                    | Reported as                                                                                                    |
| ------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Missing**  | The reference has the file; this repository does not  | Through the capability that file carries — ordinarily Absent or Partial, by the ordinary walk. Not a new state |
| **Retired**  | This repository has the file; the reference no longer | One line in the Layout section below                                                                           |
| **Diverged** | Both have it; the bytes differ                        | One line in the Layout section below, naming the file and nothing more — see why                               |

**Missing files are not reported as a layout problem.** A missing check script
is a capability that does not run, and the audit already has a state for that
which a reader knows what to do with. Routing it through a separate "your
layout is old" finding would report the same gap twice, in a vocabulary that
tells nobody what stopped being enforced. Only files that carry no capability —
`README.md`, `lib.mjs`, `run.mjs`, `capabilities.mjs` — reach the Layout section
when missing.

**Divergence is named, never judged.** A copied script that differs from the
reference is either a tuning decision the repository made deliberately (slice 3
adapts scripts to the stack's own mechanism, and that is the design's whole
point) or an upgrade that never happened. **Nothing readable from the two files
distinguishes them**, so the audit reports which files differ and stops there.
Guessing would either erase a deliberate tuning by recommending a re-copy, or
excuse a two-versions-stale gate script as intentional. This is
[never claim more than was
checked](../standards/guardrails/cross-gate-rules.md#never-claim-more-than-was-checked)
applied to the one comparison in this skill that has a genuinely ambiguous
result.

**The audit does not perform the upgrade**, and does not recommend a wholesale
re-copy: a re-copy discards every tuning decision in the directory, which is a
human's call and not a finding's remedy. What it recommends per line is the
narrow act — restore this file, delete this retired one, review this diverged
one against the reference.

**One source of divergence is now excluded, which narrows what a Diverged line
means.** Slice 3 never edits a copied file — adaptation to a repository's own
mechanism happens at
[the invocation layer](2026-08-01-distributable-guardrails-slice-3-bootstrap-skill.md#a-divergent-adaptation-never-edits-a-copied-file),
never in the bytes of a check. So a diverged file is a human's edit or an
upgrade that never happened, not a tuning decision bootstrap made. The audit
still names rather than judges: nothing readable from the two files tells a
deliberate local edit from a missed upgrade, and both remain possible. What is
gone is the third possibility that made the line permanently unresolvable by
construction.

**Without the plugin present there is no reference**, and the whole section
reports Unknown with that as its reason. An audit run without the plugin is
still a complete audit of everything else; it simply cannot compare against a
thing it does not have, and saying so is the honest result.

**And where the repository _is_ the reference, the section reports Unknown
too**, with `subject is the reference` as the stated reason. Running this audit
against the toolkit compares `.guardrails/` with itself, so every Layout line
is clean by construction — a comparison that cannot fail, which is this corpus's
most-found recurring defect class and not something to report as a pass. The
condition is the `isToolkit()` signal slice 3's activation table already reads;
no new derivation, and one line of output instead of a section of false green.

### The Layout section

Last in the actionable findings, beside Unknown and for the same reason: it
demands an upgrade decision, not a fix, and nothing in it is a capability going
unenforced — the capabilities that are went out through their own states
already. One line each:

```text
Retired    <path> — not in the plugin reference; delete unless this repository added it deliberately
Diverged   <path> — differs from the plugin reference; tuning or a missed upgrade, not determined here
Missing    <path> — in the reference, absent here, and carries no capability
```

## The report

**The stated failure is a report that lists everything and prioritises
nothing.** The fix is a report with two parts, in this order, so a reader
never has to scan past everything that is fine to find the three things that
are not:

1. **Actionable findings**, ranked — see ordering below. Everything here
   needs a human or an implementer to do something.
2. **Evidence appendix**, compact, one line per capability — everything the
   audit confirmed needs no action: Present, Suppressed, Opted out. This is
   not decoration; per [cross-gate-rules.md: every verdict leaves
   evidence](../standards/guardrails/cross-gate-rules.md#every-verdict-leaves-evidence-someone-else-can-read),
   a pass with no artefact is a claim, and this is the artefact — but it is
   evidence, not action, so it sits after the part that is.

### Ordering within actionable findings

Ranked by what a silent gap costs, and by how much of a decision it
overturns — not by how easy each is to close, which the existing skill
already refuses as a ranking basis:

| Tier | State                               | Why it ranks here                                                                                                                                                                                                                                                                                                       |
| ---- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | **Backfill needed**                 | A human decision was reversed without anyone deciding that; the repository believes it is protected where it is not, which is worse than never having decided                                                                                                                                                           |
| 2    | **Absent**, no opt-out at all       | An ordinary, undecided gap. Ranked internally by blast radius — a missing secret scan outranks a missing spell check regardless of effort, exactly as the current skill already states                                                                                                                                  |
| 3    | **Stale opt-out**, **Stale tuning** | A decision that was reasonable once and no longer matches its own stated condition — real, but something already stands between production and the gap, which is why it ranks below an active one. A stale tuning ranks here for the same reason and on the same evidence: its recorded derivation no longer reproduces |
| 4    | **Partial**                         | Something already runs; the gap is scope (no blocking, no server-side twin), not absence                                                                                                                                                                                                                                |
| 5    | **Unknown**                         | Not itself a compliance gap — an audit gap. Ranked below every compliance gap because it demands re-auditing, not a fix, but it must appear here rather than being silently dropped                                                                                                                                     |
| 6    | **Layout**                          | Retired and diverged files, and missing files carrying no capability. Every capability actually going unenforced has already been reported through its own state, so nothing here is a live gap                                                                                                                         |

Within Tier 2, rank by what the gap admits — the same rule the current skill
states and this slice keeps: a missing secret scan outranks a missing spell
check regardless of which is cheaper to close.

### Per-finding fields

```text
Capability: <capability id/name, from Slice 1>
Gate(s):    <named, not numbered — e.g. "Commit, Push">
State:      Backfill needed | Absent | Stale opt-out | Stale tuning | Partial | Unknown
Evidence:   what was run, and what happened
Risk:       what reaches production because this does not run
Fix:        Absent/Partial — concrete tool and invocation, from the stack reference
            Backfill needed — the exact path to restore and its source (history or plugin reference)
            Stale opt-out — the row's path, its removal condition, and what changed
            Stale tuning — the map row, its Derived from command, and that command's output now
Note:       present only where one applies — a proposed row awaiting approval, a row
            whose decision record does not resolve, or a record no row indexes
```

Every Backfill-needed and Stale-opt-out finding additionally cites the
register row (or the commit that removed it) **and the decision record that row
names** by path — the same citation discipline [cross-gate-rules.md's evidence
rules](../standards/guardrails/cross-gate-rules.md#every-refusal-names-the-specific-thing-being-refused)
already require of every other refusal. Citing the record is what lets a reader
see the argument being reversed or outlived without the finding restating it.

### Evidence appendix

One line per confirmed-fine capability, grouped by state, not ranked within
the group — there is nothing to prioritise among items nobody needs to act
on:

```text
Present    <capability> — <what proved it: probe result or gate output cited>
Suppressed <capability> — <rule> at <path>, register row <path>
Opted out  <capability> — register row <path>, ADR-nnnn, approver <name>
Tuned out  <capability> — enforcement map row, <fact>, re-derived by <command>
```

**Every opted-out capability appears here, every run, one line each.** No
collapsing to a count and no omitting them once they stop being interesting: gate
output says nothing about them by design, so this appendix and the register's own
diff are the whole of the visibility.

### What does not change

Everything the current skill already states about _how_ a finding is
verified survives, because the brief scopes this slice to opt-out awareness,
backfill and report shape — not the evidence discipline underneath them:

- "Do not fix anything during an audit unless asked."
- "Never approve an exception" / "You may not approve one" — the audit never
  fills an opt-out row's approver, proposed or otherwise.
- The three probes, in the order given ("Break one check deliberately",
  "Remove the local hooks and push", "Run the repository-wide sweeps").
- Streaming progress and taking the reasonable option rather than pausing to
  ask, per `agent-integration.md`.

## Success and failure criteria

**A repository that has never seen the toolkit.** Every capability in Slice
1's catalogue reports one of Present, Partial, Absent or Unknown — Suppressed,
Opted out, Backfill needed and Stale opt-out cannot occur, because there is
no register yet. The report is entirely the actionable section; the evidence
appendix is empty or near-empty. Fails if any capability is silently
skipped, or if Absent is reported for a capability actually met by a tool
the audit did not expect (the third failure mode).

**A compliant repository.** Every capability is Present, Suppressed (with a
valid row), Opted out (with an approved row citing a record that resolves) or
Tuned out (with a map row whose derivation still reproduces). The actionable
section is empty and every opted-out and tuned-out capability appears in the
appendix with its evidence. Fails if a single Opted-out or Suppressed capability
appears in the actionable section — that is the re-raising failure the brief
names first — and fails equally if an opted-out capability appears nowhere at
all, since gate output does not mention it either.

**A repository immediately after a successful uplift.** The case the tuned-out
state exists for: at least one capability discovery declined with evidence, and
the actionable section is empty on the very next audit. Fails if a tuned-out
capability is reported Absent, and fails equally if it is reported Tuned out
without the audit having re-run the map row's own derivation — a state taken on
the map's word is a check that cannot fail.

**A repository whose tuning has since gone stale.** The same repository, with
`private: true` removed from `package.json`. Success is one Stale tuning finding
quoting the command's new output, ranked in tier 3. Fails if the capability
still reports Tuned out from a map row nothing re-checked.

**The toolkit itself.** The Layout section reports Unknown with `subject is the
reference`. Fails if it reports every file clean, which is what comparing a
directory with itself would otherwise produce.

**A repository mid-uplift.** A mix: some capabilities Present, at least one
Opted out, at least one Absent with no opt-out, and — the case this slice
exists to add — at least one Backfill needed, where an approved row was
removed since a prior audit. Success is that the Backfill-needed finding
ranks above the ordinary Absent one, and its Fix field names a concrete path
rather than "propose a tool." Fails if the audit reports that capability as
an ordinary Absent gap indistinguishable from one that was never
implemented — the case the brief is most specific about.

**A repository whose `.guardrails/` predates a plugin layout change.** Every
file the reference has and the repository lacks is reported through the
capability it carries, so a check that stopped existing reads as Absent or
Partial and not as a layout note. Retired and diverged files appear once each
in the Layout section, and a diverged file's line states that the audit did
not determine which of tuning and a missed upgrade produced it. Fails if a
missing check script is reported only as a layout difference, if the report
recommends re-copying the directory, or if a diverged file is asserted to be
either stale or tuned.

**The unrecognised-tool case, tested directly.** A repository where a
capability is met by a tool the audit's stack references do not name (a
lesser-known linter, a repository-local script, a platform feature no
reference table lists). Success is Present, with the actual tool named from
its own refusal output. Fails if it reports Absent because no known-tool
signature matched.

## Out of scope

- The nine gates, their order, or what they check.
- Any new capability beyond Slice 1's catalogue.
- Any change to a standard's content.
- `references/tooling-shared.md`, `tooling-node.md`, `tooling-dotnet.md`,
  `platforms.md` — unchanged by this slice; the backfill Fix field points
  into them, it does not edit them.
- Implementation-ordering guidance for a from-scratch repository — that is
  Slice 3's bootstrap skill, not the audit.
- Writing or approving an opt-out row, or the decision record it cites — the
  audit reads both; it never writes to either, proposed or approved.

## Decisions taken here

Nothing in this slice is open.

The question that stood first here — **can the audit report a capability
inapplicable on its own evidence, with no row?** — is answered. Inapplicability
asserted by a **human** is an opt-out row and a record, and the audit still
derives none of it. Inapplicability **derived** by bootstrap is the third path
slice 3 always had, and it now has a state and an artefact to read it from:
[Tuned out](#the-five-states-and-the-two-that-are-not-among-them), taken from
the enforcement map and re-derived on every audit. Of the three options this
question posed — a row after all, a readable derived fact, or Absent accepted —
the second is taken, and the reasons the other two were rejected are recorded
with it.

## What will settle by measurement

Not an open question. It has a working answer and a trigger that would change
it, and it does not block implementation.

**Where the evidence appendix lives for a large repository.** One report carries
it, which is what this spec assumes. Slice 1's catalogue holds forty-eight
capabilities, so a compliant repository's appendix is forty-eight lines — near
the edge of readable rather than comfortably inside it. The alternative is a
summary in the report with per-capability detail in a separate generated
artefact. _Trigger: an audit whose appendix is effectively the entire report._

## References

- [Distributable guardrails — overarching design](2026-08-01-distributable-guardrails-design.md) —
  the design this slice is scoped by, including Slice 1's and Slice 2's own
  briefs.
- [Slice 1 — Foundations](2026-08-01-distributable-guardrails-slice-1-foundations.md) — the capability
  catalogue findings key on, and the flat layout that makes the reference
  comparison a file comparison.
- [Slice 2 — the opt-out register](2026-08-01-distributable-guardrails-slice-2-opt-out-register.md) —
  the register's columns, the `Removable when` cell the Stale-opt-out state
  reads, and the `removedOptOutRows()` contract this spec calls.
- [Cross-gate rules](../standards/guardrails/cross-gate-rules.md) — the
  evidence and citation rules this spec applies to the audit's own report.
- [Registers](../standards/guardrails/registers.md) — the shape (removal
  condition, human approver, approval-is-an-event) this spec assumes Slice
  2's opt-out register follows.
- [Bypass and exceptions](../standards/guardrails/bypass-and-exceptions.md) —
  the opt-out-as-decision-record model Slice 2 completes rather than replaces:
  the record stays and a capability-keyed row indexes it. The
  suppression-register model for single findings is unchanged, and so is the
  three-state reporting rule that governs it.
- `skills/guardrail-audit/SKILL.md` — the skill this spec reworks.
