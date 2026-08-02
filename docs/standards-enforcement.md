---
type: reference
summary: Which file or gate in this repository enforces each standard it operates under — the map docs-style.md requires every repository built with this toolkit to carry.
read_when: Checking whether a standard is actually enforced here, or auditing this repository the same way it audits a consumer.
---

<!-- cspell:ignore Uncited -->

# Standards enforcement

This repository is built under the standards it defines
([AGENTS.md](../AGENTS.md)), and it is its own first consumer
([docs-style.md: standards in a consuming repository](standards/docs-style.md#standards-in-a-consuming-repository)).
Its `docs/standards/` **is** the canonical corpus rather than a copy of one, so
there is no upstream commit to name here — the provenance requirement that
section describes applies to a repository instantiating a copy, not to the
source. The enforcement map below is the part that requirement asks of every
repository regardless: not what the standards say, but what actually holds
each one true here.

| Standard                                     | Enforced by                                                                                                                                                                                                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Formatting                                   | `.editorconfig` + `.prettierrc.json`, gate 1 and gate 2                                                                                                                                                                                                                               |
| Line endings, character set                  | `.gitattributes` (`* text=auto eol=lf`), `.editorconfig`                                                                                                                                                                                                                              |
| File classes                                 | `.gitattributes` `guardrail-class` attributes — `scripts/lib.mjs:classOf`, gate 4 and gate 2 read them                                                                                                                                                                                |
| Type safety                                  | `tsconfig.json` (`checkJs`, `allowJs`), gate 2 check 11 (`npm run build`)                                                                                                                                                                                                             |
| Lint / code quality                          | `eslint.config.mjs`, gate 2 check 11 (`npm run lint`, `--max-warnings 0`), gate 6                                                                                                                                                                                                     |
| Complexity, function length, parameter count | `hooks/gate-4-task-completion.mjs`'s own thresholds (`thresholds.md` defaults) at gate 4; `lizard` as the general-purpose backstop at gate 7 and gate 6                                                                                                                               |
| Commit messages                              | `commitlint.config.cjs`, gate 3 (`.husky/commit-msg`)                                                                                                                                                                                                                                 |
| Coverage floor                               | `c8 --check-coverage --lines=80` (`package.json`'s `test:coverage` script), gate 5 check 1, gate 6                                                                                                                                                                                    |
| Spelling                                     | `cspell.json` + per-file `<!-- cspell:ignore … -->` lines, gate 2 (`.md`/`.mdx` only via lint-staged — see the open gap below)                                                                                                                                                        |
| Prose structure                              | `.markdownlint.jsonc` / `.markdownlint-cli2.jsonc`, gate 2 check 5 (staged subset, via lint-staged) and gate 5 check 5 (repo-wide sweep)                                                                                                                                              |
| Secret scanning                              | `.secretlintrc.json`, gate 2 and gate 7                                                                                                                                                                                                                                               |
| Suppression register                         | `docs/registers/suppression-register.md`, `scripts/check-suppressions.mjs`, gate 2 check 15                                                                                                                                                                                           |
| Dependency licence register                  | `docs/registers/dependency-licence-register.md`, `scripts/check-licence.mjs` (completeness, gate 2 check 16) and `scripts/check-licence-policy.mjs` (policy, gate 6 check 7)                                                                                                          |
| Dependency advisory scan                     | `scripts/check-dependency-advisories.mjs`, `.github/workflows/dependency-advisory-schedule.yml`, gate 6 check 6                                                                                                                                                                       |
| Cross-stack dependency scan                  | `scripts/check-osv-scanner.mjs` (osv-scanner, PATH-resolved), gate 5 check 3, gate 6 check 10                                                                                                                                                                                         |
| Cross-language static analysis               | `semgrep` (PATH-resolved), gate 7 and gate 6's CI leg (`.github/workflows/pull-request.yml`)                                                                                                                                                                                          |
| Machine-identifying content                  | `scripts/check-machine-id.mjs`, gate 2 check 9, gate 7                                                                                                                                                                                                                                |
| Link and anchor integrity                    | `scripts/check-links.mjs`, gate 5 check 6, gate 6, gate 7                                                                                                                                                                                                                             |
| Protected branch                             | `scripts/check-protected-branch.mjs` (branch name derived via `resolveBase()`, never configured), gate 2 check 1                                                                                                                                                                      |
| The refusal-proof contract                   | `scripts/check-refusal-proofs.mjs`, gate 7, `.github/workflows/refusal-proof-audit.yml`                                                                                                                                                                                               |
| Testing strategy                             | The suite shape itself (`hooks/test/hooks.test.mjs`) — judgement, plus gate 5's coverage floor                                                                                                                                                                                        |
| Pull request pipeline                        | `.github/workflows/pull-request.yml` + `scripts/gate-6-pull-request.mjs`, gate 6                                                                                                                                                                                                      |
| Pull request finding citation                | `scripts/check-pr-body-artefacts.mjs` (`findUncitedFindings`, fix 68) — not yet wired into a gate; `--file <draft>` before opening (skills/repository-bootstrap/SKILL.md, fix 65's precondition), `gh pr view` by a reviewer once open (gate-6-pull-request.md, "Running it by hand") |

**Why the enforcement column is the valuable half.** It rots visibly. Delete
`.editorconfig` and the formatting row becomes a lie a reader can see on the
next look — the file it names is gone. A prose restatement of the same
formatting rule, instead, drifts silently and is worse than nothing: nobody
notices it stopped being true. That is the same argument
[docs-style.md](standards/docs-style.md#standards-in-a-consuming-repository)
makes against copying the standards without provenance, applied one level down
to what enforces them.

**One open gap, reported rather than fixed here** (found while wiring [fix
9a's refusal-proof audit](standards/guardrails/cross-gate-rules.md#every-blocking-check-proves-it-refuses)):
spelling is enforced for `.md`/`.mdx` files only. `npm run spell`
(`cspell lint --gitignore .`, which would cover `.mjs`/`.js` files too) is
invoked by nothing — the same shape of gap [fix 10](standards/guardrails/gate-2-commit.md)
closed for lint. Left open rather than folded into an unrelated fix; a
consuming repository copying this table should not assume its own `.mjs`
spelling is checked either, until this row changes.

## References

- [docs-style.md — Standards in a consuming repository](standards/docs-style.md#standards-in-a-consuming-repository) —
  the requirement this page exists to satisfy.
- [Guardrail standards](standards/guardrail-standards.md) — the gate index
  every row above maps into.
- [Suppression register](registers/suppression-register.md),
  [Dependency licence register](registers/dependency-licence-register.md) —
  the registers named above.
