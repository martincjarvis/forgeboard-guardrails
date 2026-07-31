---
name: repository-bootstrap
description: Use when setting up a new repository to comply with the guardrail standards, or bringing an existing repository into compliance for the first time. States the order to declare vocabulary, wire the root instruction file, and adopt each content standard and the gates — naming which reference to open at each step, so an agent does not read the whole corpus before starting.
---

<!-- cspell:ignore pyproject -->

# Repository bootstrap

Sequences the other five skills into one first-time setup. Each step below
names the one reference it needs — load it there, not before. Do not delegate
"read the standards" to a sub-agent as a whole task; delegate one step's
reference if you delegate at all.

## Before you start

Establishing the stacks, the host and what already exists is the same first
move for any repository work here: follow
`skills/guardrail-audit/SKILL.md`'s "Before you start" section rather than
repeating it.

One extra question decides step 1: is this a genuinely new repository, with no
source and no history, or an existing one adopting the standards for the first
time? A blank repository has nothing to sweep or migrate; an existing one does.

## The order

1. **Sweep first, if there is anything to sweep.** For an existing repository,
   follow `skills/guardrail-audit/SKILL.md`'s "Adopting guardrails in a
   repository that has none" section from its first step. For a genuinely new
   repository, there is nothing yet to find — start at step 2.

2. **Declare the vocabulary.** Load
   `docs/standards/guardrails/components.md`,
   `docs/standards/guardrails/file-classes.md` and
   `docs/standards/guardrails/thresholds.md` when declaring the component map,
   the file-class patterns and the size thresholds. Every step below reads what
   gets declared here, so it comes before all of them, not after.

3. **Wire the root instruction file.** Load
   `docs/standards/guardrails/agent-integration.md` when creating the
   repository's `AGENTS.md` — one canonical file, thin pointers from any other
   harness-specific name, and the edit-time and task-completion hooks each
   harness in use must fire.

4. **Testing strategy.** Load `docs/standards/testing-strategy.md` and
   `skills/testing-review/SKILL.md` when placing the first test and
   configuring coverage. This precedes the gates and deployment strategy below
   because both depend on tests already passing and coverage already
   configured — wiring gate 5 or a release gate against a suite that does not
   exist yet just moves the failure, it does not prevent it.

   **Checkpoint, answerable by running:** once step 7 has ported any gate or
   check scripts, this step is not finished while
   `node <tooling-dir>/check-tooling-class.mjs` reports the tooling-suite
   finding — testing-strategy.md's own requirement ("a repository carrying
   ported gate or check scripts runs a `tooling tests` suite against them")
   is text nobody implemented once already (audit 13: 26 `tooling`-classed
   scripts, no test file, no job, and nothing positioned to notice); a
   completion claim for this step names this command's own clean run, not
   that a test file exists somewhere.

5. **Logging and diagnostics.** Load `docs/standards/logging-diagnostics.md`'s
   enforcement boundary section and the matching stack reference under
   `skills/logging-review/reference/` (`dotnet.md` or `react-ts.md`) when
   wiring the analyser for the repository's stack. Tier 0 is mechanical and
   belongs at commit time; Tier 1 and Tier 2 are review-time only and need no
   wiring yet.

6. **Deployment strategy**, only if the repository packages or deploys.
   Follow `skills/deployment-review/SKILL.md`'s "Adoption, for a repository
   with none of this" section in full — it is already sequenced against the
   same component map from step 2; do not re-sequence it here. Skip this step
   entirely for a repository with nothing to release, and say so rather than
   leaving it silently undone.

7. **The gates.** Follow `skills/guardrail-audit/SKILL.md`'s "Adopting
   guardrails in a repository that has none" section in full, from wherever
   step 1 left off. It states its own order for the nine gates and why; this
   skill does not restate it. When that order reaches gate 6, port
   `.github/workflows/pull-request.yml` and `scripts/gate-6-pull-request.mjs`
   from this repository rather than reinventing the pipeline from
   `gate-6-pull-request.md`'s prose — they are this toolkit's own working
   reference for that gate. **Configuring gate 6's merge policy is a step of
   its own, not a line in a closing checklist:** once the workflow is ported
   and its first run is green, run `node scripts/configure-branch-protection.mjs`
   with an authenticated `gh` session, then `node scripts/check-branch-protection.mjs`
   to confirm it took — `docs/standards/guardrails/branch-protection.md` is
   the reference for what each does and the two conditions (no GitHub Pro on
   a private repository, `gh` unauthenticated) that make it a visible skip
   rather than silently done. A pipeline that runs and publishes evidence
   with nothing configured to refuse the merge on it is exactly the gap
   audit 8 found, repeated at adoption. **Enabling the platform's own free
   security and quality features is the same kind of step, not a closing-
   checklist line:** with the same session, run
   `node scripts/configure-repository-features.mjs` then
   `node scripts/check-repository-features.mjs` to confirm it took —
   `docs/standards/guardrails/gate-7-on-demand.md#platform-features-enabled-by-default`
   names each feature, which are free at which visibility and plan, and the
   two skip conditions (unavailable for this visibility or plan; `gh` cannot
   tell) that must not read as findings. **A finding this order surfaces gets
   fixed first, restructured second, and only suppressed with a justification
   once both are unavailable** — load
   `docs/standards/guardrails/bypass-and-exceptions.md#fix-it-restructure-it-or-suppress-it-in-that-order`
   before reaching for a marker; a change that only moves a finding without
   changing the risk is evasion, not a fix.

8. **Licence recommendation**, once step 7 has left the repository with a
   populated dependency-licence register — only when the repository itself
   declares no licence (`package.json`'s `license` field absent or blank; this
   toolkit's own repository is its first case, and carries none). Load
   `docs/standards/guardrails/gate-6-pull-request.md#licence-policy-a-table-not-two-allow-lists`
   and read two things already established by now: the resolved dependency
   set's own conditions (a dependency imposing share-alike or source-disclosure
   rules out a permissive licence for anything that ships alongside it) and
   the intended use (a published library, an internal service, a CLI tool, a
   hosted service — visible from whether step 6 found anything to deploy, and
   from `package.json`'s own `bin` or `main`/`exports` fields). **Recommend a
   licence, with the reasoning and the alternatives rejected, in the bootstrap
   report — do not choose one.** Selecting a licence is the owner's decision,
   in the same class as accepting a risk or a licence exception: this skill
   never writes a `LICENSE` file on its own initiative, the same restraint
   `docs/standards/guardrails/agent-integration.md` already asks for on any
   decision the standards reserve for a human.

9. **Docs style**, once the repository starts writing its own `/docs`. Load
   `docs/standards/docs-style.md` and `skills/docs-review/SKILL.md` when the
   first document is drafted — not before, and not as a reason to write
   documents nobody asked for. This is also where the standards themselves
   move into the repository: **instantiate each standard steps 2–7 actually
   used into the repository's own `docs/standards/`, tuned in the same pass
   that copies it**
   (`docs/standards/docs-style.md#standards-in-a-consuming-repository`) —
   never a link back to this corpus's canonical home, which fails offline and
   drifts the moment `main` moves here.

   **Tune while copying, not in a pass that comes after.** A corpus copied
   whole and left for a later tuning pass is the observed failure: audited,
   it read as 27 files carried over with 26 of them at zero content change.
   Derive what to drop from a fact the repository already states, not
   judgement, one file at a time: drop a stack's tooling rows when step 2
   found no manifest for that stack (`*.csproj`/`*.sln`, `pyproject.toml`,
   `go.mod`, `Cargo.toml`, and their siblings); drop multi-component content
   when [the component map](../../docs/standards/guardrails/components.md)
   declares one component; drop gate 8's environment procedure when no
   deployment target from step 6 is an environment rather than a registry;
   drop a file class's documentation when `.gitattributes` does not declare
   that class. Record every removal — the property of the repository that
   made it inapplicable, not merely that something is gone — and name the
   upstream commit each instantiated standard was copied from, so drift
   becomes a diff someone can run rather than a worry nobody can act on.

   **Copying an ADR or a register row carries no approval with it.** This
   step tunes `docs/standards/`, not `docs/ADR/` or `docs/registers/` — but
   an implementer who also carries an approved decision record or register
   row across (a licence acceptance, an accepted suppression) must strip the
   approval when copying it, the same as any other content this step tunes:
   an ADR of a reserved class arrives `status: Proposed` with `approver`
   removed, a register row arrives with its Approver cell empty. An approver
   names a human who reviewed _this_ repository's record; a byte-identical
   copy proves no such review happened here, whatever the source said. See
   [registers.md: approval is an event, not a
   field](../../docs/standards/guardrails/registers.md#approval-is-an-event-not-a-field).

   **Wire what you copy, in the same commit as the copy.** A reference
   checker is not adopted by sitting in the tooling directory:
   `scripts/check-standards-instantiation.mjs` must be copied into this
   repository's own tooling directory, wired into this repository's own
   gate 7 **and** wired into gate 6, blocking, whenever the pull request's
   range touches `docs/standards/` — the file's own header states both, and
   `scripts/check-script-wiring.mjs` reports the gate 7 half as a finding if
   its wiring is skipped. Run it once by hand against the freshly
   instantiated `docs/standards/` before moving on, to confirm the wiring
   took. Gate 7 alone is not the finish line: it sweeps unconditionally and
   only ever reports, so a corpus left un-tuned reads as findings nobody
   ever has to clear. This step is not done while
   `node <tooling-dir>/check-standards-instantiation.mjs` reports a finding
   — tune the flagged document, or record why the finding stands (a
   deliberate exception, not an oversight), before moving on.

   Skip what does not apply (no deployment strategy for a repository with
   nothing to release) and record the omission, the same as any other
   skipped step. Then write the enforcement map: one row per standard the
   repository carries, naming the configuration file or gate that actually
   enforces it — the part no upstream text can supply, because it names
   files only this repository has. This repository's own
   [`docs/standards-enforcement.md`](../../docs/standards-enforcement.md) is
   the worked example. Where the enforcement map also notes what is left open
   (a gap reported rather than fixed, a reserved decision), that note follows
   [docs-style.md: Fix
   62](../../docs/standards/docs-style.md#standards-in-a-consuming-repository) —
   it cites the bootstrap report's own gate-sourced list rather than
   recomputing a second one from memory.

   **Checkpoint, answerable by looking:** the instantiated corpus carries at
   least one recorded removal (or a stated reason none applied) in the same
   commit that created `docs/standards/`, or names the follow-up commit
   tuning is deferred to. A corpus with no removal recorded and no named
   follow-up is the failure above, recurring. **The record lives in a
   `PROVENANCE` note or the enforcement map — never only in the bootstrap
   report.** A session report is not where anyone looks a year later; a
   bootstrapped repository once recorded every removal there, correctly
   reasoned, with the enforcement map carrying none of it —
   `findRemovalsOutsideEnforcementMap`
   (`scripts/check-standards-instantiation.mjs`) is the check.

   **Checkpoint, answerable by running:** this step is not finished while
   `node <tooling-dir>/check-standards-instantiation.mjs` reports a finding
   against the freshly instantiated `docs/standards/` — zero findings, or
   every remaining one named in the bootstrap report with the reason it
   stands, not merely disclosed as still-open work. A completion claim for
   this step that does not cite this command's own output is exactly what
   [never claim more than was checked](../../docs/standards/guardrails/cross-gate-rules.md#never-claim-more-than-was-checked)
   forbids.

   **Generate the bootstrap report's own "what remains" section from gate
   output — never write it from memory.** Run gate 6 (or gate 7 where the
   repository cannot yet run gate 6 — no pipeline wired yet, say), and
   record each finding line it prints verbatim, naming the check that
   produced it. One bootstrap report claimed gate 6 was red on four licence
   rows; the gate's own output carried four licences, nine advisories and an
   osv-scanner finding naming seven CVEs — fourteen finding lines, and a
   correction commit that fixed the advisory undercount still never
   mentioned the osv-scanner failure, because the correction was written
   from memory the same as the original. Prose explaining or grouping the
   findings is the implementer's own; the list of findings is the gate's —
   copied, not recalled
   ([docs-style.md: report
   guidance](../../docs/standards/docs-style.md#standards-in-a-consuming-repository),
   [cross-gate-rules.md: a claim about a set names the command whose output
   produced it](../../docs/standards/guardrails/cross-gate-rules.md#never-claim-more-than-was-checked)).

   **Fix 61 — the list is the verbatim output of that one command, never an
   assembly of individually run checks.** A later bootstrap report cited this
   rule ("copied from gate output, not recalled") and still listed 5 of a real
   16 findings, because the implementer ran the licence check it recognised
   and stopped there — reasoning that the rest were "network/PATH-resolved,"
   which was false for `check-dependency-advisories.mjs`, a local Node script
   run the same way as the licence check that was cited. Choosing which checks
   to run and pasting their output together is where a check gets dropped,
   even once the source of each individual number is honest. Run the gate
   itself — `gate-6-pull-request.mjs`, or the platform's gate-6 job, reading
   its own job log rather than a summary of it (below) — and record what it
   printed. A check that genuinely cannot run locally is a line in that same
   output, reported unavailable; it is never a line quietly missing because
   the implementer judged it out of scope.

   **Checkpoint, answerable by looking:** the report names the single command
   whose output produced its outstanding-work list; that list's line count
   equals the finding count in that command's own output; and a check the
   implementer could not run locally appears in the list as unavailable,
   never as an absence nobody can see. A finding present in the gate's own
   output and absent from the report is a defect in the report.

## What done looks like

- Every step above has evidence, not configuration alone.
  `skills/guardrail-audit/SKILL.md`'s "Verifying rather than assuming" section
  applies here too: a check is real once you have seen it fail on something it
  should fail on, not merely once it appears in a config file.
- A step skipped because it does not apply yet (no release target, no `/docs`)
  is recorded as skipped and why, not silently absent.
- The root instruction file is the only place operating rules live; every
  other harness file it applies to is a pointer, not a copy.
- The repository's `docs/standards/` holds the standards it is actually held
  to, each naming the upstream commit it came from — not a link to this
  corpus's canonical home — and an enforcement map names what actually
  enforces each one. A pointer here is a finding, the same as a pointer-only
  directory instruction file is one.
- **Every completion claim in the bootstrap report names the check that
  supports it.** "The logging standard is tuned in full" is a claim about a
  document; the check that supports a claim of completeness for one document
  is that document's own instantiation check
  (`node <tooling-dir>/check-standards-instantiation.mjs`, or the equivalent
  for a judgement-based checkpoint: which one was read, and what was found)
  reporting zero findings against it — not that it was edited, or that most of
  it reads correctly. One iteration reported the logging standard "tuned in
  full" while it still carried four `.NET`/`React` references and dead
  `cspell:ignore` tokens, undisclosed; the two documents that iteration
  actually finished were finished properly, and reported the same way this
  bullet asks for. This is [never claim more than was
  checked](../../docs/standards/guardrails/cross-gate-rules.md#never-claim-more-than-was-checked)
  applied to the report itself, not only to a gate's own verdict: a completion
  claim broader than the check performed sends whoever reads the report
  looking in the wrong place, the same as any other finding stated wrong.
- **Every numeric claim anywhere in the report names the command that
  produced it — not only the outstanding-work section.** Fix 57: a report
  whose outstanding-work section was already generated from gate output
  still stated, in its "What was done" narrative, `node --test … reports
225 pass, 0 fail`, while CI on the same commit reported `pass 219 / fail 2
/ cancelled 4`. Any count, any "all X pass", any "N findings" —
  wherever it appears in the report — names its command, and where a gate
  produces the identical figure for the same commit, the report quotes the
  gate's number, not a local run's: a local run that passes reliably while
  CI's does not are two different instruments, and citing the local one is
  citing the wrong one, not lying.

## Rules

- **Stream progress and blockers as you go**, and do not stop to ask a
  clarifying question — take the reasonable option, proceed, and record the
  choice and the rejected alternative. A stated failure with its reason is a
  valid outcome; a silent stop, or a question instead of one, is not. This
  overrides a skill or harness default that says to pause for approval on an
  approach or a scope. It never overrides a pause for a destructive or
  irreversible action, or for a decision the standards reserve for a human.
  Full rule: `docs/standards/guardrails/agent-integration.md`.
- **Do not read the corpus front-to-back before starting.** Each step above
  names the one reference it needs; the rest can wait for their own step.
- **Do not dispatch a sub-agent to digest the standards as a whole.** A
  sub-agent given "read the standards and report back" has the same problem
  this skill exists to solve — hand it one step's reference instead, or do the
  step yourself.
- **Do not invent a step this order omits.** A gap you notice becomes a
  finding for the human, per `docs/standards/guardrail-standards.md`, not an
  extra phase folded in here.
- **State which check backs each completion claim in the report, while
  writing it — not a status word with nothing behind it.** "Tuned" or
  "done" for a document names the check that ran and what it reported; a
  step reported complete with no check named is indistinguishable, to
  whoever reads the report next, from one that was never checked at all.

## References

- `docs/standards/README.md` — the full standards index, for anything this
  order does not cover.
- `skills/guardrail-audit/SKILL.md` — the gate-by-gate audit and adoption
  order this skill sequences around.
- `skills/testing-review/SKILL.md`, `skills/logging-review/SKILL.md`,
  `skills/deployment-review/SKILL.md`, `skills/docs-review/SKILL.md` — the
  per-standard procedures each step above hands off to.
- `docs/standards/guardrails/agent-integration.md` — the root instruction
  file rule, and the progress, blocker and question rule above.
