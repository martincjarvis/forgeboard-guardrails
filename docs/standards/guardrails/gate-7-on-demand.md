---
type: reference
summary: The whole-repository sweep — the only gate that reads past HEAD, and the one to run before trusting any of the incremental gates.
read_when: Adopting guardrails in an existing repository, or auditing what a repository contains rather than what it changed.
---

<!-- cspell:ignore longpaths -->

# Gate 7 — On demand

The same checks, invoked without a trigger: before opening a review, or when
adopting guardrails in an existing repository. Reports rather than blocks,
because the caller decides the consequence.

| Check                       | Type          | Note                                                                                             |
| --------------------------- | ------------- | ------------------------------------------------------------------------------------------------ |
| Repository-wide secret scan | Security      | Every tracked file, not only the ones being touched                                              |
| History secret scan         | Security      | Every commit reachable from the default branch, not only its tip                                 |
| Platform capability audit   | Policy        | Which checks the host offers, and whether each is enabled                                        |
| Repository-wide analysis    | Security      | Static analysis and machine-identifying content across the whole tree                            |
| Repository-wide scan        | Size          | Length and complexity across all files, not just changed ones                                    |
| Link and anchor integrity   | Documentation | With or without repair                                                                           |
| Installation check          | Policy        | Hooks installed, external tools resolvable, configuration valid                                  |
| Workspace capability check  | Policy        | Long-path support on, text normalisation declared, large-file storage configured where supported |

**Line endings are normalised in the repository, not left to each machine.**
`.gitattributes` declares `* text=auto eol=lf` and marks binary files as binary,
so what is stored is normalised whatever a contributor's platform does locally.
`.editorconfig` declares the same intent to the editors and tools that write the
files in the first place.

Without both, a repository accumulates mixed endings, and the damage is not
cosmetic: a whole-file ending change swamps a one-line diff so review stops
being possible, a format check passes on one machine and fails on another, and
the team learns that the gate is unreliable rather than that the file is. That
is the same "gate that lies" failure the rest of this standard exists to
prevent, arriving through the least interesting door.

Both files belong in a repository from its first commit. Adding them later
rewrites every file that was stored wrongly, which is a change nobody can review.

**Long-path support is on by default.** A repository that only builds where
paths happen to stay short is a repository with a platform-specific failure
waiting in it, and the failure surfaces as something unrelated — a clone that
half-completes, a tool that cannot find a file that exists. Enable it as part of
adoption, not after the first person hits it.

The security rows are the ones this gate exists for. Gates 1 and 2 only ever see
files somebody touched, so a secret committed before the guardrails were adopted
— or through any path that skipped them — is invisible to every other gate,
permanently. **Run these before trusting the incremental gates**, on adoption
and on a schedule after that. A repository that has never run them does not know
what it contains; it only knows what it has changed since somebody started
looking.

**Scanning the current files is not scanning the history.** A credential
committed and then deleted is gone from every working file and still present in
every clone, which is the case that matters most — deleting it is what people do
when they notice, and it is precisely the moment they stop looking. The history
scan is the only check in this standard that reads past HEAD. A finding here is
not fixed by a commit: the credential is revoked first, and rewriting the
history is a separate decision with its own record, because it invalidates every
clone.

## Running it by hand

| Check                       | Command                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Repository-wide secret scan | `npx secretlint '**/*'`                                                                                            |
| History secret scan         | `npx secretlint --secretlintignore .gitignore` over `git rev-list --all` checkouts, or a dedicated history scanner |
| Repository-wide analysis    | `semgrep --config auto .`                                                                                          |
| Repository-wide size scan   | `lizard -C 15 -L 100 -a 7 .`                                                                                       |
| Link and anchor integrity   | The repository's own docs command                                                                                  |
| Long-path support           | `git config --get core.longpaths`                                                                                  |
| Large-file storage          | `git lfs env` · `git lfs track`                                                                                    |
| Installed hooks             | `git config --get core.hooksPath` and list that directory                                                          |
| Platform capabilities       | `gh api repos/:owner/:repo` · `az repos policy list`                                                               |

The history scan is the one to reach for a purpose-built tool for: walking every
reachable commit is not something a file-oriented scanner does well, and the
platform's own secret scanning covers it on the hosts that offer it — which is
the level-1 answer.

## Verification

- [ ] A fresh clone reports which required external tools are missing, by name.
- [ ] Every check the hosting platform already provides is enabled, rather than
      reimplemented in the pipeline — and the audit lists the ones deliberately
      left off, with their records.
- [ ] Dependency update proposals are raised on a schedule, and pass through the
      same gates as any other change.
- [ ] A repository-wide scan runs without staged content and without a branch.
- [ ] Every check not enforced is reported as skipped or suppressed, never
      omitted, and a suppressed one names its decision record.
- [ ] A previously excluded check is not re-raised as a new finding on the next
      review.
- [ ] Every opt-out record still resolves, and its removal condition is still
      untrue — an opt-out whose reason has expired is a finding.
- [ ] A secret planted in a file the change never touches is found here.
- [ ] A secret committed and then deleted in a later commit is found by the
      history scan, and the response revokes it rather than only removing it.
- [ ] The repository-wide security scan has been run at least once, and its date
      is recorded.
- [ ] Long-path support is enabled, and a deep path clones and builds.
- [ ] `.gitattributes` declares text normalisation, and binary files are marked
      binary so they are never mangled by it.
- [ ] `.editorconfig` exists and agrees with it on line endings and character set.
- [ ] A file committed from a platform using different line endings is stored
      normalised — check one rather than assuming.
- [ ] A large binary is stored via large-file storage where the remote supports
      it, and the decision is recorded where it does not.

## References

- [Bypass and exceptions](bypass-and-exceptions.md) — the three states a check
  can report, which this gate audits.
- [Cross-gate rules](cross-gate-rules.md) — the tooling tier ladder the platform
  capability audit applies.
- [Gate 2 — Commit](gate-2-commit.md) — the incremental counterpart to these sweeps.
