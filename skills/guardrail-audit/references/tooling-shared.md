# Stack-independent tooling

Defaults for the checks that are the same problem in every language. One
implementation across every repository beats a per-stack choice — these run over
files, not over a compiler's understanding of them.

**The toolkit installs none of these.** The consuming repository adds them to
its own manifest and pins them in its own lock file; the toolkit supplies the
default and the configuration. Where the ecosystem matches the repository's own,
that is a development dependency resolved by `npx`; where it does not, it is
installed through that tool's own ecosystem and resolved from `PATH`. Either
way, the installation check names it when it is missing.

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

**`semgrep` and `lizard` are pip-distributed**, not npm — installed through
their own ecosystem and resolved from `PATH`. This is where the Node-first
preference stops: neither has an npm-distributed equivalent of comparable
coverage, and reaching across ecosystems to install them automatically is the
bundling this toolkit does not do.

**`lint-staged` is one implementation of gate 2's isolation, not the mechanism
itself.** It hides unstaged changes for the duration of the run — the
hide-and-restore family. The mechanism is git's, so a repository with no Node
toolchain implements the same thing directly: `git checkout-index --all
--prefix=<dir>/` materialises the staged content without touching the working
tree at all, which is the safer family for file-scoped checks.

What is never acceptable is running the checks over the staged _file list_ while
reading the working tree. That judges bytes which are not being committed, and
is the defect the isolation check exists to catch. **Passing a file list is not
isolation.**

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

## Hook orchestration

The standard states what an orchestrator must do — fire at the right git events,
isolate staged content by one of the two git families **verifiably**, report what
it resolved, and run on every platform the team uses. It does not name one, and
neither should an audit before looking at what the repository has.

| Repository                     | Default                                                                                                               |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Has Node, or is mixed-stack    | `husky` for installation, `lint-staged` for staged isolation                                                          |
| Python only                    | `pre-commit` — language-agnostic, and its standard hook set already covers large files, private keys and line endings |
| Neither, and wants no runtime  | A single-binary manager, if it can be shown to isolate staged content                                                 |
| **Already has one that works** | **That one.** A working orchestrator is not a finding                                                                 |

**Node is the default here because it is the fallback everywhere else.** The
stack-independent checks above are already Node-hosted, so a Node repository
adds no runtime, and a mixed-stack repository was going to need it regardless.
It also gives short glue scripts an obvious home, which matters when a hook grows
past one command.

**`pre-commit` for a Python-only repository** is not a grudging exception. It
avoids introducing Node purely for hooks, it is genuinely language-agnostic, and
its published hook set implements checks this standard specifies from scratch. A
Python shop should not inherit a Node toolchain for the same reason a .NET shop
should not.

Whichever is chosen, gate 2 check 2 is verified by **observing the isolation**,
not by trusting the tool's description of itself.

## Machine-identifying content

There is no widely adopted dedicated tool. Two workable answers:

- A `secretlint` custom rule matching absolute home-directory paths and the
  host's user name.
- A repository-local pattern check in the gate itself — one of the few places
  level 3 is the honest answer.

Whichever, the patterns are the leak shapes: an absolute path under a home
directory, a `C:\Users\<name>` or `/home/<name>` prefix, a machine host name.
Placeholders must pass.

## File size

No tool needed. The staged byte size is `git cat-file -s $(git rev-parse
:<path>)`, and large-file storage is `git lfs track`. Check whether the remote
supports it before proposing it — where it does not, the answer is a decision
record, not a workaround.
