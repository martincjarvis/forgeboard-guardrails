---
type: reference
summary: The whole-repository sweep — the only gate that reads past HEAD, and the one to run before trusting any of the incremental gates.
read_when: Adopting guardrails in an existing repository, or auditing what a repository contains rather than what it changed.
---

<!-- cspell:ignore longpaths -->

# Gate 7 — On demand

The same checks, invoked without a trigger: before opening a review, or when
adopting the toolkit in an existing repository. Reports rather than blocks,
because the caller decides the consequence.

| Check                       | Type          | Note                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository-wide secret scan | Security      | Every tracked file, not only the ones being touched                                                                                                                                                                                                                                                                                                                                 |
| History secret scan         | Security      | Every commit reachable from the default branch, not only its tip                                                                                                                                                                                                                                                                                                                    |
| Platform capability audit   | Policy        | Every platform feature free at this repository's visibility and plan is enabled, or a decision record names why not — see [platform features enabled by default](#platform-features-enabled-by-default) below and `scripts/check-repository-features.mjs`                                                                                                                           |
| Branch protection audit     | Policy        | Whether the protected branch's configuration actually blocks a merge on every check gate 6 runs — a finding when unconfigured, a visible skip when `gh` cannot tell ([branch protection](branch-protection.md))                                                                                                                                                                     |
| Repository-wide analysis    | Security      | Static analysis and machine-identifying content across the whole tree                                                                                                                                                                                                                                                                                                               |
| Repository-wide scan        | Size          | Length and complexity across all files, not just changed ones                                                                                                                                                                                                                                                                                                                       |
| Link and anchor integrity   | Documentation | With or without repair                                                                                                                                                                                                                                                                                                                                                              |
| Installation check          | Policy        | Hooks installed, external tools resolvable, configuration valid                                                                                                                                                                                                                                                                                                                     |
| Workspace capability check  | Policy        | Long-path support on, text normalisation declared, large-file storage configured where supported                                                                                                                                                                                                                                                                                    |
| Refusal-proof audit         | Policy        | A blocking check's negative fixture passed instead of being refused ([cross-gate rules](cross-gate-rules.md#every-blocking-check-proves-it-refuses))                                                                                                                                                                                                                                |
| Quality-script wiring audit | Policy        | A `package.json` script no gate invokes and no on-demand declaration covers ([cross-gate rules](cross-gate-rules.md#every-quality-script-is-wired-or-declared))                                                                                                                                                                                                                     |
| Licence table re-validation | Policy        | An entry's own `reference` in `scripts/licence-table.mjs` no longer resolves — invoked separately (`node scripts/check-licence-table.mjs`), not part of the default sweep above, because it depends on external hosts staying reachable rather than the working tree ([change-triggered checks](change-triggered-checks.md#licence-and-advisory-differ-and-the-difference-matters)) |

**Line endings are normalised in the repository, not left to each machine.**
`.gitattributes` declares `* text=auto eol=lf` and marks binary files as binary,
so what is stored is normalised whatever a contributor's platform does locally.
`.editorconfig` declares the same intent to the editors and tools that write the
files in the first place.

Without both, a whole-file ending change swamps a one-line diff so review stops
being possible, and a format check passes on one machine and fails on another —
the team learns the gate is unreliable rather than the file.

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

## Platform features enabled by default

[Cross-gate rules](cross-gate-rules.md#prefer-established-tooling-to-bespoke-checks)
states the rule — "every check the platform already provides is enabled
rather than rebuilt" — and it has been unactionable: Dependabot and
vulnerability alerts have been found disabled at the platform level with no
decision record, and no cycle since has fixed it, because an implementer
reading that sentence has no way to tell whether the repository in front of them complies.
A rule with nothing enumerated is not a rule anyone can satisfy.

**Features the platform provides free at this repository's visibility and
plan are enabled by default. Leaving one off is a decision with a record, not
an omission.** For GitHub, verified directly against this account's own repositories
rather than assumed — the same discipline
[branch protection](branch-protection.md#a-private-repository-without-github-pro-cannot-be-protected)
already applies to its own plan restriction:

| Feature                      | Free at                                                                                                                                                                     | Mechanism this toolkit reads                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Dependency graph             | Every plan, every visibility                                                                                                                                                | Always on for a supported manifest; the platform exposes no toggle to audit                                    |
| Dependabot alerts            | Every plan, every visibility                                                                                                                                                | `GET /repos/:owner/:repo/vulnerability-alerts` (`204` enabled, `404` disabled)                                 |
| Dependabot security updates  | Every plan, every visibility                                                                                                                                                | `GET /repos/:owner/:repo/automated-security-fixes`                                                             |
| Secret scanning              | Public repositories, every plan. Private repositories need **GitHub Secret Protection**, purchasable only on GitHub Team or Enterprise Cloud                                | `security_and_analysis.secret_scanning.status` on the repository resource                                      |
| Push protection              | Same gate as secret scanning — it has nothing to protect until secret scanning itself is enabled                                                                            | `security_and_analysis.secret_scanning_push_protection.status`                                                 |
| Code scanning (CodeQL)       | Public repositories, every plan. Private repositories need **GitHub Code Security**, purchasable only on GitHub Team or Enterprise Cloud                                    | `GET /repos/:owner/:repo/code-scanning/default-setup`                                                          |
| Code coverage (Code Quality) | GitHub Team or Enterprise Cloud only — **not visibility-gated**: a public repository on GitHub Free does not get it free the way secret scanning and code scanning above do | No documented API; see [gate 6's coverage section](gate-6-pull-request.md#coverage-legible-without-a-download) |

Two rows are worth reading twice because the gate is different in kind, not
degree. Secret scanning and code scanning are free the moment a repository is
public — the restriction is visibility. Code coverage's native rendering is
gated on the **account's plan**, confirmed against GitHub's own pricing page
("Available on GitHub Enterprise Cloud and GitHub Team"): a public repository
on GitHub Free is still locked out, which a visibility-only mental model
would miss.

**Unavailable-for-this-plan-or-visibility is not a finding; available and
disabled is.** Probed directly against a private repository on GitHub Free,
attempting to enable secret scanning returns `422` with `"Secret scanning is
not available for this repository."`; attempting to read code scanning's
default setup returns `403` with `"Code scanning is not enabled for this
repository. Please enable code scanning in the repository settings."` — both
name the restriction in the response body, and `scripts/check-repository-features.mjs`
reports both as a visible skip rather than a finding. A `403`/`401` whose body
names something else — a missing token scope, an unauthenticated session — is
reported as an **unknown naming the missing scope**, never silently folded
into "disabled": [branch protection](branch-protection.md) already learned
this lesson once for `origin/HEAD` — a check that cannot tell "off" from
"cannot see" produces "cannot see" produces
noise, and noise is indistinguishable from a false pass once people stop
reading it.

**Enabling these is a step in the bootstrap procedure**
(`skills/repository-bootstrap/SKILL.md`, run with the adopting session's own
authenticated `gh`), not a closing-checklist line an implementer reads and
never executes — the same gap branch protection had before
`scripts/configure-branch-protection.mjs` existed to close it.
`scripts/configure-repository-features.mjs` is that mechanism here: it
enables what the probes above found available, and reports what it could not
tell rather than guessing.

## Running it by hand

| Check                         | Command                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Repository-wide secret scan   | `npx secretlint '**/*'`                                                                                            |
| History secret scan           | `npx secretlint --secretlintignore .gitignore` over `git rev-list --all` checkouts, or a dedicated history scanner |
| Repository-wide analysis      | `semgrep --config auto .`                                                                                          |
| Repository-wide size scan     | `lizard -C 15 -L 100 -a 7` over the production-and-test file list, by class — not a bare `.`                       |
| Tooling file class            | `node scripts/check-tooling-class.mjs`                                                                             |
| Tooling test suite exists     | `node scripts/check-tooling-class.mjs` (same command — `checkToolingTestSuiteExists`)                              |
| Link and anchor integrity     | The repository's own docs command                                                                                  |
| Long-path support             | `git config --get core.longpaths`                                                                                  |
| Large-file storage            | `git lfs env` · `git lfs track`                                                                                    |
| Installed hooks               | `git config --get core.hooksPath` and list that directory                                                          |
| Platform capabilities         | `gh api repos/:owner/:repo` · `az repos policy list`                                                               |
| Branch protection audit       | `node scripts/check-branch-protection.mjs`                                                                         |
| Repository features audit     | `node scripts/check-repository-features.mjs`                                                                       |
| Configure repository features | `node scripts/configure-repository-features.mjs`                                                                   |
| Refusal-proof audit           | `node scripts/check-refusal-proofs.mjs`                                                                            |
| Quality-script wiring audit   | `node scripts/check-script-wiring.mjs`                                                                             |
| Licence table re-validation   | `node scripts/check-licence-table.mjs`                                                                             |

The history scan is the one to reach for a purpose-built tool for: walking every
reachable commit is not something a file-oriented scanner does well, and the
platform's own secret scanning covers it on the hosts that offer it — which is
the level-1 answer.

**A cycle that adds or edits a workflow file runs this sweep before claiming
completion.** `semgrep --config auto` already scans `.github/workflows/`
along with everything else — that is what "repository-wide" means — and a
mutable action tag (`uses: actions/checkout@v4` rather than a pinned commit)
is exactly the kind of finding it catches. An earlier audit of this toolkit
found a new workflow added with mutable tags while an existing one had
already been pinned — a defect the toolkit had closed once, reintroduced in a
different file. The gap was not a missing rule; the sweep that would have
caught it before the cycle called itself done simply was not run.

## Verification

- [ ] A fresh clone reports which required external tools are missing, by name.
- [ ] Every platform feature free at this repository's visibility and plan —
      dependency graph, Dependabot alerts, Dependabot security updates, secret
      scanning, push protection, code scanning, code coverage — is enabled, or
      a decision record names why not
      ([platform features enabled by default](#platform-features-enabled-by-default)).
- [ ] `scripts/check-repository-features.mjs` distinguishes **unavailable for
      this visibility or plan** (a `422`/`403` naming the plan or product
      restriction in its own body) from **available and disabled** — the
      first is reported as a skip, never a finding; the second is a finding.
      Prove it against a real private repository on a plan without GitHub
      Secret Protection or Code Security: the audit skips secret scanning and
      code scanning by name rather than reporting them as findings a private
      repository on that plan can never clear.
- [ ] A `403`/`401` whose body names a missing token scope or an
      unauthenticated session — not a plan or product restriction — is
      reported as an **unknown naming the scope**, never silently read as
      "disabled."
- [ ] `scripts/configure-repository-features.mjs` is a named step in
      `skills/repository-bootstrap/SKILL.md`, run with the bootstrap
      session's own authenticated `gh` — not a line left for a closing
      checklist nobody executes.
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
- [ ] A repository carrying `tooling`-classed gate or check scripts has at
      least one `test`-classed file naming one of them — `node
scripts/check-tooling-class.mjs` (`checkToolingTestSuiteExists`) is the
      mechanical form; the toolkit's own repository is exempt, the same
      carve-out `checkToolingClassDeclared` already applies.
- [ ] Long-path support is enabled, and a deep path clones and builds.
- [ ] `.gitattributes` declares text normalisation, and binary files are marked
      binary so they are never mangled by it.
- [ ] `.editorconfig` exists and agrees with it on line endings and character set.
- [ ] A file committed from a platform using different line endings is stored
      normalised — check one rather than assuming.
- [ ] A large binary is stored via large-file storage where the remote supports
      it, and the decision is recorded where it does not.
- [ ] The refusal-proof audit runs, and a `does not refuse` verdict is treated
      as a finding — never silently read as green because the check it is
      about still exited 0 on real input.
- [ ] The branch protection audit runs, and unconfigured protection is
      reported as a finding — never silently read as green because `gh` was
      not on `PATH`, was unauthenticated, or could not read it (a private
      repository without GitHub Pro), each of which is a skip instead.
- [ ] The licence table re-validation runs on demand, reports a reference
      that no longer resolves by name, and is not wired to a schedule
      anywhere in the toolkit or a consuming repository.

## References

- [Bypass and exceptions](bypass-and-exceptions.md) — the three states a check
  can report, which this gate audits.
- [Cross-gate rules](cross-gate-rules.md) — the tooling ladder the platform
  capability audit applies.
- [Branch protection](branch-protection.md) — what the branch protection audit
  checks, and the script that configures it in the first place.
- [Gate 2 — Commit](gate-2-commit.md) — the incremental counterpart to these sweeps.
