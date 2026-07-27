# forgeboard-guardrails

Delivery guardrails toolkit for the ForgeBoard programme (Stream A). Installs
git hooks that enforce conventional commits, block default-branch commits,
scan for secrets, lint spelling/SAST/markdown, format via prettier, and run
per-component build/test gates — plus an optional status/event contract for
tools like ForgeBoard to consume.

## Status

A1 (MVP): local-source install only. Publishing to npm as a versioned,
installable package is an A2 deliverable.

## Prerequisites

- **Node.js 24+** on every machine that will run the hooks (developer
  workstations and CI runners).
- **Python 3 LTS + semgrep** for the SAST gate. semgrep is OSS (MPL-2.0) but
  Python-distributed rather than npm-bundled. Install once per machine:

  ```bash
  # Windows (Python via winget, then semgrep via pip)
  winget install Python.Python.3.12
  pip install semgrep

  # macOS
  brew install semgrep

  # Linux
  python3 -m pip install semgrep
  ```

  Verify with `semgrep --version`. Without it, the SAST gate fails loudly
  with a remediation message on every commit it would otherwise scan. All
  other gates (prettier, markdownlint, cspell, secretlint) are npm-bundled.

- **Python 3 + lizard** — required only when a repo enables the optional
  complexity gate (`agentHooks.complexity`), which the `task-complete` agent
  hook and `scan` use for a cyclomatic-complexity check. Like semgrep, lizard is
  Python-distributed rather than npm-bundled — install with `pip install lizard`
  (verify with `lizard --version`). Without `agentHooks.complexity` configured
  the gate is skipped, so lizard is not needed. Contributors to this repo need
  it to run the complexity tests, which self-skip when it is absent.

- **Per-component external commands** your repo declares (e.g. `dotnet`,
  `npm`, `az`, `azd`) — these are whatever your consuming repo's own stack
  requires; the toolkit never auto-installs them.

> **Contributing to this repo:** forgeboard-guardrails dogfoods its own
> tooling — run `npx tsx src/cli.ts install` after clone to install the
> hooks locally (they live in `.git/hooks/`, which is not committed). Every
> commit here runs the full gate suite, so `semgrep` (above) is mandatory:
> without it the SAST gate blocks every commit by design.

## Install (from source, A1)

From the consuming repo's root:

```bash
npx --package=<path-to-this-checkout> guardrails install
```

Writes `.forgeboard/guardrails.config.json` (with `$schema` pointer),
`.editorconfig`, `.gitattributes`, `.prettierignore`, `.secretlintrc.json`,
`cspell.json`, the agent guidance skill under `.claude/skills/guardrails-config/`,
git hook shims, and adds `.forgeboard/state/` to `.gitignore`. Idempotent —
re-running never overwrites existing files.

See `skills/guardrails-config/SKILL.md` (after install, in the consuming
repo) for the config schema and the judgment calls around components,
`dependsOn`, the `statusContract` opt-in, and adopting into an existing repo.

## Develop

```bash
git clone https://github.com/martincjarvis/forgeboard-guardrails
cd forgeboard-guardrails
npm install
pip install semgrep       # required for the SAST tests; see Prerequisites
pip install lizard        # required for the complexity tests; see Prerequisites
npm test                  # full unit + scenario suite
npm run test:harness      # the fixture-repo scenario matrix (A1 AC check)
```

## Repository layout

```text
src/
  cli.ts                          argv parsing, dispatches to commands
  commands/                       install, format, run, doctor
  config/                         types, schema, load, changedComponents
  git/                            staged, branch
  exec/                           commandRunner, localBin, runExternalBin
  errors/                         GateFailure
  gates/                          conventionalCommit, defaultBranchBlock, prettierFormat,
                                  markdownLint, secretScan, spellCheck, sast, lintStaged,
                                  componentCommands, repoLevelTests
  status/                         ticketId, testOutputParsers, statusWriter, eventsWriter
  hooks/                          commitMsgHook, preCommitHook
  versioning/                     releaseConfig (semantic-release configs)
  install/                        defaultPrettierIgnore
schemas/
  guardrails.config.schema.json   the consuming-repo config schema
  status.v1.json                  the status contract snapshot schema
  event.v1.json                   the status contract event schema
skills/
  guardrails-config/SKILL.md      agent guidance, installed into consuming repos
test/
  fixtures/scaffold.ts            builds the on-the-fly fixture repo
  scenarios/*.test.ts             one test per A1 acceptance criterion
  config/, git/, exec/, etc.      unit tests per source module
```

## How it works

- **Commit-msg hook** validates against the conventional-commit grammar
  (`<type>(<scope>): <subject>`). Rejection names the expected format.
- **Pre-commit hook** runs in this order, fail-fast:
  1. Default-branch block (no commits to `defaultBranch`).
  2. Universal prettier format (writes back, respects `.prettierignore`).
  3. markdownlint over `.md` files.
  4. secretlint over all staged files (preset-recommend rules).
  5. cspell over all staged files.
  6. semgrep SAST over all staged files (`--config=p/default`, `--metrics=off`).
  7. `lintStaged` plan: top-level entries, then per-changed-component entries
     (component entries override same-glob top-level entries).
  8. Per-component `build` and `unitTest` for each component whose `paths`
     match a staged file, plus transitive dependents via `dependsOn`.
  9. `repo.*` commands once per commit.
  10. Optional status/event emission when `statusContract.enabled: true`.

The `statusContract` feature is opt-in (default off). When enabled, the
pre-commit hook writes `.forgeboard/state/<ticket-id>/status.json` (schema
v1) and appends to `events.ndjson` after each run. Both are gitignored.

### Diagnostics log

Every command a gate shells out to is appended — command, exit status, duration and
both streams — to **one file per run** under `.forgeboard/logs/`, together with the
verdict of any gate that failed. Files older than 24 hours are removed on the next
run. A gate that blocks you prints the path.

A blocked commit reads end to end:

```text
=== run pre-commit — 2026-07-27T08:06:31.334Z — pid 9208
--- exit 0  0.3s  markdownlint-cli2 README.md
--- exit 0  1.0s  cspell --no-progress README.md
--- exit 0  2.7s  semgrep --config=p/default --error --quiet --metrics=off README.md
*** GATE FAILED: docs-links
=== end run pre-commit — exit 1
```

Three markers, so you can find what matters without reading the file:

| Marker | Meaning                                          |
| ------ | ------------------------------------------------ |
| `---`  | a command that succeeded                         |
| `!!!`  | a command that failed — `grep '^!!!'`            |
| `***`  | the gate's own verdict, which no command reports |

Durations are there to find the slow step; a gated commit has a 30-second budget.

Child processes inherit the run's file name, so one commit is one file however many
processes it spawns. The test suite writes to a throwaway directory instead — it runs
the real gates against fixture repos, and those commands would otherwise be 37% of
what you are reading.

It records commands that **succeeded** as well as ones that failed. An exit code
of zero is not evidence of a clean run: a tool that prints `no configuration
found, using defaults` and then exits zero looks exactly like one that worked,
and checking a build for zero warnings needs the output, not the status.

It lives in the repository so that anything confined to the repository can read
it — a sandboxed coding agent, or a CI container that mounts only the workspace.
What keeps it out of your history is not its location: the directory is created
with a `.gitignore` containing `*`, so it excludes itself and everything under it
without depending on your root ignore file. `git add -A` cannot stage a log;
committing one takes a deliberate `git add -f`.

That matters because gate output contains whatever the tools printed, which can
include the material `secretlint` exists to keep out of your history.

`FORGEBOARD_LOG_DIR` moves the directory if you want it elsewhere.

## Acceptance-criteria coverage (A1)

Each A1 acceptance criterion (ForgeBoard `docs/streams/stream-a-guardrails.md`)
maps to fixture scenarios under `test/scenarios/`, all run by
`npm run test:harness` (the single script of AC8). Every row is a test that
fails if the behaviour regresses.

| A1 AC                                                     | Evidencing scenario test(s)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 — conventional commit                                   | `commitMsg`: _rejects a non-conventional commit message naming the expected format_ / _accepts a conforming conventional-commit message_                                                                                                                                                                                                                                                                                                                                                                                 |
| 2 — default-branch block                                  | `defaultBranch`: _rejects a commit attempted on the default branch_ / _accepts the same change on a feature branch_                                                                                                                                                                                                                                                                                                                                                                                                      |
| 3 — secret scan                                           | `secretScan`: _rejects a staged file containing a planted secret_ / _accepts the commit once the secret is removed_                                                                                                                                                                                                                                                                                                                                                                                                      |
| 4 — lint / spell / SAST / build-warning / unit-test, <30s | `lintError`: _rejects a staged markdown file with a lint error (two top-level headings)_ / accept · `spellCheck`: _rejects a staged file containing a misspelling_ / accept · `sast`: _rejects a staged file with a SAST finding_ / accept · `buildWarnings`: _a warnings-as-errors build that emits a warning rejects the commit_ · `unitTestFailure`: _a failing unit test rejects the commit_ / _passes once the unit test is green_ · `timing`: _pre-commit completes well under the 30s budget with a clean commit_ |
| 5 — status schema + append-only                           | `statusContract`: _status.json validates against schema v1, keyed by the ADR-0003 ticket id, reflecting real outcomes_ · `eventsAppendOnly`: _events.ndjson is append-only across a scripted double-run — no rewritten history_                                                                                                                                                                                                                                                                                          |
| 6 — status reflects outcome                               | `statusContract`: _…reflecting real outcomes_ (asserts build/test values match the actual run)                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 7 — versioning                                            | [ADR-0001](../ForgeBoard/docs/decisions/0001-versioning-tooling.md) is Accepted · `versioning`: _release config computes a release tagFormat for the default branch component_, release/pre-release dry-run, _a rebase does not make semantic-release rebuild an already-tagged version number_                                                                                                                                                                                                                          |
| 8 — single script                                         | `npm run test:harness` runs all of the above (33 tests) and is green                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

Staged-content correctness (the A1 remediation, [ADR-0012](../ForgeBoard/docs/decisions/0012-staged-content-isolation.md))
is additionally pinned by `formatting`, `stagedContent`, `deletionGating`,
`localPaths`, and `markdownLongLine` scenarios.

## Versioning

Per-component independent versioning via semantic-release. Each component's
`tagFormat` is `<appName>-<componentKey>@${version}`, composed automatically
from the config. Default branch → release versions; feature branches →
pre-release. Rebase-safe: tags are computed by name on branch history, not
by commit SHA. See [ADR-0001](../ForgeBoard/docs/decisions/0001-versioning-tooling.md)
in the ForgeBoard repo for the full decision and consequences.

## License

Proprietary (ForgeBoard programme). Licensing terms will be finalised
alongside the A2 npm publish.

### `guardrails docs [--fix]`

Checks that every relative link and `#anchor` in the repository markdown resolves.
`--fix` repairs links whose target has moved and whose basename is unique; ambiguous and
unresolvable links are reported for a human to settle.

Run it once when adopting the toolkit. The pre-commit gate blocks on pre-existing
breakage, so a repo that has never had link checking needs one pass to clear its debt:

```bash
guardrails docs --fix
```

Directory targets and links that intentionally leave the repository are not reported.
Links inside fenced code blocks are not links, and are ignored.
