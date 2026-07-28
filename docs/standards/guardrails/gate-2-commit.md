---
type: reference
summary: The densest gate — seventeen checks over staged content, in a fixed order, from staged-content isolation through to link integrity.
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

**Partial staging is supported, and check 2 is what makes it safe.** Staging
half a file's changes is normal and this gate judges the staged half. Achieving
that takes a mechanism, and check 2 verifies **that mechanism worked**, before
anything reads a file. It is not a check on whether the author staged a whole
file.

Check 2 is the load-bearing one: every later check reads files from disk, so
content on disk that is not the content being committed means the gate judged
the wrong thing. An unverifiable result must block and must say it is unknown —
never claim a breach the check did not establish.

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

| #   | Check                       | Type          | Fails when                                                                                                  |
| --- | --------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------- |
| 11  | Per-path lint rules         | Correctness   | A path-scoped linter or type checker reports any problem, its own analysers included                        |
| 12  | Build                       | Correctness   | The changed component fails to build, or the compiler or its analysers emit a warning                       |
| 13  | Unit and architecture tests | Correctness   | A unit test fails, or an architecture test finds the code breaking the structure it claims                  |
| 14  | Repository-wide tests       | Correctness   | A repository-level check fails                                                                              |
| 15  | Suppression register        | Policy        | A suppression comment exists with no complete register row                                                  |
| 16  | Dependency licence register | Policy        | A resolved dependency has no register row, or its row records a licence the lock file no longer resolves to |
| 17  | Link and anchor integrity   | Documentation | A link resolves to nothing, resolves ambiguously, or names a heading that does not exist                    |

Check 13 runs two kinds together: unit tests, and the architecture tests that
assert on the shape of the code rather than its behaviour. Both need nothing but
the source, both must fail the moment the structure drifts, and an architecture
nobody enforces mechanically is a diagram.

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
change without resolving the whole set on every commit.

Check 17 reads the **whole** documentation corpus, not the staged subset: when a
file moves, the broken links live in files nobody staged. Repairs are confined
to staged files, because a write outside that set lands in the working tree but
not in the commit. **A break it cannot repair still blocks**, wherever the
broken link lives: the change caused it, and the fact that no unambiguous repair
exists makes it more urgent to look at, not less.

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

| #   | Check                       | Command                                                                                                                                                 |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Protected branch            | `git rev-parse --abbrev-ref HEAD`                                                                                                                       |
| 2   | Staged-content isolation    | Materialise: `git checkout-index --all --prefix=/tmp/staged/`. Hide-and-restore: `git diff --name-only` — empty output means the tree matches the index |
| 3   | Dependency lock sync        | `npm ci --dry-run` · `dotnet restore --locked-mode`                                                                                                     |
| 4   | Universal format            | `npx prettier --check <paths>` · `dotnet format --verify-no-changes`                                                                                    |
| 5   | Prose lint                  | `npx markdownlint-cli2 <paths>`                                                                                                                         |
| 6   | Secret scan                 | `npx secretlint <paths>`                                                                                                                                |
| 7   | Spelling                    | `npx cspell --no-progress <paths>`                                                                                                                      |
| 8   | Cross-language analysis     | `semgrep --config auto --error <paths>`                                                                                                                 |
| 9   | Machine-identifying content | `npx secretlint <paths>` with the path rules enabled, or a repository rule                                                                              |
| 10  | File size                   | `git cat-file -s $(git rev-parse :<path>)` — bytes as staged                                                                                            |
| 11  | Per-path lint               | `npx eslint <paths>` · `npx tsc --noEmit` · `dotnet format --verify-no-changes`                                                                         |
| 12  | Build                       | `npm run build` · `dotnet build -warnaserror`                                                                                                           |
| 13  | Unit tests                  | `npm test` · `dotnet test`                                                                                                                              |
| 17  | Link and anchor integrity   | `npx markdown-link-check <paths>`, or the repository's own docs command                                                                                 |

Prefer Node tooling where the stack has no native equivalent — the formatter,
the prose lint, the spell check and the secret scan are stack-independent, and
one implementation across every repository is worth more than a per-stack
choice. Where the stack does have one, it wins: `dotnet format` over a generic
formatter for C#, the compiler's own analysers over an external pass.

## Verification

- [ ] A commit on a protected branch is refused.
- [ ] A change touching one component builds and tests that component only.
- [ ] A change to a component's dependency also builds and tests its consumers.
- [ ] A partially staged file is judged on its staged half only.
- [ ] An isolation check that cannot run blocks the commit and says the result is
      unknown, rather than passing or claiming a breach.
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
- [ ] An unknown word not in the file's own vocabulary is refused.
- [ ] A lint or type-check failure is refused independently of the build — the
      two are separate checks and either alone blocks.
- [ ] A repository-level check fails the commit even when no component changed.
- [ ] A build warning is refused under a zero-warning policy.
- [ ] A failing unit test is refused.
- [ ] An architecture test fails when a dependency direction is violated, and it
      runs with the unit tier rather than separately.
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
- [ ] A renamed document leaves no dead link anywhere in the corpus.
- [ ] Each refusal is a diagnosis, per the cross-gate rule.

## References

- [Components](components.md) — what scopes checks 12 and 13.
- [Registers](registers.md) — the rows checks 15 and 16 require.
- [Change-triggered checks](change-triggered-checks.md) — why check 16 sometimes skips.
- [Gate 1 — Edit](gate-1-edit.md) — the same security rules, one file at a time.
- [Gate 6 — Pull request pipeline](gate-6-pull-request.md) — where all of this is
  re-run without the author's machine.
