---
type: reference
summary: The rules every gate holds regardless of what it checks — ordering, the tooling ladder, zero warnings, evidence, and how a refusal must read.
read_when: Building a gate, or judging whether an existing one is defective in a way its checks would not reveal.
---

<!-- cspell:ignore fixtured -->

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
audit 8 found exactly that: a red gate 6 and a red platform scanner check,
neither one refusing a merge. [Branch protection](branch-protection.md) is
where this is verified rather than assumed: `scripts/check-branch-protection.mjs`
reads the protected branch's actual configuration and reports every check
this toolkit runs that is not in the required list — as a finding, not a
silent skip.

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
- [ ] Every completion claim in a bootstrap or session report names the check
      that supports it, and a claim of completeness for a document names that
      document's own check reporting zero findings — not that the document was
      edited, or read as correct.
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
