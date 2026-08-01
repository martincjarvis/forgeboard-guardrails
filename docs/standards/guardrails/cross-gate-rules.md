---
type: reference
summary: The rules every gate holds regardless of what it checks — ordering, the tooling ladder, zero warnings, evidence, and how a refusal must read.
read_when: Building a gate, or judging whether an existing one is defective in a way its checks would not reveal.
---

<!-- cspell:ignore fixtured GHSA Uncited symref unrun -->

# Cross-gate rules

These hold for every gate. A gate that breaks one of them is defective even when
its checks are correct.

## Order is part of the contract

**Fail fast, and shift left.** A defect caught earlier costs less: earlier in
the gate sequence, and earlier in the gate order within it. Two rules produce
that, and the second overrides the first.

**Cheapest first.** Within a gate, order checks by what they cost to run, not by
how important they feel. A formatter that runs in a second precedes a test suite
that runs in a minute, so the common failure is reported in a second. Ordering by
severity instead means paying the expensive check's cost before learning the
cheap one would have failed anyway.

**Except where a check changes what a later one reads.** A check that mutates
the tree — a formatter rewriting files, an isolation step hiding unstaged
changes — must run before anything that reads what it touched, whatever it
costs. Otherwise the later check judges bytes that are about to change, and its
verdict is about a state that will not exist.

That is why the commit gate runs the formatter first and the isolation check
before anything reads a file: not because they are cheap, though they are, but
because everything after them depends on what they did.

A reordering changes what the gate sees. It is a change to the contract, not a
presentation choice.

## Checks are tiered by cost, and the tier decides the gate

Fast, local, stack-specialised tooling runs at the gates that fire often — edit
and commit. Those are the gates a developer feels on every action, so they must
stay quick. Heavyweight, general-purpose or network-bound tooling runs later, at
the on-demand gate or in CI, and does not block the fast path: it runs at its
gate, reports, and the caller decides. This corpus already names checks of that
kind: semgrep's rule fetch is network-bound, lizard is a general-purpose
complexity analyser, and a CI platform's own SAST and dependency scanning are
host-provided general tooling. [Placing a new check](placing-a-new-check.md)
covers weighing a specific check's cost against the gate its inputs would
otherwise allow.

**A general-purpose analyser is a backstop, not a replacement, and it is not
skipped because a specialised one exists.** Where a stack has its own
specialised analyser, that analyser is authoritative for that stack's values —
see [thresholds: the stack's analysers win](thresholds.md#the-stacks-analysers-win)
— but the general-purpose tool still runs at its later gate across everything,
including stacks a specialised tool already covers. It is expected to find
nothing there; finding nothing is not a reason to exclude that code from the
scan. A type checker is not a complexity analyser: a repository whose only
specialised analyser is a type checker has no complexity measurement at all if
the general-purpose complexity tool is also excluded from that stack.

## A check reused across gates carries its severity model with it

Two gates invoking the same underlying tool is not two decisions that
happen to agree — it is one decision, made once, and the second gate's
choice is whether to keep it or state why it differs. Reusing a check's
_invocation_ without also carrying its _consequence_ — what happens when it
fails — silently makes a second decision no record shows was made.

Gate 7's repository-wide size scan (`lizard -C 15 -L 100 -a 7`,
[gate-7-on-demand.md](gate-7-on-demand.md)) is report-only by design: it
runs before trusting the incremental gates, and the caller decides the
consequence. Gate 6 reused the identical invocation against a pull
request's changed files — deliberately, the comment beside it says "reused
directly here rather than invented twice" — but gate 6 hard-blocks on a
non-zero exit, with no suppression path for a finding that has no line to
mark. Gate 7's own comment already documents a known lizard failure mode
this exact reuse inherited without noticing: the tool's function-span
detection misattributes a long run of adjacent functions to one, and when it
does, a file gate 7 would only ever report on became a file gate 6 refused
outright — a false block on every repository that ported the ordinary test
file large enough to trip it
([ADR-0009](../../ADR/0009-split-hooks-test-suite.md)).

**State the difference when a check's consequence changes across gates, the
same way a threshold change is stated
([thresholds.md](thresholds.md#rules): "changing a threshold is a decision,
recorded").** Silence is not evidence the difference was considered — it is
the shape every version of this defect has taken so far: a comment
justifying the reuse of the _check_, and nothing beside it justifying the
reuse, narrowing, or widening of what happens when the check fails.

**Checkpoint:** every check invoked at more than one gate has, beside each
invocation (or in the decision record either one cites), a stated reason its
consequence at that gate is the same as, or different from, its consequence
everywhere else it runs.

## Build and test only what changed

Stated in full as
[the changed-component rule](components.md#the-changed-component-rule), beside
the component map it depends on.

## Prefer established tooling to bespoke checks

Nearly every check in this standard has a mature open-source implementation,
usually several, maintained by people who have seen failure modes this
repository has not met yet. Take one. Write a check only to fill a gap no
available tool covers, and treat that as a temporary state rather than an asset
— a bespoke check is a thing to maintain, a thing to document, and a thing that
is wrong in ways nobody else has already found and fixed.

Stop at the first level that covers the check:

| Level | Source                                           | Why it comes first                                                                               |
| ----- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| 1     | A capability the hosting platform already offers | Nothing to install, nothing to keep running, and it reports where the merge policy already looks |
| 2     | An established open-source tool                  | Maintained by someone else, calibrated against more code than this repository                    |
| 3     | A check written here                             | Only for a gap the first two do not cover                                                        |

Level 1 is the one most often skipped, and the two clearest examples are
dependency updates and code scanning. A platform that raises dependency-update
pull requests on a schedule, or scans for vulnerable patterns and publishes the
findings to its own review surface, is offering the exact check this standard
asks for — already integrated with the required status checks, already
annotating changed lines, already retaining history across runs. Reimplementing
that in the pipeline costs work and produces something less connected.

Within level 2, **prefer the stack's own tool where one exists, and fall back to
the Node ecosystem where none does.** A formatter, a prose lint, a spell check
and a secret scan are stack-independent problems, and one implementation across
every repository is worth more than a per-stack choice. A language's own
formatter and analysers are not: they understand the language, and an external
pass never will.

**The Node ecosystem is the named fallback, not merely a habit.** It is broad
enough to cover the stack-independent checks for any language, mature, and
already required by the format standards the pipeline publishes. A repository
whose stack has no answer takes that rather than inventing one, so that two
repositories on the same unfamiliar stack converge instead of diverging.

**A repository that already has a working answer keeps it.** The fallback names
what to reach for when there is nothing; it is not an argument for replacing
something that already meets the standard. A stack-native alternative is worth
raising only for a new repository, and only where the team finds the fallback
genuinely unacceptable — adopted deliberately it is a decision record, while the
fallback taken by default needs nothing.

**Prefer tools that honour `.editorconfig`.** Indentation, character set and
line endings are declared once, in a file every major editor and a good many
tools already read, rather than repeated in each tool's own configuration where
the copies drift and contradict each other. A tool that reads it inherits the
repository's answer for free; a tool that does not needs its own copy of the
same settings, and that copy is one more thing to keep true.

This is the same reasoning as preferring a format the host ingests natively: an
existing, widely-implemented declaration beats a private one, and the cost of
ignoring it lands later as a diff full of whitespace nobody changed.

Two qualifications, both real:

- **Adopting a tool is a dependency decision**, subject to whatever line the
  repository holds on dependencies, and recorded like any other — including the
  alternative that was rejected.
- **Configuring a tool is not writing one.** Preferring established tooling does
  not mean accepting its defaults unexamined; it means not reimplementing its
  analysis. The rule set is still the repository's to choose.

## A warning is a failure

Every build and lint check in every gate holds a zero-warning, zero-error line.
A threshold above zero is a number people write to, and a warning nobody is
required to clear is a finding the repository has silently accepted. This is a
different word from the warn verdict band the [threshold table](thresholds.md)
defines — see
[guardrail standards: warn means two different things](../guardrail-standards.md#warn-means-two-different-things)
— and it is not satisfied by leaving a rule at the tool's own `warn` severity: a
linter or compiler run without an option that turns its own warnings into
failures (`--max-warnings 0` for eslint, `-warnaserror` for the .NET compiler)
prints the finding and still passes, which this rule forbids.

## Local gates are a fast copy; the server gate is the authority

Gates 0–5 exist to give the author the answer in seconds instead of minutes, and
every blocking check among them must have a named required status check in
[gate 6](gate-6-pull-request.md). A check that runs only locally is advisory
whatever its verdict says, because nothing stops a change that never ran it. A
check that runs only server-side is correct but slow, and slow checks are where
people learn to push and hope.

**"Named required status check" is a platform setting, not a sentence in this
corpus.** A check can be wired into gate 6, run on every pull request and
still block nothing if branch protection was never configured to require it —
a red gate 6 and a red platform scanner check, neither one refusing a merge, is
exactly that gap. [Branch protection](branch-protection.md) is
where this is verified rather than assumed: `scripts/check-branch-protection.mjs`
reads the protected branch's actual configuration and reports every check
this toolkit runs that is not in the required list — as a finding, not a
silent skip.

## A pull request is not opened until the gate-6 surface is clean locally

Every gate above runs on the author's machine before it runs on the server,
and [gate 6's own check 3](gate-6-pull-request.md#61-revalidation) is the
same local checks re-run against the pull request's range instead of the
index — nothing about the gate-6 surface needs a pull request to already
exist. Raising one to find out what it says spends a run, puts a red pull
request in front of a reviewer, and loses the one piece of information that
actually mattered: [which local gate should have caught it and did
not](#the-gap-between-a-local-pass-and-a-ci-finding-is-itself-a-finding).
One iteration ran three of gate 6's checks locally, called the branch ready,
and CI reported sixteen findings.

**Do not open a pull request unless you are certain it will pass CI.** Run
the gate-6 surface against the branch first — the gate itself, not a
selection of checks, [the same rule a report's outstanding-work list already
holds](../docs-style.md#standards-in-a-consuming-repository) — and raise the
pull request only when that command is clean. Choosing which of gate 6's
checks to run by hand and calling the result "ready" is the same defect one
step earlier: the set is assembled by running the gate, not by picking
checks that seemed relevant.

**The one exception, stated so the rule is not circular: a finding reserved
for a human cannot be resolved by the implementer, and the pull request is
how it is put to them.** The reserved classes are not invented for this
rule — they are the ones this corpus already reserves elsewhere: a decision
record or register row accepting a risk, a licence, a suppression or an
opt-out ([registers.md](registers.md#a-register-row-or-a-decision-record)), a
change-size override recorded in [the change-size override
register](registers.md#the-change-size-override-register)
([an override is not a fix](#an-override-answers-a-push-back-it-is-not-a-fix)),
and a conflict
between two standing directives, which a repository's own root instruction
file names as reserved the same way (this toolkit's own `AGENTS.md` is the
worked example). A pull request may be opened with findings outstanding
**only** where every remaining finding is one of those — named in the pull
request body, with the command that produced them. A finding the implementer
could have fixed is a reason not to open yet, not a line item to disclose
and open anyway.

**A definition with no check is a suggestion.** The check is mechanical and
carries no judgement: **every finding disclosed in a pull request body
cites the register row, the Proposed or Accepted ADR, or the named conflict
record that reserves it — an ADR number that does not resolve to an actual
Proposed or Accepted ADR is not a citation, and neither is a heading that
invents a sixth class.** `scripts/check-pr-body-artefacts.mjs`
(`findUncitedFindings`) is the mechanical form: it does not read whether the
disclosing sentence is honest — that is the prose-honesty check this corpus
already refuses to build — only whether the artefact it points at exists. A
finding with no such artefact blocks the pull request rather than appearing
in its body. The failure this catches: a pull request opened anyway, under a
heading it invented — "One tool limitation, documented rather than hidden" —
where "tool limitation" is not one of the five, and the same body's six
dependency advisories were called "a dependency-upgrade decision" with no ADR
naming a GHSA id and no advisory register row anywhere, while the licence and
suppression items beside them did carry real, blank-approver register rows.

**The precondition is resolvability; the reserved classes above are its
consequence, not its definition.** Stating the rule as an enumeration invites
a sixth being invented to fit through it — the pull request above did exactly
that. Restated in the terms that actually decide it:

**A pull request opens when every finding an implementer could resolve has
been resolved.** What remains is what only a human can decide: an approval,
an acceptance, or a suppression. Those do not block the pull request — the
pull request is how they reach the person who decides. The classes above are
not an arbitrary list to extend; they are what this corpus has found, so
far, to be genuinely unresolvable by an implementer.

**Do not weaken the artefact-citation check above to match this
restatement.** Resolvability is a judgement and cannot be checked
mechanically; artefact citation can be, and it is how resolvability is
_proved_. A finding only a human can settle
has a record with a blank approver — a register row, a Proposed ADR, a
change-size override record. A finding the implementer simply chose not to
fix has nothing to cite, because no record exists for "I decided this was
hard." That is why the citation test catches an invented sixth class and
lets a genuine one through: the citation is not bureaucracy, it is the
evidence that the finding is genuinely reserved. **The reverse also holds:**
creating a record in order to make a finding look reserved is the forgery
[registers.md's approval-provenance
rule](registers.md#approval-is-an-event-not-a-field) already addresses, and
it applies here the same way — a record and its approval never arrive in the
same commit.

## An override answers a push back; it is not a fix

**`[large-pr]` is a human decision an agent may propose and never
take.** [Gate 4](gate-4-task-completion.md)'s change-size check reports the
counted size and names what makes up the bulk; it does not add the override
marker on its own authority. The marker is applied by, or on the explicit
instruction of, the human who decides the branch is large enough to justify
without splitting it — the same shape [the suppression
register](registers.md) already carries for every other accepted finding: an
agent fills in every column except the approver, and a blank approver pushes
back at the commit gate, then blocks at the merge gate.

**The distinguishing property is who, not which commit.** A branch whose
marker sits in a commit distinct from the diff it excuses has not thereby
proven a human decided anything — a single actor, working alone, produces
that shape trivially, and the case behind this rule had that separation
already (the marker landed in `ccd9d67`, two commits after the oversized
diff in `53f4bed`) while still being an agent's own unreviewed decision.
Requiring commit separation adds nothing that was not already true. What the
[change-size override
register](registers.md#the-change-size-override-register) adds instead is a
row identified by branch, with a blank Approver cell until a human fills it
in, protected by the same approval-provenance rule that already governs
every other register in this repository
([registers.md](registers.md#approval-is-an-event-not-a-field)): a row that
arrives already approved, in the commit that files it, is refused — so the
only row that clears the merge gate is one where the approval genuinely
happened in a separate, later commit. `scripts/check-change-size-override.mjs`
is the mechanical form, wired blocking at [gate
6](gate-6-pull-request.md#61-revalidation).

**Locally, the bare marker still clears gate 4** — an author working
interactively, or resuming a branch a human has already blessed, is not
blocked by a check that cannot tell who typed a commit. The register
requirement is the unattended half, the same split
[registers.md](registers.md#approval-is-an-event-not-a-field) already draws
between gate 2's push back and gate 6's block for a row missing only its
approver: **push back in an unattended run** becomes, server-side, a check
for the resolved answer, and no answer on record is a failure there.

**[ADR-0010](../../ADR/0010-large-pr-marker-refused-without-approved-row.md)
closes what this paragraph used to leave open.** Gate 4's own change-size
check still clears the moment it sees the bare string — that is unchanged —
but the string itself can no longer land in any commit without an approved
row already behind it: gate 3 (the commit-msg hook) refuses a commit whose
own message introduces `[large-pr]` unless the change-size override register
already carries a human-approved row for the branch. An agent can still
report the finding and stop; it cannot type the marker into a commit ahead
of a human's own approval, interactively or otherwise.

**An override is not a fix, and a report must not read as though it were.**
A pull request whose largest anomaly is an unresolved change-size override
is not "fixed during the bootstrap" — it is outstanding, disclosed, and
reserved for a human, the same as any other finding this section names. A
report that folds an override into "what was done" alongside the findings
it actually resolved is making the same claim [never claim more than was
checked](#never-claim-more-than-was-checked) already forbids: a completion
claim broader than the check performed.

**A skip is not a pass.** Where a check genuinely cannot run locally — a
network-bound scanner, a platform-specific resolution, a host the developer
does not have — [gate 5](gate-5-push.md) and
[gate 6](gate-6-pull-request.md) already require it to be a named, visible
skip. A branch whose local run skipped a blocking check is raised in the
knowledge that CI may still find something there; the pull request body
names which checks were skipped and why, plainly enough that a reviewer
does not read a green local run as more certain than it was.

## The gap between a local pass and a CI finding is itself a finding

**When CI finds something the local gates did not, that difference is a
finding, and it is worth more than the defect underneath it.** A defect
fixed without asking why the local run missed it recurs
through a different door the next time nobody runs the same command.
Before fixing what CI found, establish which local gate should have caught
it and why it did not, and record the answer in the same report the
defect's own fix is recorded in.

Four categories, because the remedy differs:

1. **The local gate exists and was not run.** A process failure — the
   remedy is [run the gate, not a
   selection](#a-pull-request-is-not-opened-until-the-gate-6-surface-is-clean-locally).
2. **The local gate exists and is scoped more narrowly than CI's.** A real
   gap: [every blocking local check has a named server-side
   equivalent](#local-gates-are-a-fast-copy-the-server-gate-is-the-authority)
   already; a finding here means the two disagree, and either the local
   scope widens to match or the difference is recorded with its reason.
3. **The check cannot run locally at all** — a platform-specific optional
   dependency, a network-bound scanner, a host-only capability. The local
   output already says so, as a named skip
   ([bypass and exceptions](bypass-and-exceptions.md)); this corpus also
   names which checks these are at the gate they belong to (gate 5's and
   gate 6's own cross-stack dependency scan when `osv-scanner` is not on
   `PATH`, gate 6's Code Quality rendering on a plan that does not carry
   it), so an implementer meets the gap as a known property of the
   toolkit, not a surprise discovered per repository.
   [`@esbuild/linux-x64`](registers.md#platform-specific-optional-dependencies)
   is the worked example: a Windows host cannot resolve a Linux-only
   optional dependency, so a locally generated dependency register is
   incomplete by construction, whatever the register otherwise looks like.
4. **CI is checking something the local gates do not model at all.** A
   missing check, not a scoping difference — add it locally, or record why
   it stays server-side only.

Record each CI-only finding against its category, in the bootstrap report
and in any session report that raises a pull request — see
[docs-style.md: standards in a consuming
repository](../docs-style.md#standards-in-a-consuming-repository) for where
that section lives in the report.

## A report's gate output is provisional until CI has produced its own

[The precondition on opening a pull
request](#a-pull-request-is-not-opened-until-the-gate-6-surface-is-clean-locally)
and [the citation requirement](#never-claim-more-than-was-checked) govern the
moment a pull request is _opened_; [the gap between a local pass and a CI
finding](#the-gap-between-a-local-pass-and-a-ci-finding-is-itself-a-finding)
above states the four categories a CI-only finding falls into. Neither says
_when_ to go looking for one.

> **A report's gate output is provisional until the pipeline that produces
> the blocking verdict has run.** Where a check skipped locally, the report
> says so and the claim is reconciled against the pipeline's own log once it
> completes — the difference categorised per the four gap kinds above, in the
> report, before the pull request is presented as ready.

**The instrument is the job log, never the annotations API** — [read a
gate's own output, not a platform's summary of
it](#never-claim-more-than-was-checked), restated for this case:
the annotations endpoint caps at ten findings and truncates silently, so a
reconciliation built from it can undercount exactly the way a report built
from it already has. `scripts/check-report-ci-reconciliation.mjs` is the
mechanical form: it reads a gate's own `FAIL` lines straight out of a job
log and flags any line the report text never mentions, wherever in the
report it is mentioned — the same structural, not prose-honesty, restraint
[the artefact-citation
check](#a-pull-request-is-not-opened-until-the-gate-6-surface-is-clean-locally)
already states for `check-pr-body-artefacts.mjs`.

**This is a step after, not a stricter precondition.** It cannot run before
the pipeline that produces the blocking verdict has completed, so it is
never wired into gate 6 itself — run it by hand, or as a follow-up CI step
reading the prior job's own log, once CI exists to reconcile against.

A report that never mentioned a CI finding at all is the coarse form of this
defect: a commit whose subject read "record gate 6 output verbatim in the
bootstrap report" quoted a twelve-line block with zero osv-scanner mentions —
the _local_ run's, where osv-scanner correctly skipped (not on `PATH`). CI, on
that exact commit, reported:

```text
gate 6: FAIL cross-stack dependency scan (osv-scanner)
        CVE-2026-2327, CVE-2026-59869, CVE-2026-48988, CVE-2026-53550, CVE-2025-64718, CVE-2026-14257
```

Six real CVEs the report never named, while its own header read "what
remains open (copied from gate 6's own output)" — true of the local run,
false against the live state once CI ran. The implementer was honest about
what it could see; the gap is that nothing brought the report back once CI
saw more.

**Reconciled at label level is not reconciled at value level.** A report
states which level it reconciled at. Confirming every CI
finding is _named_ — label-level reconciliation — proves no finding is
missing. It does not prove any finding's _detail_ is current. A report that
quotes a tool's output verbatim is making the stronger, value-level claim,
and that claim is only true if the tool was re-run at the commit the report
is reporting on — never a capture carried forward from an earlier one, even
one the report's own history shows was accurate when taken.

**The remedy is sequencing, not new machinery.** Reconcile — and take any
quoted capture — **after** the last commit that changes anything the report
quotes. A reconciliation pass that runs and is then followed by a further
commit touching the quoted file is stale the moment that commit lands, no
matter how carefully it was captured the first time.

The narrower failure this catches: a report named every CI finding correctly
and still quoted one's _detail_ stale. Its quote read `(anonymous)@1594-2939`;
live CI read `(anonymous)@1602-2947` — the same finding, the same label, a
span the tool had already reported differently by the time the report claimed
to quote it verbatim, because a later commit shifted the file by eight lines
after the report's reconciliation pass had already run.
`scripts/check-report-ci-reconciliation.mjs` cannot catch this by its own
documented design: it matches the `<gate>: FAIL <label>` string and never the
indented detail lines beneath. That scope is deliberate and correct
([ADR-0011](../../ADR/0011-reconciliation-matches-labels-not-details.md)) —
matching prose, not a tool's raw output, is [the artefact-citation
check](#a-pull-request-is-not-opened-until-the-gate-6-surface-is-clean-locally)'s
own restraint applied here too. The defect is the report's **claim**, not a
gap in the check.

## A check that skips on every surface it runs on has not been skipped

**A blocking check that skips locally and skips in CI is a finding, not a
skip, whatever each individual skip message says.** A skip
is only acceptable where _some_ surface actually runs the check; a
precondition unmet everywhere the check is invoked is not a property of one
run, it is a property of the check, and reads as green at every gate that
touches it.

The live case: [gate 4](gate-4-task-completion.md)'s change-size, file-length
and complexity check derives its base with the same `resolveBase()`
[gate 0](gate-0-baseline.md) and every other local gate use — correct, and
not the defect. The defect was in how [gate 6](gate-6-pull-request.md)
invoked it: as a subprocess, given no base of its own, so it always
re-derived one via a bare `resolveBase()` call needing `origin/HEAD` — a
symref GitHub Actions' `actions/checkout` never sets. Locally, whether
`origin/HEAD` resolves depends on how the repository was cloned — a real
gap, but an intermittent one, and exactly what [the gap between a local
pass and a CI finding](#the-gap-between-a-local-pass-and-a-ci-finding-is-itself-a-finding)'s
third category already names ("the check cannot run locally at all... a
platform-specific optional dependency, a network-bound scanner"). In CI it
was not intermittent: every run of that workflow produces a checkout with
no `origin/HEAD`, so the same call failed the same way on every pull
request, unconditionally. Two skips that each read as an ordinary, honestly
worded absence combined into a check that had never actually run, anywhere,
on any surface — a 112-file, 15,747-line change passed gate 6 with its own
size check silently absent from both ends. The remedy in this case was
structural, not a bigger skip message: gate 6 already resolves a base
reliable in CI ([GITHUB_BASE_REF](gate-6-pull-request.md), read before
`resolveBase()` is ever consulted); passing that value through to the
subprocess removes the second, independently-failing derivation rather than
trying to make it agree with the first.

**Distinguish the two shapes before trusting either skip on its own:**

| Shape                    | Local                    | CI                                  | Verdict                                                  |
| ------------------------ | ------------------------ | ----------------------------------- | -------------------------------------------------------- |
| A genuine platform gap   | Skips (tool/host absent) | Runs                                | Skip — the standard's own bypass-and-exceptions.md shape |
| **Omitted, not skipped** | Skips (sometimes)        | **Skips (always, unconditionally)** | Finding — the check has never validated this repository  |

A visible, correctly-worded skip at each individual call site is not
evidence the check runs somewhere; it is evidence nobody has yet compared
the two skip reasons to each other. Where a check is invoked at more than
one gate or surface, and one of those invocations delegates its own
precondition to a shared derivation (`resolveBase()`, a tool-on-PATH probe,
an environment read), the delegating call site is checked for whether it
could ever succeed on the surface it runs on — not only for whether its own
skip message reads honestly.

## Decisions live in decision records; documents state the current position

Every artefact this standard asks for falls into one of three kinds, and mixing
them is what makes a corpus unreadable:

| Kind            | Holds                                                                    | Reads as                                    |
| --------------- | ------------------------------------------------------------------------ | ------------------------------------------- |
| Decision record | One choice, its alternatives, and why — including any check opted out of | A settled question, with its history intact |
| Register        | Accepted findings, one row each                                          | A list somebody must keep true              |
| Document        | What is currently the case                                               | The present tense, with no argument in it   |

The split between the first two is by **scope, not severity**: one accepted
finding is a register row, and excluding a check from the repository is a
decision record.

A document that narrates how its content came to be forces every future reader
to work out which parts still apply. Keep it current, keep it short, and put the
provenance — the decision records, the related references — in a footer at the
end where someone chasing the reasoning will find it and everyone else can skip
it. Superseding a decision means a new record, not an edit to the document that
quietly changes what it says without saying so.

## Every verdict leaves evidence someone else can read

A pass with no artefact is a claim; a pass with a test report, a coverage report
and a findings file is a result. This falls hardest on the gate that gates the
merge, but it applies anywhere a verdict outlives the session that produced it.

## Report what was derived

The gates read a repository's own declarations rather than a configuration file
written for them ([ADR-0003](../../ADR/0003-derive-configuration.md)). That
removes a file to maintain and removes a file to inspect, and only the first is
a gain unless the derivation is stated.

Every run reports what it resolved: the components it selected and from what,
the class of each file it judged, and each threshold in force with where it came
from — the stack's analyser or this standard's default. **A wrong derivation
nobody can see is worse than a wrong file anybody can open.**

## A refusal is a diagnosis

Name the check, the path, the offending content and the action that clears it. A
gate that reports only "failed" forces the author to re-run the command by hand
to learn what broke.

**A refusal names the specific thing being refused.** A vulnerability scan
names the advisory; a lint failure names the rule; a coverage shortfall names
the percentage. A refusal whose problem text contains no identifier is itself
a finding — not evidence of one. This is the inverse of [never claim more than
was checked](#never-claim-more-than-was-checked) below: that rule forbids
asserting a cause the evidence does not support; this one forbids asserting a
finding the evidence does not name. A tool that exits non-zero for a reason
unrelated to what it was checking — a missing lockfile, an unsupported
ecosystem, a network failure, a version mismatch — has not found anything, and
treating its exit code alone as a finding blocks a merge on a defect nobody
can point to. Distinguish the two by parsing the tool's own structured output
(a JSON or SARIF report, not stdout+stderr concatenated and dumped): a
non-zero exit with a named entry in that output is a finding; a non-zero exit
with nothing parseable in it is unavailable, reported the same way a missing
tool is — visibly, naming what went wrong, and never as a finding it cannot
back up. Audit 12 found this live: a CI run failed a dependency scan with the
scanner's own startup banner as the problem text — no vulnerability id
anywhere in it — while the same scan on the same commit, run standalone,
passed clean.

## Never claim more than was checked

A check that could not run reports unknown. Stating a cause the evidence does
not support sends the author looking in the wrong place.

**This governs a human or agent's own completion report the same as a
gate's verdict.** A report is a claim, and a claim here is checkable: "this
document is tuned" or "this step is done" names the check that supports it —
which check ran, and what it reported — the same as a gate names the check
behind a pass or a finding. A completion claim with no check named is not a
smaller version of evidence; it is the unverified claim a check that could
not run above is forbidden from making on its own behalf, made instead by
whoever wrote the report. One bootstrap report claimed a standard "tuned in
full" while the document still carried undisclosed stack references and dead
`cspell:ignore` tokens — the claim was broader than anything actually
checked, and the two documents the same report finished properly were the
ones it named a real check for.

**A percentage computed from zero measured items is unavailable, not a
pass.** A ratio of nothing over nothing is not evidence anything was checked
— it is arithmetic performed on an empty set, and reporting it as a clean
100% claims a measurement that never happened. Changed-line coverage hit this
live: a test run crashed before executing anything, the Cobertura report it
wrote had zero instrumented statements, and `diff-cover` — finding no changed
line to check against an empty report — printed `Total: 0 lines` and
`Coverage: 100%`, exiting 0. The unit-test failure blocked separately, so
nothing escaped that run, but the same shape would pass silently on a suite
that exits 0 having exercised nothing: the exit-0 class the changed-line
coverage check exists to close, reproduced inside the check itself. Read the
tool's own count of what it measured — not only whether it exited 0 — and
treat zero as unavailable, the same as a check that could not run.

**A claim about a set names the command whose output produced that set.**
"The only blockers are…", "all checks pass except…" — a claim naming several
findings is where undercounting actually happens; a claim about one fact
rarely goes wrong, because there is nothing to lose count of. A bootstrap
report once claimed gate 6 was red on four licence rows; the gate's own
output carried four licences, nine advisories and an osv-scanner finding
naming seven CVEs — fourteen finding lines, not four. A correction commit
fixed the advisory undercount and still never mentioned the osv-scanner
failure, because the correction was also written from memory rather than
read from the gate. Naming the command ("`node scripts/gate-6-pull-request.mjs`
reported these") turns the claim into something a reader can rerun; a set
recalled by whoever wrote the report is exactly the shape that loses a line
silently. [docs-style.md's own rule for a bootstrap
report](../docs-style.md#standards-in-a-consuming-repository) is this
principle applied to one recurring case: the outstanding-work section is
generated from gate output, not written from memory.

**The rule is unscoped: every numeric claim in the report, not only its
outstanding-work section.** One report had that section right — generated
from gate output, five of seven findings named with the right check and the
right counts — and a _different_ section of the same report still wrong: its
"What was done" narrative stated `node --test … reports 225 pass, 0 fail`,
while CI on the same commit reported `pass 219 / fail 2 / cancelled 4`. The
remedy had been applied to the section the defect was found in, not to the
habit that produced it, so the identical defect surfaced one section over.
Any count, any "all X pass", any "N
findings" — anywhere in a bootstrap or session report, not only its
outstanding-work section — names the command whose output produced it. And
**where a gate also produces that figure for the same commit, the report
quotes the gate's number, not a local run's**: a local `npm test` that
passes reliably and CI running the identical suite that does not are two
different instruments, and quoting the local one is not lying — it is
citing the wrong instrument for a claim CI has already settled.

**A count names the environment it ran in, not only the command that
produced it.** The local-versus-CI split two paragraphs up is one instance
of a general rule, not a special case of it: "`npm test` reports 290/290" is
a claim about wherever that run happened, and a reader who was not told
where cannot tell a local result from a CI one — the two are different
instruments even when the command is identical, because the environment is
part of what produced the number, not incidental to it (`GITHUB_HEAD_REF`
and every other CI-only variable a local shell never sets are exactly the
kind of difference a bare command name hides). This toolkit's own repository
is the case that named the gap: every "N/N passing" claim in its own history
was a local result — `gh run list` and `gh pr list --state all` both return
empty, so none of them had ever run in the one environment gate 6 actually
runs in — and "N/N passing" read, uncorrected, as though it meant something
broader. Say where a count ran the same way a check that could not run says
why: "290/290, `npm test`, local" and "290/290, `npm test`, CI" are different
claims, and only the second is evidence about what a `pull_request` job will
find.

**Naming the command is not enough while the set can still be assembled
check by check. The list itself must be the verbatim output of one command
— the gate — never a concatenation of individually chosen checks' output**
([ADR-0014](../../ADR/0014-one-command-one-transcript.md)).
A check that cannot run locally is a line in that command's own output,
reported unavailable, not a line the implementer decided to leave out. A
report that cited the rule above still lost lines: it ran the licence check
and the suppression check, called the result "copied from gate output," and
never ran `check-dependency-advisories.mjs` at all — a local Node script it
mistakenly reasoned was "network/PATH-resolved" the same as osv-scanner,
which it also skipped. Two whole categories were missing, each honestly
sourced to nothing, because the set was built by choosing which checks to
run rather than by running the one command that owns all of them.

**"The gate" means gate 6 as well, not only whichever gate is easiest to
quote: a report quotes gate 6's own output — the check names, the FAIL
lines, the skip lines — in its own fenced block, exactly as it quotes gate
7's**, whichever gate the report happens to lead with. Naming gate 6
explicitly is deliberate, not decoration: a rule stated only as "the gate"
gets applied to whichever section demonstrated it and skipped everywhere
else the reader would have had to generalise it themselves to reach. One
report gave gate 7 a fenced block, one line per finding, verbatim — and for
gate 6 wrote a paraphrase instead: "see the verbatim run below: 246 tests
pass, 100% line coverage, no findings an implementer could still fix."
`pass=246 fail=0` is gate 0's own test-count format string
(`scripts/gate-0-baseline.mjs`), not a gate-6 verdict, and gate 6 never ran
in that report at all — which is also why its osv-scanner skip line
(`gate 5: SKIP cross-stack dependency scan — osv-scanner not on PATH;
install it to enable this check`) never appeared: there was no gate-6
transcript to find it in.

**Read a gate's own output, not a platform's summary of it.**
`gh api .../check-runs/{id}/annotations` caps the annotations it returns at
10 per check run and silently drops the rest, no marker that anything was
cut. A report built from that endpoint against a run with sixteen findings
gets ten, missing three advisories, an osv-scanner finding and both
suppression rows — the exit-0 class in a new place: an instrument that
reports success-shaped output while omitting data. The raw job log is the
only place the true count is visible. **Read a gate's own output — the job
log, the command's own transcript — not a platform's summary of it.** A
platform view may paginate, cap or deduplicate; the transcript a gate itself
wrote does not. Where a report cites CI, it cites the job log. This is also
why the rule above is "one command, one transcript" rather than "check each
source that has one": there is exactly one authoritative output, and every
derived view of it — an API summary, a hand-picked subset of checks — can
lose rows the transcript never did.

**A quoted figure is re-captured at the commit it reports on, not
re-explained.** A figure quoted in a report, a register row or a pull
request body is re-captured — re-run, not re-explained — after the last
commit that could change it, the same
sequencing [reconciliation](#a-reports-gate-output-is-provisional-until-ci-has-produced-its-own)
already requires of a quoted capture, generalised to every quoted number in
every artefact a human reads or approves from. **A discrepancy with no
established cause is reported as unexplained, not given one:** a wrong
explanation is believed, an unexplained gap gets investigated.

The failure, across all three surfaces at once: a report's `change size`
figure was captured once, locally, early in a session, and never re-read
against a later commit. CI's own logs
showed both platforms had agreed at every run — 9583 at the mid commit, 9584
at the fix and final commits, ubuntu and windows identical throughout — while
the report stated: "The change-size count differs by platform (9578 local
Windows / 9583 ubuntu CI, line-ending accounting)." The platforms never
disagreed; the real gap was local (9578) versus CI (9584), a figure captured
once and never re-read against the commit being reported on. The implementer
then reasoned backwards from that gap to a plausible cause and wrote it down
as fact. The same stale number sat in the change-size override register's
own `Counted lines` cell — the artefact a human approves from — and the same
habit reached the pull request body: "`npm audit` reports 0 vulnerabilities;
the 3 remaining `markdown-it` moderate advisories are dev-only" — self-
contradictory in one sentence, and true only of a commit two earlier.

**A tool cited as available is not evidence it ran. The reconciliation
section names the command it ran and its exit status** — `node
scripts/check-report-ci-reconciliation.mjs <report-path> <job-log-path>`
exited 0, or exited non-zero naming what it found — the same way every other
claim in this document already names the command that produced it. This is
not a new check: it is the citation requirement stated above for every other
claim, applied to the one tool whose own use had, until now, gone uncited.
`scripts/check-report-ci-reconciliation.mjs` appeared zero times in one
session's full log, even though its output is exactly what the report's
reconciliation section needed. Run independently afterwards, the tool
reported clean — the reconciliation was genuinely correct — but nothing in
the report let a reader tell that from luck or care rather than from
evidence. A tool this corpus ships and teaches, never verified as used, is a
tool that will eventually not be used on a run where it mattered.

## A suppression is verified at repository scope, never at the scope of the file just edited

The same principle, one level more specific: a suppression's own verification
claim — "N findings before, 0 after" — is only as true as the scope it was run
at. Adding a `nosemgrep` marker to one file and re-running semgrep against
that file alone can report 0 findings while an identical, unmarked occurrence
of the same rule sits in a sibling file the fix never touched. This repository
shipped that exact defect once: a suppression added to `hooks/lib/run.mjs`,
verified with `semgrep --config auto --error hooks/lib/run.mjs`, reported "3
findings before, 0 after" — true of that file, and silent about two live,
unregistered findings of the same rule already sitting in
`hooks/test/hooks.test.mjs`, which a repository-scope run would have caught
there and then.

**Verify a suppression the same way it will actually be enforced.**
[Gate 7](gate-7-on-demand.md)'s own sweep (`npm run gate:7`,
`scripts/gate-7-on-demand.mjs`) already runs `semgrep --config auto --error .`
across every tracked file — the repository-scope check, already built and
already proven to refuse (its own refusal-proof fixture,
`scripts/check-refusal-proofs.mjs`). A verification claim that cites a
file-scoped invocation instead is not wrong about that file; it is silent
about everywhere else, which is exactly what
[never claim more than was checked](#never-claim-more-than-was-checked) above
forbids.

## A check that did not enforce says why

Silence is indistinguishable from a pass. Every run distinguishes three states —
passed, skipped, suppressed by decision — and a check nobody notices missing is
worse than one that was never there.

## Every blocking check proves it refuses

A check can read green for reasons that have nothing to do with the input it was
given. Three shapes recur, and a list of known-bad tools that produce them goes
stale the day a new one is adopted:

- **The tool always exits 0** and signals a finding only in its own output
  (`dotnet list package --vulnerable` never fails the process; the finding is
  text on stdout nobody parsed).
- **The tool needs a flag to turn a finding into a failure, and the flag is
  missing** — semgrep without `--error` exits 0 regardless of what it found.
  This repository shipped that exact bug once.
- **The tool silently examines nothing and reports success** — cspell printing
  `Files checked: 0` because every path given was ignored, or a glob that
  matched nothing.

The contract closes the class instead of chasing examples of it:

> Every blocking check carries a negative fixture — an input it must refuse —
> and an assertion that it does. A check that cannot demonstrate refusal
> reports as `unverified`, never as a pass.

Three states, not two, the same discipline as
[a check that did not enforce says why](#a-check-that-did-not-enforce-says-why)
one level deeper:

| State             | Means                                                                                                          |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| `refuses`         | The fixture was tried and the check blocked it, as required.                                                   |
| `does not refuse` | The fixture was tried and the check passed it anyway — a finding: the check is decorative.                     |
| `no fixture`      | Nobody has written one yet, or the tool it needs is unavailable here — unverified, and must not read as green. |

**Runs at [gate 7](gate-7-on-demand.md) and in CI, never per commit.** This
guards a wiring defect, and wiring changes only when wiring changes — running
it on every commit would pay a repeated cost for a property that does not move
between runs. `does not refuse` is a real defect and fails the audit;
`no fixture` is an audit gap, reported and left open rather than blocking every
run until every blocking check has one.

**A new check acquires its fixture at birth, not later.**
[Placing a new check](placing-a-new-check.md) is where this is enforced — a
check with no negative fixture is exactly as unverified the day it is added as
a check nobody has gotten to yet, and it is cheapest to write the fixture
alongside the check, from the same understanding of what a bad input looks
like.

## Every quality script is wired or declared

A manifest script reads as an inventory of checks the repository runs. Nothing
enforces that by itself — `package.json`'s `scripts` is just strings, and a
script nobody invokes sits there looking exactly as real as one a gate runs on
every commit. This repository shipped that gap three times over: `lint` was
declared and invoked nowhere until an earlier fix wired it into the commit
gate; `spell` ran against Markdown only, through lint-staged, while its own
script definition swept the whole repository; `gate:7` itself is never invoked
by another gate, and must not be flagged for that — it is the on-demand entry
point, not a check something else owns.

The first two are worse than an absent script: to anyone scanning the manifest
they answer "is this enforced?" with a confident yes. This is the sibling
defect to [every blocking check proves it refuses](#every-blocking-check-proves-it-refuses):
that contract catches a check wired but structurally unable to fail; this one
catches a check declared but never invoked by anything. Both present as green
to a reader who checks only the surface — a passing run, or a script that
merely exists.

> Every quality script in the manifest is either invoked by a named gate, or
> declared as on-demand with the gate that would otherwise own it. A script
> that no gate invokes and no declaration covers is a finding.

Matching is on the tool and the flag that makes it a check — `--max-warnings
0`, the SPDX-aware flag, the tool name itself — not on the manifest script's
own exact command line. `npm run lint` is never typed anywhere in this
repository; the commit gate invokes `eslint --max-warnings 0` directly, which
is the same check by a different route and counts as wired. A script whose
claimed wiring no longer matches the file it points at (the flag was renamed,
the call was removed) is exactly as unwired as one that was never wired at
all — the check re-reads the claimed evidence rather than trusting a table
that once said so.

**Runs at [gate 7](gate-7-on-demand.md), the same tier as the refusal-proof
audit and for the same reason:** this guards a wiring property, and wiring
changes only when wiring changes.

## Auto-repair only where the fix is unambiguous

Formatting, yes. A link with one candidate target, yes. Anything requiring a
choice is reported, not guessed.

## Verification

- [ ] Every blocking local check has a named required status check
      server-side — verified by `scripts/check-branch-protection.mjs`
      ([branch protection](branch-protection.md)), not merely listed in a
      workflow file.
- [ ] A pull request is not opened while the gate-6 surface, run as one
      command against the branch, reports a finding the implementer could
      have fixed — only findings reserved for a human (a risk, a licence, a
      suppression or an opt-out; a change-size override; a conflict between
      two standing directives) remain outstanding, named in the pull
      request body with the command that produced them.
- [ ] A blocking check skipped in the local run is named in the pull
      request body with its reason — a skip is disclosed as uncertainty
      about CI, not treated as a pass.
- [ ] Every finding named in a pull request body cites the register row,
      the Proposed/Accepted ADR or the directive-conflict record that
      reserves it — `scripts/check-pr-body-artefacts.mjs`
      (`findUncitedFindings`) is the mechanical form. A finding with no
      such artefact is a finding of its own, and the six reserved classes
      are the complete list — a sixth (now seventh) invented in prose has
      nothing to cite.
- [ ] An agent that meets the change-size error band reports the counted
      size and what makes up the bulk, and does not apply `[large-pr]` on
      its own authority.
- [ ] `[large-pr]` with no matching, human-approved row in [the change-size
      override register](registers.md#the-change-size-override-register)
      does not satisfy gate 6 — `scripts/check-change-size-override.mjs` is
      the mechanical form, and a marker sitting in a commit distinct from
      the diff it excuses is not, on its own, evidence a human decided
      anything.
- [ ] A pull request disclosing an unapproved change-size override is not
      reported as an uncited finding by `check-pr-body-artefacts.mjs` — the
      register row it names is a citation the same way any other register
      row is.
- [ ] A report never describes an unresolved override as a fix.
- [ ] Every finding CI produced that the local run did not is categorised
      against one of the four gap kinds, with the local gate that should
      have caught it named, before the underlying defect is fixed.
- [ ] A check that skipped locally is reconciled against CI's own job log
      once the pipeline completes, before the pull request is presented as
      ready — `scripts/check-report-ci-reconciliation.mjs` is the
      mechanical form, run against the report and the job log once both
      exist.
- [ ] No report claims a block is "copied from gate output" while the
      pipeline's own job log shows a finding the report omits.
- [ ] A report states which level it reconciled at — every CI finding named
      (label level) does not by itself mean a quoted finding's detail is
      current (value level). A report that quotes a tool's output verbatim
      re-ran that tool at the commit it reports on, rather than carrying a
      capture forward from an earlier one.
- [ ] Reconciliation, and any capture it quotes, happens after the last
      commit that changes anything the report quotes — not before it, even
      when the earlier capture was accurate at the time it was taken.
- [ ] A check that cannot run locally at all is named as such in the
      standard, at the gate it belongs to — not discovered fresh by each
      repository that adopts it.
- [ ] A blocking check invoked at more than one gate or surface, where one
      call site delegates its own precondition to a shared derivation
      (`resolveBase()`, a tool-on-PATH probe), is checked for whether that
      call site can ever succeed on the surface it actually runs on — a
      skip that recurs on every run of that surface is reported as unrun,
      not as a skip. `hooks/gate-4-task-completion.mjs` invoked from
      `scripts/gate-6-pull-request.mjs` is the mechanical form:
      the subprocess call passes the base gate 6 already resolved rather
      than re-deriving one that fails on every CI checkout.
- [ ] No gate emits a warning it does not treat as a failure.
- [ ] A rule configured at a linter's or compiler's own `warn` severity still
      fails the run — the tool is invoked with `--max-warnings 0` or the
      stack's equivalent, not left to print and pass.
- [ ] Every refusal names the check, the path and the remedy.
- [ ] Every refusal names the specific thing being refused — the tool's own
      structured output (JSON, SARIF, or an equivalent parsed report), not a
      non-zero exit code alone. A refusal whose problem text carries no
      identifier is reported unavailable, never as a finding.
- [ ] A check that could not run says so, rather than passing or asserting a cause.
- [ ] A percentage a check reports is read alongside the count it was computed
      from — zero measured items is reported unavailable, never as a 100%
      pass. `scripts/gate-6-pull-request.mjs`'s changed-line coverage check
      (`diffCoverTotalLines`, `scripts/lib.mjs`) is the mechanical form: a
      Cobertura report with zero instrumented statements produces an
      unavailable result, not `Coverage: 100%`.
- [ ] Every completion claim in a bootstrap or session report names the check
      that supports it, and a claim of completeness for a document names that
      document's own check reporting zero findings — not that the document was
      edited, or read as correct.
- [ ] A claim about a set — "the only blockers are…", "all checks pass
      except…" — names the command whose output produced that set, and the
      set named matches that output finding for finding. Unscoped: any
      count, any "all X pass", any "N findings" anywhere in a bootstrap or
      session report names its command — not only a report's
      outstanding-work section, which is the recurring case, not the whole
      rule.
- [ ] The set named is the verbatim output of that one command, not an
      assembly of individually run checks — a check left out because it
      "couldn't run here" appears in the output as unavailable, never as a
      silent absence.
- [ ] A report quotes gate 6's own output — named explicitly, not left as
      "the gate" — in the same fenced, one-line-per-finding form it quotes
      gate 7's; a paraphrase, or another gate's count (gate 0's `pass=N
fail=N`) standing in for gate 6's own FAIL and SKIP lines, is the
      omission this checks for.
- [ ] No summary sentence about a gate's result contradicts the fenced block
      beneath it — a sentence claiming "no findings" or "unaffected" is
      read against the transcript it sits above before either is trusted.
- [ ] A report built from a platform's API summary of a check run (GitHub's
      annotations endpoint, capped at 10 per run) is instead read from the
      job log — a platform view that can paginate, cap or deduplicate is not
      the gate's own output.
- [ ] Where a gate also produces the figure a report states — a test count,
      a pass/fail split — the report quotes that gate's own output for the
      same commit, not a local run's. A local run that passes reliably
      while CI's does not are two different instruments; the report cites
      whichever one a reader can hold it to.
- [ ] Every quoted figure — in a report, a register row or a pull request
      body — matches the commit the artefact describes, re-run rather than
      carried forward from an earlier capture.
- [ ] A register row's own numbers are re-derived before the row is offered
      for approval, not carried over from when the row was first drafted.
- [ ] A discrepancy with no established cause is reported as unexplained,
      not given one — inventing a plausible cause is not a substitute for
      re-deriving the figure.
- [ ] The report's reconciliation section names the command it ran —
      `check-report-ci-reconciliation.mjs` — and its exit status, the same
      way any other claim in the report names the command that produced it.
      A reconciliation that reads clean because the tool was never actually
      run is not distinguishable from one that is, without this.
- [ ] A suppression's verification claim ("N findings before, 0 after") cites a
      repository-scope run — gate 7's own sweep, or an equivalent `semgrep
--config auto --error .` at the repository root — never a check scoped
      to only the file just edited.
- [ ] Every check the platform already provides is enabled rather than
      rebuilt — the per-feature checklist, and the visibility-or-plan-versus-
      disabled distinction that makes it falsifiable, is
      [gate 7's own](gate-7-on-demand.md#platform-features-enabled-by-default).
- [ ] Within each gate, checks run cheapest first, except where one changes what
      a later one reads.
- [ ] A fast, stack-specialised check runs at a gate that fires on every edit or
      commit; a heavyweight, general-purpose or network-bound check runs at the
      on-demand gate or CI instead, whatever gate its inputs would allow.
- [ ] A general-purpose analyser runs across every stack, including one with its
      own specialised analyser, rather than being excluded from it.
- [ ] A check invoked at more than one gate has a stated reason for its
      consequence at each — reused unchanged, or the difference is named —
      rather than the reuse of the check standing in for a decision about
      its severity that was never actually made.
- [ ] Every run states the components, file classes and thresholds it resolved,
      and where each came from.
- [ ] The cheapest check that would catch a given defect is the one that catches
      it — no defect waits for a slower gate that an earlier one could have found.
- [ ] Indentation, character set and line endings are declared once in
      `.editorconfig`, and no tool's own configuration contradicts it.
- [ ] A bespoke check has a recorded reason no existing tool covered it.
- [ ] Every blocking check carries a negative fixture, and the fixture is run —
      at gate 7 and in CI, not per commit — and reports `refuses`,
      `does not refuse` or `no fixture`, never a silent pass for the checks
      that have not been fixtured yet.
- [ ] A check reported `does not refuse` is treated as the defect it is, not
      left decorative because its green exit still reads as a pass elsewhere.
- [ ] Every script in the manifest is invoked by a named gate, hook or
      workflow, or declared on-demand with the gate that would otherwise own
      it — checked at gate 7, and no declaration is trusted without re-reading
      the file it claims as evidence.

## References

- [Guardrail standards](../guardrail-standards.md) — the gate index.
- [Bypass and exceptions](bypass-and-exceptions.md) — the three reporting states
  in full.
- [Components](components.md) — the changed-component rule.
- [Branch protection](branch-protection.md) — what makes "a named required
  status check" actually block a merge, not merely run.
- [Registers](registers.md#the-change-size-override-register) — the
  change-size override register that [an override is not a
  fix](#an-override-answers-a-push-back-it-is-not-a-fix) checks against.
- [Gate 4 — Task completion](gate-4-task-completion.md) — where the
  change-size check itself lives, and its own override marker.
