---
type: reference
summary: The densest gate — sixteen checks over staged content, in a fixed order, from staged-content isolation through to the changed-component build and tests.
read_when: Configuring commit-time checks, or working out why a commit was refused.
---

# Gate 2 — Commit

The densest gate. Everything here reads **staged content**, not the working
tree, so a partially staged file is judged by what is actually being committed.
Checks run in the fixed order below and stop at the first failure.

## 2.1 Preconditions

| #   | Check                    | Type      | Fails when                                                                                                               |
| --- | ------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | Protected branch         | Policy    | The commit targets a protected branch directly                                                                           |
| 2   | Staged-content isolation | Integrity | After isolation, the files on disk still differ from the index, or the comparison itself cannot run                      |
| 3   | Dependency lock sync     | Integrity | A manifest is staged without its lock file, or a lock file is staged with neither a manifest change nor a stated upgrade |

**The protected branch name is derived, not declared.** It resolves from
`origin/HEAD` — the remote-tracking ref that already names the remote's default
branch, and the same source of truth [gate 0](gate-0-baseline.md) reads to
decide what to rebase onto. A name held in a repository-specific configuration
file instead is one more place for it to drift from what the remote already
says, and it drifts silently the day the default branch is renamed. Check 1
refuses when the branch `HEAD` currently names is the one `origin/HEAD`
resolves to.

**Check 1 runs locally regardless of whether the server-side equivalent can
currently be configured.** [Gate 6](gate-6-pull-request.md) names branch
protection as the authority; that authority being unreachable — a private
repository on a plan without it, say — is a reason to record the gap, not a
reason to drop the local refusal. Dropping both leaves a protected branch with
no refusal at all: this check is what actually stops a direct push when
nothing server-side does.

**Partial staging is supported, and check 2 is what makes it safe.** Staging
half a file's changes is normal and this gate judges the staged half. Achieving
that takes a mechanism, and check 2 verifies **that mechanism worked**, before
anything reads a file. It is not a check on whether the author staged a whole
file.

Check 2 is the load-bearing one: every later check reads files from disk, so
content on disk that is not the content being committed means the gate judged
the wrong thing. An unverifiable result must block and must say it is unknown —
never claim a breach the check did not establish.

**Isolation is a property of the whole gate, not of the file-scoped checks it
is usually explained through.** Checks 4–10 in 2.2 are the ones that need a
mechanism to hide the unstaged remainder while they run, so the isolation
mechanism tends to get described in terms of them. The property it guarantees
is broader than that: every check in this gate that reads a file must read
the content actually being committed, and that includes the repository-level
checks in 2.3 that run last — machine-identifying content (9), the suppression register (15), the licence register (16) are file-content
checks the same as the formatter and the linter are, and the isolation
guarantee has to survive as far as they run, not only as far as 2.2.

**The concrete trap is a mechanism scoped to only the file tier.** A
hide-and-restore implementation that stashes the unstaged remainder, runs
checks 4–10, and restores the working tree once that tier is done leaves
every check after the restore reading the working tree again — whatever the
author has since edited into it, not the blob that was staged. Stage a
violation, edit the working copy to remove it without re-staging: the commit
still contains the violation, but a check that runs after the restore reads
the edited file and finds nothing. **Read staged content directly, at
whichever point in the gate a check runs, rather than trusting a restore that
already happened**: `git show :<path>` reads the staged blob for a given
check, the same index-relative form `git cat-file -s :<path>` already uses for
file size (check 10).

### Two ways to isolate, both git's

**The mechanism is a git one, not a language one.** Any stack can implement it;
no stack needs a particular ecosystem's tooling to have this check. There are
two families, and they differ in what check 2 has to verify.

| Family                    | How                                                                                    | Check 2 verifies                                        | Costs                                                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Materialise the index** | `git checkout-index --all --prefix=<dir>/` writes exactly the staged content elsewhere | The materialised tree is complete and matches the index | Checks run outside the repository, so anything resolving configuration or imports from the working tree needs its paths adjusted |
| **Hide and restore**      | Stash the unstaged remainder, run the checks against the working tree, restore it      | The working tree matches the index after hiding         | Mutates the working tree; a hard kill mid-run can leave changes stashed, so the failure mode must be recoverable and documented  |

**Prefer materialising for file-scoped checks** — the formatter, the scanners,
the linters. Nothing touches the author's working tree, so nothing can be lost.

**Hide-and-restore is for checks that need the real tree**: a build, a test run,
anything resolving a project graph or a module path. Those cannot run against a
detached copy without more path surgery than the isolation is worth.

A repository may use both — materialise for 2.2, hide-and-restore around 2.3 —
provided check 2 verifies whichever is in force at the time.

**One consequence worth stating**: because the formatter rewrites and re-stages
(check 4), the isolation must survive that write. A mechanism that snapshots
once and never re-reads will judge later checks against pre-format bytes.

**Check 3 runs in both directions**, and the two have different verdicts. A
manifest without its lock file **blocks**: the dependency set on disk is not the
one declared, and every later dependency check would read a stale answer. A lock
file with no manifest change **pushes back**: it is usually a regeneration
nobody intended, moving transitive versions inside a change about something
else, but a deliberate upgrade looks identical in the diff. The gate cannot tell
intent, so it asks — and the answer is the upgrade stated in the commit message
or a decision record.

## 2.2 File content

Run over staged files, formatter first so later checks read the final bytes.

| #   | Check                          | Type          | Scope               | Fails when                                                                          |
| --- | ------------------------------ | ------------- | ------------------- | ----------------------------------------------------------------------------------- |
| 4   | Universal format               | Format        | All supported files | Never blocks; rewrites and re-stages, honouring `.editorconfig`                     |
| 5   | Prose lint                     | Documentation | Documentation files | Structural rules violated                                                           |
| 6   | Secret scan                    | Security      | All files           | A credential, key or token is present                                               |
| 7   | Spelling                       | Documentation | All files           | A token is absent from dictionary and file-local vocabulary                         |
| 8   | Cross-language static analysis | Security      | Source files        | A security or correctness rule matches                                              |
| 9   | Machine-identifying content    | Security      | All files           | An absolute local path, a user name or host layout detail appears in a tracked file |
| 10  | File size                      | Size          | All files           | A file exceeds the byte-size limit                                                  |

Check 9 guards the same content the [diagnostic-log rules](diagnostic-logs.md)
keep out of version control, in the place it is more often leaked: a path pasted
into a configuration file, a home directory in an example command, a machine
name in a comment. It is cheap, pattern-based, and it is the difference between
a placeholder and somebody's user name in the history forever.

Check 10 exists because change size is measured in lines, which says nothing
about a committed binary. Its warn band pushes back; its error band blocks. The
urgency is that the failure is effectively permanent — a large object in the
history stays there without a rewrite everyone has to act on.

**It is the one Size check that does not vary by file class.** Everywhere else,
a test file gets a warning where a production file gets a push back, because a
long test file is usually repetitive rather than badly designed. Bytes do not
work that way: a five-megabyte fixture costs every clone exactly what a
five-megabyte asset costs, and permanence does not care which directory it
landed in.

**A binary large enough to warn should prompt large-file storage**, where the
remote supports it. The refusal names it as the first option, because storing
large objects outside the history is the fix that keeps working — the file stays
versioned, the clone stays small, and the history stays rewritable by anyone who
needs to. Where the remote offers no such support, the choice narrows to
committing it deliberately or keeping it out, and the register row records which
was chosen.

## 2.3 Repository rules

These still read staged content, the same guarantee established for check 2
above — a check here that reads the working tree instead has quietly fallen
outside the gate's isolation, even though it runs nowhere near the mechanism
that provides it.

| #   | Check                            | Type        | Fails when                                                                                                                                  |
| --- | -------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 11  | Per-path lint rules              | Correctness | A path-scoped linter or type checker reports any problem, its own analysers included                                                        |
| 12  | Build                            | Correctness | The changed component fails to build, or the compiler or its analysers emit a warning                                                       |
| 13  | Unit and architecture tests      | Correctness | A unit test fails, or an architecture test finds the code breaking the structure it claims                                                  |
| 14  | Repository-wide tests            | Correctness | A repository-level check fails                                                                                                              |
| 15  | Suppression register             | Policy      | A suppression comment exists with no complete register row                                                                                  |
| 16  | Dependency licence register      | Policy      | A resolved dependency has no register row, or its row records a licence the lock file no longer resolves to                                 |
| 17  | Third-party attribution register | Policy      | A row claims a third-party defect with no upstream ticket URL and recorded state, and carries no `unattributed` sentinel (change-triggered) |

Check 11 runs a linter and a type checker together, and neither substitutes for
the other — see
[thresholds: the stack's analysers win](thresholds.md#the-stacks-analysers-win).

Check 13 runs two kinds together: unit tests, and the architecture tests that
assert on the shape of the code rather than its behaviour. Both need nothing but
the source, both must fail the moment the structure drifts, and an architecture
nobody enforces mechanically is a diagram.

**A test process spawned from the hook inherits git's environment.** Git
exports `GIT_DIR`, `GIT_INDEX_FILE` and `GIT_WORK_TREE` into every process the
hook spawns. A test that builds a throwaway git repository and passes it only
a working directory, expecting an isolated sandbox, does not get one: git
resolves the inherited variables before it looks at the directory the process
was started in, so the test operates on the repository running the hook — its
real index, its real `HEAD`. This is not hypothetical: a suite run this way
once committed against the real index and deleted the tracked corpus in a
single commit, recovered in full but avoidably. **Strip `GIT_*` from the
child environment** before spawning a test process from a hook.

Checks 12 and 13 run **only for components the staged paths touch**, per
[the changed-component rule](components.md#the-changed-component-rule). Check 14
is the exception by design: it covers repository-level invariants that belong to
no component, so it is scoped to be cheap enough to run every time.

Check 16 is [change-triggered](change-triggered-checks.md): it runs when the
lock file is in the change, and reports a visible skip otherwise. It checks
**completeness**, not policy — that every resolved dependency has a row and the
row is current. Whether the licence is acceptable is check 7 of the
[pull request pipeline](gate-6-pull-request.md), against the allow list.
Splitting them this way is what lets the cheap half run on every dependency
change without resolving the whole set on every commit. The two checks are
not one job under two names — see
[registers: completeness and policy are different checks](registers.md#the-dependency-licence-register).

**Check 5 (prose lint) is the documentation check that belongs at the commit
gate, and it runs over the staged files only.** Its rules are per-file —
heading style, fence languages, spacing — answerable from a single file, so a
commit need only be self-consistent. The cross-file documentation checks moved
to [gate 5](gate-5-push.md): a repo-wide markdown sweep and link/anchor
integrity, both of which need the complete set to judge, and a pushed series is
where that set exists. Holding either here widened the commit gate beyond the
staged subset — `.markdownlint-cli2.jsonc` used to glob the whole tree on every
commit — so the two scopes are now chosen at their call sites, not in shared
configuration ([scope-split spec](../../specs/2026-08-01-markdown-gate-scope-design.md)).

## 2.4 Technology-native analysis

Static analysis arrives in two layers, and they are not substitutes.

| Layer                      | Runs as                                     | Sees                                                                       |
| -------------------------- | ------------------------------------------- | -------------------------------------------------------------------------- |
| Cross-language (8)         | Its own pass over source files              | Patterns expressible without a compiler; every language at once            |
| Technology-native (11, 12) | Part of the stack's own lint and build step | Types, symbols and data flow, at the depth only that stack's toolchain has |

The native layer catches what the cross-language layer structurally cannot — a
tainted value reaching a sink three calls away, a disposal that never happens,
an API used in the one way its own maintainers consider unsafe. It is also the
earliest possible point: the author sees it in the same output as a type error,
seconds after writing it, without invoking anything extra.

Rules:

- **Analysers run inside the existing lint or build step, never as a separate
  pass.** A separate command is one the author forgets, the pipeline runs
  differently, and the two drift. If the stack's linter or compiler can host the
  rule set, that is where it lives.
- **Every language in the repository has a declared analyser set.** A language
  with none is a recorded gap, not silence. The set is named in configuration
  that is checked in, so every machine and the pipeline resolve the same rules.
- **Start from the analyser's recommended rule set**, then subtract with a
  reason rather than building up from nothing. A rule set assembled by hand
  contains what its author already knew to worry about, which is the set of
  problems they have already had.
- **Security rules are enabled by default, not opt in.** Ship the shared
  configuration with the stack's security rule set turned on, and enable it once
  centrally rather than per project. A rule set nobody switches on protects
  nothing.
- **Analyser findings are build warnings, and a warning is a failure.** Severity
  is not a matter of taste per project: the zero-warning line in the
  [cross-gate rules](cross-gate-rules.md) covers analyser output the same as
  compiler output.
- **Analysers are pinned dependencies.** A floating analyser version makes the
  build non-reproducible and turns someone else's upgrade into your red build.
  Pin them, and upgrade deliberately as a change of its own.
- **One rule set, two outputs.** The same analysers, at the same versions and
  configuration, produce the developer's console output locally and the SARIF
  the pipeline publishes. A finding that appears in one and not the other is a
  configuration defect, not a difference of scope.

## Running it by hand

The staged set is `git diff --cached --name-only --diff-filter=ACMR`. Every
command below takes that list.

| #   | Check                            | Command                                                                                                                                                                                                              |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Protected branch                 | `git rev-parse --abbrev-ref origin/HEAD` resolves the protected branch (strip the `origin/` prefix); refuse when `git rev-parse --abbrev-ref HEAD` names the same branch                                             |
| 2   | Staged-content isolation         | Materialise: `git checkout-index --all --prefix=/tmp/staged/`. Hide-and-restore: `git diff --name-only` — empty output means the tree matches the index                                                              |
| 3   | Dependency lock sync             | `npm ci --dry-run` · `dotnet restore --locked-mode`                                                                                                                                                                  |
| 4   | Universal format                 | `npx prettier --check <paths>` · `dotnet format --verify-no-changes`                                                                                                                                                 |
| 5   | Prose lint                       | `npx markdownlint-cli2 <paths>`                                                                                                                                                                                      |
| 6   | Secret scan                      | `npx secretlint <paths>`                                                                                                                                                                                             |
| 7   | Spelling                         | `npx cspell --no-progress <paths>`                                                                                                                                                                                   |
| 8   | Cross-language analysis          | Deferred — `semgrep` fetches its rules over the network, so it runs at [gate 7](gate-7-on-demand.md) and in CI, not here ([cost tiers](cross-gate-rules.md#checks-are-tiered-by-cost-and-the-tier-decides-the-gate)) |
| 9   | Machine-identifying content      | `npx secretlint <paths>` with the path rules enabled, or a repository rule                                                                                                                                           |
| 10  | File size                        | `git cat-file -s $(git rev-parse :<path>)` — bytes as staged                                                                                                                                                         |
| 11  | Per-path lint                    | `npx eslint <paths>` · `npx tsc --noEmit` · `dotnet format --verify-no-changes`                                                                                                                                      |
| 12  | Build                            | `npm run build` · `dotnet build -warnaserror`                                                                                                                                                                        |
| 13  | Unit tests                       | `npm test` · `dotnet test`                                                                                                                                                                                           |
| 14  | Repository-wide tests            | The repository's own repository-level check command                                                                                                                                                                  |
| 15  | Suppression register             | `git grep -nE 'eslint-disable\|nosemgrep\|ts-expect-error'`, compared against the register                                                                                                                           |
| 16  | Dependency licence register      | `npm ls --all --json` · `dotnet list package --include-transitive`, compared against the register                                                                                                                    |
| 17  | Third-party attribution register | `node scripts/check-third-party-attribution.mjs`, compared against the register (runs when the register is staged)                                                                                                   |

Prefer Node tooling where the stack has no native equivalent — the formatter,
the prose lint, the spell check and the secret scan are stack-independent, and
one implementation across every repository is worth more than a per-stack
choice. Where the stack does have one, it wins: `dotnet format` over a generic
formatter for C#, the compiler's own analysers over an external pass.

## Verification

- [ ] A commit on a protected branch is refused.
- [ ] The protected branch name is read from `origin/HEAD`, not from a
      repository-specific configuration value — renaming the default branch on
      the remote changes what check 1 refuses without editing this repository.
- [ ] The protected-branch check still runs, and still refuses, on a host where
      the server-side branch-protection equivalent cannot currently be
      configured — the platform limitation is a recorded gap, not a reason to
      drop the local check.
- [ ] A change touching one component builds and tests that component only.
- [ ] A change to a component's dependency also builds and tests its consumers.
- [ ] A partially staged file is judged on its staged half only.
- [ ] An isolation check that cannot run blocks the commit and says the result is
      unknown, rather than passing or claiming a breach.
- [ ] A repository-level check (9, 15 or 16) still reads staged content, not
      the working tree: stage a violation — a leaked absolute path is enough —
      edit the working copy to remove it without re-staging, run the gate, and
      confirm it still refuses.
- [ ] The isolation mechanism is implemented with git, not with one ecosystem's
      task runner — a repository in any language has this check.
- [ ] Where the working tree is mutated to isolate, an interrupted run leaves the
      author's unstaged work recoverable, and the recovery is documented.
- [ ] The checks after the formatter read the reformatted, re-staged bytes — a
      file the formatter rewrote is judged in its final form, not its staged one.
- [ ] A manifest change without its lock file is refused.
- [ ] A planted credential is refused.
- [ ] An absolute local path or a user name in a tracked file is refused, and a
      placeholder passes.
- [ ] A file over the byte-size limit is refused before it enters the history.
- [ ] A documentation file breaking a structural prose rule is refused.
- [ ] A commit touching one markdown file lints that one file alone — the prose
      check is scoped to the staged subset, and an unrelated malformed draft
      elsewhere in the tree does not refuse a commit that does not touch it
      (the repo-wide sweep runs at [gate 5](gate-5-push.md)).
- [ ] An unknown word not in the file's own vocabulary is refused.
- [ ] A lint or type-check failure is refused independently of the build — the
      two are separate checks and either alone blocks.
- [ ] A repository-level check fails the commit even when no component changed.
- [ ] A build warning is refused under a zero-warning policy.
- [ ] A failing unit test is refused.
- [ ] An architecture test fails when a dependency direction is violated, and it
      runs with the unit tests rather than separately.
- [ ] A test spawned from the hook with `GIT_DIR` set in the parent
      environment still operates on its own fixture, not the real
      repository — verified by exporting `GIT_DIR` before running the suite
      and confirming the repository's `HEAD` is unchanged afterward.
- [ ] A new suppression without a register row is refused.
- [ ] An upgrade that pulls in a new transitive dependency is refused until that
      dependency has a register row.
- [ ] A commit touching no lock file skips the licence register check visibly.
- [ ] Every language present in the repository has a named analyser set, or a
      recorded gap saying it has none.
- [ ] The stack's security rule set is on in the shared configuration, not
      enabled project by project.
- [ ] An analyser finding fails the build rather than printing and passing.
- [ ] Analyser versions are pinned, and an upgrade is a deliberate change.
- [ ] A finding reproduces identically from the local command and from the
      pipeline's published report.
- [ ] Each refusal is a diagnosis, per the cross-gate rule.

## References

- [Components](components.md) — what scopes checks 12 and 13.
- [Registers](registers.md) — the rows checks 15 and 16 require.
- [Change-triggered checks](change-triggered-checks.md) — why check 16 sometimes skips.
- [Gate 1 — Edit](gate-1-edit.md) — the same security rules, one file at a time.
- [Gate 6 — Pull request pipeline](gate-6-pull-request.md) — where all of this is
  re-run without the author's machine.
