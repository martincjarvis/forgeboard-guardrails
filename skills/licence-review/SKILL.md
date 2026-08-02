---
name: licence-review
description: Use when asked to review, audit, or approve third-party licences in a repository — inventories every dependency's licence with the stack's own tooling, flags policy conflicts, and produces the attribution file where distribution requires one.
---

# Licence review

Audit-time, read-only. Not a commit gate: licences change on dependency
bumps, so this runs on demand and before a release, and its findings are
decisions for a human — accepting a licence is owned like any other
exception ([docs/standards.md](../../docs/standards.md)).

## Inventory — the stack's own tool

| Stack  | Command                                                              |
| ------ | -------------------------------------------------------------------- |
| Node   | `npx license-checker-rseidelsohn --summary` (`--csv` for the detail) |
| dotnet | `dotnet-project-licenses -i . -u` (install as a local tool)          |
| Python | `pip-licenses --format=markdown`                                     |

GitHub's dependency graph / licence data covers most of this on-platform —
prefer reading it (`gh api repos/{owner}/{repo}/dependency-graph/sbom`)
before installing anything.

## Judge

1. **Policy first.** If the repository states a licence policy, apply it.
   Absent one, flag for a human: copyleft (GPL/AGPL) reached by _distributed_
   code; licence-less packages; licence changes since the last review.
2. **Usage matters.** A GPL dev-tool run at build time is not the same
   finding as a GPL library linked into a shipped binary — state which.
3. **Attribution.** Where the repository distributes artefacts, generate or
   refresh the third-party notices file with the inventory tool's output;
   missing attribution for a shipped dependency is a finding.

## Report

Verdict line (counts by licence family), findings ordered by risk (each:
package, licence, how it is reached, the ask), then the full inventory as an
appendix. Acceptance of any flagged licence is recorded by a human — a PR
review on the notices file or the repository's licence policy, not a
register.
