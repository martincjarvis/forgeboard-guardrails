---
type: reference
summary: The overarching design for distributing the guardrails as a plugin — a .guardrails/ folder a repository owns, a capability-level opt-out register, two reworked skills, a mechanical harness, and a tuning loop.
read_when: Designing or implementing any of the seven slices below, or judging whether a proposed change belongs to this design or a different one.
---

<!-- cspell:ignore opencode -->

# Distributable guardrails — overarching design

The toolkit currently proves itself by bootstrapping a repository from a corpus
installed at a path the prompt names. That works, and twenty-six rounds of it
produced ninety-eight fixes. It does not distribute: a user cannot add the plugin
and have it apply itself.

This design closes that. It is split into seven slices, each specified separately
within the scope set here. Anything not described here is out of scope for all
seven.

## What is being built

A user adds the guardrails plugin. A skill activates when it should. The
repository ends up with a `.guardrails/` folder it owns — gate scripts, hooks and
their tests, copied from the plugin and tuned to the stack — that works for every
developer on the repository whether or not they have the plugin installed.

Where a guardrail does not suit that repository, a human opts out and the decision
is recorded where the auditor can see it. Where the repository already exists, the
same skill uplifts it rather than assuming a clean slate.

## Decisions already taken

These are settled. A slice that contradicts one is wrong, not creative.

| Decision                                                                                                                                                         | Why                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scripts are copied from the plugin and tuned to the target**, not called from it                                                                               | A developer without the plugin must still be able to run the gates                                                                                                                                                                                                               |
| **Everything guardrail-related lives in `.guardrails/`**                                                                                                         | Unambiguously separate from the repository's own `scripts/`; one file class; no argument about whose is whose                                                                                                                                                                    |
| **An opt-out is a human-approved register row _and_ a decision record**: the row indexes it, the ADR carries the reasoning. The register lives in `.guardrails/` | A gate must know what is off without opening an ADR; a human must know why without reconstructing it. Approval stays a human's, because anything an agent can write to make a failure disappear, it eventually will — proven three times this series                             |
| **An opt-out is configuration, not a suppression**, and a disabled capability is therefore silent in gate output                                                 | A suppression tolerates a violation that exists, so the standing reminder is the point. An opt-out asserts the class of check does not apply here, so there is no violation to be reminded of and the notice is pure noise. Visibility is the register in the diff and the audit |
| **An agent proposes an opt-out only during interactive bootstrap**                                                                                               | Bootstrap summarises what it will implement; the human names what is not relevant                                                                                                                                                                                                |
| **Unattended bootstrap implements everything**, unless the prompt itself names opt-outs                                                                          | Keeps rounds comparable; no clarifying question, which is a stated failure condition                                                                                                                                                                                             |
| **Opt-out rows are keyed on a capability**, not a check number                                                                                                   | Check numbering has already changed during development; a row that stops matching silently re-enables                                                                                                                                                                            |
| **Removing a row is the opt-back-in.** The auditor reports the gap and backfills from the plugin reference, as an uplift                                         | Reversible, and the reversal is detected rather than silent                                                                                                                                                                                                                      |
| **Gates are named, not numbered, wherever a human reads them**                                                                                                   | The standards already title them (`Gate 2 — Commit`); the output discards the name                                                                                                                                                                                               |

### What tuning is, and is not

Two things were conflated during design and must stay separate:

- **Tuning** — which tool implements a check in this repository. Derived from the
  manifests present. No human involved. The corpus already does this.
- **Opt-out** — this capability does not apply to this repository at all. A human
  decision, indexed by a register row and reasoned in the decision record that row
  cites.

There are **no stack-specific gates**. The nine gates are stack-neutral; only the
tool implementing a check varies, per
[cross-gate-rules](../standards/guardrails/cross-gate-rules.md): _"prefer the
stack's own tool where one exists."_

## The seven slices

Each slice below states its brief, what success and failure look like, and
indicative behaviour as Given/When/Then. The BDD lines are **illustrative of the
required behaviour, not a test plan** — the slice's own spec derives the real
cases.

---

### Slice 1 — Foundations: the `.guardrails/` folder, capabilities, gate names

**Brief.** Define the layout a consuming repository ends up with, the capability
vocabulary that opt-out rows and audit findings key on, and the human-facing gate
names. Everything else depends on this, so it is specified first and changes
after that are expensive.

Covers: the folder's contents and structure; its `guardrail-class` declaration;
how the ported test suite sits in it; the capability list and what each capability
spans; renaming gate output from `gate 2:` to its title; the four places gates
fire (git hooks, agent hooks, CI, by hand) as the grouping a human is given.

**Success.** A developer who clones the repository, installs its dependencies and
runs the gates gets the same result as CI, without the plugin. A capability can be
named unambiguously by a human and resolved unambiguously by a script. Gate output
names the gate.

**Failure.** A capability whose boundary is arguable — two people disagreeing
about whether a finding belongs to it. A layout that requires the plugin present
to run. Gate output a human has to consult a table to read.

```gherkin
Given a repository bootstrapped with the guardrails
When a developer clones it without the plugin installed
Then every gate runs and reports the same findings as CI

Given a finding from any check
When it is reported
Then it names both its gate title and the capability it belongs to

Given the capability list
When two people independently assign twenty real findings to capabilities
Then they agree on every one
```

**Complexity: high.** Assign to `opus`. It defines vocabulary five other slices
consume, and a vocabulary that needs revising later invalidates the rows written
against it.

---

### Slice 2 — The opt-out register

**Brief.** The register's schema, lifecycle and enforcement, and its division of
labour with the decision record each row cites. It lives in `.guardrails/`, keys
on capability, and carries a human approver.

Covers: columns and their meaning; which facts live on the row and which in the
ADR, so neither duplicates the other; how a row is proposed and by whom; the
structural enforcement that stops an agent approving its own row; what "silent
going forward" means for a disabled capability; what happens when a row is removed;
how the register interacts with the existing suppression register and
[bypass-and-exceptions](../standards/guardrails/bypass-and-exceptions.md).

**Success.** An agent cannot disable a capability alone, in any mode, by any
route. A human can, in one edit, with the reason recorded. A disabled capability
produces no findings and no noise. A removed row produces a reported gap.

**Failure.** Any sequence of agent-only commits that ends with a capability
disabled. A disabled capability that keeps reporting. A row whose removal goes
unnoticed. Approval and the row it approves arriving in the same commit.

```gherkin
Given a repository with no opt-out register
When an agent commits a register with an approver filled
Then the commit is refused

Given an agent proposes an opt-out row with a blank approver
When the pull request is opened
Then the merge is blocked until a human fills the approver

Given a capability opted out with an approved row
When any gate runs
Then that capability produces no finding and no skip message

Given an approved opt-out row is deleted
When the audit runs
Then it reports the capability as a gap awaiting backfill
```

**Complexity: high.** Assign to `opus`. The enforcement design is the part this
series got wrong repeatedly; prose forbidding an action does not prevent it.

---

### Slice 3 — The bootstrap skill

**Brief.** Rework `repository-bootstrap` so it handles a new repository and the
uplift of an existing one as first-class paths, discovers the stack and tooling
when the prompt does not state them, and references the plugin's own scripts
rather than assuming they have already been copied.

Covers: activation conditions; discovery of stack, CI platform, registry and
target operating systems from what is present, and what to do when discovery is
ambiguous; the interactive path, including the summary of guardrails to be
implemented and the opt-out conversation; the unattended path; uplift, including
what to do about existing hooks, existing CI and existing conventions that
conflict.

Note that existing-repository handling is currently **one line** in a 466-line
skill — `skills/repository-bootstrap/SKILL.md:28`, _"Sweep first, if there is
anything to sweep"_ — and the word "uplift" does not appear in it at all. It is
not a variation of the new-repository path — an existing repository has commit history,
a working CI pipeline people depend on, and conventions that predate the toolkit.

**Success.** A user adds the plugin, says "set this repository up", and gets a
compliant repository. An unattended run needs no clarifying question. An uplift
does not break the CI that was already working.

**Failure.** A clarifying question the corpus should have answered. An uplift that
replaces a working pipeline rather than extending it. Discovery that guesses
silently where it should ask, or asks where it could derive.

```gherkin
Given an empty repository and a prompt naming only the project
When bootstrap runs unattended
Then it derives the stack, implements every capability, and asks nothing

Given an existing repository with its own CI pipeline
When bootstrap runs in uplift mode
Then the existing pipeline still runs and the gates are added alongside it

Given an interactive session
When bootstrap starts
Then it summarises the capabilities it will implement before implementing them

Given a repository whose stack cannot be determined from its manifests
When bootstrap runs interactively
Then it asks; and when it runs unattended it records the ambiguity as a finding
```

**Complexity: high.** Assign to `opus`. Two modes, two repository states, and it
is the skill twenty-six rounds were spent hardening.

---

### Slice 4 — The audit skill

**Brief.** Rework `guardrail-audit` to be opt-out aware, to detect a removed row
and treat the gap as an uplift migration, and to produce a report someone can act
on without reading the corpus.

Covers: what the report contains and how it is ordered; how a capability's state
is reported (present, absent, partial, suppressed, opted out); backfill — what
"restore from the plugin reference" means concretely and how it differs from
bootstrap; running against a repository that has never seen the toolkit.

**Success.** An audit of an untouched repository produces a report whose findings
a person can work through in order. An audit of a compliant repository is quiet. A
removed opt-out row is reported with the remedy.

**Failure.** A report that lists everything and prioritises nothing. Re-raising a
finding that has an approved opt-out. Reporting a capability as absent when it is
implemented by a tool the audit did not recognise.

```gherkin
Given a repository that has never used the toolkit
When the audit runs
Then it reports each capability's state and proposes a concrete tool per gap

Given a capability with an approved opt-out row
When the audit runs
Then that capability is not reported as a gap

Given an opt-out row was deleted since the last audit
When the audit runs
Then it reports the capability as needing backfill, naming what to restore
```

**Complexity: medium.** Assign to `sonnet`. It is a rework of a skill that
substantially exists, within a scope this design fixes.

---

### Slice 5 — The harness

**Brief.** A script that drives the improvement loop mechanically, so the
scriptable parts cost no model tokens, with the roles running in the devcontainer.

Covers: what the script owns (reset, launch, wait, capture, verify, hand off) and
what stays a model's job (writing the audit brief, judging findings); how a role
is executed in the container; where artefacts land and in what shape, since slice
6 consumes them; how the script decides a run has hung, per the three-signal rule
in [the improvement loop](../prompts/toolkit-improvement-loop.md); how a round is
identified so its artefacts can be found later.

**Success.** A round runs end to end from one command. The model is invoked only
where judgement is required. A hung run is detected and reported without a human
watching it.

**Failure.** A harness that needs a model to decide what to do next at each step.
Artefacts a later round cannot locate or parse. A hang detector that kills healthy
runs, or one that never fires.

```gherkin
Given a configured round
When the harness is run with no arguments
Then it resets the subject, runs the implementer, captures CI, and stops for the audit

Given an implementer that has stopped writing output
When ten minutes pass with no file writes and CPU at the idle floor
Then the harness reports the run as hung and does not silently continue

Given a completed round
When slice 6's tuning skill looks for its artefacts
Then it finds implementer log, audit report, CI logs and final repository state at known paths
```

**Complexity: medium.** Assign to `sonnet`. Mechanical, but the artefact contract
matters because slice 6 depends on it.

---

### Slice 6 — The tuning skill

**Brief.** A skill local to this repository that reads a completed round —
implementer log, auditor output, final repository state, CI logs — and produces
the next round's changes as tracked findings, hypotheses, fixes and results.

Covers: the record's shape and where it lives; how a finding becomes a hypothesis
and what makes a hypothesis testable; how a fix's result is recorded against the
round that tested it; how a recurring finding is recognised across rounds; what
distinguishes a corpus defect from an implementer's execution defect.

The scientific framing is the point. A fix without a stated hypothesis cannot be
falsified, and this series produced several fixes whose effect nobody measured
because nobody said in advance what would change.

**Success.** Every fix traces to a finding and a hypothesis, and to the round that
confirmed or refuted it. A recurring finding is visible as recurring. Someone can
read the record and say which changes worked.

**Failure.** A record that lists what was done without saying what was expected.
Hypotheses unfalsifiable as written. A fix whose result is never recorded.

```gherkin
Given a completed round's artefacts
When the tuning skill runs
Then each finding it raises carries a hypothesis stating what the next round should show

Given a fix applied in a previous round
When the round after it completes
Then the record states whether the hypothesis held

Given a finding that has appeared in three rounds
When the tuning skill runs
Then it is reported as recurring, with the fixes already attempted against it
```

**Complexity: high.** Assign to `opus`. It is the only slice with no existing
implementation to rework, and the framing decides whether the loop compounds or
merely repeats.

---

### Slice 7 — User journeys declared, and bracketed by a failing test

**Brief.** [testing-strategy](../standards/testing-strategy.md) already requires
one given–when–then end-to-end test per user journey, and says nothing about where
the list of journeys comes from — so "every journey has a test" is satisfied by
whichever journeys someone chose to name. Journeys are declared in the spec,
closing the set, and each journey's test is written failing when implementation
starts and green when the plan completes.

Covers: what makes a journey declared rather than aspirational; what a journey
asserts beyond the product itself, at larger scope; granularity per level of
specification; declaring dependencies between specs; and the decomposition
heuristic — a journey whose test cannot be made to pass in one plan means the
spec is too large.

Specified in [slice 7](2026-08-01-distributable-guardrails-slice-7-user-journeys.md).

**Success.** A spec's journeys are a finite list. Every end-to-end test failed at
least once, before the code it exercises existed. A plan is not complete while a
journey it promised is red.

**Failure.** Journeys loose enough that no test follows from them. Journeys
written after implementation, describing what was built. A test that has only ever
passed.

```gherkin
Given a spec declaring three user journeys
When implementation starts
Then three end-to-end tests exist and all three fail

Given a spec that declares no user journeys
When it is reviewed
Then that is a finding against the spec, not against the implementation
```

**Complexity: medium.** Corpus only — the standard and the checks that read it.
The skill that helps a planning session produce journeys is a separate design,
because it hooks into planning tools this toolkit does not own and must work in a
repository with no guardrails at all.

---

## Sequencing

Slices 1 and 2 are foundational and must be specified before 3 and 4, which
consume their vocabulary. Slice 5 needs 1–4 stable, since it automates their flow.
Slice 6 needs 5's artefact contract. Slice 7 is independent of all six — it
changes the testing standard and nothing they define.

Specification may proceed in parallel where a slice's inputs are fixed by this
document. Implementation may not.

## Cross-slice acceptance journeys

Every slice above states success and failure for its own part. Nothing above
traces a journey **across** a slice boundary, and that is where the defects have
been: slice 4 asking for a contract slice 2 had already written, slice 2 built
against a file layout slice 1 superseded, and the same question about `docs/ADR/`
standing open in two slices at once until slice 1 took it.

The six journeys below are end-to-end scenarios that each traverse three or more
slices. **They are the acceptance criteria for the design as a whole** — the
cases no individual slice author could have written, because each of them sees
only one side of the seam.

### How these relate to the per-slice scenarios

**The Given/When/Then blocks under each slice above stay illustrative and are
not superseded.** They describe one slice's required behaviour, in that slice's
own terms, and the slice's spec still derives its real cases from them.

**These journeys are the testable set for the design.** Every `Then` here is
checkable by running a command or reading a named artefact; where one is not, it
has been rewritten until it is, or it is recorded as a gap. Two consequences:

- A slice's own success criteria remain that slice's acceptance criteria. No
  journey here replaces one.
- **Where a per-slice scenario and a journey disagree, the journey is right**,
  because it is the only one of the two that saw both sides of the boundary.
  The worked case: slice 2 illustrated an opt-out with _"an image scan in a
  repository that builds no image"_, and slice 1's forty-eight capabilities
  contain no image-scanning capability — the corpus has no such check — so that
  row could never have been filed. Neither document was wrong read alone; only a
  journey crossing both saw it. The illustration gave way rather than the
  vocabulary, and slice 2 now teaches the same point with `smoke-tests`.

### Reading a journey

Each step names **the slice that owns it**. A step whose Owner reads
**`— none —`** is a finding: no slice claims it, and the journey cannot be
completed as specified until one does.

Seventeen steps read that way when these journeys were first traced, and they
were the most valuable output of this section. Every one now names an owner, and
[the register below](#gaps-these-journeys-found-and-where-each-closed) records
which slice took each and where. A step here that acquires a `— none —` again is
a new finding, and it belongs in that table.

---

### J1 — The opt-out lifecycle, from plugin install to backfill

**Crosses slices 1, 2, 3 and 4.** A user adds the plugin, bootstraps a new
repository, opts out of one capability in the interactive conversation, a later
audit respects it, someone deletes the row, and the audit reports the gap.

| #   | Step                                                                                                            | Owner            | Then — checkable as written                                                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The user installs the plugin and says "set this repository up" in a git repository with one commit and a remote | Slice 3          | The transcript records mode `interactive` and state `New`, quoting the output of `git rev-list --count HEAD` and `git ls-files`                                                                                                         |
| 2   | The skill evaluates `isPopulated('.guardrails')`                                                                | Slice 1          | It reports `stub`, and names what was missing. `grep` of the skill text finds no second definition of the populated test — it imports `isPopulated` from `check-script-wiring.mjs`                                                      |
| 3   | Discovery derives stack, CI platform, registry, target operating systems and default branch                     | Slice 3          | Every discovery row in the report carries the command that produced it; re-running each command reproduces the stated value                                                                                                             |
| 4   | The skill presents one summary turn, grouped by the four firing places, carrying every discovery ambiguity      | Slice 1, slice 3 | The transcript contains exactly one question turn before the first write. Its group headings are exactly `Git hooks`, `Agent hooks`, `CI`, `Run by hand`                                                                                |
| 5   | The human names a capability that does not apply — "we ship a library; nothing is ever deployed"                | Human            | —                                                                                                                                                                                                                                       |
| 6   | The skill maps that to exactly one capability id and reads it back                                              | Slice 3          | The id is a member of `capabilities.mjs`. In the transcript, the human's turn at step 5 precedes the first occurrence of that id anywhere                                                                                               |
| 7   | The skill drafts the pair: a row with Approved by blank, and a `Proposed` decision record with no `approver`    | Slice 3, slice 2 | Both artefacts exist in one commit; `check-approval-provenance.mjs` passes on it; the record's frontmatter has no `approver` key                                                                                                        |
| 7a  | The repository has no `docs/ADR/` yet, and the `Proposed` record is the first thing to need it                  | Slice 1          | The record's own commit creates the directory; no earlier step creates it. `node .guardrails/check-adr-approver.mjs` run before that commit reports no records rather than failing on a missing directory                               |
| 8   | The skill copies `.guardrails/` from `${CLAUDE_PLUGIN_ROOT}`                                                    | Slice 1, slice 3 | `diff -r "${CLAUDE_PLUGIN_ROOT}/.guardrails" .guardrails` reports no difference in any `.mjs` file                                                                                                                                      |
| 8a  | The copy step distinguishes what is copied from what is written                                                 | Slice 3          | `README.md` is byte-identical to the plugin's. `.guardrails/opt-out-register.md` does not exist yet — it is created by the first row filed, and `diff -r` excludes it and `enforcement-map.md` and reports no other difference          |
| 9   | Gate 2 refuses a register that arrives already approved                                                         | Slice 2          | `node .guardrails/gate-2-commit.mjs` on a staged register whose Approved by is filled exits non-zero and names `check-approval-provenance.mjs`                                                                                          |
| 10  | Gate 4 measures the bootstrap commit's change size                                                              | Slice 1          | `node .guardrails/gate-4-task-completion.mjs` reports roughly 8,900 counted lines against an 800-line error band                                                                                                                        |
| 10a | That figure needs a human-approved change-size override row, and the repository has no `docs/registers/`        | Slice 3          | The run files the row with Approved by blank, creating the register on first need, and no commit message on the branch carries `[large-pr]`. Unattended, the row stays blank and the pull request stays unmergeable                     |
| 11  | The work reaches the default branch as a pull request                                                           | Slice 3          | The branch the run started on has no new commit; a pull request is open, its body carrying the report; nothing was merged                                                                                                               |
| 12  | Branch protection requires at least one approving review before the register change merges                      | Slice 3          | Host configuration is the run's last write, before the pull request exists — for a new repository and for an uplift with no protection today. Where protection already exists it is untouched, and extended after the merge on evidence |
| 13  | A human approves the pull request; it merges                                                                    | Slice 2          | `checkOptOutAdmission(range)` passes: an `APPROVED` review exists from an account that is not the author and whose login matches the Approved by cell                                                                                   |
| 14  | The capability is now disabled                                                                                  | Slice 2          | `git show origin/HEAD:.guardrails/opt-out-register.md` contains the row, and `disabledCapabilities()` returns a set containing the id                                                                                                   |
| 15  | A developer who never saw the pull request runs the gates                                                       | Slice 1, slice 2 | Gate output is byte-identical to the same run in a fixture repository that never named the capability — no finding, no `SKIP`, no timing, no header line                                                                                |
| 16  | The audit runs                                                                                                  | Slice 4          | The capability appears exactly once, in the evidence appendix, as `Opted out <capability> — register row <path>, ADR-nnnn, approver <name>`, and nowhere in the actionable section                                                      |
| 17  | Someone deletes the row and merges the deletion                                                                 | Slice 2          | No approval is required; the merge succeeds with the register change and no review of the row                                                                                                                                           |
| 18  | The next audit reads `removedOptOutRows(origin/HEAD)`                                                           | Slice 2, slice 4 | It returns one entry carrying `capability`, `filed`, `approvedBy`, `decisionRecord`, `removedIn`, `removedAt`                                                                                                                           |
| 19  | The audit reports it                                                                                            | Slice 4          | The finding's State is `Backfill needed`, it ranks above every Tier-2 `Absent` finding in the same report, and its Fix field is a concrete path under `.guardrails/` — not "propose a tool"                                             |
| 20  | Someone performs the backfill                                                                                   | Slice 4          | An audit run never backfills; the Backfill-needed finding is the ask, and a request to restore that capability is a second invocation of the audit skill, which restores exactly the paths the finding named                            |

```gherkin
Given a new repository bootstrapped interactively with one capability opted out
  and the row merged to the protected default branch
When any gate runs on a developer's clone
Then its output is byte-identical to the same gate run in a repository where
  that capability was never named

Given the same repository, and the approved row deleted on the default branch
When the audit runs
Then the capability is reported as Backfill needed, ranked above every ordinary
  Absent finding, naming who approved the row, when it was filed, the record it
  cited, and the exact path to restore
```

### J2 — The round loop

**Crosses slices 5 and 6, and exercises slice 3 as the thing under measurement.**
The harness resets the subject, the implementer runs, CI is captured, the auditor
reports, the tuning skill records a finding and a hypothesis, and the next round
confirms or refutes it.

| #   | Step                                                                                                                     | Owner            | Then — checkable as written                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `node eval/harness.mjs round` deletes and recreates the subject                                                          | Slice 5          | The subject's `git rev-list --count HEAD` is 0, or the repository is absent, before anything is launched                                                                                                                         |
| 2   | The prompt is rendered and the round identified                                                                          | Slice 5          | `roundId` is `<sha256(renderedPrompt)[0:12]>-<seq>`; `seq` is one past the highest existing `eval/rounds/<seriesId>-*/`; no counter file exists                                                                                  |
| 3   | The implementer runs slice 3's bootstrap unattended, in an ephemeral container, subject read-write and toolkit read-only | Slice 5          | `docker inspect` on the container shows exactly two mounts with those modes; the container is absent after the role exits                                                                                                        |
| 4   | The hang detector runs                                                                                                   | Slice 5          | Against a fixture that sleeps eleven minutes: `hang.json` written, `status: "hung"`, no CI capture attempted. Against a fixture writing many small files at idle CPU: no hang declared                                           |
| 5   | The implementer's pull request is detected and CI polled to a conclusion                                                 | Slice 5          | `implementer/pr.json` is non-null and `ci/run-*.log` is non-empty and was fetched from a job-log command, not the annotations endpoint                                                                                           |
| 5a  | Verify requires a pull request, and bootstrap now opens one                                                              | Slice 3, slice 5 | Slice 3's run ends at an open pull request in both modes, so `pr.json` is non-null for a completed implementer and slice 5's verify passes on the same fact it was already reading                                               |
| 6   | Hand-off prints the round id, the artefact root and the auditor command                                                  | Slice 5          | The round command's own transcript ends there; `roles.auditor.status` is `not-started`                                                                                                                                           |
| 7   | A model writes the brief; `run-role auditor` runs against it                                                             | Model, slice 5   | `auditor/brief.md` is byte-identical to the file the model wrote; both mounts are read-only                                                                                                                                      |
| 8   | The auditor's report carries a per-finding defect classification                                                         | Slice 6          | Every finding block ends with a line reading exactly `Defect class: corpus` or `Defect class: execution`; the audit brief carries that requirement verbatim. Slice 6 fixes the form because it is the only slice that parses it  |
| 9   | The tuning skill reads the manifest and guards the series                                                                | Slice 6          | It refuses to proceed when `series.id` differs from the series the open findings were filed under                                                                                                                                |
| 9a  | A rotation is refused rather than taken silently                                                                         | Slice 5          | Against a fixture holding rounds of one series and a prompt rendering to another, `round` exits without resetting the subject and names both ids; `--new-series` is the only thing that starts one                               |
| 10  | Each audit finding is resolved to an existing id or opens a new file, keyed on capability                                | Slice 6          | `Checked against` is non-empty on every file — an id list or the literal `none-open-for-this-key`                                                                                                                                |
| 10a | Findings key on capability, and gate output is a named artefact                                                          | Slice 5, slice 1 | `manifest.json`'s `gateOutput[]` names `subject-final/gate-7.log`, captured verbatim from the subject's own on-demand gate; every result line in it carries a capability id, including for a tool an uplift kept                 |
| 11  | A hypothesis is written and committed before the fix exists                                                              | Slice 6          | Artefact, Observation and Refutation are all non-empty; the hypothesis commit is an ancestor of the next round's manifest `toolkit.headSha`                                                                                      |
| 12  | The fix is applied by a separate session, and the next round runs                                                        | Slice 6, slice 5 | The new round's `series.id` equals the previous round's                                                                                                                                                                          |
| 13  | The tuning skill settles the hypothesis before raising anything new                                                      | Slice 6          | The prior round section carries `Confirmed`, `Refuted` or `Not measured` with a reason, quoting the line from the artefact the hypothesis named                                                                                  |
| 13a | The settle-before-next-round rule is enforced before a round                                                             | Slice 5, slice 6 | `eval/harness.mjs round` runs `check-ledger.mjs` as a precondition and stops before the reset on an unsettled fix. Same script as gate 7's, second caller; `--ignore-ledger` overrides and the manifest records that it was used |
| 14  | The index is regenerated                                                                                                 | Slice 6          | `docs/tuning/README.md` matches what the finding files generate, and shows one row per fix attempt with its remedy kind and result                                                                                               |

```gherkin
Given two consecutive rounds run against an unedited prompt template
When the tuning skill runs after the second
Then every Fix recorded in the first round's sections carries a Result quoting a
  line from an artefact named in the second round's manifest.json

Given a round the harness declared hung
When the tuning skill settles the hypotheses predicted for it
Then every one reads "Not measured", with the manifest's hung status as the
  stated reason, and none reads "Confirmed"
```

### J3 — Uplift of a repository with its own working CI

**Crosses slices 1, 2, 3 and 4.** The failure this journey is written against is
an uplift that succeeds and is then reported as non-compliant by the audit that
follows it.

| #   | Step                                                                                                               | Owner   | Then — checkable as written                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The survey runs read-only and captures the default branch's current CI verdict before the first write              | Slice 3 | The report quotes the baseline conclusion and the command that read it; `git status --porcelain` output is unchanged across the survey                                                                                              |
| 2   | The repository uses lefthook; the gates are invoked from it                                                        | Slice 3 | `git config --get core.hooksPath` returns the same value before and after; the diff adds no `.husky/` directory and no second hook manager                                                                                          |
| 2a  | The class declaration names this repository's own hook manager                                                     | Slice 1 | `git check-attr guardrail-class -- lefthook.yml` returns `configuration`; no pattern names `.husky/`. The two `.guardrails/**` patterns are identical in every repository, and the hook-manager pattern is discovered by the survey |
| 3   | A divergent conflict is resolved by adapting to the repository's mechanism, in its own syntax                      | Slice 3 | The gates fire from lefthook. No `.guardrails/*.mjs` file differs from the plugin reference                                                                                                                                         |
| 3a  | A divergent adaptation may not modify a copied file                                                                | Slice 3 | Adaptation is written in the repository's own mechanism's configuration. `diff -r` against the plugin reference reports no difference in any copied file, which is what keeps slice 4's comparison a file comparison                |
| 4   | A contradictory conflict — a release workflow publishing untagged from the default branch — is raised, not settled | Slice 3 | The workflow diff is empty. A suppression register row exists quoting the workflow, with the approver blank. No opt-out row is filed                                                                                                |
| 4a  | The suppression row's Path cell holds the file whose content carries the deviation                                 | Slice 3 | The row is filed at `.github/workflows/release.yml`, quoting the job. A deviation with no tracked file is not filed here at all — gate 7 reports it on every run, so nothing is being silenced                                      |
| 5   | Gates are added change-scoped; the pre-existing violations land at gate 7                                          | Slice 3 | The default branch's CI conclusion after the merge equals the baseline captured at step 1. Gate 7's own output carries a count, quoted into the uplift report                                                                       |
| 6   | Protection is extended only on evidence                                                                            | Slice 3 | For every required status check after uplift, at least one successful run on the default branch predates the protection change                                                                                                      |
| 7   | The audit runs and finds the capabilities the repository already met                                               | Slice 4 | Each is `Present`, and the appendix line names the tool taken from its own refusal output — not from a list of expected names                                                                                                       |
| 8   | The audit reaches a capability bootstrap tuned out with evidence                                                   | Slice 4 | It reports **Tuned out**, from the enforcement map row, having re-run that row's own `Derived from` command and seen the fact still hold. One line in the evidence appendix, nothing in the actionable section                      |
| 8a  | The consequence, stated at journey level                                                                           | Slice 4 | A successful uplift's very next audit has an empty actionable section. Where a recorded derivation no longer reproduces, that is one **Stale tuning** finding quoting the command's new output — actionable, and true               |

```gherkin
Given a repository with a green pipeline, lefthook, and a release workflow that
  publishes untagged from the default branch
When bootstrap runs in uplift mode and the audit runs after it merges
Then the pipeline's conclusion is unchanged, core.hooksPath is unchanged, the
  workflow diff is empty, a suppression row quotes it with a blank approver, and
  every capability the repository already met reports Present naming its own tool
```

### J4 — A developer clones without the plugin

**Crosses slices 1, 2 and 3.** This is the design's first decision, tested as a
journey rather than as a layout property.

| #   | Step                                                                                 | Owner            | Then — checkable as written                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A developer with no plugin clones, installs dependencies, and runs each gate by hand | Slice 1          | Each gate's finding set on a given commit equals CI's finding set on the same commit                                                                                                                                        |
| 2   | Nothing under `.guardrails/` reaches outside it                                      | Slice 1          | A test walking every `import` statement under `.guardrails/` finds only `./name.mjs` siblings and Node built-ins                                                                                                            |
| 3   | Nothing committed resolves through the plugin                                        | Slice 3          | `git grep CLAUDE_PLUGIN_ROOT` over the consuming repository returns nothing                                                                                                                                                 |
| 4   | Git hooks fire — Commit, Commit message, Push                                        | Slice 1, slice 3 | Each hook file is one line invoking `.guardrails/`; a staged violation is refused with no plugin installed                                                                                                                  |
| 5   | Agent hooks fire — Edit, Task completion                                             | Slice 1, slice 3 | A declaration exists for every harness the survey found in use — or, where it found none, for the harness the session ran in — invoking both gate entry points repository-relative. Criterion 9 fails a run that wrote none |
| 6   | An approved opt-out is in effect, and the developer's gate run respects it           | Slice 2          | `disabledCapabilities()` reads `git show origin/HEAD:.guardrails/opt-out-register.md` and returns the id; the capability contributes no line                                                                                |
| 6a  | The same read in CI, where `origin/HEAD` is commonly unset on a shallow checkout     | Slice 3          | Every workflow job that runs a gate resolves `git symbolic-ref refs/remotes/origin/HEAD` after checkout, so the reader resolves the same register CI's developers do and neither run diverges from the other                |

```gherkin
Given a repository with one approved opt-out on its protected default branch
When the same commit is gated on a developer's full clone and in CI
Then both runs produce the same finding set, and neither names the opted-out
  capability
```

### J5 — A capability implemented by a tool the toolkit did not choose

**Crosses slices 1, 3, 4 and 6.** The rule "a tool that meets the standard is not
a finding" survives everywhere it is stated; what no slice states is what happens
to that tool's **output**.

| #   | Step                                                                                      | Owner            | Then — checkable as written                                                                                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Uplift finds a repository-local script that meets `secret-scanning` in full, and keeps it | Slice 3          | The diff adds no second secret-scanning tool. The existing script is unmodified                                                                                                                                                                   |
| 2   | The mapping is recorded                                                                   | Slice 1, slice 3 | `.guardrails/enforcement-map.md` carries one row per capability — what implements it here, and the command that was derived from. Slice 1 defines the columns; slice 3 writes it from discovery; slice 4 re-derives each row before relying on it |
| 3   | The audit probes behaviourally and names the tool from the refusal itself                 | Slice 4          | Against a fixture whose secret scanning is an unrecognised local script: state is `Present`, and the appendix line names that script, sourced from its own refusal output                                                                         |
| 4   | The kept tool's findings carry a capability id, in slice 1's line format                  | Slice 1          | The gate entry point invokes the kept tool and writes the result line itself, naming the tool as it names itself and quoting its output as the problem. A tool no gate invokes emits nothing in this format and is Partial at best                |
| 5   | Slice 6 keys a tuning finding on the capability that tool defends                         | Slice 1, slice 6 | Follows from row 4: the id is present for a kept tool exactly as for any other, and `check-ledger.mjs`'s membership row therefore fires on an invented id rather than on a wrapping that never happened                                           |

```gherkin
Given an uplifted repository whose secret scanning is a local script no
  reference table names
When the audit runs
Then the capability reports Present, the appendix names that script, and the
  script's own refusal output is quoted as the evidence
```

### J6 — The toolkit under its own guardrails

**Crosses slices 1, 3, 4, 5 and 6.** The repository that is simultaneously the
subject and the reference.

| #   | Step                                                                                               | Owner                     | Then — checkable as written                                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Bootstrap is invoked here and stops                                                                | Slice 3                   | It reports the `isToolkit()` result and stops. The stop and its reason are in the transcript; nothing is written                                                                                                   |
| 2   | The class declaration differs by repository                                                        | Slice 1                   | `git check-attr guardrail-class -- .guardrails/lib.mjs` returns `production` here and `tooling` in a consumer fixture                                                                                              |
| 3   | The three never-received locations are classed and wired here                                      | Slice 1, slice 5, slice 6 | `.claude/**` is `agent-context`; `node .guardrails/check-script-wiring.mjs` reports zero unwired across `.guardrails/`, `scripts/configure-*.mjs`, `.claude/skills/**/*.mjs` and `eval/*.mjs`                      |
| 3a  | The wiring check can actually fail                                                                 | Slice 1                   | Add one unwired `.mjs` under each of the four locations: the check reports four findings and exits non-zero                                                                                                        |
| 4   | The audit's drift comparison runs against the toolkit                                              | Slice 4                   | The Layout section reports `Unknown`, reason `subject is the reference`, on the `isToolkit()` signal. It does not report every file clean, which is what comparing a directory with itself would otherwise produce |
| 5   | The toolkit's own `.guardrails/opt-out-register.md` is both its live register and a reference file | Slice 3                   | The copy step copies it to nobody. A consumer's register is created by the first row filed there, so no row of the toolkit's can arrive in one                                                                     |

```gherkin
Given a session whose working directory is this toolkit
When repository-bootstrap is invoked
Then it reports the isToolkit() result, stops, and the working tree is unchanged
```

---

### Gaps these journeys found, and where each closed

Seventeen steps above had no owner when these journeys were first traced. Each
sat on a seam between slices drafted in parallel, and every one is now specified
in a slice — **not by adding capability, but by naming the step and who takes
it.** The table is kept rather than deleted: a gap and the slice that absorbed it
are harder to re-argue later than a gap that quietly disappeared.

**All nineteen gaps are closed.** A step that acquires `— none —` again is a new
finding and belongs in this table beside its journey row. Seventeen were found by
the journeys; G18 and G19 were raised afterwards by reviewing slice 6's
requirements on slice 5 against slice 5's own scope, and both are owned by slice
5 — a requirement one slice makes of another is settled by widening the
providing slice, not by the depending slice quietly dropping what it needs.

| Gap | Journey                   | What no slice owned                                                                                                                                                                                                                                | Owner            | Closed by                                                                                                                                                                                              |
| --- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G1  | J1 row 11, J2 row 5a      | **Bootstrap never opens a pull request.** Slice 2's entire enforcement depends on one existing                                                                                                                                                     | Slice 3          | [How the work lands](2026-08-01-distributable-guardrails-slice-3-bootstrap-skill.md#how-the-work-lands) — seven ordered steps ending at an open pull request, plus criterion 14                        |
| G2  | J1 row 20                 | **Backfill is reported by nobody who performs it**                                                                                                                                                                                                 | Slice 4          | [Who performs the backfill](2026-08-01-distributable-guardrails-slice-4-audit-skill.md#who-performs-the-backfill) — the audit does, on a second invocation, never inside an audit run                  |
| G3  | J1 row 7a                 | **Creating `docs/ADR/` in a repository that has none**                                                                                                                                                                                             | Slice 1          | Closed before this pass — created on first need, stated once in slice 1 and cited by slices 2, 3 and 4                                                                                                 |
| G4  | J1 row 8a, J6 row 5       | **Whether `opt-out-register.md` and `README.md` are copied**                                                                                                                                                                                       | Slice 3          | [What bootstrap copies, and what it writes](2026-08-01-distributable-guardrails-slice-3-bootstrap-skill.md#what-bootstrap-copies-and-what-it-writes) — the README copied, the register never           |
| G5  | J1 row 10a                | **The bootstrap commit's change-size override**, with no `docs/registers/` and no human unattended                                                                                                                                                 | Slice 3          | [The change-size override row](2026-08-01-distributable-guardrails-slice-3-bootstrap-skill.md#the-change-size-override-row) — filed blank, register created on first need, no marker applied           |
| G6  | J1 row 12                 | **Whether host configuration precedes or follows the bootstrap commit**                                                                                                                                                                            | Slice 3          | [When host configuration runs](2026-08-01-distributable-guardrails-slice-3-bootstrap-skill.md#when-host-configuration-runs) — three cases, decided by what protection already exists                   |
| G7  | J2 row 8 (slice 6's R9)   | **Where the auditor's defect classification appears** in its report                                                                                                                                                                                | Slice 6          | [Where the classification appears](2026-08-01-distributable-guardrails-slice-6-tuning-skill.md#where-the-classification-appears-in-the-report) — one fixed line, and the brief line asking for it      |
| G8  | J2 row 9a                 | **Slice 5 rotates the series silently; slice 6 stops on a rotation**                                                                                                                                                                               | Slice 5          | [A series never rotates silently](2026-08-01-distributable-guardrails-slice-5-harness.md#a-series-never-rotates-silently) — its question 5, answered: refuse unless `--new-series`                     |
| G9  | J2 row 10a (slice 6's R7) | **Gate output is not a named artefact**                                                                                                                                                                                                            | Slice 5          | `subject-final/gate-7.log`, captured verbatim after the implementer exits and named in the manifest's `gateOutput[]`                                                                                   |
| G10 | J2 row 13a                | **Nothing enforces the settle-before-next-round rule**                                                                                                                                                                                             | Slice 5          | [Preconditions](2026-08-01-distributable-guardrails-slice-5-harness.md#preconditions-before-the-subject-is-touched) — slice 6's own check, run before the reset rather than at gate 7                  |
| G11 | J3 rows 8, 8a             | **A tuned-out capability reports Absent**, so a successful uplift is never quiet                                                                                                                                                                   | Slice 4          | Its question 1, answered by the readable derived fact — **Tuned out** and **Stale tuning**, both re-derived from the enforcement map on every audit                                                    |
| G12 | J3 row 4a                 | **A suppression row for a deviation that is not at a path**                                                                                                                                                                                        | Slice 3          | Its question 4, answered without a standards change — the file whose content carries the deviation is the path, and a deviation in no file is not filed at all                                         |
| G13 | J3 rows 2a, 3a            | **The `.gitattributes` declaration and the divergence rule when the hook manager is not husky**                                                                                                                                                    | Slice 1, slice 3 | Slice 1's class rule names the manager generically; slice 3 states that a divergent adaptation never edits a copied file                                                                               |
| G14 | J4 row 5                  | **Agent-hook wiring in the consumer**                                                                                                                                                                                                              | Slice 3          | [The agent-hook declaration](2026-08-01-distributable-guardrails-slice-3-bootstrap-skill.md#the-agent-hook-declaration), and a non-vacuous form of criterion 9                                         |
| G15 | J4 row 6a                 | **`origin/HEAD` in a CI checkout**                                                                                                                                                                                                                 | Slice 3          | [The CI checkout resolves the default branch](2026-08-01-distributable-guardrails-slice-3-bootstrap-skill.md#the-ci-checkout-resolves-the-default-branch)                                              |
| G16 | J5 rows 2, 4, 5           | **The enforcement map does not exist**, and a kept third-party tool's output carries no capability id                                                                                                                                              | Slice 1, slice 3 | Slice 1 defines [the map](2026-08-01-distributable-guardrails-slice-1-foundations.md#the-enforcement-map) and the wrapping rule in its output format; slice 3 writes it; slices 4 and 6 read it        |
| G17 | J6 row 4                  | **The drift comparison against the toolkit itself cannot fail**                                                                                                                                                                                    | Slice 4          | The Layout section reports `Unknown` with `subject is the reference` as its reason, on the `isToolkit()` signal                                                                                        |
| G18 | Slice 6 R10               | **The fix brief and its dispatch are captured by nobody.** Slice 6's findings cite what was dispatched; slice 5's hand-off prints the next command, but its scope leaves writing the fix brief to a model, and its layout has no fixer directory   | Slice 5          | Slice 5 captures the dispatched fix brief as a round artefact. Writing it stays a model's job; recording what was dispatched does not, because a citation pointing outside the round cannot be re-read |
| G19 | Slice 6 R8                | **Manifest immutability is unstated.** Slice 6's findings are ordered by a manifest a later rewrite would alter; slice 5 writes the manifest and updates it through the round, and does not state that the completed manifest is frozen afterwards | Slice 5          | Slice 5 states that a manifest is frozen once its round reaches a terminal status. A manifest that can change afterwards makes every result citing it unverifiable                                     |

**Two closes changed a slice's own answer rather than adding to it**, and read as
decisions rather than as fill-in: slice 5 now refuses a series rotation it
previously took silently (G8), and slice 4 gains two reported states where it
previously had only Absent (G11). Both were forced by a journey seeing two sides
at once, which is what this section is for.

**Three closes are load-bearing for a journey rather than cosmetic.** G1 gives
slice 2's enforcement the artefact it rests on — without a pull request, nothing
can ever be opted out. G8 and G10 were a deadlock between two correct defaults:
one slice rotating a series silently, the other refusing to start a round with an
unsettled result. G16 gives a kept third-party tool's output a capability id, so
the audit and the tuning record can key on it at all.

## Out of scope

- Changing the nine gates, their order, or what they check
- New gates or capabilities beyond those the corpus already has
- Any change to the standards' content, except gate naming in output and the
  capability catalogue slice 1 adds at `docs/standards/guardrails/capabilities.md`
- Publishing the plugin to a marketplace or registry
- Multi-repository or organisation-wide rollout

**Why the catalogue is the one exception.** Slice 1's vocabulary needs two
artefacts — a machine-readable id list and a human-readable statement of what
each capability spans — and the second is a standards document by every test
this corpus applies: it is prose a person consults to decide what a row means.
Writing it anywhere else would put the definitive account of the vocabulary
outside the corpus that defines everything else it keys on. The exception is
this document and nothing beyond it: the catalogue records what the corpus
already checks, in the corpus's own terms, and adds no gate, no check and no
threshold. A slice that wants to change any _other_ standard's content is still
out of scope, and slice 2's `bypass-and-exceptions.md` amendment, slice 3's
`agent-integration.md` carve-out for an interactive session, and slice 6's
`docs-style.md` class row are all correctly outside this line.

Each is identified by the slice that needs it and tracked as a follow-on. That
is the point of naming them: an amendment a slice silently assumes is an
amendment nobody schedules, and the slice then ships against a standard that
still says the opposite.
