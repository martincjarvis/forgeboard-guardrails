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

Specified in [slice 7](2026-08-01-slice-7-user-journeys.md).

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
  There is already one such case: slice 2 illustrates an opt-out with _"an image
  scan in a repository that builds no image"_, and slice 1's forty-eight
  capabilities contain no image-scanning capability — the corpus has no such
  check — so that row cannot be filed. The illustration is wrong, not the
  vocabulary.

### Reading a journey

Each step names **the slice that owns it**. A step whose Owner reads
**`— none —`** is a finding: no slice claims it, and the journey cannot be
completed as specified until one does. Those are collected in
[the gap register](#gaps-no-slice-owns-these) below and are the most valuable output of
this section.

---

### J1 — The opt-out lifecycle, from plugin install to backfill

**Crosses slices 1, 2, 3 and 4.** A user adds the plugin, bootstraps a new
repository, opts out of one capability in the interactive conversation, a later
audit respects it, someone deletes the row, and the audit reports the gap.

| #   | Step                                                                                                                                                      | Owner            | Then — checkable as written                                                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The user installs the plugin and says "set this repository up" in a git repository with one commit and a remote                                           | Slice 3          | The transcript records mode `interactive` and state `New`, quoting the output of `git rev-list --count HEAD` and `git ls-files`                                                                                              |
| 2   | The skill evaluates `isPopulated('.guardrails')`                                                                                                          | Slice 1          | It reports `stub`, and names what was missing. `grep` of the skill text finds no second definition of the populated test — it imports `isPopulated` from `check-script-wiring.mjs`                                           |
| 3   | Discovery derives stack, CI platform, registry, target operating systems and default branch                                                               | Slice 3          | Every discovery row in the report carries the command that produced it; re-running each command reproduces the stated value                                                                                                  |
| 4   | The skill presents one summary turn, grouped by the four firing places, carrying every discovery ambiguity                                                | Slice 1, slice 3 | The transcript contains exactly one question turn before the first write. Its group headings are exactly `Git hooks`, `Agent hooks`, `CI`, `Run by hand`                                                                     |
| 5   | The human names a capability that does not apply — "we ship a library; nothing is ever deployed"                                                          | Human            | —                                                                                                                                                                                                                            |
| 6   | The skill maps that to exactly one capability id and reads it back                                                                                        | Slice 3          | The id is a member of `capabilities.mjs`. In the transcript, the human's turn at step 5 precedes the first occurrence of that id anywhere                                                                                    |
| 7   | The skill drafts the pair: a row with Approved by blank, and a `Proposed` decision record with no `approver`                                              | Slice 3, slice 2 | Both artefacts exist in one commit; `check-approval-provenance.mjs` passes on it; the record's frontmatter has no `approver` key                                                                                             |
| 7a  | The repository has no `docs/ADR/` yet, and the `Proposed` record is the first thing to need it                                                            | Slice 1          | The record's own commit creates the directory; no earlier step creates it. `node .guardrails/check-adr-approver.mjs` run before that commit reports no records rather than failing on a missing directory                    |
| 8   | The skill copies `.guardrails/` from `${CLAUDE_PLUGIN_ROOT}`                                                                                              | Slice 1, slice 3 | `diff -r "${CLAUDE_PLUGIN_ROOT}/.guardrails" .guardrails` reports no difference in any `.mjs` file                                                                                                                           |
| 8a  | **The copy contract names `.guardrails/<name>.mjs` only.** `README.md` and `opt-out-register.md` are in slice 1's layout and in neither slice's copy step | **`— none —`**   | Copying the plugin's `opt-out-register.md` verbatim imports the toolkit's own rows into the consumer. No slice states whether the register arrives empty, as a template, or is created on first use                          |
| 9   | Gate 2 refuses a register that arrives already approved                                                                                                   | Slice 2          | `node .guardrails/gate-2-commit.mjs` on a staged register whose Approved by is filled exits non-zero and names `check-approval-provenance.mjs`                                                                               |
| 10  | Gate 4 measures the bootstrap commit's change size                                                                                                        | Slice 1          | `node .guardrails/gate-4-task-completion.mjs` reports roughly 8,900 counted lines against an 800-line error band                                                                                                             |
| 10a | **That figure needs a human-approved change-size override row, and the repository has no `docs/registers/`**                                              | **`— none —`**   | Slice 1 states the requirement, slice 3 asks about it in its question 6, neither creates the register or resolves the block. In the unattended path there is no human to approve it either — see journey J2, the round loop  |
| 11  | The work reaches the default branch as a pull request                                                                                                     | **`— none —`**   | Slice 2's entire enforcement is "a row reaches the protected branch only through a pull request carrying an approving review". Slice 3 never mentions a branch, a pull request or a merge; its criteria stop at the diff     |
| 12  | Branch protection requires at least one approving review before the register change merges                                                                | **`— none —`**   | Slice 2 blocks the merge when `required_approving_review_count` is below 1. Slice 3 runs `configure-branch-protection.mjs` "once during setup" without stating whether that precedes or follows the bootstrap commit         |
| 13  | A human approves the pull request; it merges                                                                                                              | Slice 2          | `checkOptOutAdmission(range)` passes: an `APPROVED` review exists from an account that is not the author and whose login matches the Approved by cell                                                                        |
| 14  | The capability is now disabled                                                                                                                            | Slice 2          | `git show origin/HEAD:.guardrails/opt-out-register.md` contains the row, and `disabledCapabilities()` returns a set containing the id                                                                                        |
| 15  | A developer who never saw the pull request runs the gates                                                                                                 | Slice 1, slice 2 | Gate output is byte-identical to the same run in a fixture repository that never named the capability — no finding, no `SKIP`, no timing, no header line                                                                     |
| 16  | The audit runs                                                                                                                                            | Slice 4          | The capability appears exactly once, in the evidence appendix, as `Opted out <capability> — register row <path>, ADR-nnnn, approver <name>`, and nowhere in the actionable section                                           |
| 17  | Someone deletes the row and merges the deletion                                                                                                           | Slice 2          | No approval is required; the merge succeeds with the register change and no review of the row                                                                                                                                |
| 18  | The next audit reads `removedOptOutRows(origin/HEAD)`                                                                                                     | Slice 2, slice 4 | It returns one entry carrying `capability`, `filed`, `approvedBy`, `decisionRecord`, `removedIn`, `removedAt`                                                                                                                |
| 19  | The audit reports it                                                                                                                                      | Slice 4          | The finding's State is `Backfill needed`, it ranks above every Tier-2 `Absent` finding in the same report, and its Fix field is a concrete path under `.guardrails/` — not "propose a tool"                                  |
| 20  | Someone performs the backfill                                                                                                                             | **`— none —`**   | The decision table above says "the auditor reports the gap **and backfills**". Slice 4 implements the reporting half only. Slice 3's activation table routes a single-capability restore to slice 4; slice 4 never claims it |

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

| #   | Step                                                                                                                     | Owner            | Then — checkable as written                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `node eval/harness.mjs round` deletes and recreates the subject                                                          | Slice 5          | The subject's `git rev-list --count HEAD` is 0, or the repository is absent, before anything is launched                                                                                                                                        |
| 2   | The prompt is rendered and the round identified                                                                          | Slice 5          | `roundId` is `<sha256(renderedPrompt)[0:12]>-<seq>`; `seq` is one past the highest existing `eval/rounds/<seriesId>-*/`; no counter file exists                                                                                                 |
| 3   | The implementer runs slice 3's bootstrap unattended, in an ephemeral container, subject read-write and toolkit read-only | Slice 5          | `docker inspect` on the container shows exactly two mounts with those modes; the container is absent after the role exits                                                                                                                       |
| 4   | The hang detector runs                                                                                                   | Slice 5          | Against a fixture that sleeps eleven minutes: `hang.json` written, `status: "hung"`, no CI capture attempted. Against a fixture writing many small files at idle CPU: no hang declared                                                          |
| 5   | The implementer's pull request is detected and CI polled to a conclusion                                                 | Slice 5          | `implementer/pr.json` is non-null and `ci/run-*.log` is non-empty and was fetched from a job-log command, not the annotations endpoint                                                                                                          |
| 5a  | **Verify requires a pull request that no slice says bootstrap opens**                                                    | **`— none —`**   | Slice 5's verify step fails the round when `pr.json` is null for a completed implementer. Slice 3 never specifies opening one — the same missing step as journey J1 row 11, reached from the other side                                         |
| 6   | Hand-off prints the round id, the artefact root and the auditor command                                                  | Slice 5          | The round command's own transcript ends there; `roles.auditor.status` is `not-started`                                                                                                                                                          |
| 7   | A model writes the brief; `run-role auditor` runs against it                                                             | Model, slice 5   | `auditor/brief.md` is byte-identical to the file the model wrote; both mounts are read-only                                                                                                                                                     |
| 8   | The auditor's report carries a per-finding defect classification                                                         | **`— none —`**   | Slice 6 records this as its own R9 gap. Nothing in slice 5 or in the loop's brief template fixes **where** `corpus` or `execution` appears in the report, so step 10 cannot read it                                                             |
| 9   | The tuning skill reads the manifest and guards the series                                                                | Slice 6          | It refuses to proceed when `series.id` differs from the series the open findings were filed under                                                                                                                                               |
| 9a  | **Slice 5 rotates the series silently; slice 6 treats a rotation as a stop**                                             | **`— none —`**   | Slice 5's question 5 keeps auto-derivation as the default. A one-character prompt edit therefore strands every open finding with no result, and slice 6's "a round does not start while a fix has no Result" then blocks every subsequent round |
| 10  | Each audit finding is resolved to an existing id or opens a new file, keyed on capability                                | Slice 6          | `Checked against` is non-empty on every file — an id list or the literal `none-open-for-this-key`                                                                                                                                               |
| 10a | **Findings key on capability, and gate output is not a named artefact**                                                  | **`— none —`**   | Slice 6 records this as its own R7 gap. The skill parses capability ids out of a session transcript, so `check-ledger.mjs`'s "Capability absent from `capabilities.mjs`" row fires on a parse failure as readily as on a real defect            |
| 11  | A hypothesis is written and committed before the fix exists                                                              | Slice 6          | Artefact, Observation and Refutation are all non-empty; the hypothesis commit is an ancestor of the next round's manifest `toolkit.headSha`                                                                                                     |
| 12  | The fix is applied by a separate session, and the next round runs                                                        | Slice 6, slice 5 | The new round's `series.id` equals the previous round's                                                                                                                                                                                         |
| 13  | The tuning skill settles the hypothesis before raising anything new                                                      | Slice 6          | The prior round section carries `Confirmed`, `Refuted` or `Not measured` with a reason, quoting the line from the artefact the hypothesis named                                                                                                 |
| 13a | **Nothing enforces "a round does not start while a previous round's fix has no Result"**                                 | **`— none —`**   | `check-ledger.mjs` is wired at the toolkit's gate 7. `eval/harness.mjs round` never consults the ledger. The rule slice 6 calls structurally impossible is prose only, and closing it is one precondition in slice 5's round command            |
| 14  | The index is regenerated                                                                                                 | Slice 6          | `docs/tuning/README.md` matches what the finding files generate, and shows one row per fix attempt with its remedy kind and result                                                                                                              |

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

| #   | Step                                                                                                               | Owner          | Then — checkable as written                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The survey runs read-only and captures the default branch's current CI verdict before the first write              | Slice 3        | The report quotes the baseline conclusion and the command that read it; `git status --porcelain` output is unchanged across the survey                                                                                                    |
| 2   | The repository uses lefthook; the gates are invoked from it                                                        | Slice 3        | `git config --get core.hooksPath` returns the same value before and after; the diff adds no `.husky/` directory and no second hook manager                                                                                                |
| 2a  | **Slice 1's `.gitattributes` template names `.husky/**`, which this repository does not have**                     | **`— none —`** | Nothing states what the `guardrail-class` declaration says when the hook manager is not husky. The `file-classification` capability keys on a path that does not exist here                                                               |
| 3   | A divergent conflict is resolved by adapting to the repository's mechanism, in its own syntax                      | Slice 3        | The gates fire from lefthook. No `.guardrails/*.mjs` file differs from the plugin reference                                                                                                                                               |
| 3a  | **No slice says whether a divergent adaptation may modify a copied file**                                          | **`— none —`** | If it may, slice 4 reports the file `Diverged` and explicitly refuses to say whether that is tuning or a missed upgrade — a permanent unresolvable line the design's own conflict resolution manufactured                                 |
| 4   | A contradictory conflict — a release workflow publishing untagged from the default branch — is raised, not settled | Slice 3        | The workflow diff is empty. A suppression register row exists quoting the workflow, with the approver blank. No opt-out row is filed                                                                                                      |
| 4a  | **The suppression register is keyed on rule and path, and a workflow job's behaviour is neither**                  | **`— none —`** | Slice 3 raises it as its question 4. Slice 2 declines it (there is a violation, so it is not an opt-out). Slice 4 reads the row but does not define it. The standard that would fix it is out of scope for every slice                    |
| 5   | Gates are added change-scoped; the pre-existing violations land at gate 7                                          | Slice 3        | The default branch's CI conclusion after the merge equals the baseline captured at step 1. Gate 7's own output carries a count, quoted into the uplift report                                                                             |
| 6   | Protection is extended only on evidence                                                                            | Slice 3        | For every required status check after uplift, at least one successful run on the default branch predates the protection change                                                                                                            |
| 7   | The audit runs and finds the capabilities the repository already met                                               | Slice 4        | Each is `Present`, and the appendix line names the tool taken from its own refusal output — not from a list of expected names                                                                                                             |
| 8   | The audit reaches a capability bootstrap tuned out with evidence                                                   | **`— none —`** | It reports `Absent`. Slice 4 records this as its own question 1 and names slice 3's criterion 12 as assuming an answer without stating which                                                                                              |
| 8a  | **The consequence, stated at journey level**                                                                       | **`— none —`** | Slice 4's own success criterion — "an audit of a compliant repository is quiet" — is unreachable for **any** repository with a tuning decision. A successful uplift always produces a non-empty actionable section on the very next audit |

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

| #   | Step                                                                                 | Owner            | Then — checkable as written                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A developer with no plugin clones, installs dependencies, and runs each gate by hand | Slice 1          | Each gate's finding set on a given commit equals CI's finding set on the same commit                                                                                                                                                                                            |
| 2   | Nothing under `.guardrails/` reaches outside it                                      | Slice 1          | A test walking every `import` statement under `.guardrails/` finds only `./name.mjs` siblings and Node built-ins                                                                                                                                                                |
| 3   | Nothing committed resolves through the plugin                                        | Slice 3          | `git grep CLAUDE_PLUGIN_ROOT` over the consuming repository returns nothing                                                                                                                                                                                                     |
| 4   | Git hooks fire — Commit, Commit message, Push                                        | Slice 1, slice 3 | Each hook file is one line invoking `.guardrails/`; a staged violation is refused with no plugin installed                                                                                                                                                                      |
| 5   | Agent hooks fire — Edit, Task completion                                             | **`— none —`**   | Slice 1 raises this as its question 2 and assigns the wiring to slice 3. Slice 3 surveys existing agent hooks and never writes a declaration. Its criterion 9 is satisfied vacuously by writing none, leaving two of the nine gates plugin-only                                 |
| 6   | An approved opt-out is in effect, and the developer's gate run respects it           | Slice 2          | `disabledCapabilities()` reads `git show origin/HEAD:.guardrails/opt-out-register.md` and returns the id; the capability contributes no line                                                                                                                                    |
| 6a  | **The same read in CI, where `origin/HEAD` is commonly unset on a shallow checkout** | **`— none —`**   | The reader fails safe to the empty set, so CI re-runs the opted-out capability and reports findings the developer's clone does not — breaking slice 1's "same finding set as CI" precisely when an opt-out exists. Nobody owns making `origin/HEAD` resolvable in a CI checkout |

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

| #   | Step                                                                                      | Owner          | Then — checkable as written                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Uplift finds a repository-local script that meets `secret-scanning` in full, and keeps it | Slice 3        | The diff adds no second secret-scanning tool. The existing script is unmodified                                                                                                                                              |
| 2   | The mapping is recorded                                                                   | **`— none —`** | Slice 3 says "record the mapping in the enforcement map". The phrase occurs once in the whole pack. No slice defines such an artefact, slice 1's layout has no file for it, and slice 4 reads none                           |
| 3   | The audit probes behaviourally and names the tool from the refusal itself                 | Slice 4        | Against a fixture whose secret scanning is an unrecognised local script: state is `Present`, and the appendix line names that script, sourced from its own refusal output                                                    |
| 4   | The kept tool's findings carry a capability id, in slice 1's line format                  | **`— none —`** | Slice 1's criterion — "every result line's capability resolves against `capabilities.mjs`" — is written against the copied scripts. Nothing says a kept third-party tool must emit the format, or that its output is wrapped |
| 5   | Slice 6 keys a tuning finding on the capability that tool defends                         | **`— none —`** | Follows from row 4. The ids are missing for exactly the capabilities an uplift kept, so the ledger's `Capability` field cannot be filled for them and `check-ledger.mjs` cannot distinguish that from an invented id         |

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

| #   | Step                                                                                               | Owner                     | Then — checkable as written                                                                                                                                                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Bootstrap is invoked here and stops                                                                | Slice 3                   | It reports the `isToolkit()` result and stops. The stop and its reason are in the transcript; nothing is written                                                                                                                                                                                     |
| 2   | The class declaration differs by repository                                                        | Slice 1                   | `git check-attr guardrail-class -- .guardrails/lib.mjs` returns `production` here and `tooling` in a consumer fixture                                                                                                                                                                                |
| 3   | The three never-received locations are classed and wired here                                      | Slice 1, slice 5, slice 6 | `.claude/**` is `agent-context`; `node .guardrails/check-script-wiring.mjs` reports zero unwired across `.guardrails/`, `scripts/configure-*.mjs`, `.claude/skills/**/*.mjs` and `eval/*.mjs`                                                                                                        |
| 3a  | The wiring check can actually fail                                                                 | Slice 1                   | Add one unwired `.mjs` under each of the four locations: the check reports four findings and exits non-zero                                                                                                                                                                                          |
| 4   | The audit's drift comparison runs against the toolkit                                              | **`— none —`**            | Here the repository's `.guardrails/` **is** the plugin reference, so every Layout line is clean by construction. Slice 4 handles "no plugin, so no reference"; it does not handle "the repository is the reference", and a comparison that cannot fail is this corpus's named recurring defect class |
| 5   | The toolkit's own `.guardrails/opt-out-register.md` is both its live register and a reference file | **`— none —`**            | Same missing decision as journey J1 row 8a, reached from the toolkit's side: if the toolkit ever files a row, every later consumer bootstrap copies it unless the copy step says otherwise                                                                                                           |

```gherkin
Given a session whose working directory is this toolkit
When repository-bootstrap is invoked
Then it reports the isToolkit() result, stops, and the working tree is unchanged
```

---

### Gaps: no slice owns these

Each row is a step above whose Owner reads `— none —`. They are recorded rather
than resolved: three are already open questions inside a slice, and the rest were
only visible from a journey. **The cheapest close is a suggestion, not a
decision** — several of these are boundary questions for a human.

| Gap | Journey                   | What no slice owns                                                                                                                                                                               | Cheapest close                                                                                             |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| G1  | J1 row 11, J2 row 5a      | **Bootstrap never opens a pull request.** Slice 2's entire enforcement depends on one existing                                                                                                   | One step in slice 3's implementation order, and one success criterion                                      |
| G2  | J1 row 20                 | **Backfill is reported by nobody who performs it.** The decision table assigns it to the auditor; slice 4 implements the reporting half and slice 3 routes single-capability restores to slice 4 | Slice 4 states whether "unless asked" covers a backfill, or the design's decision row is corrected         |
| G3  | J1 row 7a                 | **Creating `docs/ADR/` in a repository that has none.** Slice 2 question 1 and slice 3 question 5 are the same question, asked twice, taken by neither                                           | One row in slice 3's implementation order                                                                  |
| G4  | J1 row 8a, J6 row 5       | **Whether `opt-out-register.md` and `README.md` are copied**, and what the register contains on arrival                                                                                          | One row in slice 3's copy phase table                                                                      |
| G5  | J1 row 10a                | **The bootstrap commit's change-size override**: no `docs/registers/` exists, and unattended has no human                                                                                        | Slice 3 creates the register and files the row blank; the human approves it with the pull request          |
| G6  | J1 row 12                 | **Whether host configuration precedes or follows the bootstrap commit.** The first opt-out cannot merge until protection requires a review                                                       | One ordering sentence in slice 3                                                                           |
| G7  | J2 row 8 (slice 6's R9)   | **Where the auditor's defect classification appears** in its report                                                                                                                              | One required line in the audit brief template                                                              |
| G8  | J2 row 9a                 | **Slice 5 rotates the series silently; slice 6 stops on a rotation.** The two defaults compose into a deadlock                                                                                   | Slice 5 refuses a changed prompt hash unless a new series is confirmed — its own question 5, answered      |
| G9  | J2 row 10a (slice 6's R7) | **Gate output is not a named artefact**, so capability ids are parsed from a transcript                                                                                                          | One named capture in slice 5's layout                                                                      |
| G10 | J2 row 13a                | **Nothing enforces the settle-before-next-round rule** — the check runs at gate 7, not before a round                                                                                            | One precondition in slice 5's round command                                                                |
| G11 | J3 rows 8, 8a             | **A tuned-out capability reports Absent**, so a successful uplift is never quiet                                                                                                                 | Slice 4 question 1, answered — a row, a readable derived fact, or Absent accepted with the evidence quoted |
| G12 | J3 row 4a                 | **A suppression row for a deviation that is not at a path**                                                                                                                                      | Slice 3 question 4, answered — the workflow file as the path, or a standards change authorised separately  |
| G13 | J3 rows 2a, 3a            | **The `.gitattributes` declaration and the divergence rule when the hook manager is not husky**                                                                                                  | One row in slice 1's class table; one sentence in slice 3's divergent resolution                           |
| G14 | J4 row 5                  | **Agent-hook wiring in the consumer.** Slice 1 assigns it to slice 3; slice 3 does not do it                                                                                                     | One row in slice 3's copy phase table, and a non-vacuous form of its criterion 9                           |
| G15 | J4 row 6a                 | **`origin/HEAD` in a CI checkout**, where the opt-out reader fails safe and CI diverges from a clone                                                                                             | Slice 3 wires the CI checkout to set it, or slice 2 names a second acceptable ref                          |
| G16 | J5 rows 2, 4, 5           | **The enforcement map does not exist**, and a kept third-party tool's output carries no capability id                                                                                            | Slice 1 names the artefact and the wrapping rule; slice 3 writes it; slice 4 and slice 6 read it           |
| G17 | J6 row 4                  | **The drift comparison against the toolkit itself cannot fail**                                                                                                                                  | Slice 4 reports `Unknown` with `subject is the reference` as the reason                                    |

**G1, G2 and G16 are the three that stop a journey outright.** The rest degrade a
journey or make a stated criterion unreachable; those three leave a step with no
implementation at all.

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
out of scope, and slice 2's `bypass-and-exceptions.md` amendment and slice 6's
`docs-style.md` class row are both correctly outside this line.
