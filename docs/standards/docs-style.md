---
type: reference
summary: How documents in /docs are structured — frontmatter, section order, and where references go.
read_when: Writing or revising anything under /docs.
---

<!-- cspell:ignore Diataxis diffable pyproject -->

# Documentation style standard

How documents under `/docs` are structured, and why they are ordered for human
readers rather than for agent execution.

## Frontmatter

Every document under `/docs` opens with these three **base fields**:

```yaml
---
type: reference | how-to | explanation | tutorial
summary: One line stating what the document tells you.
read_when: The trigger for opening the body.
---
```

`summary` should answer the question outright where possible, so an agent can act
without reading further. `read_when` describes the situation, not the reader
("Defining a new gate", not "When an agent needs gate information").

Where a document class redefines a base field, its own convention governs — a
class whose `type` means a work type rather than a document type is following
its own convention, not breaking this one.

The three base fields are the floor, not the ceiling. A **document class** may define
additional typed fields, but only fields its own convention names — an undeclared
field is a defect, and a schema nobody maintains is worse than none.

| Class           | Extra fields                                                | Defined by                          |
| --------------- | ----------------------------------------------------------- | ----------------------------------- |
| ADR             | `status`, `decided`, `owner`, `supersedes`, `superseded_by` | [ADR conventions](../ADR/README.md) |
| Everything else | none                                                        | this standard                       |

A consuming repository may add classes of its own — tickets, delivery artefacts —
and declares their fields in its own convention.

## Section order

**Guidance first. Provenance last.** A reader arriving mid-task should hit the
actionable content within the first screen.

1. Title, then one line of purpose. If the purpose needs a paragraph, the document
   is doing two jobs — split it.
2. The content, most-used first.
3. `## References` at the foot: ADRs, related standards, external sources.

Never open with why the document exists, what it deliberately does not cover, or
which decisions led to it. That material is real, and it belongs at the bottom or
in the ADR that owns it.

## Document types

Naming the type prevents the most common structural error — applying a
task-oriented skeleton to material people consult rather than follow.

| Type          | For                                     | Shape                                         |
| ------------- | --------------------------------------- | --------------------------------------------- |
| `reference`   | Consulted mid-task, not read through    | Tables and lists; scannable; no narrative     |
| `how-to`      | Achieving one stated goal               | Prerequisites → numbered steps → verification |
| `explanation` | Understanding why something is as it is | Prose; the one type where rationale leads     |
| `tutorial`    | Learning by doing, first time through   | Ordered, complete, works end to end           |

Most standards are `reference`. Most ADRs are `explanation`.

## Language

**Active voice.** "Run the command", not "the command should be run". Passive hides
who acts, which in a standard is usually the thing the reader needs to know.

**One instruction per sentence** — `how-to` documents only. Two actions joined by
"and" become two steps, because a reader who completes half a sentence has no way
to record that.

**One term per concept.** Pick the term, use it everywhere, never vary it for
readability. Synonyms read better and search worse, and in a reference document the
reader is searching.

| Use                             | Not                        | Why                                                                             |
| ------------------------------- | -------------------------- | ------------------------------------------------------------------------------- |
| acceptance criterion / criteria | AC, ACs                    | The abbreviation reads as a proper noun and breaks search; spell it out         |
| gate                            | check                      | `gate` is what the toolkit calls them, down to `src/gates/`                     |
| spec                            | design spec, specification | Files are named `-design.md`; the artefact is a spec                            |
| toolkit                         | guardrails (bare)          | `guardrails` alone is ambiguous between the package, the concept, and the hooks |

**Identifiers are exempt.** `AC2`, `P-01` and `ADR-0002` are labels, not prose,
and stay as they are. A word-boundary match gives this for free: `AC` matches,
`AC2` does not.

Seeded, not exhaustive. Add a row when a pair has actually caused confusion — a
vocabulary nobody hit a problem with is overhead.

## Skills

Where a skill automates part of a standard, mention it **as an aside** — a
parenthetical or an italic line next to the guidance it relates to. Never let the
skill be the organising spine: a document structured around which skill runs when
is agent-facing, and stops serving the human reading it.

## Standards in a consuming repository

A repository built with this toolkit **instantiates the standards it is
actually held to, rather than pointing at this corpus's canonical home.** A
line reading `Standards: <link to forgeboard-guardrails/blob/main/...>` is a
finding, not compliance, however tidy it looks — it fails offline, it costs an
agent a network round trip and a large context load before it can start, and
`/blob/main/` is a moving target: the rules can change under a repository that
never touched a file. Not copying the corpus is the right instinct — a
duplicate that drifts silently is worse than a link — but a reference and a
copy are not the only two options.

Three positions, and only the third resolves the drift objection instead of
ignoring it:

| Position                                  | Offline? | Version-stable?          | Drift is...                                            |
| ----------------------------------------- | -------- | ------------------------ | ------------------------------------------------------ |
| Reference the canonical home              | No       | No — `/blob/main/` moves | Invisible                                              |
| Blind copy, no provenance                 | Yes      | Frozen at copy time      | Silent — a stale copy reads exactly like a current one |
| **Instantiate, with recorded provenance** | **Yes**  | **Named, and diffable**  | **Detectable — a diff against the named commit**       |

**Instantiate: copy the standard into the repository's own `docs/standards/`,
customised to what applies.** A repository with one component and no deployed
environment does not carry the multi-component prerelease rules or gate 8's
health-check procedure — it carries what it is actually held to, and records
what it left out and why, the same "state what was actually checked" discipline
this corpus asks of everything else.

**Derive what to drop — do not judge it.** This is
[ADR-0003](../ADR/0003-derive-configuration.md)'s own principle — a gate reads
what the repository already states rather than a bespoke declaration — turned
on the corpus's own documentation. Two implementers tuning the same repository
must reach the same result, which is only possible if what to keep or drop is
read off a fact the repository already states, never a judgement call:

| What to tune                                   | Derived from                                                                                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which stacks' tooling to keep                  | The languages actually present — the manifests each stack already carries: `package.json`, `*.csproj`/`*.sln`, `pyproject.toml`, `go.mod`, `Cargo.toml` and their siblings      |
| Whether multi-component rules apply            | [The component map](guardrails/components.md) — one component means no deployment ordering, no cross-component prerelease propagation, no per-component version table           |
| Whether gate 8's environment procedure applies | Whether any deployment target is an environment rather than a registry — [gate 8](guardrails/gate-8-release.md)'s health-check, smoke-test and rollback checks apply only there |
| Which file classes to document                 | The classes `.gitattributes` actually declares ([file classes](guardrails/file-classes.md))                                                                                     |
| Whether an approval survives                   | Never — it is stripped, not derived. See below.                                                                                                                                 |

**Instantiation strips approvals.** An approver names a human who reviewed
_this repository's_ record, and a copy carries no such review with it,
whatever the source said. An ADR of a reserved class (registers.md's four:
risk, licence, suppression, opt-out) arrives `status: Proposed` with
`approver` removed; a register row arrives with its Approver cell empty. A
bootstrapped repository once carried both across byte-identical — an
`Accepted` ADR and five register rows, all naming the same person, all
already approved before that person had reviewed anything in the new
repository — because the corpus's own rules say who may approve and which
record type needs one, never which repository a name is scoped to. See
[registers.md: approval is an event, not a
field](guardrails/registers.md#approval-is-an-event-not-a-field) for the
mechanical check this instantiation rule exists beside.

A repository whose only manifest is `package.json` carries only the Node and
TypeScript rows of any per-stack table — the .NET, Python, Java, Go, Rust, PHP
and Ruby rows are removed, not commented out or left "in case it becomes
relevant." A reader cannot tell aspiration from requirement, and a table with
seven stacks and one actually in use reads as if none of them were checked —
the defect Audit 10 found: an instantiated `docs/standards` carrying the same
file count as this toolkit's own, because nothing had been removed.

**Record every removal**, in a `PROVENANCE` note or a short section of the
enforcement map: the property of the repository that made the content
inapplicable — "no .NET in this repository," "single component, no
cross-component ordering," "registry deployment, no environments." That is
what lets someone re-derive the corpus later, and what stops a reviewer
wondering whether an omission was deliberate or missed.

**A one-time session report — a bootstrap report, a migration summary — is
not one of the two accepted locations, however completely it states the
same removals.** A bootstrapped repository once recorded every removal in
exactly that shape, correctly reasoned, in a document nobody reads a year
later, while its enforcement map carried no removal record at all. The
substance was right; the location was not. `findRemovalsOutsideEnforcementMap`
(`scripts/check-standards-instantiation.mjs`) is the mechanical check: a
removals heading in a report-shaped document with no matching heading or
`PROVENANCE` note in the enforcement map or an instantiated standard is a
finding — it does not judge whether the removal's stated reason is honest,
only where it was written down.

**Fix 56 — a bootstrap report's "what remains" section is generated from
gate output, not written from memory.** Nothing in this toolkit reads the
report — `git grep -il "IMPLEMENTATION-REPORT" scripts/ hooks/ .github/`
returns nothing, so every claim in it stands or falls on whoever wrote it
getting the count right by hand. One report claimed gate 6 was red on four
licence rows; the actual gate output carried four licences, nine advisories
and an osv-scanner finding naming seven CVEs — fourteen finding lines. A
correction commit fixed the advisory undercount and still never mentioned
the osv-scanner failure. The fix is not a checker that reads the report's
prose and scores its honesty — that is the decorative evidence this corpus
already refuses (["never claim more than was
checked"](guardrails/cross-gate-rules.md#never-claim-more-than-was-checked)).
It is that the list itself has one legitimate source: the implementer runs
the gate and records what it said, verbatim, one line per finding, each with
the check that produced it — run gate 6, or gate 7 where the repository
cannot yet run gate 6. Prose explaining or grouping the findings is the
implementer's own; the list of findings is not something prose summarises
from memory. A list assembled this way cannot understate what the gate
found, because it is the gate's own output, not a recollection of it.

**Fix 57 — the rule above is not scoped to the outstanding-work section; it
is the report.** Once fix 56 made that one section gate-sourced, the same
report's "What was done" narrative still stated `node --test … reports 225
pass, 0 fail` while CI on the same commit reported `pass 219 / fail 2 /
cancelled 4` — the identical undercount defect, one section over, because
the fix had targeted the section it was found in rather than the habit that
produced it. **Any count, any "all X pass", any "N findings" — anywhere in
the report — names the command whose output produced it, and where a gate
also produces that figure for the same commit, the report quotes the
gate's own number, not a local run's.** A local test run that passes
reliably is not lying when CI's does not; it is the wrong instrument for a
claim CI has already settled, cited instead of the one that matters.

**Fix 61 — the same rule applied to a list still allowed choosing which
checks to include.** A report cited fix 56's rule almost verbatim — "copied
from gate output, not recalled" — and still listed 5 of a real 16 findings:
nine dependency advisories and an osv-scanner finding, from
`check-dependency-advisories.mjs`, a local Node script run the same way as
the licence check the report did cite, omitted on the stated reason that the
tool was "network/PATH-resolved" — false for that script. Fix 56 named the
source; it did not remove the step where an implementer picks which of
several checks to run and pastes the results together, and picking is where
a check gets dropped even while every individual number stays honest. **The
outstanding-work list is the verbatim output of one command — the gate
itself — not an assembly of individually chosen checks.** A check that
cannot run locally is a line in that command's own output, reported
unavailable, never a line missing because the implementer judged it out of
scope.

**Fix 62 — the identical belief, restated in a second artefact.** An
enforcement map once described a repository's licence rows as "the single
reserved-decision item the bootstrap leaves for a human," unaware of the
nine advisories and the osv-scanner finding the same partial run had already
missed in the report beside it — one wrong belief about what remains,
written down twice from the same incomplete recall. The fix is not a second
gate-sourced rule for the enforcement map to match fix 56's for the report —
that would be the identical defect recurring in the very guidance meant to
close it. **Any artefact stating what remains derives that statement from
the same single command the report does, or cites the report rather than
recomputing the set.** A second document that recomputes "what's left"
independently can drift from the first the moment either one is edited; a
document that only points at the report cannot, because there is nothing
left in it to get wrong.

**Fix 65 — a report's outstanding-work list is what decides whether the
pull request should exist yet, not only what it says once it does.** Every
iteration in this series raised a pull request and then discovered what CI
thought — three findings cited locally, sixteen from CI, because _some_ of
the gate-6 surface ran rather than the gate itself. **Do not open a pull
request unless the gate-6 surface, run as one command, is clean.** The one
exception is a finding reserved for a human — a decision record or register
row accepting a risk, a licence, a suppression or an opt-out
([registers.md](guardrails/registers.md#a-register-row-or-a-decision-record)),
a change-size override recorded in [the change-size override
register](guardrails/registers.md#the-change-size-override-register)
([fix 74](guardrails/cross-gate-rules.md#an-override-answers-a-push-back-it-is-not-a-fix)),
or a conflict between two standing directives, reserved the same way by a
repository's own root instruction file — named in the pull request body
with the command that produced it. Full rule:
[cross-gate-rules.md](guardrails/cross-gate-rules.md#a-pull-request-is-not-opened-until-the-gate-6-surface-is-clean-locally).

**Fix 75 — the precondition is resolvability; the enumeration above is its
consequence.** A pull request opens when every finding an implementer could
resolve has been resolved; what remains is what only a human can decide, and
those do not block the pull request — the pull request is how they reach the
person who decides. The list above is not an arbitrary set to extend on
finding a new case; it is what this corpus has found, so far, to be
genuinely unresolvable by an implementer, each provable by a record with a
blank approver rather than by a claim in prose. Full rule:
[cross-gate-rules.md](guardrails/cross-gate-rules.md#a-pull-request-is-not-opened-until-the-gate-6-surface-is-clean-locally).

**Fix 66 — the bootstrap report, and any session report that raises a pull
request, carries a section recording every finding CI produced that the
local run did not**, each categorised against the four gap kinds
[cross-gate-rules.md
names](guardrails/cross-gate-rules.md#the-gap-between-a-local-pass-and-a-ci-finding-is-itself-a-finding) —
the local gate was not run, the local gate is scoped narrower than CI's,
the check cannot run locally at all, or CI models something the local gates
do not. This is the small artefact that would have surfaced fix 63
organically (a locally generated dependency register incomplete for a
platform-specific optional dependency) rather than waiting for an audit to
notice a missing register row. Where the local run reported no gap because
it was never raised until it was clean (fix 65), the section says exactly
that — an empty section with the reason is still the section, not an
omission.

**Fix 74 — an override is not a fix.** A report once described its own
largest anomaly — a branch 18.7 times the change-size error threshold — as
"fixed during the bootstrap," when what actually happened was an unapproved
`[large-pr]` marker. An override answers a push back; it does not resolve
the finding the push back was about. A report names it as what it is —
outstanding, disclosed, reserved for a human — under the same heading every
other reserved-class finding uses, never folded into a narrative of what was
fixed. Full rule:
[cross-gate-rules.md](guardrails/cross-gate-rules.md#an-override-answers-a-push-back-it-is-not-a-fix).

**Fix 76 — a report's gate output is provisional until CI has produced its
own.** A commit whose subject read "record gate 6 output verbatim in the
bootstrap report" quoted the _local_ run, where osv-scanner had correctly
skipped; CI, on that same commit, failed the check with six CVEs the report
never named, while the report's own header claimed the block was "copied
from gate 6's own output." Once CI's job log exists, reconcile the report
against it — `node scripts/check-report-ci-reconciliation.mjs <report> <job
log>` is the mechanical form, reading the job log directly rather than the
capped annotations API (fix 64) — and record any gap CI's log carries that
the report does not, categorised per fix 66's four kinds, before the pull
request is presented as ready. This is a step after the pipeline runs, not a
stricter precondition on opening it. Full rule:
[cross-gate-rules.md](guardrails/cross-gate-rules.md#a-reports-gate-output-is-provisional-until-ci-has-produced-its-own).

**Fix 80 — reconciled at label level is not reconciled at value level.** A
report named every CI finding correctly but quoted one's detail stale — its
quote of a finding read `(anonymous)@1594-2939` where live CI read
`(anonymous)@1602-2947`, because a later commit shifted the file after the
reconciliation pass had already captured the earlier span.
`check-report-ci-reconciliation.mjs` matches the `<gate>: FAIL <label>`
string by design, never the indented detail beneath it, so this was never
within the check's own scope to catch — the defect is the report's claim,
not the check. A report states which level it reconciled at: confirming
every finding is named proves nothing is missing; it does not prove a
quoted finding's detail is current, and a report that quotes a tool's output
verbatim is making the stronger claim. The remedy is sequencing — reconcile,
and capture any quote, after the last commit that changes anything quoted,
not before it. Full rule:
[cross-gate-rules.md](guardrails/cross-gate-rules.md#a-reports-gate-output-is-provisional-until-ci-has-produced-its-own).

**Tuning removes content; it never removes the checklist that catches
under-tuning.** The seven checks in [Verification](#verification) below are
not stack-specific or component-specific content — they are a property of
having been instantiated at all, and every consuming repository's copy carries
all seven regardless of its own stack list or component count. Reading "remove
content that cannot apply" as licence to drop the multi-component checkpoint
because the repository has one component is the same misreading that produced
Audit 10's finding in the first place — it prunes the check, not the content
the check exists to catch.

**Record provenance.** Each instantiated standard names the upstream commit it
was copied from — a footer line in its own `## References` section is enough.
Provenance is what turns "might this be stale" into a diff someone can
actually run against the named commit, rather than a worry nobody can act on.

**Rewrite or drop what a copy cannot carry.** An instantiated standard's own
links point at paths the canonical corpus has, and a consumer may not —
`branch-protection.md` here links `../../../skills/repository-bootstrap/
SKILL.md`, a path this toolkit ships that a consumer with no `skills/` tree
does not. Two outcomes close the link check honestly: retarget the link at
wherever the consumer actually records that procedure (its own `AGENTS.md`,
its enforcement map, an adoption note), or drop it when nothing in the
consumer replaces what it pointed at. Neither is "leave the old path and let
gate 2 refuse it."

**A replacement sentence must name a location that actually contains the
thing.** "The adoption procedure is recorded in `AGENTS.md` and the
enforcement map" is only true if `AGENTS.md` or the enforcement map actually
says so — a sentence that satisfies the link checker while asserting
something false has not fixed the gap, it has hidden it behind a passing
gate. Open the file the sentence names before writing it; a link check
proves the target exists, never that the claim about it is true.

**Add the enforcement map — the part no upstream text can supply**, because it
names the consuming repository's own files: which configuration file or gate
actually enforces each standard, not merely which document describes it. A
reader cannot tell that `.editorconfig` is what controls basic formatting, or
that `.gitattributes` decides file classes, from the standard's prose alone —
that mapping lives only in the repository holding the files. The enforcement
column is the valuable half of the map: delete `.editorconfig` and its row
becomes a lie a reader can see immediately, where a prose restatement of the
same formatting rule would drift silently and never be caught — the same
argument against copying the standards verbatim, applied one level down to
what enforces them. This repository carries its own instance:
[Standards enforcement](../standards-enforcement.md), since it is built under
the standards it defines and asks nothing of a consumer it does not do itself.

**The enforcement map is also where a dropped adoption-procedure link goes to
live**, for a standard whose canonical form points at a script run once
during setup rather than a gate run on every commit: a row naming the script
(`scripts/configure-branch-protection.mjs`) and where it is invoked from is
exactly the consumer-specific fact the map exists to carry, and it is where
an implementer asking "where is this recorded" will actually find something
— rather than the standards-only search that found nothing and produced the
false replacement sentence above.

### Write for the consuming repository's reader

An instantiated document serves a **different reader** from the corpus that
generated it. This corpus argues with alternatives, records superseded
reasoning and justifies each rule to someone deciding whether to adopt it. The
consuming repository's reader has already adopted it and needs to know what
applies here, what enforces it, and what to do when it fires.

Keep the reasoning that answers _why this rule exists_ — a reader who does not
understand a rule routes around it. Drop the reasoning that answers _why this
rule rather than a different one_ — that is this corpus's adoption argument,
not the repository's, and it belongs upstream. Concretely, an instantiated
document is:

- **Shorter than its source.** The rejected alternatives and the adoption
  argument are exactly what the previous paragraph said to drop, and they are
  most of what makes a corpus document long.
- **Specific.** "Coverage floor 80% over `src/`, enforced by `c8` at gate 5" —
  not "a coverage floor appropriate to the repository." A number and the tool
  that enforces it are checkable; an adjective is not.
- **Ordered as a process**, where it describes one: what triggers the gate,
  what it checks, what a refusal says, and what the reader does next, in that
  order. A gate is a sequence; prose that does not read as one makes the
  reader reconstruct the order themselves before they can act.
- **Honest about gaps.** A check the repository cannot run says so, naming the
  gate that covers it instead — never silently absent. Several bootstrapped
  repositories already do this well; it is a requirement here, not a nicety
  some copies happened to include.

## What this does not govern

- **ADRs** — recording how a decision was made is the genre, not a fault. Their
  format is fixed by [the ADR conventions](../ADR/README.md).
- **Delivery artefacts** — registers, retrospectives, specs and plans have their
  own audiences and lifetimes, and belong to the repository that produces them.

## Enforcement

Two rules here are mechanically checkable, and they run as documentation checks
at the [commit gate](guardrails/gate-2-commit.md) — alongside the prose lint,
the spell check and the link and anchor integrity check: the three frontmatter
fields being present and non-empty, and the preferred-terms table. The second is a word-list check of the same shape as the cspell gate that
already runs, so it needs no new tooling.

Instantiation and the enforcement map are mostly judgement, verified at
adoption and at [gate 7](guardrails/gate-7-on-demand.md) rather than per
commit — a missing provenance footer or an enforcement row naming a file that
does not exist are things a reader catches on sight, the same as any other
broken claim.

Two of the seven instantiation checks are the exception: a stack name outside
the derived list is a text search, and a multi-component section present at
one component is a heading search gated on a count. Neither requires reading
prose for tone or completeness, which is why `scripts/check-standards-instantiation.mjs`
exists.

**Fix 72 — a heading search cannot see a retained standard's contradiction
when it lives outside a heading.** Audit 17's case: `deployment-strategy.md`
retained wholesale, 567 of its 568 lines, in a repository this corpus's own
component map derives as one component — and the multi-component heading
search reported clean, because the contradiction was in the document's own
frontmatter `summary` field ("How a multi-component app is versioned
per-component…"), never a Markdown heading. The checker was not lying: it
detects literal dead-stack vocabulary and heading mismatches, and there
were none. It could not detect the wrong standard retained wholesale, the
larger version of the same defect. `findComponentCountContradiction` (same
module) widens exactly that far: a document's own frontmatter or title
naming "multi-component" while the component map declares one component is
a finding — structural, not vocabulary-based, since the component count is
already derived and this compares that one fact against the two places a
document states what it is about. Deliberately narrow to those two
locations: reading the body for the same phrase would reopen the "was this
reduced enough" judgement call this section already refuses to automate.

**A claim that no residue remains is itself subject to [never claim more
than was checked](guardrails/cross-gate-rules.md#never-claim-more-than-was-checked).**
An enforcement map or bootstrap report stating "no dead stack vocabulary, no
multi-component content, no residue remains" is a completeness claim the
same as any other, and names the check that supports it — the widened
`check-standards-instantiation.mjs`, run and reporting zero findings — not
a document that was read and judged clean by eye. A residue claim written
alongside the map rather than derived from the checker's own output is the
same defect fix 56 already closed for a report's outstanding-work section,
one artefact over.

**The first of those two is not confined to `docs/standards/**` — instantiation
residue is not confined to prose.** Fix 55: a Node-only repository's
`cspell.json` carried `Roslynator`, `Meziantou`, `xunit` and `warnaserror`,
each with zero occurrences anywhere else in the tree, copied wholesale from
this toolkit's own multi-stack word list, where the same words are not
residue — they occur in this corpus's own `.NET` prose. A repository's
configuration can carry a stack it does not have the same as its documents
can. `checkCspellResidue` (same module) reads the instantiated repository's
own `cspell.json` word list, kept conservative on purpose: a word absent
everywhere else in the tree is only a finding when it _also_ names a stack
outside the derived list — an unused word alone is not, because plenty of
legitimate vocabulary appears once and is later edited away, and a checker
that flags every unused word gets turned off.

**Fix 59 — the "used elsewhere" corpus must exclude the checker's own
fixtures.** Once this module (and, following the porting instruction below,
its test file) is copied into the repository it inspects, "every tracked
file" now includes this checker's own source and test fixtures — which
necessarily contain the literal dead-stack words as fixtures (`Roslynator`,
`Meziantou`, `xunit`, `warnaserror` are exactly fix 55's demonstrated case).
Those fixtures then vote the words "used elsewhere" and the checker never
flags them in the one repository it exists to protect. This toolkit's own
test suite never caught it: this repository is exempt outright
(`isToolkit()`), so the corpus-composition path never ran here at all — a
bug in a path an exemption always skips is invisible to any test that only
ever exercises the exempt repository. `checkCspellResidue` now builds its
corpus from files **not** classed `tooling` ([file-classes.md](guardrails/file-classes.md)),
the same attribute `check-tooling-class.mjs` already derives, applied to one
more consumer of it — a word's own checker and its own fixtures no longer
get a vote on whether the word is legitimate product vocabulary.

**The general rule, for the next "does this appear elsewhere" check**: a
corpus built from "everything tracked" will include the check's own source
and fixtures once that check is itself ported into the repository it
inspects, and an exemption that correctly lets the canonical toolkit skip
the check entirely also means the toolkit's own tests can never exercise the
non-exempt path where a corpus-composition bug like this one actually
lives. Derive such a corpus from file class, excluding `tooling`, and prove
it by exercising the non-exempt path directly — a scratch repository that
has ported the checker — not only by re-checking this toolkit's own, exempt
repository.

**Fix 60 — instantiation tunes code as well as prose.** An implementer
removed, by hand, two toolkit self-checks that had made it into a ported
test file: one reading this toolkit's own commit SHA, one asserting this
toolkit's own ADR-0004 was `Accepted` with a named approver. Both would have
failed deterministically on every consuming repository's first CI run — a
consumer's history does not, and cannot, contain another repository's
commits — and nothing mechanical caught it, because the checks above read
`docs/standards/**` and `cspell.json`, never test files. A ported test
asserting the source repository's own state is the same defect class as a
ported standard naming a stack the consumer lacks: instantiation residue,
just in code rather than prose. `checkHardcodedCommitSha` (same module)
adds the narrow, mechanical proxy: a full 40-character hex commit SHA
hard-coded in a file classed `test` is a finding. Deliberately narrow —
detecting "this assertion tests the upstream repository's state"
semantically would false-positive on legitimate fixtures, so the check
looks for nothing but the SHA shape itself, scoped to `test`-classed files
so a `configuration`-classed CI workflow pinning a third-party GitHub Action
to its commit SHA (a security practice, not this defect) is never in scope.
The same `isToolkit()` exemption as `checkCspellResidue`, and the same fix
59 lesson applied to it: this repository's own real history
(`daa59d0c…`, fix 49's hazard 3) is exactly the recursive case an exemption
could hide from its own tests, so the exemption is verified against this
repository directly rather than assumed to hold.

Porting the module is three steps, not one:

1. Copy it into the consuming repository's own tooling directory.
2. **Wire it into that repository's own gate 7**, the same commit as the copy —
   a script that sits in the tooling directory unimported by anything checks
   nothing, which is exactly the gap a mechanical checker existing and never
   running left open once already; `scripts/check-script-wiring.mjs` reports a
   check script no gate invokes as a finding for this reason.
3. **Also wire it into that repository's own gate 6, blocking, whenever the
   pull request's range touches `docs/standards/` or `cspell.json`.** Gate
   7's sweep is unconditional and reports on every run regardless of what
   changed — right for catching a stack added later that the corpus never
   mentioned, since nothing else would notice that — but it never blocks a
   merge on its own. A pull request that edits the instantiated corpus or
   the word list and leaves either non-clean should not merge leaving it
   that way; one that touches neither is not asked about it. This is the
   same change-triggered
   shape [change-triggered-checks.md](guardrails/change-triggered-checks.md)
   already states for a dependency check: the trigger is "did the range touch
   the thing this check reads", computed the same way gate-6-pull-request.mjs's
   own checks 6 and 7 already compute theirs — a `changedFiles(range)` read,
   not a second range comparison invented for this one check.

   A bootstrapped repository that skipped this step is the observed failure:
   audited, gate 7 reported 60 findings across 13 gate-reference documents and
   never blocked, because nothing was wired to ask at the point a change
   could have kept the corpus clean.

Run it there, against that repository's **own** instantiated `docs/standards/`
and its own `cspell.json`. It is not run against this corpus's own
`docs/standards/` or `cspell.json`: this repository is the canonical source,
not an instantiated copy, and correctly documents and lists every stack it
supports — do not copy that exemption along with the file.
`checkCspellResidue` carries the exemption itself (`deriveComponent()` naming
this repository's own shipped product, the same signal
`check-tooling-class.mjs` already uses), rather than relying on a consumer
to never run it here, because unlike the prose checks this one is cheap
enough to run unconditionally and a repository that forgets the exemption
would otherwise flag its own canonical corpus.

Everything else stays judgement, including the other five instantiation
checks: no gate can tell whether a removal was recorded for the right reason,
whether a document is concise because it was tuned or merely trimmed, or
whether prose reads as a process. Pretending otherwise would put a number on
a property that has none, and people would write to the number instead of the
requirement it stands in for.

## Verification

- [ ] Every document under `/docs` has non-empty `type`, `summary`, and
      `read_when` frontmatter, and `type` is one of the four listed values or a
      document class's own declared convention.
- [ ] The document opens with its title and a one-line purpose — not with why
      it exists, what it deliberately does not cover, or the decisions behind it.
- [ ] `## References` is the last section, and no provenance appears earlier
      in the document.
- [ ] The document's structure matches its declared `type` — a `reference`
      scans as tables and lists, a `how-to` runs prerequisites → numbered steps
      → verification, an `explanation` leads with rationale.
- [ ] One term is used per concept throughout the document — no synonym
      swapped in for readability.
- [ ] A skill mentioned in the document sits as an aside next to the guidance
      it automates, never as the structure the document is organised around.
- [ ] The repository's `AGENTS.md` (or equivalent) instantiates the standards
      it holds itself to under its own `docs/standards/`, rather than only
      linking to this corpus's canonical home.
- [ ] Each instantiated standard names the upstream commit it was copied from.
- [ ] An enforcement map exists, naming the configuration file or gate that
      enforces each standard the repository carries — and every file it names
      actually exists.
- [ ] A link inside an instantiated standard that pointed at a path the
      canonical corpus has and the consumer does not (a `skills/` tree, a
      script the consumer never ported) is retargeted at where the consumer
      actually records that procedure, or dropped — never left broken and
      never satisfied by a replacement sentence that asserts a location
      that, checked, does not contain the thing.
- [ ] A bootstrap report's outstanding-work list matches the gate output it
      names, finding for finding — answerable by anyone with both artefacts
      in front of them. A finding present in the gate's own output and
      absent from the report is a defect in the report, not a smaller
      version of the truth.
- [ ] The outstanding-work list names the single command that produced it —
      the gate itself, not an assembled set of individually run checks.
- [ ] The list's line count equals that command's own finding count.
- [ ] A check the implementer could not run locally appears in the list as
      unavailable, never as an omission nobody can see.
- [ ] A second artefact — an enforcement map, a status note — describing
      what remains cites the report rather than recomputing its own set.
- [ ] The pull request this report accompanies was not opened while the
      gate-6 surface reported a finding the implementer could have fixed —
      only findings reserved for a human remain, named in the pull request
      body with the command that produced them.
- [ ] The report carries a section recording every finding CI produced that
      the local run did not, each categorised against one of the four gap
      kinds — present and empty with a reason where the branch was not
      raised until the local run was clean, never simply absent.
- [ ] An unresolved change-size override is reported as outstanding and
      reserved for a human, under the same heading every other reserved-class
      finding uses — never described as fixed.
- [ ] Once CI has produced its own job log, the report is reconciled against
      it — `node scripts/check-report-ci-reconciliation.mjs` run against the
      report and the job log — and any finding CI produced that the report
      does not mention is added, categorised, before the pull request is
      presented as ready.
- [ ] Every numeric claim anywhere in the report — not only its
      outstanding-work section — names the command whose output produced
      it, and where a gate produces the same figure for the same commit,
      the report quotes the gate's own number rather than a local run's.
- [ ] A word present only in `tooling`-classed files does not count as "used
      elsewhere" for an instantiation-residue finding — checked against a
      scratch repository that has actually ported the checker, not only
      against this toolkit's own, exempt repository.
- [ ] A ported test does not hard-code a full 40-character commit SHA —
      naming the source repository's own history, which a consumer's git
      log does not and cannot contain. Scoped to files classed `test`; a
      `configuration`-classed CI workflow pinning a GitHub Action to its
      commit SHA is not this defect.

The seven checks below always apply to an instantiated repository's copy —
they verify that tuning happened, so they are never among the content tuning
removes. Run them at adoption and unconditionally at
[gate 7](guardrails/gate-7-on-demand.md), the same as the rest of this
section — and, for the two mechanical checks above, additionally blocking at
[gate 6](guardrails/gate-6-pull-request.md) whenever the change touches
`docs/standards/`:

- [ ] Every instantiated standard applies only to the stacks the
      repository's own manifests declare — a language, package manager or
      analyser named in the copy that is outside the derived stack list is a
      finding. `scripts/check-standards-instantiation.mjs`
      (`deriveStackList`, `findStackReferencesOutsideList`) is the mechanical
      form of this check: derive the stack list from the tracked manifests,
      then search the instantiated documents for a keyword belonging to a
      stack not in that list.
- [ ] The repository's own configuration carries no stack it does not have
      either — starting with `cspell.json`'s word list, the demonstrated
      case. A word with no occurrence anywhere else in the tree, that also
      names a stack outside the derived list, is a finding; an unused word
      alone is not. `checkCspellResidue`
      (`scripts/check-standards-instantiation.mjs`) is the mechanical form,
      exempt outright against this toolkit's own repository, which
      legitimately lists every stack it documents.
- [ ] No instantiated standard describes multi-component behaviour —
      deployment ordering, cross-component prerelease propagation, a
      per-component version table — when [the component map](guardrails/components.md)
      declares one component. `findMultiComponentContent` in the same script
      is the mechanical form: a known multi-component heading present while
      the component count is 1 is a finding.
- [ ] No instantiated standard's own frontmatter or title contradicts the
      same component map either — a document retained wholesale rather than
      tuned can carry the contradiction there instead of in a heading.
      `findComponentCountContradiction` (fix 72, same script) is the
      mechanical form: `deployment-strategy.md`'s frontmatter reading "a
      multi-component app" at component count 1 is the demonstrated case.
- [ ] No instantiated standard describes an environment deployment procedure
      (health check, smoke test, rollback) when no declared deployment
      target is an environment.
- [ ] Every removal is recorded, naming the property of the repository that
      made the content inapplicable — not merely that something was removed.
- [ ] The record lives in a `PROVENANCE` note or the enforcement map, not
      only in a one-time session report — `findRemovalsOutsideEnforcementMap`
      (`scripts/check-standards-instantiation.mjs`) is the mechanical form.
- [ ] Every instantiated document is shorter than its upstream source, or the
      reason it is not is recorded. This is a **crude proxy**, and
      deliberately so: its value is that it is unambiguous and fails loudly
      on a corpus copied rather than tuned — the defect Audit 10 actually
      found. Treat a pass as evidence tuning happened at all, not as a target
      — shortening a document by deleting content that still applies games
      the proxy without fixing what it stands in for.
- [ ] Every gate document states, in order: what triggers the gate, what it
      checks, what a refusal says, and what the reader does next.
- [ ] A check the repository cannot run is named as such, with the gate that
      covers it instead — never silently absent.
- [ ] A pull request that touches `docs/standards/` is blocked at gate 6 while
      either mechanical instantiation check reports a finding — reported at
      gate 7 is not enough, and a change that never touches `docs/standards/`
      is not asked about it. A repository whose gate 6 does not have this
      wired has the failure Audit 12 found: 60 findings reported at gate 7,
      nothing ever blocking on them.

## References

- [ADR conventions](../ADR/README.md) — the one document class with extra fields.
- [Guardrail standards](guardrail-standards.md) — the gate that checks what is
  checkable here.
- Document types adapted from the Diataxis framework (<https://diataxis.fr>).
- The one-term-per-concept rule is borrowed from ASD-STE100 Simplified Technical
  English (<https://www.asd-ste100.org>), which pairs ~65 writing rules with a
  controlled 900-word dictionary. The specification itself is **not adopted**: it
  states it is "not intended for general-purpose writing", it targets procedural
  maintenance documentation for non-native readers, and ASD retains copyright, so
  its dictionary cannot ship inside this repo. The idea transfers; the artefact
  does not. Its sentence-length caps are deliberately omitted — a word count is
  easy to satisfy without writing more clearly, and it invites bad splits.
