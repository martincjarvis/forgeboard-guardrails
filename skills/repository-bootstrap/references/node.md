# Node / TypeScript tooling

Default choices for a Node 20+ repository. An existing equivalent always wins.

| Capability        | Tool                                                | Notes                                                                                          |
| ----------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `format`          | prettier                                            | `templates/node/prettierrc.json`; auto-fix via lint-staged                                     |
| `lint`            | eslint + `@eslint/js` recommended                   | `--max-warnings 0`; flat config `templates/node/eslint.config.mjs`; add `typescript-eslint`    |
| `typecheck`       | `tsc --noEmit`                                      | TS repos; for JS, `checkJs` via jsconfig is optional, else `off` with reason                   |
| `tests`           | `node --test`, or the repo's existing runner        | Do not replace vitest/jest if present                                                          |
| `coverage`        | c8 (`--check-coverage --lines=80`) or runner-native | Floor enforced by the runner, tune per repo                                                    |
| `commit-messages` | commitlint + `@commitlint/config-conventional`      | `templates/node/commitlint.config.cjs`                                                         |
| `secrets`         | secretlint (recommended preset + pattern rule)      | `templates/node/secretlintrc.json` — pattern rule blocks home-dir/UNC paths (personal details) |
| `spelling`        | cspell                                              | seed project words into `cspell.json` during bootstrap so it starts green                      |
| `supply-chain`    | npm `min-release-age` + host toggles                | `templates/node/npmrc`; Dependabot + CodeQL per shared.md                                      |

Wiring:

- Hook manager: husky (`npx husky init`) unless one exists.
  - `.husky/pre-commit`: `npx lint-staged`
  - `.husky/commit-msg`: `npx --no-install commitlint --edit "$1"`
  - `.husky/pre-push`: `npm run verify`
- lint-staged: `templates/node/lintstagedrc.json` — formatter first, then
  checks, so checks judge the formatted bytes. Staged files only; tree-wide
  sweeps belong in `verify`.
- Markdown link integrity is a lint feature: dev-dependency
  `markdownlint-rule-relative-links`, wired as a custom rule in
  `templates/node/markdownlint-cli2.jsonc`. The secretlint pattern rule needs
  dev-dependency `@secretlint/secretlint-rule-pattern`.
- Copy `templates/node/npmrc` to `.npmrc` — `min-release-age` blocks
  freshly-published versions; `audit-level=high` makes `npm audit` usable in
  `verify` where Dependabot is unavailable.
- `verify` script:
  `npm run format:check && npm run lint && npm run typecheck && npm test`
  (include coverage in `npm test` where the floor is set).
- Pin the Node floor in `"engines"` and point CI setup-node at it
  (`node-version-file: package.json`), so the two cannot drift. Set the floor
  to what the toolchain itself supports — current cspell needs Node ≥ 22.18,
  so a floor of 20 passes locally on newer Node and fails in CI.
