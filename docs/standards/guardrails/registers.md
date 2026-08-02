---
type: reference
summary: The six checked-in registers — suppression, dependency licence, test quarantine, change size override, minimum release age and third-party attribution — their columns, and the rules common to all of them.
read_when: Adding an accepted finding, auditing what a repository has accepted, or deciding whether something is a register row or a decision record.
---

<!-- cspell:ignore rseidelsohn govulncheck -->

# Registers

A register is a **checked-in record of things the repository has accepted**. It
is reviewed in the diff, which is its whole purpose: a new dependency, a new
suppression or a newly quarantined test arrives as a row a reviewer sees, rather
than as a silent change in behaviour.

**They live in `docs/registers/`.** Important enough to be found without
searching, not important enough to sit at the top of the documentation tree
beside the standards a reader actually reads through. One file per register.

| Register                | Records                                                                | One row per            | Enforced by                                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Suppression             | Accepted findings a check would otherwise raise                        | One rule at one path   | Commit gate                                                                                                                            |
| Dependency licence      | Every resolved dependency and its licence                              | One dependency         | Commit gate for completeness, pipeline for policy                                                                                      |
| Test quarantine         | Known-flaky tests not currently blocking                               | One test               | Push gate and pipeline                                                                                                                 |
| Change size override    | Branches accepted over the change-size error band, and by whom         | One branch             | Pipeline ([an override is not a fix](cross-gate-rules.md#an-override-answers-a-push-back-it-is-not-a-fix))                             |
| Minimum release age     | Dependencies admitted past the release-age window                      | One dependency@version | Pipeline ([gate 6](gate-6-pull-request.md#61-revalidation))                                                                            |
| Third-party attribution | Defects attributed to a third-party tool, with an open upstream ticket | One tool@symptom       | Commit gate ([attribution needs an open ticket](cross-gate-rules.md#a-third-party-attribution-is-a-claim-and-it-needs-an-open-ticket)) |

## Rules common to all six

- **Each has a gate.** A register nobody can fail is decoration; the gate is what
  makes the row a precondition rather than a courtesy.
- **A row is specific.** One rule, one dependency, one test, at one path — not
  a limit of one _suppression_ per line. Two analysers can flag the same
  defect under different rule identifiers, or one analyser can fire several
  rules at one site, and every rule named there gets its own row; a row that
  covers more than the one rule, dependency or test it names is what
  generalises and silences things nobody assessed. [Bypass and
  exceptions](bypass-and-exceptions.md#exceptions-are-per-rule-per-path-and-recorded)
  restates this for suppressions specifically, because the earlier wording
  read as a count rather than a scope.
- **Every row carries a removal condition.** What would have to become true for
  the row to go. A register whose rows have no exit becomes a list of things
  nobody will ever revisit.
- **A generated inventory is not a register.** The pipeline publishes a
  dependency inventory as evidence each run; it is derived, untracked and
  reviewed by nobody. The register is the reviewed counterpart.

Every register carries the same three columns — **justification**, **removal
condition** and **approver** — and adds the columns its own subject needs.

## A register row or a decision record?

By **scope, not severity**. One accepted finding is a register row. Excluding a
check from the repository, or answering a push back, is a [decision
record](bypass-and-exceptions.md), because it outlives the change that raised
it — a licence that fails the table's decision rule is accepted on its own
register row instead, because the acceptance is about one dependency, not a
standing exclusion (gate-6-pull-request.md's own reasoning for why there is no
allow list left to extend).

**The human-approver requirement follows the decision, not the artefact it is
recorded in.** Every register in this file names its own Approver column and
requires a human there. A decision record accepting the same class of thing —
a risk, a suppression, an opt-out — needs
exactly the same human, in an `approver` field of its own
([ADR frontmatter](../../ADR/README.md)), even though an ADR's ordinary
frontmatter (`status`, `decided`, `owner`, `supersedes`) has no column that
says so on its face. Routing a decision to a record instead of a row does not
change who the standard requires to accept it — it changes where the decision
lives, nothing about who may make it. An ADR whose `owner` is a team is fine
for an ordinary design choice; the moment that same record accepts a risk,
licence, suppression or opt-out, it needs a human `approver` the same as a
register row would.

**A blank approver is not the same defect as an incomplete row, and the two
get different verdicts at gate 2.** Every column of a row is validated —
justification, removal condition and approver alike — not only the code and
scope a marker needs to find its row. A missing justification, a removal
condition of "never", or an approver that reads as a team label or a machine
(`check-adr-approver.mjs`'s own "person, not a team label" judgement, shared
rather than re-implemented) blocks the commit outright: the row is broken.
A row that is otherwise complete with **only** the approver blank is a
different thing — an agent recording a proposed suppression honestly, because
it is not the one who may accept it. Gate 2 lets that through as a **push
back**: visible in the commit output, unresolved, not a pass and not a block.
Gate 6 reads the same rows and blocks the merge on them, because nobody is
present server-side to answer a push back — see [gate
6](gate-6-pull-request.md#61-revalidation)'s own approver check. Two checks
over one set of rows, not one check behind a mode flag: gate 2 asks "is this
row complete except for approval," gate 6 asks "has a person approved it,"
and collapsing them would report the wrong verdict for whichever gate asked.

## Approval is an event, not a field

**An approver field is evidence a review happened, not a declaration that
one may be assumed.** A field can be typed by anyone at any time; an event
leaves a trace. The rule this section adds is mechanical and needs no new
metadata: **an approval is recorded in a commit distinct from the one that
introduces what it approves.** A register row or a decision record that
arrives already approved, in the same commit that created it, has not been
reviewed by anyone — whoever is named.

The gap this closes is real: a bootstrapped repository once landed an ADR
and five register rows, all naming the same person, all already accepted —
inside the single bootstrap commit, hours after that person had approved the
identical text in a _different_ repository.
`scripts/check-adr-approver.mjs`, `scripts/check-suppressions.mjs` and
`scripts/check-licence-policy.mjs` all exited 0, because none of them reads
git history or authorship — each reads only the current text, which cannot
tell a name a human typed from a name an agent copied. The code comment on
`check-adr-approver.mjs`'s own remedy — "an agent may not fill this in
itself" — is a social instruction in a comment, not something the code
checked.

Stamping a repository name into the artefact would not have closed this: the
name travels with everything else that gets copied. The defect is one level
deeper than a missing field — the corpus treated approval as something that
could be filled, when it is something that has to happen.

**Mechanically checkable, and it cannot be satisfied by copying**: a copy
lands in one commit, so the approval must follow in another.
`scripts/check-approval-provenance.mjs` is the check, wired blocking at
[gate 2](gate-2-commit.md) (staged content against `HEAD`) and
[gate 6](gate-6-pull-request.md) (per commit in the pull request's range, so
two separate, legitimate commits — a row filed, then approved later — are
never mistaken for one suspicious change). Both only ever examine commits
going forward; a `--commit <sha>` mode is the blunt instrument for auditing
one commit by hand — a bootstrap commit under review, say — without sweeping
the whole history and re-flagging a repository's own earlier, legitimately
single-commit decisions forever.

- An ADR is checked whole: if it did not exist immediately before the
  commit under test, and the commit's version is `status: Accepted` with a
  human named as approver and reads as accepting a risk, licence,
  suppression or opt-out, the approval and the record arrived together.
- A register row is checked by identity — its first two cells (Code+Scope
  for a suppression row, Dependency+Version for a licence row, the same
  pair each register's own convention already treats as the row's
  identity): if no row with that identity existed immediately before the
  commit under test, and the commit's version already names an approver,
  the same defect applies. A row filed with its Approver cell blank and
  approved by a later, separate commit — the ordinary, healthy path this
  corpus already documents below — is unaffected: only the approver cell
  changed, and the row's identity already existed.

**Instantiation strips approvals — the same rule from the opposite
direction.** Copying an ADR or a register row into a new repository is not
copying a review that happened there; see [docs-style.md: standards in a
consuming repository](../docs-style.md#standards-in-a-consuming-repository)
and the bootstrap skill's own step 9.

**Checkpoints:**

- No approver field is set in the same commit that introduced the row or
  record it approves — `scripts/check-approval-provenance.mjs`, checked at
  gate 2 and gate 6.
- An instantiated ADR of a reserved class arrives `Proposed`, with no
  approver — answerable by looking, at instantiation.
- An instantiated register row arrives with an empty approver cell —
  answerable by looking, at instantiation.
- A commit under review (a bootstrap commit, say) contains no filled
  approver field anywhere it did not already exist — `node
scripts/check-approval-provenance.mjs --commit <sha>`, run by hand. The
  blunt instrument, and the one that would have caught it.

## The suppression register

| Column            | Holds                                         |
| ----------------- | --------------------------------------------- |
| Rule              | The single rule identifier being silenced     |
| Path              | The one path it is silenced at                |
| Justification     | Why the finding is accepted rather than fixed |
| Removal condition | What would let the suppression be deleted     |
| Approver          | The human who accepted it                     |

## The test quarantine register

The columns are here; the rules that make them mean anything — no silent
retries, quarantined tests still run, expiry blocks — are in
[Flaky tests](flaky-tests.md). Auditing quarantine needs both.

| Column            | Holds                                                               |
| ----------------- | ------------------------------------------------------------------- |
| Test              | The single test identifier                                          |
| Owner             | Who is fixing it — a name, not a team                               |
| Justification     | The cause, or the current hypothesis if the cause is not yet known  |
| Expiry            | The date the quarantine stops being accepted                        |
| Removal condition | What would let the test block again — normally "the cause is fixed" |
| Approver          | The human who accepted it                                           |

## The dependency licence register

| Column               | Holds                                                                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency           | Name, as resolved                                                                                                                                                       |
| Version              | The pinned version or range the register was assessed against                                                                                                           |
| Licence              | The licence as resolved, as a proper SPDX identifier or expression — not as advertised in documentation, and not a free-text rendering with spaces in place of a hyphen |
| Direct or transitive | Which, and for a transitive dependency, what pulls it in                                                                                                                |
| Scope                | Runtime or development — development-only carries no obligation to what ships (gate-6-pull-request.md's decision rule)                                                  |
| Used by              | The components that depend on it                                                                                                                                        |
| Why                  | What it is for — the row a reviewer reads when asking whether it is still needed                                                                                        |
| Decision record      | Required when the licence's table entry does not pass the decision rule on its own — names the ADR carrying the reasoning; a licence that passes needs none             |
| Obligations          | What acceptance commits the organisation to — seat or usage limits, redistribution restrictions, attribution, audit rights. Empty for a licence that passes on its own  |
| Expires              | Required for a commercial or purchased licence; the date the acceptance stops being valid                                                                               |
| Approver             | Required when the licence's table entry does not pass the decision rule on its own                                                                                      |

**A row whose licence fails the decision rule names the record that accepted
it — there is no allow list left to extend.** [Gate 6 check
7](gate-6-pull-request.md#61-revalidation) reads
[`scripts/licence-table.mjs`](../../../scripts/licence-table.mjs)'s recorded
facts, not a policy list a decision record used to grow: "permissive" and
"OSI-approved" are looked up, not chosen, so accepting a licence that fails
the table's decision rule is a decision about the one dependency that raised
the question, recorded on that row alone — its own Decision record column
names the ADR, its own Approver column names the human. Nothing about that
acceptance reaches a second row citing the same licence; each needs its own.
A row whose licence passes the decision rule on its own needs neither column.

**Completeness and policy are two different checks, not one job under two
names — and both now also check the table has an entry at all.** [Gate 2 check
16](gate-2-commit.md#23-repository-rules) asks whether every dependency the
lock file resolves — direct and transitive alike, because a transitive
dependency is exactly the one a manifest diff will not show — has a current
row in this register, **and** whether every row's licence has an entry in the
table (a coverage gap, not a policy failure — see
[gate-6-pull-request.md](gate-6-pull-request.md#licence-policy-a-table-not-two-allow-lists)).
[Gate 6 check 7](gate-6-pull-request.md#61-revalidation) asks whether the
licence on every one of those rows passes the table's decision rule. Both read
the full transitive set: narrowing completeness to direct dependencies to keep
the commit-time check cheap does not make it a smaller version of the same
check, it removes the transitive rows the policy check depends on — check 16
never asked for them, and check 7 then has nothing to judge for anything
reached through depth. The two checks need different tooling for the same
reason: completeness is a diff against the register, cheap enough to run on
every commit that touches a lock file; policy is a decision-rule evaluation
against the table, which is what gate 6 exists to do server-side rather than
on every commit.

**Three artefacts, three jobs, and they are easy to confuse.** The table is
fact: what each licence permits, requires and forbids, with a citation. The
register is the record: what is actually here, under which licence, and why —
plus, for the licences that need one, the human decision that accepted this
dependency specifically. The published inventory is evidence: what a given run
resolved. The gate reads the first two together to reach a verdict; the third
proves what the run saw.

**Drift is the failure this catches.** A transitive dependency arriving through
an upgrade is invisible in a manifest diff and unremarkable in a lock file diff
of four hundred lines. As a missing register row it is a blocked commit with a
name attached.

## The change-size override register

A row is required before `[large-pr]` clears the merge gate; see
[an override is not a fix](cross-gate-rules.md#an-override-answers-a-push-back-it-is-not-a-fix).
Identified by branch and filing date, not by rule and path — a change-size override is a
decision about one branch's own size, not about a rule silenced at a location.

| Column         | Holds                                                                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch         | The branch (or pull request) the override applies to                                                                                           |
| Filed          | The ISO date the row was filed. Never edited afterwards — with Branch it is the row's identity                                                 |
| Counted lines  | The measured change size the override answers; updates freely with every re-measurement                                                        |
| Composition    | What is driving the bulk — named, not merely totalled                                                                                          |
| Justification  | Why this size is accepted rather than the change split                                                                                         |
| Removable when | What would let the row go — normally "the change is split" or "the ported tooling is customised enough that its size no longer needs excusing" |
| Approved by    | The human who accepted it                                                                                                                      |

An agent fills in every column except Approved by — it reports the counted
size and what makes up the bulk (gate 4 already does this); it does not add
`[large-pr]` on its own authority, and does not fill in its own approver.
This register is read by branch, not by any other identity: an approved row
for one branch does not authorise a different one, so a stale acceptance
elsewhere in the register's history cannot silently cover a branch it was
never filed for.

## The minimum release age register

A dependency published very recently is the supply-chain attack window. [Gate 6
check 11](gate-6-pull-request.md#61-revalidation) refuses a dependency whose
resolved version was published inside the window declared in `.npmrc`'s
`min-release-age` (npm's own setting) unless a human-approved row here admits
it. The window and the rule live in npm's config — this register holds only the
exceptions, the same split the licence register already draws between a policy
and its accepted findings.

| Column         | Holds                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------- |
| Dependency     | Name, as resolved                                                                             |
| Version        | The exact pinned version the exception admits (the row's identity, with Dependency)           |
| Published      | The version's publish date (ISO), so staleness is checkable offline without a registry lookup |
| Justification  | Why this young version is accepted rather than waited out — normally an urgent security patch |
| Removable when | Mechanical: once the version is older than the `min-release-age` window, the row must go      |
| Approver       | The human who accepted the exception                                                          |

The **Removable when** column is mechanical rather than aspirational here, and
that is the point of the design. Every pinned version eventually passes the
window on its own, so every row is self-expiring: the staleness check (the same
gate 6 check, run over this register) reports any row whose Published date is
older than the window, so an exception cannot silently accumulate into a
permanent exemption. The Published column is what makes that checkable from the
row alone, which is why it is a column rather than a value the check re-fetches
every run — staleness must be deterministic, not network-dependent.

## The third-party attribution register

A defect attributed to a third-party tool is _verified_ only when the row
carries a link to an **open** upstream ticket — the rule, and the reasoning
behind it, live in [cross-gate
rules](cross-gate-rules.md#a-third-party-attribution-is-a-claim-and-it-needs-an-open-ticket).
Until such a ticket exists the defect is assumed to be ours and resolved, not
filed here as someone else's. The register holds the attributions that cleared
that bar, and a row may instead carry the `unattributed` sentinel to record a
defect treated as ours — measured against a tool, no upstream claim — when its
measurement needs to outlive the commit that established it.

| Column               | Holds                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tool                 | The third-party tool the symptom was observed in                                                                                                                    |
| Version              | The version the symptom was observed against                                                                                                                        |
| Symptom              | The behaviour as observed, not the inferred cause                                                                                                                   |
| Upstream ticket      | An http(s) URL to the open upstream issue tracking this defect, or the literal `unattributed` for a defect treated as ours with no upstream claim                   |
| Ticket state         | `open` or `closed`, read from the upstream tracker and recorded — a closed ticket is a prompt to revisit (the fix may be released), not a second form of "verified" |
| Minimal reproduction | The smallest input that exhibits the symptom                                                                                                                        |
| Date verified        | When the row was last confirmed against a real run                                                                                                                  |
| Removable when       | What would close the row — the fix released and upgraded past, the workaround removed, the ticket resolved                                                          |
| Approver             | The human who accepted the attribution                                                                                                                              |

The check is offline, by design: it verifies presence and shape (a URL and a
recorded state, or the `unattributed` sentinel), never fetching the URL. Whether
the ticket is still open, and whether the link still resolves, is freshness a
human checks at review — the same property that makes the minimum-release-age
register's Published column a recorded value rather than one the check re-fetches.

## Running it by hand

Resolving what is actually installed, to compare against the register:

| Purpose                          | Command                                                 |
| -------------------------------- | ------------------------------------------------------- |
| Resolved tree with licences      | `npx license-checker-rseidelsohn --json`                |
| Resolved tree, no extra tooling  | `npm ls --all --json`                                   |
| Advisories over the resolved set | `npm audit --json`                                      |
| Resolved packages, .NET          | `dotnet list package --include-transitive`              |
| Advisories, .NET                 | `dotnet list package --vulnerable --include-transitive` |

The .NET commands report advisories natively; licences there come from the
package metadata, so a licence inventory needs a tool that reads it — prefer the
host's own dependency graph where it offers one.

### Platform-specific optional dependencies

**A register generated on one host is incomplete by construction wherever
the resolved tree includes an optional, per-platform package.** `npm ls --all
--json` (or the equivalent for any package manager) reports what the current
host actually resolved — and a package published as one tarball per OS,
`@esbuild/linux-x64` and `@esbuild/win32-x64` being the recurring case,
ships each platform's binary as its own optional dependency, so `npm install`
fetches only the one matching the host it runs on. A Windows implementer
generating the register locally cannot see the Linux row at all; it exists
only once an ubuntu leg resolves the tree and nobody has reason to look there
unless they already know the package is platform-split.

`@esbuild/win32-x64@0.28.1` had a register row and
`@esbuild/linux-x64@0.28.1`, resolved on the same lock file, did not — not
because anyone skipped a row, but because the register was built once, on
one host, and `npm ls --all --json` on that host had nothing to say about
the other platform's package.

**Generate the register per platform and union the rows, or generate it on
the CI matrix that already runs every platform.** A register that ran the
resolve command on only one host names that limitation next to the rows it
produced, so a reader knows the set is partial rather than assuming a single
run was enough.

### Advisories, per stack

The dependency advisory question (gate-6-pull-request.md check 6, and its
scheduled leg) has a native answer in most ecosystems; take it before reaching
for the cross-stack fallback (osv-scanner — [gate 5](gate-5-push.md), [gate
6](gate-6-pull-request.md)). This is the convenience reference; the rule that
actually catches a broken invocation — a missing flag, a tool that always
exits 0, a scan that silently examines nothing — is the [refusal-proof
contract](cross-gate-rules.md#every-blocking-check-proves-it-refuses), not this
table.

| Stack  | Command                                                                                      | Note                                                                                   |
| ------ | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Node   | `npm audit --json` (`pnpm audit`, `yarn npm audit`)                                          |                                                                                        |
| .NET   | `dotnet list package --vulnerable --include-transitive`                                      | **Always exits 0** — parse the output, or use `--format json`                          |
| .NET   | NuGet Audit at restore (SDK 8.0.100+)                                                        | On by default; set `NuGetAuditMode=all` for transitive dependencies                    |
| Python | `pip-audit` (PyPA; checks OSV and PyPI advisories)                                           | uv and poetry have no native audit — run it against the lock file                      |
| Java   | OWASP Dependency-Check (Maven or Gradle plugin)                                              | Slow — it downloads the NVD feed                                                       |
| Go     | `govulncheck`                                                                                | Reachability analysis, so it has fewer false positives                                 |
| Rust   | `cargo audit` (RustSec advisory database), or `cargo deny` for licence and advisory together |                                                                                        |
| PHP    | `composer audit`                                                                             |                                                                                        |
| Ruby   | `bundler-audit`                                                                              |                                                                                        |
| Any    | `osv-scanner`                                                                                | The cross-stack general-purpose tier — a backstop, not a replacement for the row above |

## Verification

- [ ] Every register has a gate that fails when a row is missing.
- [ ] Every row eventually names a human approver, and an approver that reads
      as a team label or a machine is refused the moment it is written, not
      merely when it is blank.
- [ ] A row missing only its approver pushes back at gate 2 (allowed,
      visible, unresolved) and blocks the merge at gate 6 (no author present
      to answer it) — the same rows, two different verdicts, not one check
      with a mode flag.
- [ ] A row or an ADR of a reserved class that arrives already approved, in
      the same commit that introduced it, is refused at gate 2 and gate 6 —
      `scripts/check-approval-provenance.mjs`
      ([approval is an event, not a field](#approval-is-an-event-not-a-field)).
      The same row, filed with a blank approver and approved by a later,
      separate commit, is not refused.
- [ ] An instantiated ADR of a reserved class arrives `Proposed` with no
      approver, and an instantiated register row arrives with an empty
      approver cell — copying a rule is right, copying an acceptance of a
      risk made in a different repository is not.
- [ ] An ADR any register row cites in its Decision record column is treated
      as a reserved-class decision regardless of the ADR's own wording — an
      `Accepted` ADR cited this way with no `approver` is refused whether or
      not its prose uses the vocabulary the fallback check looks for
      (`scripts/check-adr-approver.mjs`, [ADR
      README](../../ADR/README.md)). The real ADR-0004 — four licences
      accepted, no use of the phrase "allow list" — with status flipped to
      `Accepted` and no approver is the regression case: it passed before
      this checkpoint existed and must be refused now.
- [ ] Every row has a removal condition, and none of them is "never".
- [ ] A row covers exactly one rule at one path (or one dependency, or one
      test) — never more than the one it names. A marker naming several rules
      on one line is legal and gets one row per rule; a row that tries to
      cover several is the defect, not the multiple markers.
- [ ] The published dependency inventory and the licence register agree; where
      they differ, the register is the one that is wrong.
- [ ] A dependency whose licence cannot be determined appears as blocked, not as
      an empty licence cell.
- [ ] A dependency licence register row whose licence fails the table's
      decision rule on its own names the decision record and the approver
      that accepted it — a blank Decision record or Approver column is
      refused, even though the row is otherwise complete.
- [ ] A row whose licence has no entry in the licence table is refused with
      its own finding, distinct from one whose licence has an entry but does
      not pass the decision rule.
- [ ] The register has a row for a transitive dependency, not only for the ones
      named in the manifest — completeness (gate 2) and policy (gate 6) both
      read the full resolved set, not the direct one.
- [ ] Every commercial acceptance names its obligations and carries an expiry,
      and no expiry has passed.
- [ ] A dependency inside the release-age window is refused at gate 6 unless a
      human-approved row in the minimum-release-age register admits it, and a
      row whose version has aged past the window is reported stale so it cannot
      accumulate into a permanent exemption.
- [ ] The dependency register covers every platform the repository's CI
      targets — a package published one optional tarball per OS
      (`@esbuild/linux-x64` and `@esbuild/win32-x64` being the recurring
      case) has a row for each platform CI actually runs, not only the host
      the register happened to be generated on.
- [ ] A register generated on a single host states that limitation, or its
      generation runs across the platform matrix instead of once.
- [ ] A row in the third-party attribution register that names a tool carries
      an open upstream ticket URL and its recorded state, or the `unattributed`
      sentinel — an empty Upstream ticket cell is refused at the commit gate by
      `scripts/check-third-party-attribution.mjs`, which verifies presence and
      shape offline and never fetches the URL.

## References

- [Gate 2 — Commit](gate-2-commit.md) — the completeness checks that enforce two
  of the three.
- [Gate 6 — Pull request pipeline](gate-6-pull-request.md) — where licence policy
  is judged.
- [Flaky tests](flaky-tests.md) — the behaviour rules behind the quarantine register.
- [Bypass and exceptions](bypass-and-exceptions.md) — when a decision record is
  required instead of a row.
- [Suppression register](../../registers/suppression-register.md) — this repository's own instance.
- [Change size override register](../../registers/change-size-override-register.md) —
  this repository's own instance.
- [Minimum release age register](../../registers/minimum-release-age-register.md) —
  this repository's own instance.
- [Third-party attribution register](../../registers/third-party-attribution-register.md) —
  this repository's own instance.
- [Cross-gate rules](cross-gate-rules.md#an-override-answers-a-push-back-it-is-not-a-fix) —
  the rule this register exists to answer.
