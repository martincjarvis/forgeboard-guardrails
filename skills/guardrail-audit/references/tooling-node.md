<!-- cspell:ignore rseidelsohn -->

# Node tooling

Defaults for a repository with a `package.json`. Stack-independent checks are in
`tooling-shared.md` — this covers only what needs to understand JavaScript or
TypeScript.

| Check                   | Gate | Default                                                  | Invocation                               |
| ----------------------- | ---- | -------------------------------------------------------- | ---------------------------------------- |
| Type check              | 2    | `typescript`                                             | `npx tsc --noEmit`                       |
| Lint, with analysers    | 1, 2 | `eslint` + `typescript-eslint`                           | `npx eslint <paths>`                     |
| Security rules          | 1, 2 | `eslint-plugin-security`, and the framework's own plugin | Enabled in the shared config             |
| Build                   | 2    | The repository's build script                            | `npm run build`                          |
| Unit tests              | 2    | `vitest` or `jest`                                       | `npm test`                               |
| Coverage                | 5    | The runner's own provider                                | `npm test -- --coverage`                 |
| Integration, end-to-end | 5    | `playwright`                                             | `npx playwright test`                    |
| Dependency install      | 0    | `npm ci`                                                 | Fails when lock and manifest disagree    |
| Advisories              | 6    | `npm audit`                                              | `npm audit --json`                       |
| Licences                | 2, 6 | A licence reader over the resolved tree                  | `npx license-checker-rseidelsohn --json` |
| Workspace graph         | —    | `npm` workspaces, or `nx`                                | `npx nx show projects --affected`        |

## Notes that matter

**`npm ci`, never `npm install`, at gate 0.** `ci` fails when the lock file and
manifest disagree, which is the check. `install` reconciles them silently and
answers a different question — and rewrites the lock file, which gate 2 check 3
then reports as an unexplained regeneration.

**The type check is a separate check from the build.** Many build tools strip
types without checking them, so a green build proves nothing about type
correctness. Gate 2 lists them as checks 11 and 12 for this reason: either alone
blocks.

**Start from the recommended config, not from nothing.** `eslint`'s recommended
set plus `typescript-eslint`'s recommended-type-checked set is the baseline;
subtract with a reason. A hand-assembled rule list contains what its author
already knew to worry about.

**Type-aware rules need the project reference.** `typescript-eslint`'s
type-checked rules are the ones that find data-flow problems, and they only run
when the config points at a `tsconfig.json`. Without it you have a linter that
reads syntax, which the standard treats as the cross-language layer, not the
native one.

**SARIF comes from the formatter**: `npx eslint --format @microsoft/eslint-formatter-sarif`.
Without it, gate 6's evidence row 12 has nothing to publish for this stack.

**Coverage as Cobertura**: both common runners emit it through their coverage
provider's reporter list. Add `cobertura` alongside whatever the team reads
locally — the local format is for people, the Cobertura file is for the host.

## What this stack does not have natively

- **Cyclomatic complexity across every file type.** `eslint`'s `complexity` rule
  covers what it parses; `lizard` covers the rest. A repository that is entirely
  TypeScript can use the rule alone.
- **A licence reader in the base tooling.** `npm ls` gives the resolved tree but
  not licences; the reader is an added dependency, so check first whether the
  host's dependency graph already answers it.
