---
type: reference
summary: The authoritative gate — every local check re-run server-side on the merge result, evidence published in formats the host ingests, and a merge policy that refuses without them.
read_when: Building or auditing a pull request pipeline, or configuring branch protection.
---

<!-- cspell:ignore govulncheck idempotently -->

# Gate 6 — Pull request pipeline

The authoritative gate. Every gate above runs on the author's machine and is
skippable by a flag; this one runs on the server, on a clean checkout, and its
result is the one the merge policy consults. Fires on opening a pull request and
on every push to it.

Three obligations, and it must satisfy all three. A pipeline that runs the
checks but publishes nothing forces reviewers to read logs. One that publishes
evidence but does not block leaves the merge to whoever is impatient.

## 6.1 Revalidation

| #   | Check                                     | Type        | Fails when                                                                                                                    |
| --- | ----------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | Clean-checkout provenance                 | Integrity   | The pipeline builds anything the repository does not contain                                                                  |
| 2   | Merge-result build                        | Correctness | The **merge result** fails to build, not merely the branch tip                                                                |
| 3   | Every blocking local check                | Correctness | Any check from gates 2–5 fails when re-run server-side                                                                        |
| 4   | Whole-repository build and test           | Correctness | Any component fails, changed or not                                                                                           |
| 5   | End-to-end tests                          | Correctness | Health checks fail, or an end-to-end test fails, against an environment the pipeline provisioned and destroyed                |
| 6   | Dependency advisory scan                  | Security    | A dependency carries an advisory at or above the block severity, or one at the push-back severity with no record accepting it |
| 7   | Dependency licence policy                 | Policy      | A resolved dependency, direct or transitive, carries a licence outside the allow list                                         |
| 8   | Changed-line coverage                     | Correctness | Coverage of the lines this change added or modified is below the floor                                                        |
| 9   | Untrusted-run isolation                   | Security    | A run triggered from outside the repository is given credentials a trusted run gets                                           |
| 10  | Cross-stack dependency scan (osv-scanner) | Security    | osv-scanner reports an advisory with no accepted record, published as SARIF                                                   |

Check 1 is the reason this gate exists in its current form. A local run proves
the checks pass **on that machine**, with that machine's tool versions, caches
and stray files. A clean checkout proves they pass on the artefact everyone else
will get.

Check 2 catches the change that is correct on its own branch and broken against
the base it will land on. Validating the branch tip alone lets a semantically
conflicting merge through with every check green.

**Check 3 adapts each local check to the pull request's range; it does not
re-run the same command.** Every worked example in
[gate 2](gate-2-commit.md#running-it-by-hand) reads the staged index —
`git diff --cached`, `git show :<path>` — and a CI checkout of a branch has no
index: nothing is staged, the checkout already **is** the branch. The same
check runs instead against `origin/<base>...HEAD`: a check written as
`git diff --cached --name-only` becomes
`git diff origin/<base>...HEAD --name-only`, and a check reading
`git show :<path>` for the staged blob instead reads `<path>` directly from the
checkout, which already holds what the branch would commit.
[Gate 3](gate-3-commit-message.md)'s checks are scoped to a commit message
rather than to a file, and adapt the same way over the range instead of a
single message: commit-message structure and scope agreement run once per
commit in `git log origin/<base>..HEAD`, not once against the branch tip. A
check with a working local command and no server-side equivalent is not
rebuilt from nothing here — it is the same command, pointed at the range
instead of the index.

Check 4 is where [the changed-component rule](components.md#the-changed-component-rule)
is repaid. The local gates skip untouched components for speed; this gate does
not, so the optimisation never becomes an unverified claim.

Check 5 is where end-to-end tests belong when the pipeline can provision an
environment per pull request. If it cannot, they run at
[gate 8](gate-8-release.md) instead — but they exist and run somewhere, and the
checklist below asks which.

The order within the check is fixed: **deploy, then health checks, then
end-to-end**. A journey failing against a process that was never ready is a
misleading failure, and it costs a team an afternoon before anyone checks
readiness.

### The two dependency questions

Checks 6 and 7 are two different questions about the same dependency set, and
one does not imply the other. A dependency can be free of known advisories and
still carry a licence the organisation cannot accept, and the licence answer is
needed **before** the merge, not at release: by then the dependency is in the
history and removing it is a change of its own. Both read the transitive set,
because a licence obligation arrives through depth, not through the manifest.

Both are [change-triggered](change-triggered-checks.md): they run when the
resolved dependency set moved, and check 6 additionally runs on a schedule
because the advisory database moves without the repository moving. A pull
request that touches no dependency reports both as skipped, with the reason.

**Push back has no author to ask here**, so it takes the unattended form: an
advisory in the push-back band fails the check unless a record already accepts
it — a decision record where the advisory is being lived with, a register row
where the exposure is judged not to apply. The severity bands are therefore two
different questions, not two volumes of the same one. Above the block severity,
no record helps and the dependency moves or goes. At the push-back severity, the
answer is "somebody has looked at this and written down why it is tolerable",
and the check is asking whether that happened.

A record accepting an advisory is one of the few that should carry an expiry, in
the way a quarantine does. An advisory tolerated because no fix exists is a
different statement a month later, when one does.

**Scope changes the answer for both.** A dependency present in what ships and
one used only to build or test it carry different obligations: a licence that
reaches every consumer of the product versus one that reaches nobody outside the
team, and an advisory exploitable in production versus one exploitable only on a
build machine. Judge each dependency against the list for its own scope, and
record the scope in the register — a dependency that moves from development to
runtime is a change of obligation, not merely a change of position.

Check 7 is the blocking counterpart to evidence row 13 below. The inventory is
published either way; the check is what refuses the merge. It also reads a
different scope than gate 2's completeness check over the same register — see
[registers: completeness and policy are different checks](registers.md#the-dependency-licence-register).

### Four licence categories, not two

The allow lists are **enumerated identifiers, not adjectives**. "Permissive" and
"copyleft" are category judgements, and licence classification is the last place
to improvise one — two implementers will sort the ambiguous cases differently
and neither will know. A licence is on the list or it is not.

| Category                                                         | Examples                                       | Treatment                                          |
| ---------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------- |
| **Permissive**                                                   | The runtime allow list                         | Passes                                             |
| **Weak copyleft**                                                | The development allow list additions           | Passes for build and test only; blocks if it ships |
| **Strong copyleft, source-available, commercial, dual-licensed** | Everything else                                | Blocks until accepted by decision record           |
| **Unknown or absent**                                            | No licence file; a scanner reporting `UNKNOWN` | **Blocks. Never treated as unclassified-yet.**     |

**Unknown is the dangerous one, and it is not a gap in the list.** A dependency
with no licence is not unlicensed in the permissive sense — it is all rights
reserved by default, the strictest position there is. A rule written as "block
what is not on the list" invites an implementation where unknown falls through
as "not classified yet" and passes. State it as its own blocking condition, and
test it with a dependency that genuinely has no licence file.

**Source-available licences are the trap.** Some widely used licences are not
open source and restrict _offering the software as a service_ rather than using
it. A dependency under one can pass a glance, pass a naive scanner that only
looks for a licence string, and still forbid precisely what a hosted service
does with it. They are outside both allow lists deliberately.

**A commercial acceptance records more than the licence.** Purchased
dependencies carry obligations a licence identifier does not express: seat or
usage limits, redistribution restrictions, renewal dates, audit clauses. The
decision record names them, and it **carries an expiry** — a purchased licence
that lapses becomes an unlicensed dependency in production, and nothing else in
this standard would notice.

**A licence decision is an architecture decision record, not a register row.**
Accepting a licence outside the allow list, or changing the allow list itself,
binds every future dependency and every consumer of what is shipped — it
outlives the change that raised it, which is precisely the boundary between a
suppression and a decision record. Record the licence, the dependency that
raised the question, the obligations accepted, the alternatives rejected and why
they were rejected. A register row cannot carry that, and a row that tries makes
the reasoning unfindable a year later, when the question is asked again about a
different dependency.

The gate reads the allow list, not the records: the decision record is the
justification, and updating the list is how the decision takes effect.

### Coverage and untrusted runs

Check 8 is where the coverage delta stops being decoration. A repository
comfortably above its overall floor absorbs an entirely uncovered change without
the number moving enough to notice, and the floor is defended while the practice
rots. Measuring the lines this change touched is the only version of the
question that stays honest as the repository grows.

Check 9 is the one check that protects the pipeline rather than the code. A run
triggered from a fork, or by anyone who can open a pull request, executes
configuration the pull request itself supplies — so any credential that run can
reach is a credential a stranger can exfiltrate by editing a pipeline file. An
untrusted run gets the checks and none of the secrets: no deployment
credentials, no publishing tokens, no environment provisioning. Where a check
genuinely needs a credential, it runs after a human has looked, not before.

Check 10 is the local re-run cross-gate-rules.md requires of anything blocking
that also runs at a local gate — here, [gate 5's own cross-stack dependency
scan](gate-5-push.md). It reads the whole resolved dependency set, the same
repository-wide shape as checks 6 and 7, and publishes SARIF the way static
analysis findings do (evidence row 12) rather than a bespoke format. It does
not replace a stack's own advisory scanner — `govulncheck`, `cargo audit` and
the rest stay where they are faster or more precise
([cross-gate rules](cross-gate-rules.md#checks-are-tiered-by-cost-and-the-tier-decides-the-gate)) —
and it is external, resolved from `PATH`, never bundled, the same as semgrep
and lizard ([ADR-0002](../../ADR/0002-analysis-tool-distribution.md)).

## 6.2 Published evidence

Every check publishes a machine-readable artefact, not just an exit code. The
verdict answers "did it pass"; the evidence answers "what was actually run, and
what did it find" — which is the question a reviewer, an auditor and the author
of the next change each need.

| #   | Evidence                 | Type     | Form                                                                                                                                       | Consumed by                                                                    |
| --- | ------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| 10  | Test report              | Evidence | A format the host ingests without conversion — JUnit XML across most stacks, the stack's native equivalent where the host already reads it | Per-test pass, fail and skip visible on the pull request without opening a log |
| 11  | Coverage report          | Evidence | Cobertura XML, or LCOV where the stack has no Cobertura writer, plus a delta against the base                                              | The threshold verdict, and whether **this change** is covered                  |
| 12  | Static analysis findings | Evidence | SARIF from **every** analyser, cross-language and technology-native alike, uploaded to the platform's code-scanning surface                | Findings annotated on the changed lines, and tracked across runs               |
| 13  | Dependency inventory     | Evidence | Machine-readable inventory of resolved dependencies and their licences                                                                     | Supply-chain review; diffing what the change pulled in                         |
| 14  | Build and test logs      | Evidence | Retained artefacts with a stated retention period                                                                                          | Reproducing a failure after the runner is gone                                 |
| 15  | Run identity             | Evidence | Commit, merge base, tool versions, run identifier, recorded in the run                                                                     | Establishing which artefact the verdict refers to                              |

**The requirement is native ingestion, and the format follows from it.** These
are formats, not tools — the same class of thing as the commit-message and
versioning conventions this standard already names — and what makes one correct
is that the host reads it without a conversion step, turning a published file
into annotations on the diff rather than an artefact somebody downloads.

Cobertura and SARIF are near-universal on that test: every major host ingests
them, and the common coverage and analysis tools emit them directly. Test
reports are the one place to check rather than assume. **JUnit XML is the
broadest default**, but some stacks have a native result format their own
tooling emits with no extra dependency and the host already reads — and where
that is true, use it. Adding a package purely to convert a format the host would
have accepted anyway is the bolt-on the
[tooling ladder](cross-gate-rules.md) tells you to avoid.

Where a stack has neither, convert at the end of the run. The ingestion is the
point; a bespoke format loses it.

Rules that make the evidence worth publishing:

- **Published on failure as well as success** — a pipeline that uploads reports
  only when green withholds them exactly when they are needed.
- **A skipped check is published as skipped, with its reason.** An absent entry
  and a passing one must not look the same.
- **A fallback that produces plausible-looking output is not a visible skip.**
  A check that cannot run — a tool never installed, a fetch that failed —
  must be published as unavailable, naming what was missing, not replaced with
  placeholder output shaped like a real result. A step that runs the tool,
  swallows a failure, and writes a stand-in file on the same path a genuine
  report would occupy fails this even though something was written every run:
  the artefact reads as evidence and nobody notices the tool was never there.
- **Coverage carries its delta against the base**, which check 8 enforces.
- **Findings are line-annotated where the platform supports it.** A finding
  nobody sees during review is a finding that ships.
- **Evidence outlives the run.** A retention period shorter than the time to
  review makes the artefact decorative.
- **A result this repository already accepted is filtered out before
  upload, not merely tolerated in the SARIF.** A static analyser's SARIF
  output can include a finding suppressed in source (semgrep marks it
  `suppressions: [{ kind: "inSource" }]` rather than omitting it) so the
  analyser's own exit code stays honest about what it found. The platform's
  code-scanning surface has no such awareness: built from the identical
  file, it treats every result as a candidate new alert and fails the check
  on a finding the [suppression register](registers.md) already accepted.
  Filtering the suppressed result out before upload is not less honest than
  uploading it — the register is the audit trail a reviewer reads; the
  SARIF file's job on the platform is to surface what is not already
  accounted for. `scripts/lib.mjs`'s `filterSuppressedSarif` is this
  toolkit's own instance, called for every SARIF this gate uploads.

## 6.3 Merge policy

Evidence and verdicts are inert unless the platform refuses the merge. Configure
these on the protected branch, not as convention. **This is a mechanism, not
only a principle** — `scripts/configure-branch-protection.mjs` applies every
row below, idempotently, and `scripts/check-branch-protection.mjs` makes its
absence a finding rather than a silent pass, wired into gate 7 and CI; see
[branch protection](branch-protection.md) for both. Audit 8 found the
mechanism missing four times running: a red required check and a red gate 6
blocked nothing, because nothing had ever configured the platform to refuse.

| #   | Policy                                | Type   | Prevents                                                      |
| --- | ------------------------------------- | ------ | ------------------------------------------------------------- |
| 16  | Required status checks, named         | Policy | Merging with a check failing, queued, or never having run     |
| 17  | Branch up to date with base           | Policy | Merging a result that was never validated against the base    |
| 18  | Required review approval              | Policy | Merging unreviewed work                                       |
| 19  | No self-approval                      | Policy | The author clearing their own gate                            |
| 20  | Stale approvals dismissed on new push | Policy | An approval of code that no longer exists                     |
| 21  | Conversations resolved                | Policy | Merging over unanswered review findings                       |
| 22  | Direct push and force push refused    | Policy | Bypassing the pipeline entirely, and rewriting merged history |
| 23  | Required history shape                | Policy | A merge strategy the repository has ruled out                 |
| 24  | No administrator override             | Policy | A privileged account being the documented workaround          |

Policy 16 has a failure mode worth stating separately: a required check that is
**never reported** blocks correctly, but a check that is not in the required
list passes silently when it fails. Adding a check to the pipeline is not the
same act as requiring it, and the second is the one that gates.

Policy 24 is the one most often left off. If an override exists, it is the path
every urgent change will take, and the gate describes an intention rather than a
control. Where an override is genuinely needed, it is recorded the same way as
any other exception: a suppression register row, or a decision record if it
stands rather than covering one merge.

## Running it by hand

Most of this gate is platform configuration rather than a command, but the
checks themselves are the local ones re-run — see each gate's own page. What is
specific here:

| Purpose                        | Command                                                              |
| ------------------------------ | -------------------------------------------------------------------- |
| Build the merge result locally | `git merge-tree $(git merge-base HEAD origin/main) HEAD origin/main` |
| Reproduce a clean checkout     | `git clone --depth 1 <url> /tmp/clean && cd /tmp/clean`              |
| Changed-line coverage          | `npx diff-cover coverage.xml --compare-branch origin/main`           |
| Inspect required status checks | `gh api repos/:owner/:repo/branches/main/protection`                 |
| Inspect branch protection, ADO | `az repos policy list --branch main`                                 |

The falsifiable test for check 3 is worth running once at adoption: remove the
local hooks entirely, break one check deliberately, push, and confirm the
pipeline refuses the merge.

## Verification

- [ ] A branch whose local hooks were bypassed is still refused at merge.
- [ ] Every check in gates 2–5 is **re-executed** here — not merely listed. Break
      one deliberately and confirm this gate catches it, with the local hooks
      removed entirely.
- [ ] A staged-scope check — dependency lock sync, file size, the suppression
      register, licence register completeness, or gate 3's commit-message and
      scope checks — runs here against `origin/<base>...HEAD` or the commit
      range, not silently absent because its local command assumed an index a
      checkout does not have.
- [ ] Every one of those checks is also **named in the required list**, which is
      the separate act; a check that runs here but is not required passes
      silently when it fails.
- [ ] The pipeline builds only what the repository contains — an artefact
      fetched or generated outside the checkout fails provenance.
- [ ] A component untouched by the change is still built and tested here.
- [ ] Changed-line coverage below the floor fails the merge even when the
      repository total is comfortably above its own.
- [ ] A run triggered from a fork receives no deployment or publishing
      credentials, and the checks still run.
- [ ] A dependency with an unacceptable licence is refused even when it has no
      known advisory.
- [ ] A dependency with **no licence file at all** is refused, and the refusal
      says unknown rather than reporting an empty licence and passing.
- [ ] A source-available licence is refused for a shipped component, however
      open it looks.
- [ ] A weak-copyleft dependency passes for build and test and is refused when
      it moves into what ships.
- [ ] Every commercial acceptance records its obligations and an expiry, and an
      expired one fails the gate.
- [ ] The licence check reads the transitive set, not only direct dependencies.
- [ ] A runtime dependency and a development-only one with the same licence are
      judged against different lists.
- [ ] Moving a dependency from development to runtime re-runs the licence check
      against the stricter list.
- [ ] A pull request touching no dependency skips both dependency checks
      **visibly**, naming the reason.
- [ ] The advisory scan also runs on a schedule, and a newly published advisory
      is caught without anyone changing a dependency.
- [ ] Every entry on the licence allow list traces to a decision record naming
      the obligations accepted and the alternatives rejected.
- [ ] No lock file in the change was regenerated without a manifest change or a
      stated upgrade.
- [ ] A check that fails but is not in the required list is identified — that is
      the silent-pass hole.
- [ ] The pipeline builds the merge result, not only the branch tip.
- [ ] Test, coverage and static-analysis reports appear on a **failing** run.
- [ ] A run that produces no test report, or an unreadable one, fails the merge
      rather than passing on the exit code alone.
- [ ] The test and coverage reports are rendered by the host itself, not merely
      uploaded as files — if a reviewer has to download an artefact to see which
      test failed, the format is wrong for this host.
- [ ] Coverage reports a delta against the base, enforced as check 8.
- [ ] Static-analysis findings appear as annotations on the changed lines.
- [ ] A skipped check is visibly skipped, with a reason, in the published evidence.
- [ ] A check whose tool is missing or unreachable publishes an unavailable
      result naming what was missing — not a placeholder file that reads like a
      genuine artefact on a run where the tool never ran.
- [ ] The cross-stack dependency scan (osv-scanner) runs here as well as at
      gate 5, and its SARIF is published — the local-versus-server rule
      applies to it the same as any other blocking check.
- [ ] End-to-end tests run here or at gate 8, and the checklist states which.
- [ ] Health checks pass before any end-to-end test runs against the provisioned
      environment.
- [ ] Every end-to-end test asserts through public interfaces and diagnostics
      only — none reaches into a database or an internal service.
- [ ] The dependency inventory, the logs and the run identity are all published,
      and the run identity names the commit, the merge base and the tool versions.
- [ ] A pull request behind its base cannot merge until it is updated.
- [ ] A pull request with no approval cannot merge, and the author's own
      approval does not count.
- [ ] Approval is dismissed by a subsequent push.
- [ ] An unresolved review conversation blocks the merge.
- [ ] A merge producing the wrong history shape is refused by the platform, not
      by convention.
- [ ] An administrator cannot merge a pull request with a failing required check.
- [ ] A direct push to the protected branch is refused.
- [ ] `scripts/check-branch-protection.mjs` reports a pass, not a finding or a
      skip standing in for one — see [branch protection](branch-protection.md)
      for the three states and what each one means.

## References

- [Cross-gate rules](cross-gate-rules.md) — why this gate is the authority and
  the local ones are a fast copy.
- [Registers](registers.md) — what checks 6 and 7 read.
- [Change-triggered checks](change-triggered-checks.md) — when they run at all.
- [Bypass and exceptions](bypass-and-exceptions.md) — the flags this gate exists
  to put out of reach.
- [Branch protection](branch-protection.md) — the mechanism behind 6.3, and the
  check that makes its absence a finding.
- [Gate 8 — Release](gate-8-release.md) — what happens downstream of the merge.
