---
type: reference
summary: Slice 6 of the distributable-guardrails design — a repository-local skill that turns a completed round into tracked findings, one file per finding, each carrying a hypothesis written before the fix and a result written by the round that tested it.
read_when: Implementing or reviewing slice 6, writing a tuning finding, or judging whether a claim that a fix worked is backed by anything.
---

# Slice 6 — the tuning skill

A skill local to this repository that reads a completed round and produces the
next round's changes as tracked findings, hypotheses, fixes and results.

Scope is fixed by
[the overarching design](2026-08-01-distributable-guardrails-design.md).
Anything not described there is out of scope here too.

## Where the skill lives, and why the boundary holds

`.claude/skills/toolkit-tuning/SKILL.md`, with its one check script beside it.

| Path              | Is                                                                   |
| ----------------- | -------------------------------------------------------------------- |
| `skills/`         | Shipped by the plugin — six skills, all consumer-facing              |
| `.claude/skills/` | Loaded only for a session whose working directory is this repository |

The boundary is a **discovery path, not a promise**. A plugin registers the
skills under its own root's `skills/` directory; nothing registers a
`.claude/skills/` directory that happens to sit inside an installed plugin. A
consumer who installs this plugin therefore cannot invoke this skill, whatever
anyone forgets to write down — which is the same standard
[slice 2](2026-08-01-distributable-guardrails-slice-2-opt-out-register.md) holds its own enforcement to.

It belongs on this side of the boundary because its whole subject is this
repository's own improvement history. A consumer has no rounds, no implementer
log and no corpus to fix; the skill would activate on nothing.

Two consequences, both small and both stated so they are not discovered later:

- `.gitattributes` gains `.claude/**  guardrail-class=agent-context`, the same
  class `skills/**` already carries. The `agent-context-limits` capability then
  applies to `SKILL.md` exactly as it does to the six shipped skills.
- The check script is repo-local tooling and is **not** copied into
  `.guardrails/`. That is settled, and it is not an exception this slice
  negotiated: slice 1 defines `.guardrails/` as **what a consuming repository
  receives**, and names `.claude/skills/**/*.mjs` in
  [its carve-out](2026-08-01-distributable-guardrails-slice-1-foundations.md#what-guardrails-is-and-what-therefore-stays-out-of-it-here)
  alongside the two one-off `configure-*.mjs` setup scripts and slice 5's
  `eval/`. `check-ledger.mjs` qualifies on the definition: a consumer has no
  rounds and no ledger, so the check would have nothing to read — and copying
  it would leave a `tooling`-classed script no gate there invokes, which
  `check-script-wiring.mjs` reports as a finding in the consumer. The wiring
  check accepts the three carved-out locations as repo-local tooling that must
  be wired **here**, which `check-ledger.mjs` is: this repository's gate 7
  invokes it.

## The record

### One artefact per finding, not one per round

`docs/tuning/`, flat:

```text
docs/tuning/
  README.md            generated index — the "which changes worked" view
  F-0001-<slug>.md     one file per finding, for its whole life
  F-0002-<slug>.md
```

**The finding is the tracked object; the round is a value inside it.** A round is
already an object with a record — slice 5's manifest — and duplicating it here
would produce a second statement of the same facts that can drift from the first,
which
[docs-style's fix 62](../standards/docs-style.md) already names as a defect
rather than thoroughness.

The decision, argued both ways:

| Shape                  | Answers "what happened in this round"              | Answers "has this happened before"                       |
| ---------------------- | -------------------------------------------------- | -------------------------------------------------------- |
| One artefact per round | Directly                                           | Only by reading every round file — twenty-six of them    |
| **One per finding**    | By the generated index, or a grep for the round id | **Directly — the recurrence is the file's own contents** |

Recurrence is the brief's stated highest-value output and the shape that makes it
free wins. The cost — reconstructing a round's view — is paid by a generated
index rather than by a second hand-written record.

`docs/tuning/README.md` is **generated** from the finding files and declared
`guardrail-generated` in `.gitattributes`, per
[ADR-0005](../ADR/0005-generated-files-discounted-from-change-size.md). It is the
artefact that answers "which changes worked" without re-reading a log: one row
per fix attempt, with its remedy kind and its result.

### The finding file

The three base frontmatter fields, then a fixed identity block, then one section
per round in which something happened to this finding.

```text
# F-0042 — reconciliation matcher cannot parse a real job log

| Field           | Value                                      |
| --------------- | ------------------------------------------ |
| Id              | F-0042                                     |
| Scope           | capability                                 |
| Capability      | evidence-publication                       |
| Defect class    | corpus                                     |
| Locus           | .guardrails/check-report-ci-reconciliation.mjs |
| Opened          | 4f2a9c1e0b7d-012                           |
| Series          | 4f2a9c1e0b7d                               |
| Status          | open                                       |
| Checked against | F-0007, F-0031                             |

## Round 4f2a9c1e0b7d-012

Observed:     yes
Evidence:     check-report-ci-reconciliation.mjs printed `0 findings from 9`
              against job log 12345/67890, and exited 0.
Fix:          rebuild the matcher against a captured job log; add a negative
              fixture from that same log. Commit <sha>.
Remedy kind:  reference-implementation
Hypothesis:
  Artefact:    the next round's ci.runs[0].logPath, as its manifest names it
  Observation: the line `16 findings from 16`, and exit status 0
  Refutation:  any count below CI's own finding count, or the string `0 findings`
Result (4f2a9c1e0b7d-013): Confirmed — the artefact reads `16 findings from 16`.
```

Every key in that shape is required and none may be empty. That is the whole
integrity mechanism: **a field that cannot be left blank, and a field only a
later round can fill.** Nothing reads a sentence and judges it.

#### The identity block

| Field             | Holds                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| `Id`              | `F-NNNN`, assigned once, never reused, never renumbered                                                       |
| `Scope`           | `capability` or `loop` — see below                                                                            |
| `Capability`      | One id from slice 1's `capabilities.mjs`. Required when `Scope` is `capability`, absent otherwise             |
| `Loop condition`  | `prompt-tuning`, `clarifying-question` or `harness`. Required when `Scope` is `loop`, absent otherwise        |
| `Defect class`    | `corpus` or `execution`                                                                                       |
| `Locus`           | The toolkit path the finding is about — a standards file and section, or a script                             |
| `Opened`          | The round id that first raised it, as slice 5 writes it (`<seriesId>-<seq>`)                                  |
| `Series`          | The series id — the prompt's own hash. Results from a different series are not comparable                     |
| `Status`          | `open` or `closed`                                                                                            |
| `Checked against` | The finding ids this observation was compared to before a new file was opened — see [Recurrence](#recurrence) |

**`Scope` exists so this slice adds no capability.** The overarching design puts
new capabilities out of scope, and two of the loop's own findings are not
properties of a repository at all: the test prompt had to be tuned, and the
implementer asked a clarifying question the skill should have answered. Those key
on `Scope: loop` with a `Loop condition`, and they never borrow a capability id
that does not fit. `harness` covers a defect in slice 5's own machinery, which is
neither a corpus defect nor an implementer's.

Findings with `Scope: capability` **key on slice 1's vocabulary and nothing
else**. An id that does not resolve against `capabilities.mjs` is a defect in the
finding, not a reason to invent a value.

**Including a capability an uplift met with a tool this toolkit did not
choose.** Slice 1's format is the gate's, not the tool's — the gate entry point
invokes the kept tool and writes the result line itself, carrying the capability
id and quoting the tool's own output — so the id is present for those
capabilities exactly as it is for any other, and the map of capability to tool
is in
[the enforcement map](2026-08-01-distributable-guardrails-slice-1-foundations.md#the-enforcement-map)
when a finding needs to name what was enforcing it.

## Recurrence

A finding observed in rounds 3, 7 and 12 is one file with three sections. It is
one finding because **identity is assigned once and every later round is made to
resolve against it**, never because a matcher was clever.

Three mechanisms, in order:

**1. The match key narrows the candidates.** Two observations are candidates for
the same finding when they share `Scope`, the capability or loop condition, and
`Defect class`. `Locus` is compared but does not decide: the same defect recurs
at a different path when a fix moved the code, and the whole point of the series'
strongest result is that a defect survives its remedy.

**2. `Checked against` cannot be left empty.** A new finding file may not be
opened without recording the ids it was compared to — or the literal value
`none-open-for-this-key` when the ledger holds none. This is the field that
replaces someone remembering. It is cheap because the index is generated and
short: the skill reads the open findings for the key before it writes anything.

**3. A recurrence reopens the id; it never opens a new one.** A `closed` finding
observed again flips to `open` and gains a new round section. The file therefore
carries its own history: every fix attempted against it, each with its remedy
kind and its result.

**This is what makes the series' strongest result a query rather than a
memory.** _A defect given a reference implementation is fixed next round; a
defect given prose recurs_ was only visible because someone remembered twenty-two
audits. Once every fix attempt records `Remedy kind` as
`reference-implementation`, `prose` or `both`, the claim is a count over the
index:

| Remedy kind                | Attempts | Recurred in a later round |
| -------------------------- | -------- | ------------------------- |
| `reference-implementation` | …        | …                         |
| `prose`                    | …        | …                         |

Nobody scores the remedy. The kind is a fact about what the fix commit contains —
a check with a fixture, or a paragraph — and where a fix contains both, `both` is
the honest value and the row it lands in says so.

## Corpus defect versus execution defect

The auditor already distinguishes these, and
[the loop](../prompts/toolkit-improvement-loop.md) states why: a defect in the
corpus is the deliverable; a defect in this implementer's execution matters only
where the corpus permitted it.

| `Defect class` | Means                                                    | Gets                                    |
| -------------- | -------------------------------------------------------- | --------------------------------------- |
| `corpus`       | The corpus said the wrong thing, or said nothing at all  | A fix in the toolkit, with a hypothesis |
| `execution`    | The implementer did something the corpus did not require | A record, and no toolkit fix            |

### Where the classification appears in the report

**One line, last in each finding block, in this exact form:**

```text
Defect class: corpus
```

`corpus` or `execution`, lower case, nothing else on the line. Position and
spelling are fixed here because this skill is the only reader of the field and
a required line no reader specified is a required line nobody can rely on: the
fallback below then becomes the normal path rather than the exception, and every
finding arrives `execution` by default — which is the classification that
produces no fix.

**The audit brief carries the requirement, verbatim**, since the brief is what
the auditor is actually given and nothing templates it beyond this one line:

> Every finding you raise ends with a line reading `Defect class: corpus` or
> `Defect class: execution` — corpus where the standards said the wrong thing
> or said nothing, execution where the implementer did something the corpus did
> not require.

**This is specified here rather than in slice 5** because slice 5 stores the
brief and the report as opaque files and reads neither; the two class names are
this slice's vocabulary and appear nowhere else in the pack. A format is owned
by the slice that has to parse it.

Three rules keep the distinction honest:

- **The auditor's classification is carried, not re-derived.** The skill reads
  the class from the line above; where the report does not carry one, the
  finding is recorded `execution` and the missing classification is itself raised
  as a `harness` finding. Guessing at it would be the coordinator re-deriving a
  fact the loop already forbids.
- **Reclassification is a new round section, never an edit.** An execution defect
  the corpus is later found to have permitted becomes `corpus` in the round that
  found that, with the reason. The original section stands — a record that
  changes silently makes every citation of it unreliable, which is the same
  argument [the ADR conventions](../ADR/README.md) already make for superseding
  rather than editing.
- **An `execution` finding observed in three rounds is promoted to `corpus`.**
  The subject is reset and the implementer session is fresh every round, so the
  only thing constant across three occurrences is the corpus. This is an
  inference the ledger can actually support, and it needs no judgement: it is a
  count of round sections.

Only `corpus` findings produce fixes, so only they carry hypotheses. An
`execution` finding's round section carries `Fix: none — execution defect` and no
hypothesis, and that is not a blank field evading the rule.

## Hypotheses

### What makes one testable

A hypothesis is testable when all three of these can be written **before the
round runs**:

| Field           | Is                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------ |
| **Artefact**    | Which of the next round's artefacts will be read, named by its place in slice 5's manifest |
| **Observation** | What will be true in it, as a line, a count or an exit status — something you can look for |
| **Refutation**  | What that same artefact would contain instead if the fix did not work                      |

**The rule: if the refutation cannot be written, the hypothesis is not one.**

"The corpus will be clearer" fails at Artefact — there is no file that carries
clarity — and fails again at Refutation, because no artefact state contradicts
it. "The next round's report will quote gate 6's own output including the
osv-scanner line" passes all three: the artefact is the round's bootstrap report,
the observation is the presence of that line, and the refutation is the report
quoting a gate-6 block with the line absent.

The test is deliberately not a question about the sentence's quality. It is
whether three specific fields can be filled, and an unfilled field is the only
failure the record recognises.

### The prediction must precede the result

**The hypothesis is committed before the round that tests it, and that is
checkable.** A round's manifest names the toolkit HEAD the round ran against; the
commit carrying a hypothesis must be an ancestor of that HEAD. A hypothesis
written after the artefacts exist is not a prediction, and this is the one place
the record could otherwise be quietly falsified into always being right.

This is [the loop's own rule](../prompts/toolkit-improvement-loop.md) —
_derive a fact, do not type it_ — applied to the record's own integrity: the
ordering is read from git, not asserted in a field somebody fills.

### A hypothesis about a check names real input

Where the fix is a check, **the Artefact must be a round-produced artefact — a
real job log, a real report, a real gate run — never a fixture.** This is the
defect the brief names: a check tested against hand-constructed strings, which
returned success against a report that said nothing, and carried three later
fixes with it for three rounds.

A fixture-based hypothesis is not refused because fixtures are bad; the fix
should add one, per the loop's negative-fixture rule. It is refused as the
_hypothesis_ because a fixture is written by the same person as the check, and
agreeing with itself is what it did last time.

### Results

`Result (round N+1)` takes exactly one of three values, and the round that
settles it writes it:

| Value          | When                                                                                 |
| -------------- | ------------------------------------------------------------------------------------ |
| `Confirmed`    | The named artefact carries the observation. Quote it                                 |
| `Refuted`      | The named artefact carries the refutation, or neither. Quote what it carries instead |
| `Not measured` | With a reason, mandatory                                                             |

**`Not measured` is a permitted value on purpose.** Forbidding it produces
fabricated results, which is worse than an honest gap and much harder to see. Its
commonest legitimate cause is mechanical: the round was aborted or judged hung,
which slice 5's manifest states, so the skill fills both the value and the reason
without anyone deciding anything.

**A round does not start while a previous round's fix has no Result.** This is
the ordering rule that makes the brief's stated failure — _several fixes' effects
were never measured_ — structurally impossible rather than discouraged. It is
also the [check](#the-one-mechanical-check)'s main job.

**What enforces it is slice 5, not this skill.** The check is wired at this
repository's gate 7, which fires on a commit — never before a round, which is
the one moment the rule is about. So
[the round command runs it as a precondition](2026-08-01-distributable-guardrails-slice-5-harness.md#preconditions-before-the-subject-is-touched)
and stops before the reset when it reports an unsettled fix. Same script, second
caller: this slice owns the rule and the check, and the harness owns the moment.
`--ignore-ledger` overrides it and the manifest records that it was used, so an
overridden round is visible as one rather than indistinguishable from a clean
one.

## The skill's own procedure

The skill runs once per completed round, in the order below. **The ordering is
load-bearing**: settling old hypotheses before raising new findings is what stops
a result being displaced by the next round's excitement.

1. **Read slice 5's manifest for the completed round.** Refuse to proceed if its
   `series.id` differs from the one the open findings were filed under — the
   series id is the prompt's own hash, so a different series means every prior
   result is incomparable. That is a finding about the series, not a fact to work
   around.
2. **Settle every open hypothesis** whose predicted round is this one. Write
   `Confirmed`, `Refuted` or `Not measured` with the quoted artefact line. Nothing
   else happens until this is done.
3. **Read the generated index** for open findings, so step 5 has the candidates
   for `Checked against`.
4. **Read the audit report**, taking each finding with the auditor's own defect
   classification.
5. **Resolve each observation** to an existing id or open a new file, recording
   `Checked against` either way.
6. **Write the hypothesis for each `corpus` finding to be fixed this cycle**, and
   commit it — before the fix exists.
7. **Produce the fix brief**, in the shape
   [the loop](../prompts/toolkit-improvement-loop.md) already fixes, citing the
   finding ids.
8. **Regenerate the index.**

**The skill does not apply the fix.** The loop keeps three roles that never
merge, and a fix agent gets a fresh session with no memory of the others. This
skill occupies the coordinator's seat between the audit and the fix dispatch: it
produces the record and the brief, and hands off.

## What the skill reads — requirements on slice 5

These are requirements this spec places on slice 5's artefact contract. They were
written against the brief, not against slice 5's spec, and the Reconciles column
records what
[slice 5 as drafted](2026-08-01-distributable-guardrails-slice-5-harness.md) actually provides — so review
sees the gaps rather than an assumption of fit.

| #   | Slice 5 must provide                                                                                                                                  | Because                                                                                                                                      | Reconciles                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | A **round manifest**, machine-readable, at a path derivable from the round id alone                                                                   | Step 1 must find it without being told where it is                                                                                           | Met — `eval/rounds/<round-id>/manifest.json`                                                                                                                      |
| R2  | In the manifest: **round id, prompt hash, toolkit repository, branch and HEAD sha, subject repository, branch and pull request number**               | The series guard, and the hypothesis-ancestry check, both read this                                                                          | Met, and better — `series.id` **is** `sha256(renderedPrompt)[0:12]`, so the prompt hash is the series identity                                                    |
| R3  | In the manifest: the **path of every captured artefact** — implementer log, audit report, CI job logs, final repository state, each gate's own output | A hypothesis's Artefact field names a manifest key, not a guessed filename                                                                   | Met — the first four, plus `gateOutput[]` and `subjectFinal`                                                                                                      |
| R4  | CI logs captured as **raw job logs**, with the run id and job id recorded so they can be re-fetched                                                   | The annotations endpoint caps at 10 and truncates silently — it reported 10 findings where the log had 16                                    | Met — `ci.runs[].logPath`, with `checks.json` explicitly marked non-authoritative                                                                                 |
| R5  | An explicit **hung or aborted status**, and the reason                                                                                                | An absent finding in an aborted round is not evidence a fix worked. Without this the record produces false `Confirmed` results               | Met — `roles.<role>.status` of `hung`/`failed`/`not-started`, plus `hang.json`                                                                                    |
| R6  | **Missing captures named explicitly** in the manifest, rather than the file merely being absent                                                       | A capture that failed and a capture that found nothing are different facts, and only one of them is evidence                                 | Met — `verify.checks[]` records each completeness check by name and result                                                                                        |
| R7  | Gate output captured **verbatim**, in slice 1's line format, so every finding line carries its capability id                                          | Step 5 keys on capability without parsing prose                                                                                              | Met — `subject-final/gate-7.log`, named in the manifest's `gateOutput[]`. Gate 7 sweeps the whole tree, so its output is the one that enumerates capability state |
| R8  | **Round ids monotonic and never reused**, and a manifest immutable once written                                                                       | A finding's round sections are ordered by it, and a rewritten manifest silently rewrites history                                             | Monotonic and unique by construction (`<seriesId>-<seq>`, next seq from a directory scan). Immutability unstated                                                  |
| R9  | The audit report carrying a **per-finding defect classification** — `corpus` or `execution` — in a fixed position                                     | The skill carries the auditor's classification rather than re-deriving it, and cannot do that if the classification is only implied by prose | Met, and not by slice 5 — [the position is fixed in this spec](#where-the-classification-appears-in-the-report), by the only slice that parses it                 |
| R10 | The **fix brief and dispatch** for round N recorded as artefacts of round N                                                                           | A finding's Fix field cites what was actually dispatched, not what was intended                                                              | **Gap** — the layout captures the auditor's brief, not the fix brief                                                                                              |

**R7 and R9 were the two that decided how much prose this skill has to read,
and both are closed.** R7 by a named capture in slice 5's layout — the subject's
own gate 7, run after the implementer exits and kept verbatim — so step 5 reads
capability ids from an artefact the manifest names instead of parsing them out
of a session transcript. R9 here, because the two class names are this slice's
and a format is owned by whoever parses it. The fallback that records
`execution` and raises a `harness` finding survives as the exception it was
meant to be.

**R10 is small and worth taking.** Slice 5's own hand-off prints the next command;
capturing the fix brief beside the auditor's costs one file and removes the only
field in the ledger whose citation would otherwise point outside the round.

## The one mechanical check

`.claude/skills/toolkit-tuning/check-ledger.mjs`, wired into this repository's
own gate 7. Roughly sixty lines, and it exists because _a defect given a
reference implementation is fixed; a defect given prose recurs_ — a tuning skill
whose rules are only prose will decay exactly as every other prose-only rule in
this series did.

It reports, and nothing else:

| Finding                                                                             | Detects                                             |
| ----------------------------------------------------------------------------------- | --------------------------------------------------- |
| A round section with a `Fix` and no `Result`, where a later round's manifest exists | The unmeasured fix — the brief's central failure    |
| A `Hypothesis` missing any of Artefact, Observation or Refutation                   | An untestable hypothesis, by the only test there is |
| A hypothesis commit that is not an ancestor of the round's toolkit HEAD             | A prediction written after the result               |
| A `Capability` value absent from `capabilities.mjs`                                 | A finding keyed on an invented vocabulary           |
| A finding file with an empty `Checked against`                                      | A recurrence check nobody ran                       |
| `docs/tuning/README.md` not matching what the finding files generate                | A stale index                                       |

**It does not read prose for quality, and it must not learn to.** Every row above
is a presence, a set membership, an ancestry, or a regeneration diff.

It ships with a **negative fixture built from a real ledger file** — a finding
file with a genuinely unmeasured fix, captured from this repository's own
history, not hand-written. That is the loop's own rule about the most expensive
defect in the series, applied to the check that exists to prevent its recurrence.

## Success and failure criteria

| Criterion                                                                    | Verified by                                                                                                               |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Every fix traces to a finding, a hypothesis, and the round that settled it   | `check-ledger.mjs` reports zero unsettled fixes with a later manifest present                                             |
| A finding appearing in three rounds is one file with three sections          | Its `Id` is unchanged across them, and no second file shares its match key                                                |
| Which changes worked is answerable without opening a log                     | Read `docs/tuning/README.md`: remedy kind and result per attempt                                                          |
| A hypothesis written after its round cannot be recorded as a prediction      | The ancestry row of the check, against a deliberately back-dated fixture                                                  |
| An aborted round produces `Not measured`, never `Confirmed`                  | A fixture manifest carrying the `aborted` flag, run through step 2                                                        |
| A corpus defect is distinguishable from an execution defect in every finding | `Defect class` is a required identity field; the check has no separate row because an absent field breaks the block parse |
| The skill is unavailable to a consumer who installs the plugin               | Install the plugin into a scratch repository and list the available skills                                                |

**Failure.** A record that lists what was done without saying what was expected —
which, concretely, is a round section with a `Fix` and no `Hypothesis`. A
hypothesis whose refutation cannot be stated. A fix whose result is never
recorded, or is recorded from a round that did not run. A second finding file for
a defect already in the ledger. Any check that scores a sentence.

## Out of scope

- The nine gates, their order, or what they check.
- Any capability beyond slice 1's list — `Scope: loop` exists precisely so this
  slice adds none.
- Any change to a standard's content.
- Applying fixes. The skill writes the record and the brief; the fix agent is a
  separate session, per the loop's role separation.
- Distributing this skill, or the ledger, with the plugin.

## Decisions taken here

Nothing in this slice is open.

**A body table, not extra frontmatter.** Every register in this corpus already
uses one and `checkOptOutRegisterStaged` already parses it.
[docs-style](../standards/docs-style.md) permits extra frontmatter fields only
where a document class declares them, and its class table has one row (ADR), so
a `tuning finding` row would be a change to a standard's content — which the
overarching design puts out of scope. Frontmatter remains available later, but
it needs that docs-style change authorised on its own terms first.

**The twenty-six completed rounds are backfilled** — identity, locus, remedy
kind and recurrence taken from the existing fix-cycle history, with every
`Result` set to `Not measured — recorded retrospectively`. Backfilling the
_hypotheses_ would be fabrication: nobody wrote them, and that absence is the
finding the ledger exists to fix. Backfilling the rest produces the
reference-implementation-versus-prose comparison from real data on day one while
stating plainly that those results were never predicted.

**The round section's `Fix` field records the existing fix number** where one was
assigned. The corpus already cites `fix 56`, `fix 61`, `fix 74` and others as
stable references, and a ledger with its own `F-NNNN` ids would introduce a
second numbering competing with them. Joining the two vocabularies in the record
costs one field. Whether new fixes keep receiving fix numbers once the ledger
exists is a separate question this slice does not settle.

**A finding about slice 5's harness goes to `Scope: loop`, `Loop condition:
harness`.** It is neither a corpus defect nor an implementer's. Letting slice 5
own its own defect record was rejected: it would be a second place the same
thing might be written, and a finding filed in either of two places is a finding
nobody can count.

**The quoted line is copied verbatim into the finding file**, with the
manifest's `runId` and `jobId` beside it. Slice 5 git-ignores `eval/rounds/`
correctly — a stale capture in the tree looks like a result — but a `Result`
citing a log that exists on one machine cannot be re-checked by anyone else, and
this slice's whole argument is that a claim should be checkable. The verbatim
copy is what makes the record self-contained; the ids let the log be re-fetched
from the platform rather than from disk. **This covers CI and does not cover a
quote from an implementer transcript**, which has no equivalent re-fetch.

## What will settle by measurement

Not an open question. It has a working answer and a trigger, and it does not
block implementation.

**Is `Locus` stable enough to be useful?** It is compared but does not decide a
match, so a wrong value costs little. _Trigger: a finding whose locus moves every
time it is fixed is evidence the match key needs a fourth component. Twenty real
recurrences would answer it; none have been filed yet._

## References

- [Distributable guardrails — overarching design](2026-08-01-distributable-guardrails-design.md) — the six slices, and the decisions this one may not contradict.
- [The toolkit improvement loop](../prompts/toolkit-improvement-loop.md) — the three roles, the two failure conditions, and the rules the loop earned.
- [Slice 1 — Foundations](2026-08-01-distributable-guardrails-slice-1-foundations.md) — the capability vocabulary findings key on, and the gate output format they are read from.
- [Slice 2 — the opt-out register](2026-08-01-distributable-guardrails-slice-2-opt-out-register.md) — the enforcement standard this spec's boundary argument is held to.
- [Slice 4 — the audit skill](2026-08-01-distributable-guardrails-slice-4-audit-skill.md) — the report this skill reads, and the state vocabulary its findings arrive in.
- [ADR conventions](../ADR/README.md) — supersede rather than edit, the rule this spec's reclassification follows.
- [ADR-0005](../ADR/0005-generated-files-discounted-from-change-size.md) — the `guardrail-generated` declaration the index carries.
- [Documentation style standard](../standards/docs-style.md) — the frontmatter and structure rules, and the fix-62 argument against a second record of the same facts.
