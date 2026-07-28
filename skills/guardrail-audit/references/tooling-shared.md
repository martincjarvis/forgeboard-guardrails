# Stack-independent tooling

Defaults for the checks that are the same problem in every language. One
implementation across every repository beats a per-stack choice — these run over
files, not over a compiler's understanding of them.

All are Node-distributed and run through `npx` without a global install, except
the two marked external.

| Check                          | Gate | Default                      | Invocation                                    |
| ------------------------------ | ---- | ---------------------------- | --------------------------------------------- |
| Universal format               | 1, 2 | `prettier`                   | `npx prettier --check <paths>`                |
| Prose lint                     | 2    | `markdownlint-cli2`          | `npx markdownlint-cli2 <paths>`               |
| Spelling                       | 2    | `cspell`                     | `npx cspell --no-progress <paths>`            |
| Secret scan                    | 1, 2 | `secretlint`                 | `npx secretlint <paths>`                      |
| Cross-language static analysis | 2    | `semgrep` — external         | `semgrep --config auto --error <paths>`       |
| Complexity, function size      | 4    | `lizard` — external          | `lizard -C 15 -L 100 -a 7 <paths>`            |
| Commit message                 | 3    | `commitlint`                 | `npx commitlint --from origin/main --to HEAD` |
| Version derivation             | 3, 8 | `semantic-release`           | `npx semantic-release --dry-run`              |
| Staged-file orchestration      | 2    | `lint-staged`                | Runs the above over the staged set            |
| Hook installation              | all  | `husky`, or `core.hooksPath` | `git config core.hooksPath <dir>`             |

## Notes that matter

**`semgrep` and `lizard` are pip-distributed**, not npm. They must be on `PATH`
before a gated commit, and a repository that depends on them needs its
installation check (gate 7) to name them when they are missing. This is the one
place the Node-first preference does not reach: neither has an npm-distributed
equivalent of comparable coverage.

**`lint-staged` is what makes gate 2 correct**, not merely convenient. It hides
unstaged changes for the duration of the run, which is the mechanism gate 2
check 2 verifies. Running the checks over the staged _file list_ without hiding
unstaged content judges the wrong bytes — the defect the isolation check exists
to catch.

**`prettier` is a formatter, not a linter.** It never fails an edit at gate 1
and never blocks at gate 2; it rewrites and re-stages. A repository that runs it
with `--check` at gate 2 has turned a Format-typed check into a blocking one,
which the type table forbids — use `--write` there and `--check` only in the
pipeline, where nothing can be rewritten.

**`cspell` is per-file vocabulary, not a global dictionary.** New tokens belong
in the file's own `cspell:ignore` comment. A word added to the repository
dictionary is silenced everywhere, which is the broadened-suppression pattern
the standard forbids.

**`commitlint` needs the type set configured**, or it accepts types the version
derivation will silently skip. Configure it from the same list the derivation
reads.

## Machine-identifying content

There is no widely adopted dedicated tool. Two workable answers:

- A `secretlint` custom rule matching absolute home-directory paths and the
  host's user name.
- A repository-local pattern check in the gate itself — one of the few places
  tier 3 is the honest answer.

Whichever, the patterns are the leak shapes: an absolute path under a home
directory, a `C:\Users\<name>` or `/home/<name>` prefix, a machine host name.
Placeholders must pass.

## File size

No tool needed. The staged byte size is `git cat-file -s $(git rev-parse
:<path>)`, and large-file storage is `git lfs track`. Check whether the remote
supports it before proposing it — where it does not, the answer is a decision
record, not a workaround.
