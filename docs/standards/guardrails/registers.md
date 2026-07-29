---
type: reference
summary: The three checked-in registers — suppression, dependency licence and test quarantine — their columns, and the rules common to all of them.
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

| Register           | Records                                         | One row per          | Enforced by                                       |
| ------------------ | ----------------------------------------------- | -------------------- | ------------------------------------------------- |
| Suppression        | Accepted findings a check would otherwise raise | One rule at one path | Commit gate                                       |
| Dependency licence | Every resolved dependency and its licence       | One dependency       | Commit gate for completeness, pipeline for policy |
| Test quarantine    | Known-flaky tests not currently blocking        | One test             | Push gate and pipeline                            |

## Rules common to all three

- **Each has a gate.** A register nobody can fail is decoration; the gate is what
  makes the row a precondition rather than a courtesy.
- **A row is specific.** One rule, one dependency, one test. A row that
  generalises silences things nobody assessed.
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
check from the repository, accepting a licence outside the allow list, or
answering a push back is a [decision record](bypass-and-exceptions.md), because
it outlives the change that raised it.

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

| Column               | Holds                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency           | Name, as resolved                                                                                                                                             |
| Version              | The pinned version or range the register was assessed against                                                                                                 |
| Licence              | The licence as resolved, not as advertised in documentation                                                                                                   |
| Direct or transitive | Which, and for a transitive dependency, what pulls it in                                                                                                      |
| Scope                | Runtime or development — which allow list the row is judged against                                                                                           |
| Used by              | The components that depend on it                                                                                                                              |
| Why                  | What it is for — the row a reviewer reads when asking whether it is still needed                                                                              |
| Decision record      | Required when the licence is outside the allow list; empty otherwise                                                                                          |
| Obligations          | What acceptance commits the organisation to — seat or usage limits, redistribution restrictions, attribution, audit rights. Empty for an allow-listed licence |
| Expires              | Required for a commercial or purchased licence; the date the acceptance stops being valid                                                                     |
| Approver             | Required when the licence is outside the allow list                                                                                                           |

**Completeness and policy are two different checks, not one job under two
names.** [Gate 2 check 16](gate-2-commit.md#23-repository-rules) asks whether
every dependency the lock file resolves — direct and transitive alike, because
a transitive dependency is exactly the one a manifest diff will not show — has
a current row in this register. [Gate 6 check 7](gate-6-pull-request.md#61-revalidation)
asks whether the licence on every one of those rows is on the allow list for
its scope. Both read the full transitive set: narrowing completeness to direct
dependencies to keep the commit-time check cheap does not make it a smaller
version of the same check, it removes the transitive rows the policy check
depends on — check 16 never asked for them, and check 7 then has nothing to
compare against the allow list for anything reached through depth. The two
checks need different tooling for the same reason: completeness is a diff
against the register, cheap enough to run on every commit that touches a lock
file; policy is a classification against the allow list, which is what gate 6
exists to do server-side rather than on every commit.

**Three artefacts, three jobs, and they are easy to confuse.** The allow list is
policy: which licences are acceptable. The register is the record: what is
actually here, under which licence, and why. The published inventory is
evidence: what a given run resolved. The gate compares the first two; the third
proves what the run saw.

**Drift is the failure this catches.** A transitive dependency arriving through
an upgrade is invisible in a manifest diff and unremarkable in a lock file diff
of four hundred lines. As a missing register row it is a blocked commit with a
name attached.

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
- [ ] Every row names a human approver, and no automated worker appears in that
      column.
- [ ] Every row has a removal condition, and none of them is "never".
- [ ] A row covering more than one rule, dependency or test is treated as a
      defect.
- [ ] The published dependency inventory and the licence register agree; where
      they differ, the register is the one that is wrong.
- [ ] A dependency whose licence cannot be determined appears as blocked, not as
      an empty licence cell.
- [ ] The register has a row for a transitive dependency, not only for the ones
      named in the manifest — completeness (gate 2) and policy (gate 6) both
      read the full resolved set, not the direct one.
- [ ] Every commercial acceptance names its obligations and carries an expiry,
      and no expiry has passed.

## References

- [Gate 2 — Commit](gate-2-commit.md) — the completeness checks that enforce two
  of the three.
- [Gate 6 — Pull request pipeline](gate-6-pull-request.md) — where licence policy
  is judged.
- [Flaky tests](flaky-tests.md) — the behaviour rules behind the quarantine register.
- [Bypass and exceptions](bypass-and-exceptions.md) — when a decision record is
  required instead of a row.
- [Suppression register](../../registers/suppression-register.md) — this repository's own instance.
