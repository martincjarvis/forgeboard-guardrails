---
type: reference
summary: Slice 3 of the distributable guardrails design — the reworked repository-bootstrap skill, covering activation, the two modes against the two repository states, discovery of what the prompt does not state, plugin-relative script references, and uplift of a repository that already works.
read_when: Implementing or reviewing the reworked repository-bootstrap skill, or deciding whether a behaviour belongs to bootstrap, to the audit skill, or to the opt-out register.
---

<!-- cspell:ignore pyproject -->

# Slice 3 — the bootstrap skill

The reworked `repository-bootstrap` skill: what makes it fire, what it derives,
what it asks, and how it brings a repository that already works into compliance
without breaking it.

Scope is fixed by
[the overarching design](2026-08-01-distributable-guardrails-design.md). A
behaviour that contradicts a decision recorded there is wrong, not creative.

## What this slice depends on and does not define

| Depended on                                                               | Owner   | Referred to here as                             |
| ------------------------------------------------------------------------- | ------- | ----------------------------------------------- |
| The capability vocabulary — the names an opt-out row and a finding key on | Slice 1 | "a capability", "the capability list"           |
| The `.guardrails/` layout — folder structure, script paths, class         | Slice 1 | `.guardrails/`, "the script path slice 1 fixes" |
| The four places gates fire, as the grouping a human is shown              | Slice 1 | "the four firing places"                        |
| The opt-out register's columns, lifecycle and enforcement                 | Slice 2 | "a register row", "slice 2's schema"            |

This spec names those and builds on them. Where it needs a concrete path or a
concrete capability name to make a rule testable, it writes a placeholder and
says so. **An implementation that invents a capability name or a
`.guardrails/` path rather than taking slice 1's is defective**, even if the
name it invents is better.

## Activation

### It fires when

- The session asks to set up, adopt, apply or bring into compliance **the
  repository as a whole** — the working directory is a git repository, and no
  narrower request was made.
- The working directory has no `.guardrails/`, or has one that is a **stub**
  rather than **populated**. Those two words are
  [slice 1's test](2026-08-01-distributable-guardrails-slice-1-foundations.md#populated-versus-stub),
  evaluated by its `isPopulated(dir)`: every gate entry point the plugin's
  `GATE_FILES` names is present, and `capabilities.mjs` is present and exports
  a non-empty list. The skill calls it; it does not re-derive the condition, and
  it reports which of the two the directory was and what was missing.

### It does not fire when

| Situation                                                 | What owns it instead                                                                                                                                                                                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "Which gates am I missing?"                               | `guardrail-audit` — a report is not an adoption                                                                                                                                                                                                        |
| One capability is to be added, restored or backfilled     | `guardrail-audit`'s backfill (slice 4)                                                                                                                                                                                                                 |
| `.guardrails/` exists and is populated, by slice 1's test | `guardrail-audit` — bootstrap defers rather than re-bootstrapping. That includes a populated directory copied from an older plugin whose layout has since changed: the upgrade is slice 4's, per its own drift comparison against the plugin reference |
| The working directory is not a git repository             | Nothing. Report it and stop; creating the repository is the human's act                                                                                                                                                                                |
| The repository is this toolkit itself                     | Nothing. Report it and stop — the corpus is the source, not an instantiated copy; the `isToolkit()` signal `check-standards-instantiation.mjs` already derives is the test                                                                             |

A stated stop with its reason is a valid outcome
([agent-integration.md](../standards/guardrails/agent-integration.md#progress-blockers-and-questions)).
A silent one is not.

## The two modes and the two repository states

### Determining the mode

Mode is determined once, before anything else, and reported.

| Signal, in order                                                                                 | Mode       |
| ------------------------------------------------------------------------------------------------ | ---------- |
| The invocation names it — "unattended", "autonomous", "headless", a harness non-interactive flag | As named   |
| The harness reports no interactive terminal                                                      | Unattended |
| Neither answers                                                                                  | Unattended |

**The default is unattended, deliberately.** Asking in a session with nobody
there stalls the run and is a stated failure condition of the evaluation
harness; recording a finding in a session with somebody there is merely noisier
than it needed to be. Fail toward not asking.

### Determining the repository state

| Evidence                                                                                  | State  |
| ----------------------------------------------------------------------------------------- | ------ |
| No commits, or commits containing no tracked file outside `README`/`LICENSE`/`.gitignore` | New    |
| Anything else — source, history, a pipeline, hooks, conventions                           | Uplift |

Read from `git rev-list --count HEAD` and `git ls-files`, reported with both
outputs. A repository is not "new" because it is small.

### The matrix

|                 | **New**                                                                                | **Uplift**                                                                                                                                       |
| --------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Interactive** | Discover, summarise, take the opt-out conversation, implement everything not opted out | Survey first, then discover, then summarise **with what already covers each capability**, take the opt-out conversation, implement the remainder |
| **Unattended**  | Discover, implement everything; opt-outs only where the prompt names them; ask nothing | Survey first, then discover, implement the remainder additively; opt-outs only where the prompt names them; ask nothing                          |

The four cells differ in two things only: whether a survey precedes discovery,
and whether the human is offered the opt-out conversation. Everything else —
discovery, tuning, the order of implementation, the report — is common.

## Discovery

**Discovery derives facts the prompt does not state.** It never overrides a
fact the prompt does state: where discovery contradicts the prompt, that is a
finding, not a correction.

### The evidence order

**Named in the prompt → declared in a tracked file → derived from the host →
the stated default.** The first source that answers wins, and the sources are
never blended. A fact derived from a lower source when a higher one answered is
a defect.

### What is derived from what

| Fact                     | Derived from, in order                                                                                                                                                          | Default when nothing answers                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stack(s)                 | Tracked manifests: `package.json`, `*.csproj`/`*.sln`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `pom.xml`/`build.gradle`, `Gemfile`, `composer.json`                           | No manifest: a documentation-and-configuration repository. Wire every stack-neutral capability; record that no build or test capability could be wired |
| Components               | [components.md](../standards/guardrails/components.md)'s own derivation — the workspace, solution or project manifest that already groups the source                            | One component                                                                                                                                          |
| CI platform              | An existing pipeline definition (`.github/workflows/`, `azure-pipelines.yml`, `.gitlab-ci.yml`, `Jenkinsfile`, `.circleci/`); then the `origin` remote's host                   | No CI capability wired; recorded as a finding naming what is therefore unenforced server-side                                                          |
| Package registry         | `package.json`'s `publishConfig`/`private`, `.npmrc`, `nuget.config`, the publish step of an existing release workflow; then the discovered host's own registry                 | Publishing left unconfigured; gate 8 wired for versioning and tagging only; recorded as a finding                                                      |
| Target operating systems | An existing CI matrix; then the stack's own declarations (`engines`, `os`, `RuntimeIdentifiers`, `TargetFrameworks`, classifiers); then a devcontainer or Dockerfile base image | The CI platform's default runner, single-OS matrix; recorded as a finding naming that no second OS was proven                                          |
| Default branch           | `git symbolic-ref refs/remotes/origin/HEAD`; then the host CLI's report of the remote default                                                                                   | The checked-out branch's upstream; recorded as a finding                                                                                               |
| Build and test commands  | Conventional task names in the discovered manifests                                                                                                                             | None wired. The remedy is naming the tasks conventionally, which is a change to the repository — recorded as a finding, never performed silently       |
| Licence                  | `package.json`'s `license`, a `LICENSE` file, `PackageLicenseExpression`                                                                                                        | Absent is not ambiguous — it is the existing step 8 recommendation, already reserved for a human                                                       |

**Several answers is not ambiguity.** A repository with three manifests has
three stacks; every one of them gets its own answer for build, lint, test and
analysis. Nothing is chosen between.

### What counts as ambiguous

> Two or more sources disagree, or no source answers — **and the answer changes
> what gets implemented.**

The second clause is load-bearing. A fact whose candidate values produce the
same implementation is not ambiguous: resolve it either way and say which was
taken. A skill that asks about a difference that makes no difference has asked
a clarifying question the corpus should have answered.

### What happens then

| Mode        | On ambiguity                                                                                                                                                                                                               |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interactive | Ask — **once, batched.** Every ambiguity in one turn, each with its candidates, the evidence for each, and the default that will be taken on no answer. Never one question at a time                                       |
| Unattended  | **Never ask.** Take the row's stated default, implement against it, and record a finding naming: the fact, the candidates, the evidence for each, the default taken, and what would change if the other candidate is right |

### Reporting a derivation

**Every derived fact is reported with the command whose output produced it.**
This is [components.md](../standards/guardrails/components.md)'s "what is
derived must be reported" applied to discovery: a file somebody wrote can be
read; a derivation cannot, so a wrong one is invisible unless it is stated.

## Plugin-relative references

The current skill writes `node scripts/check-branch-protection.mjs`, which
resolves against the consuming repository's own `scripts/` — a directory that
does not exist at the point the skill says to run it. Four reference forms,
and the phase each belongs to:

| Phase                                                             | What exists    | Form                                                                                                         |
| ----------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------ |
| **Before the copy** — survey and discovery                        | The plugin     | `node "${CLAUDE_PLUGIN_ROOT}/.guardrails/<name>.mjs"`                                                        |
| **Before the copy** — one-off host configuration                  | The plugin     | `node "${CLAUDE_PLUGIN_ROOT}/scripts/<name>.mjs"` — the two `configure-*.mjs` scripts and nothing else       |
| **The copy**                                                      | Both           | Source `${CLAUDE_PLUGIN_ROOT}/.guardrails/<name>.mjs`, destination `.guardrails/<name>.mjs` — same file name |
| **After the copy** — every gate invocation, wiring and checkpoint | The repository | `node .guardrails/<name>.mjs`, repository-relative                                                           |

**The copy rewrites no path**, because slice 1's layout is flat and the source
and destination file names are identical. That is the property slice 4's
backfill needs — a comparison against the plugin reference is a file
comparison, not a diff modulo path rewriting — and a bootstrap that reshapes
the tree on the way in destroys it.

`${CLAUDE_PLUGIN_ROOT}` is the variable the plugin's own `hooks/hooks.json`
already resolves through; this slice reuses it rather than introducing a second
mechanism. The plugin's own tree is `.guardrails/` after slice 1's migration —
which is what makes the source and destination names match — with the one-off
setup scripts carved out of it, per
[slice 1's carve-out](2026-08-01-distributable-guardrails-slice-1-foundations.md#what-guardrails-is-and-what-therefore-stays-out-of-it-here).

### The rules

- **No committed file names `${CLAUDE_PLUGIN_ROOT}`.** A hook, workflow,
  manifest script or document that resolves through the plugin breaks for the
  developer who does not have it — the design's first decision. The
  plugin-relative form is for the bootstrap session's own commands only, and
  `git grep CLAUDE_PLUGIN_ROOT` returning nothing outside the plugin is the
  check.
- **Every command the skill writes names its phase.** A bare path in the skill
  text is the current defect; every invocation reads either "from the plugin"
  or "from the repository".
- **A script is copied when a gate invokes it; run plugin-relative when only
  the bootstrap session does.** `check-branch-protection.mjs` and
  `check-repository-features.mjs` are invoked by gate 7 and are copied.
  `configure-branch-protection.mjs` and `configure-repository-features.mjs` run
  once, during setup, and are not — copying them would leave a `tooling`-classed
  script no gate invokes, which is a finding
  `check-script-wiring.mjs` raises
  ([cross-gate-rules.md](../standards/guardrails/cross-gate-rules.md#every-quality-script-is-wired-or-declared)).
  This is not a rule this slice invents to protect itself: slice 1 defines
  `.guardrails/` as **what a consuming repository receives**, keeps the two
  `configure-*.mjs` scripts at `scripts/` through the migration for that
  reason, and carries an explicit carve-out row in its migration table so the
  wildcard above it is not read as covering them. The skill therefore has a
  plugin path to name for them, which is why the phase table has two
  before-the-copy rows rather than one.
- **The `<tooling-dir>` placeholder disappears.** The current skill writes
  `node <tooling-dir>/check-standards-instantiation.mjs` because it had no
  fixed path to name. Slice 1 fixes it; the reworked skill writes the literal
  path.

## Uplift

An existing repository has commit history, a pipeline people depend on,
conventions that predate the toolkit, and possibly hooks already installed.
Uplift is not a variation of the new-repository path.

### The survey

Read-only. It writes nothing, and it completes before any capability is
implemented.

| Surveyed                      | Read from                                                                                                                                     | Why it decides something                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Working tree state            | `git status --porcelain`                                                                                                                      | A dirty tree stops the run — never start on top of uncommitted work                               |
| History shape                 | `git rev-list --count`, a sample of recent subjects                                                                                           | Whether gate 3's message format is already met, and what it must not retrospectively demand       |
| Default branch and protection | The host CLI's branch-protection read                                                                                                         | Which checks are already required, and must stay required                                         |
| CI pipeline                   | The pipeline definitions, and **the default branch's current verdict**                                                                        | The baseline. An already-red pipeline is a recorded finding, not something uplift caused or fixes |
| Hooks                         | `git config --get core.hooksPath`, that directory's contents, `.husky/`, `lefthook.yml`, `.pre-commit-config.yaml`, `simple-git-hooks` config | Which manager exists, so the toolkit's gates are invoked from it rather than replacing it         |
| Agent harness hooks           | The harness hook configuration in use                                                                                                         | Whether gates 1 and 4 already fire, and in which harnesses                                        |
| Existing tooling              | Linter, formatter, spell-check, secret-scan, coverage and analyser configuration                                                              | Which capabilities are already implemented, and by what                                           |
| Existing conventions          | An existing tooling directory, docs layout, registers, decision records, contribution guide                                                   | Where the toolkit's own artefacts must fit rather than duplicate                                  |
| Existing `.guardrails/`       | `isPopulated()`, slice 1's own test, over its contents                                                                                        | Stub versus populated — populated defers to the audit skill                                       |

**The baseline verdict is captured before the first write and quoted in the
report.** Without it there is no way to tell uplift's breakage from what it
inherited.

### What uplift leaves alone

Absolutely, and each is testable from the diff:

- **Existing pipeline jobs.** Never edited, renamed, reordered or deleted. Gates
  arrive as new jobs or new workflow files.
- **The existing hook manager.** The toolkit's gates are invoked **from** it.
  `core.hooksPath` is never repointed — repointing it silently disables
  everything the repository already ran.
- **Existing history.** Never rewritten. No retrospective commit-message
  conformance, no rebasing to satisfy gate 3.
- **Existing required status checks.** Extended, never removed.
- **Product source.** Uplift does not refactor code to make a newly added gate
  pass.
- **The repository's own tools that already meet a capability.** Per
  `guardrail-audit`'s existing rule: a tool that meets the standard is not a
  finding, however differently you would have chosen.

### Conflicts, and how each resolves

A **conflict** is the repository already occupying the slot a capability wants.
Four kinds, and the resolution is determined by the kind, not by preference:

| Kind              | Looks like                                                                                                                                                                                  | Resolution                                                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Equivalent**    | The repository's tool meets the capability in full                                                                                                                                          | Keep it. Record the mapping in the enforcement map. Not a finding, and no second tool for the same check                                                                       |
| **Partial**       | The tool runs but does not block; a configuration exists but nothing invokes it                                                                                                             | Extend in place — wire what is missing to the tool that is already there. Never add a parallel implementation                                                                  |
| **Divergent**     | The same job, a different tool: `lefthook` where the plugin's reference wiring uses husky                                                                                                   | The repository's tool wins. Adapt the plugin's script to its mechanism, in that mechanism's own syntax. Two managers means one silently wins, which is the exit-0 defect class |
| **Contradictory** | The repository's existing behaviour and the capability cannot both hold — a release workflow that publishes untagged from the default branch, a pre-commit hook that auto-fixes and commits | Not an agent's to resolve. Raise it, do not settle it — see below                                                                                                              |

**Replace a working tool only on `guardrail-audit`'s existing three grounds**:
it cannot meet the standard (name the check it fails), it is demonstrably
unmaintained, or the repository is new. The third is unavailable in uplift by
definition, which leaves two.

#### The single rule for a deliberate deviation

> **An existing repository's deliberate deviation from a capability is an
> unregistered suppression. Uplift makes it visible as a row with a blank
> approver — it does not change the behaviour, and it does not approve the
> deviation.**

**It is a suppression, and it is filed as one — not as an opt-out.** The
capability applies here: the repository does the thing the capability governs and
does it in a way the standard refuses, so there is a real violation being
tolerated. That is
[the one question slice 2 settles it by](2026-08-01-distributable-guardrails-slice-2-opt-out-register.md#an-opt-out-is-configuration-not-a-suppression)
— is there a violation? — and the answer here is yes. A release workflow that
publishes untagged from the default branch is not a repository to which release
gating is irrelevant; it is a repository that violates it. Filing that as an
opt-out would buy permanent silence for a live defect, which is the misfiling
slice 2 names as the one that matters.

So: the deviation is recorded as an accepted-finding row in the ordinary
[suppression register](../standards/guardrails/registers.md#the-suppression-register),
with the deviation quoted from the repository's own configuration as its
justification and the approver left for a human. The capability is still
implemented where it can be; the conflicting part is recorded, not silently
dropped and not forced through.

**The opt-out route stays open, and only a human opens it.** If the human's
answer is that the class of check does not apply here at all, that is the
interactive opt-out conversation above, and it produces slice 2's row _and_ its
decision record. An uplift never reaches that conclusion on its own, in either
mode: what it found is a conflict, and a conflict is evidence of a violation, not
of inapplicability.

### Adding gates without breaking a working pipeline

Two mechanisms, both already in the corpus rather than invented here:

1. **Change-scoped gates are safe by construction.** Gates 1 to 6 judge the
   change under judgement — staged paths, the pushed range, the pull request's
   range. Pre-existing content is not in scope for them, so a repository whose
   tree would fail a newly added check does not go red until somebody touches
   the offending file. Nothing needs to be non-blocking.
2. **The pre-existing tree is gate 7's.** Gate 7 sweeps unconditionally and only
   reports. The violations already in the tree land there as a counted backlog,
   quoted into the uplift report from gate 7's own output, and are neither
   suppressed nor hidden.

The residual case is a **whole-repository blocking check at gate 6** — licence
policy, a full-tree secret scan — which genuinely can turn a green pipeline red.
One rule closes it:

> **A gate becomes a required status check only after it has passed once on the
> default branch.** The workflow is added first; branch protection is extended
> in a second step, taken only on evidence of that pass.

Testable directly: after uplift, no required status check exists that has never
passed on the default branch.

### Ordering

Uplift follows `guardrail-audit`'s existing adoption order — gate 7's sweep
first, then the vocabulary, then gate 6, then 2 and 3, then the rest — with one
addition: **the survey precedes all of it**, and the baseline verdict is
captured before the first write.

## The interactive opt-out conversation

Interactive only. It never happens unattended, in any form.

### The summary

**One line per capability, grouped by the four firing places slice 1 defines.**
Each line carries: the capability, what it stops, how it would be implemented
here — the tuned tool, from discovery — and, in uplift, what already covers it.

Constraints:

- **It fits on one screen.** A summary a human scrolls past is not a summary. If
  the capability list is long enough that one line each exceeds a screen, the
  human is offered the four groups and responds per group.
- **It carries the discovery ambiguities in the same turn.** One interruption,
  not two.
- **A capability discovery has already ruled out is shown as tuned out, not
  offered for opt-out.** "Registry publishing — not implemented, derived from
  `package.json` declaring `private: true`" is a tuning outcome with evidence.
  It produces no register row.

### The conversation

1. The skill presents the summary and the ambiguities, together, once.
2. The human names what is not relevant, in their own words. They are not
   required to use the capability vocabulary.
3. The skill maps each named thing to **exactly one** capability and reads the
   mapping back. Something that maps to no capability, or to more than one, is
   read back as such — **this is the only permitted second question.**
4. For each confirmed capability, the skill drafts **both artefacts slice 2
   requires** — they are one proposal, and neither half is a proposal alone:
   - a register row per slice 2's schema: the capability, the human's own words
     reduced to the one repository fact that makes it inapplicable, a removal
     condition, the decision record it cites, and **the approver left blank**;
   - the decision record itself, `Proposed`, with **no `approver`**, carrying
     what the row deliberately does not: what is lost, what was weighed, and what
     bringing the capability back would involve. The human's own words go here in
     full, where there is room for them. Filed at `docs/ADR/`, which this
     record creates if the repository has none yet — bootstrap does not create
     the directory ahead of time, and an opt-out is not a special case; see
     [slice 1](2026-08-01-distributable-guardrails-slice-1-foundations.md#what-is-not-in-it).
5. The skill implements everything not opted out, and the report names each
   opted-out capability beside the row and the record that carry it.

### What the agent may not do

- **Propose an opt-out.** The skill summarises; the human names. "Shall I skip
  the release gate, since you do not publish?" is a proposed opt-out. This is
  testable from the transcript: **a capability named in a register row appears
  first in a human turn.**
- **Approve one.** Approval is an event with a git trace, not a field this
  conversation fills
  ([registers.md](../standards/guardrails/registers.md#approval-is-an-event-not-a-field)).
  That applies to both artefacts: the row's approver stays blank and the record
  stays `Proposed` with no `approver`. Slice 2 owns the enforcement; this
  conversation produces two drafts and nothing else.
- **Invent the reasoning.** The record is written from what the human actually
  said. Where their grounds do not reach — they named the capability but not what
  its absence costs — the record says so and leaves it for the approver, rather
  than manufacturing an argument the human never made and then presenting it back
  to them for signature. A drafted justification nobody gave is the same defect
  as a filled approver nobody typed.
- **Treat a tuning decision as an opt-out, or the reverse.** Tuning is which
  tool implements a check, derived from the manifests, with no human involved.
  Opt-out is whether the capability applies at all, decided by a human. They are
  recorded in different places and neither substitutes for the other.

### Unattended

An opt-out exists unattended **only where the prompt names it.** The prompt's
own words become the record's grounds, quoted, and the repository fact they name
becomes the row's justification cell; the approver is still blank and the record
is still `Proposed`, because both are slice 2's to enforce. Nothing else in the
unattended path produces a row, and nothing in it asks.

## Success criteria

Each is checkable against a completed run.

1. **No clarifying question in an unattended transcript.** The stated failure
   condition of the evaluation harness, checked against the transcript itself.
2. **Uplift is additive.** The diff against the pipeline definitions contains
   additions only — no job edited, renamed, reordered or deleted.
3. **The pipeline that was green stays green.** The default branch's verdict
   after the uplift merges matches the baseline captured before the first write.
4. **No required status check has never passed.** After uplift, every required
   check has at least one passing run on the default branch.
5. **The hook manager survives.** `git config --get core.hooksPath` resolves to
   whatever the repository had, where it had one, and the toolkit's gates are
   invoked from it.
6. **Every derived fact names its command.** Each discovery row in the report
   carries the command whose output produced it.
7. **Every ambiguity resolved by default is a finding**, naming candidates,
   evidence, the default taken and what would change if the other candidate is
   right.
8. **No committed file resolves through the plugin.** `git grep
CLAUDE_PLUGIN_ROOT` over the consuming repository returns nothing.
9. **Every gate invocation in a committed file resolves under `.guardrails/`.**
10. **At most one question turn interactively** before implementation begins,
    plus at most one clarification of an unmappable opt-out.
11. **Every opt-out row's capability first appears in a human turn** — or, in
    unattended mode, in the prompt text.
12. **A capability not implemented has exactly one of**: an opt-out row citing a
    decision record, or a tuning decision with the fact it was derived from.
    Never neither, and never a row without its record.
13. **Every drafted opt-out is a pair, and neither half carries an approval** —
    the row's approver cell blank, the record `Proposed` with no `approver`.

## Failure criteria

- A clarifying question in unattended mode.
- A pipeline job edited, removed or reordered during uplift.
- A capability skipped with neither a register row nor an evidenced tuning
  decision.
- An opt-out the agent proposed rather than the human named.
- A committed hook, workflow or manifest script that resolves through the
  plugin.
- A whole-repository check made a required status check before it has passed.
- History rewritten, or a pre-existing commit message amended, to satisfy a
  gate.
- A question asked about a fact whose candidate values produce the same
  implementation.
- A second tool added for a capability the repository already implements.
- Discovery blending two evidence sources rather than taking the first that
  answered.
- A derived fact stated in the report with no command behind it.

## Indicative behaviour

Illustrative of the required behaviour, not a test plan. The real cases come
from the criteria above.

```gherkin
Given a repository whose pipeline is green and whose tree fails a newly added check
When bootstrap runs in uplift mode
Then the check is wired change-scoped and blocking, the pre-existing violations
  are reported by gate 7 with a count, and the default branch stays green

Given a repository using lefthook where the plugin's reference wiring uses husky
When bootstrap runs in uplift mode
Then the gates are invoked from lefthook in its own syntax, core.hooksPath is
  unchanged, and no second hook manager is installed

Given a repository whose release workflow publishes untagged from the default branch
When bootstrap runs unattended in uplift mode
Then the workflow is left untouched and a suppression register row is drafted
  quoting it, with the approver blank, and no opt-out row is filed

Given a prompt that names no CI platform and a repository with no pipeline and no remote
When bootstrap runs unattended
Then no CI capability is wired, and a finding names the candidates, the evidence
  and what is therefore unenforced server-side

Given an interactive session on a new repository
When bootstrap starts
Then one turn carries both the capability summary and every discovery ambiguity,
  and implementation begins after one human answer

Given a human who says "we do not deploy anything"
When the skill maps that to capabilities
Then it reads back the single capability it mapped to, and drafts one row and one
  Proposed decision record quoting the human's own words, with no approver on either
```

## Out of scope

- The capability vocabulary, the `.guardrails/` layout, the populated-versus-stub
  test and the gate names — slice 1.
- The register's columns, lifecycle and enforcement — slice 2.
- Backfill of a single capability, and the audit report — slice 4.
- **Upgrading an existing, populated `.guardrails/` across a plugin layout
  change — slice 4.** Bootstrap does not fire on a populated directory at all,
  so the case never reaches it, and slice 4 already compares that directory
  against the plugin reference for backfill. Drawing the boundary anywhere else
  would give two skills a reason to write to the same directory.
- Changing the nine gates, their order, or what they check.
- Changing the standards' content.

## Questions

These are unresolved and need a decision before implementation. None is
invented to be safe — each is a real fork this spec could not settle from the
material available.

1. **`agent-integration.md` forbids clarifying questions unconditionally; the
   overarching design requires bootstrap to ask, interactively, on discovery
   ambiguity.** The opt-out conversation is already inside the existing carve-out
   ("a decision the standards reserve for a human"). A discovery ambiguity is
   not — it is a clarifying question by that document's own definition. Either
   `agent-integration.md` gains a carve-out for an interactive session with a
   human present, or the interactive path takes the default and reports, the
   same as unattended, and the design's fourth Gherkin line for slice 3 is wrong.
   **This is a conflict between two standing directives and is put to the human
   rather than settled here.** This spec is written to the design's wording;
   changing that wording changes the interactive column of the matrix.

2. **Does a survey of a dirty working tree stop the run, or proceed?** This spec
   says stop, following the repository's own "never start on top of someone
   else's uncommitted work". A user who says "set this repository up" with work
   in progress may reasonably expect it to proceed against `HEAD`. Stopping is
   the conservative reading and is what is specified; it may be wrong for the
   plugin's actual users.

3. **May the summary omit a capability the repository already implements in
   full?** Showing it makes the summary longer and mostly noise; omitting it
   hides a capability the human might want opted out. This spec shows it, marked
   with what already covers it. A run against a large existing repository will
   settle whether that is readable.

4. **What is the suppression row's Path cell for a deviation that is not at a
   path?** The suppression register is keyed on rule and path, and an uplift's
   contradictory conflict is often neither — a workflow job's behaviour, a branch
   protection setting, a repository-level configuration. The routing above is
   right (there is a violation, so it is not an opt-out), but the register it
   routes to may not have a key that fits. Either the workflow file counts as the
   path, or this class of accepted finding needs somewhere else to live, and this
   spec cannot settle that without changing a standard.

5. **Does bootstrap introduce `docs/ADR/` on an uplift of a repository that
   already records decisions at a different path, or adapt to theirs?** The
   ordinary case is decided, once, in
   [slice 1](2026-08-01-distributable-guardrails-slice-1-foundations.md#what-is-not-in-it): bootstrap
   creates no `docs/ADR/`, and an opt-out is no special case — the opt-out
   conversation's own `Proposed` record creates the directory if it is the
   first decision record the repository has, new repository or uplift alike.
   What that leaves open is narrower: a repository that already has an
   established, differently-named location for its decisions. Writing the
   opt-out's record to `docs/ADR/` anyway introduces a second convention
   alongside the repository's own; adapting means every check that resolves
   `adrDir` from `docs/ADR/` needs the path made configurable. Neither is
   decided here.

6. **Is the change-size override still reserved for a human on a bootstrap
   branch that is large by nature?** The current skill says yes, at length. That
   holds unchanged here, but an uplift branch is smaller than a new-repository
   bootstrap's, and it is worth confirming the threshold is still crossed often
   enough to justify the paragraph.

## References

- [The distributable guardrails design](2026-08-01-distributable-guardrails-design.md) — the six slices and the decisions this one is bound by.
- [Slice 1 — Foundations](2026-08-01-distributable-guardrails-slice-1-foundations.md) — the flat `.guardrails/` layout every path here resolves under, the carve-out for scripts a consumer never receives, and the populated-versus-stub test this slice's activation reads.
- `skills/repository-bootstrap/SKILL.md` — the skill this slice reworks.
- `skills/guardrail-audit/SKILL.md` — the adoption order, the audit states, and the three grounds for replacing a working tool.
- [Agent integration](../standards/guardrails/agent-integration.md#progress-blockers-and-questions) — the progress, blocker and question rule, and question 1's other half.
- [Components](../standards/guardrails/components.md) — the component derivation discovery reuses, and the report-what-you-derived obligation.
- [File classes](../standards/guardrails/file-classes.md) — the `tooling` class the copied scripts take, and the derived `guardrail-generated` declaration.
- [Registers](../standards/guardrails/registers.md#approval-is-an-event-not-a-field) — why the conversation drafts a row and never approves it.
- [Cross-gate rules](../standards/guardrails/cross-gate-rules.md#every-quality-script-is-wired-or-declared) — why a script no gate invokes is not copied.
- [The toolkit improvement loop](../prompts/toolkit-improvement-loop.md) — the two failure conditions the unattended path is measured against.
