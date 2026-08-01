---
type: reference
summary: Slice 1 of the distributable-guardrails design — the .guardrails/ folder a consuming repository owns, the forty-eight-capability vocabulary opt-out rows and audit findings key on, and the gate names and output format that replace `gate 2: FAIL`.
read_when: Implementing or reviewing slice 1, assigning a finding to a capability, or deciding whether something belongs in .guardrails/ or in the repository's own tree.
---

<!-- cspell:ignore numstat shortstat hooksPath commitlint renamelimit govulncheck -->

# Slice 1 — Foundations

The layout, the vocabulary and the names every other slice consumes. Scope is
fixed by [the overarching design](2026-08-01-distributable-guardrails-design.md);
anything not described there is out of scope here too.

---

## Part 1 — The `.guardrails/` folder

### Layout

A consuming repository ends up with one directory it owns:

```text
.guardrails/
  README.md                     index of every script: what it is for, why it exists
  capabilities.mjs              the capability id list, machine-readable
  lib.mjs  run.mjs              shared helpers
  gate-0-baseline.mjs           one entry point per gate that has one
  gate-1-edit.mjs
  gate-2-commit.mjs
  gate-3-commit-message.mjs
  gate-4-task-completion.mjs
  gate-5-push.mjs
  gate-6-pull-request.mjs
  gate-7-on-demand.mjs
  check-*.mjs                   the individual checks the gates import
  licence-table.mjs
  opt-out-register.md           slice 2's register
  test/
    *.test.mjs  support.mjs     the ported test suite
```

**Flat, apart from `test/`.** Every `.mjs` file is a sibling, so every import
between them is `./name.mjs` and stays correct wherever the directory is copied
to. This is not a style preference: it is what makes a copy from the plugin
byte-identical to its source, which in turn is what lets slice 4's backfill be a
file comparison rather than a diff modulo path rewriting. Grouping into
`gates/`, `checks/` and `lib/` would buy readability the `README.md` already
provides and cost a path-rewriting step in every copy, every backfill and every
drift check.

**One entry point per gate, named for its gate.** Gate 3 gains one it does not
have today: `.husky/commit-msg` currently runs three commands in sequence, so
gate 3 has no single command whose output is the gate's own — which
[fix 61](../standards/guardrails/cross-gate-rules.md#never-claim-more-than-was-checked)
requires of every gate a report quotes. Gates 8 has no entry point because its
checks are the release pipeline's, not a script's.

### Populated versus stub

Slice 3's activation rule turns on whether an existing `.guardrails/` is
populated or a stub, and the test belongs here because the layout is what it
is a test of. It is one function, and the answer is mechanical:

> `.guardrails/` is **populated** when every gate entry point named in the
> **plugin's** `GATE_FILES` is present in it, and `capabilities.mjs` is present
> and exports a non-empty list. Everything else is a **stub** — the directory
> absent, empty, holding only a `README.md` or an `opt-out-register.md`, or
> missing a single gate entry point.

`isPopulated(dir)`, exported from `check-script-wiring.mjs`, so the activation
rule and the wiring check read one list rather than two that drift.

Three things this deliberately is:

- **Read from the plugin's `GATE_FILES`, never from the copy under test.** The
  directory being judged is the one suspected of being incomplete, so it does
  not get to define what complete means. A hand-made `.guardrails/` holding one
  file and its own wiring constant reads as a stub, which is correct.
- **Not a manifest.** The plausible alternative — "every path this slice
  declares mandatory" — is a second list of the layout, maintained beside the
  first, and it drifts the first time a gate gains an entry point. `GATE_FILES`
  is already maintained, already asserted against the code it describes, and
  already gains gates 1, 3 and 4 in the migration below.
- **Presence, not health.** A populated directory can still be stale, drifted
  or wrong; that is a comparison against the plugin reference and it is slice
  4's, not this test's. This one answers a single question — has a bootstrap
  ever completed here — and answering more would make it a second audit.

### What is not in it

| Stays outside                                                              | Because                                                                                                                              |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `.husky/` (or `core.hooksPath`)                                            | The installation point, not guardrail logic. Each file is one line invoking `.guardrails/`; it carries no checks                     |
| `.github/workflows/`                                                       | Platform configuration. The workflow invokes `.guardrails/`; the checks it runs are not written there                                |
| The agent harness's own hook declaration                                   | Read from the path that harness fixes. Its commands point at `.guardrails/`                                                          |
| `.gitattributes`, `.editorconfig`                                          | Git and editor configuration, read by tools that do not know this toolkit exists                                                     |
| Tool configuration (`eslint.config.mjs`, …)                                | Tuning — which tool implements a check. The tool's own configuration is the repository's, not the toolkit's                          |
| `docs/registers/` — suppression, licence, quarantine, change-size override | Their rows are keyed on a product artefact: a source path, a dependency, a test, a branch                                            |
| `docs/ADR/` — decision records                                             | Not a `.guardrails/` artefact at all. A repository's decision records are not specific to this toolkit and outlive any one guardrail |

**The register split rule, stated once so slice 2 does not re-derive it.** A
register whose rows are keyed on a **capability** lives in `.guardrails/`; a
register whose rows are keyed on a **product artefact** lives in
`docs/registers/` where [registers.md](../standards/guardrails/registers.md)
already puts it. Exactly one register satisfies the first test — the opt-out
register — and it does not exist yet, so nothing moves.

**`docs/ADR/` is created on first need, stated once here so slices 2, 3 and 4
do not each re-derive it.** Bootstrap does not create it:
`skills/repository-bootstrap/SKILL.md` says so directly — "This step tunes
`docs/standards/`, not `docs/ADR/` or `docs/registers/`." An absent
`docs/ADR/` is not an error condition anywhere it is read from; it is modelled
as the empty set, by two independent routes. Three of the checks that read
it — `.guardrails/check-adr-approver.mjs`,
`.guardrails/check-dependency-advisories.mjs` and
`.guardrails/check-pr-body-artefacts.mjs` — wrap `readdirSync(adrDir)` in
`try`/`catch` and continue as though the directory held nothing. A fourth,
`.guardrails/check-approval-provenance.mjs`, reaches the same outcome without
ever listing the directory: it matches path prefixes against paths a commit
or the staging area already names, so there is nothing to catch a missing
directory doing. Three checks share one mechanism; the fourth never touches
the filesystem for it, so an absent directory cannot fail there either.

Whatever decision record a repository files first — a licence acceptance, an
accepted advisory, an opt-out — creates `docs/ADR/` when it lands, the same
way any file creates the directory it is the first to occupy. **There is no
special case for an opt-out, or for any other reserved decision:**
[slice 2](2026-08-01-slice-2-opt-out-register.md#the-row-indexes-the-adr-reasons),
[slice 3](2026-08-01-slice-3-bootstrap-skill.md#the-interactive-opt-out-conversation)
and [slice 4](2026-08-01-slice-4-audit-skill.md#opt-out-awareness) each need
this once and cite it here rather than restating it.

### What `.guardrails/` is, and what therefore stays out of it here

Stated once, because three slices reach the same boundary from three
directions and each was about to decide it separately.

> **`.guardrails/` is what a consuming repository receives.**

That is the whole definition and it settles every borderline case by itself: a
file copied into a consuming repository belongs in it; a file never copied does
not, wherever it sits in the toolkit's own tree. The overarching design's
"everything guardrail-related lives in `.guardrails/`" is about the guardrails a
repository runs, not about every `.mjs` file the toolkit happens to own.

Three things in this repository are guardrail-adjacent and are never received:

| Stays outside `.guardrails/` in the toolkit                                            | Is                                                | Never received because                                                                                                                                  |
| -------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/configure-branch-protection.mjs`, `scripts/configure-repository-features.mjs` | One-off host configuration, run once during setup | Setup runs from the plugin, before any copy exists. A repository being set up has the plugin; one that does not has nothing left for these to configure |
| `.claude/skills/**/*.mjs` — slice 6's `check-ledger.mjs`                               | Tooling for this repository's improvement record  | A consumer has no rounds and no ledger, so the check would have nothing to read                                                                         |
| `eval/**` — slice 5's harness                                                          | The evaluation loop that measures the toolkit     | It runs the toolkit against a subject repository; a consumer _is_ a subject                                                                             |

The carve-out is not a preference. Copying any of them would leave a
`tooling`-classed script in a consuming repository that no gate there invokes,
which is a finding `check-script-wiring.mjs` raises
([cross-gate-rules](../standards/guardrails/cross-gate-rules.md#every-quality-script-is-wired-or-declared))
— so the alternative is a copy that fails the consumer's own gate 7 on arrival.

**They are still wired, here, where they do run.** `check-script-wiring.mjs`
scans `.guardrails/` for the copied set, and additionally accepts these three
locations as repo-local tooling: each is invoked by a gate in this repository
(`check-ledger.mjs`, at gate 7) or declared on demand with its caller named
(`configure-*.mjs`, by the bootstrap skill; `eval/harness.mjs`, by a person).
None of them is compared against the plugin reference or expected in a
consumer. That is one extra constant beside the directory constant the
migration below introduces, not a second check.

### The `guardrail-class` declaration

One pattern, in `.gitattributes`, and its value differs by repository:

```gitattributes
.guardrails/**       guardrail-class=tooling
.guardrails/test/**  guardrail-class=test
```

In the toolkit's own repository the first line reads `production` instead: the
toolkit's product _is_ the tooling, which
[file classes](../standards/guardrails/file-classes.md) already states as a
per-repository rule and `isToolkit()` already resolves mechanically. No new
machinery, and no per-file patterns — one directory, one class, which is the
whole reason the design puts everything in it.

The directory carries the `README.md` file classes requires of a tooling
directory. It carries **no** directory-level agent instruction file: nothing
about `.guardrails/` needs a rule the root instruction file has no reason to
state, and a pointer-only file is a finding rather than compliance.

### Change size

**Nothing here is exempted from change-size counting, and no new exemption is
proposed.** `.guardrails/**` is `tooling`, which
[file classes](../standards/guardrails/file-classes.md) counts.
[ADR-0008](../ADR/0008-tooling-complexity-band.md) has already refused the
obvious move — "ported gate scripts are copied, not generated; a human can act
on them, edit them, simplify them" — so
[ADR-0005](../ADR/0005-generated-files-discounted-from-change-size.md)'s
`guardrail-generated` discount does not reach them.

The consequence is unchanged and intended: a bootstrap commit carrying ~8,900
lines of ported tooling exceeds the 800-line error band by roughly eleven times
and needs a human-approved row in
[the change-size override register](../standards/guardrails/registers.md#the-change-size-override-register).
That is [fix 74](../standards/guardrails/cross-gate-rules.md#an-override-answers-a-push-back-it-is-not-a-fix)
working, not failing.

What this slice does change is the **composition**, which that register's own
column requires to be "named, not merely totalled". Today the bulk is spread
across `scripts/`, `hooks/` and `.husky/` and has to be assembled by hand. After
this slice it is one path, so gate 4's report can name it in one line and the
row's Composition cell is derivable rather than written from memory.

### The migration out of `scripts/` and `hooks/`

The toolkit's own tree moves into `.guardrails/` **in this slice**, before
slices 3 and 4 are built. Those slices copy from, and compare against, the
plugin's reference layout; they cannot be written against a layout that does not
exist. Keeping the plugin at `scripts/` + `hooks/` while consumers use
`.guardrails/` would mean every copy flattens two directories into one, every
copy rewrites the imports that cross between them, and every drift check
compares two shapes rather than two files.

| From                                                                                   | To                                                               |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `scripts/*.mjs`                                                                        | `.guardrails/*.mjs`                                              |
| `scripts/configure-branch-protection.mjs`, `scripts/configure-repository-features.mjs` | **Stay at `scripts/`** — never received, per the carve-out above |
| `scripts/pre-commit.mjs`                                                               | `.guardrails/gate-2-commit.mjs`                                  |
| `hooks/gate-1-edit.mjs`                                                                | `.guardrails/gate-1-edit.mjs`                                    |
| `hooks/gate-4-task-completion.mjs`                                                     | `.guardrails/gate-4-task-completion.mjs`                         |
| `hooks/lib/run.mjs`                                                                    | `.guardrails/run.mjs`                                            |
| `hooks/test/**`                                                                        | `.guardrails/test/**`                                            |
| `hooks/README.md`                                                                      | `.guardrails/README.md`                                          |

`pre-commit.mjs` is renamed because gate names are the vocabulary this slice
establishes and a file named after its hook rather than its gate is the one
place `GATE_FILES` currently needs a special case.

**`scripts/` survives the migration, holding two files and nothing else.** The
carve-out row is written into the table rather than left implicit because an
unqualified `scripts/*.mjs` wildcard is exactly what a later reader would act
on. Slice 3 depends on the distinction: the bootstrap skill runs those two from
`${CLAUDE_PLUGIN_ROOT}/scripts/` and every other script it names from
`${CLAUDE_PLUGIN_ROOT}/.guardrails/`.

**One commit.** A half-moved tree fails every gate, and the rename detection the
next section depends on only works when the removal and the addition are in the
same commit.

#### What breaks, and how each is handled

| What                                                      | Names today                                                                                                                          | Handling                                                                                                                                                                                                                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `check-script-wiring.mjs` — `WIRING`                      | `scripts/gate-0-baseline.mjs`, `scripts/pre-commit.mjs`, `scripts/gate-5-push.mjs`, `"--test", "hooks/test/hooks.test.mjs"`          | Update each `file` value and the `test` entry's `contains` string                                                                                                                                                                                            |
| `check-script-wiring.mjs` — main block                    | `readdirSync("scripts")`, `join("scripts", f)`, `join("scripts", "README.md")`                                                       | One directory constant, used in all three places, plus the repo-local list the carve-out names — `scripts/configure-*.mjs`, `.claude/skills/**/*.mjs`, `eval/*.mjs` — scanned for wiring here and never compared against the reference                       |
| `check-script-wiring.mjs` — `GATE_FILES`                  | `pre-commit.mjs` for gate 2; no entries for gates 1, 3, 4                                                                            | Rename gate 2's value; add 1, 3 and 4 now that each has an entry point                                                                                                                                                                                       |
| `check-script-wiring.mjs` — `checkScriptFileWiring`       | Matches `"./${file}"` between siblings                                                                                               | Unaffected — the flat layout keeps every inter-script import `./name.mjs`                                                                                                                                                                                    |
| `package.json`                                            | `lint: eslint … hooks scripts`, `test` and `test:coverage` paths, `gate:0`, `gate:7`                                                 | Update all five; the `WIRING` `contains` strings must be updated to match, not merely the scripts                                                                                                                                                            |
| `.husky/pre-commit`, `commit-msg`, `pre-push`             | `node scripts/*.mjs`                                                                                                                 | Repoint. `commit-msg`'s three commands collapse to `node .guardrails/gate-3-commit-message.mjs`                                                                                                                                                              |
| `.github/workflows/*.yml`                                 | `node scripts/check-branch-protection.mjs`, `check-dependency-advisories.mjs`, `check-refusal-proofs.mjs`, `gate-6-pull-request.mjs` | Repoint the four `run:` lines and the comment blocks that cite paths                                                                                                                                                                                         |
| The plugin's agent hook manifest                          | `${CLAUDE_PLUGIN_ROOT}/hooks/gate-1-edit.mjs`, `.../gate-4-task-completion.mjs`                                                      | `${CLAUDE_PLUGIN_ROOT}/.guardrails/…`                                                                                                                                                                                                                        |
| `eslint.config.mjs`, `tsconfig.json`                      | `hooks/**/*.mjs`, `scripts/**/*.mjs` globs                                                                                           | One glob each: `.guardrails/**/*.mjs`                                                                                                                                                                                                                        |
| `.gitattributes`                                          | `scripts/**`, `hooks/**`, `hooks/test/**`, `.husky/**`                                                                               | Replaced by the two patterns above; `.husky/**` keeps `configuration`                                                                                                                                                                                        |
| Test files                                                | `../../scripts/…` imports                                                                                                            | Become `../name.mjs`                                                                                                                                                                                                                                         |
| `docs/**` links into `scripts/`                           | `../../../scripts/licence-table.mjs` and siblings                                                                                    | Must move in the same commit — gate 2 check 17 refuses a broken link, so a staged half-migration cannot be committed                                                                                                                                         |
| Prose in `docs/standards/**` naming `scripts/check-*.mjs` | Roughly forty mentions, in tables and checklists                                                                                     | Text update. Not links, so no gate refuses them — a stale path in a standard is a finding under docs-style's own "a sentence must name a location that actually contains the thing", not a blocked commit. This is the part most likely to be left half-done |

Two things this migration is **not** allowed to do: change what any check
checks, or change any threshold. It moves files and repoints the names of files.

#### A defect the migration exposes

Gate 4 measures change size from `git diff --numstat <base>...HEAD` and resolves
each file's class with `git check-attr` on the path in column three. Git's rename
detection is on by default, so a renamed file's third column is not a path — it
is `{scripts => .guardrails}/lib.mjs`. Measured directly:

```text
$ git diff --numstat main...HEAD     (tabs shown as spaces)
2   2   {scripts => .guardrails}/a.mjs
0   0   {scripts => .guardrails}/b.mjs
```

`git check-attr` on that string matches no pattern and returns `unspecified`,
which file classes resolves to **production** — the fail-safe direction, and
correct as a default, but it means **every renamed file is counted as production
whatever its real class**. A renamed test or documentation file, which should
contribute zero, contributes its edited lines.

For this migration the error is in the safe direction (it over-counts, and the
counted total stays small). The remedy is `git diff -z --numstat`, whose rename
records carry the old and new paths as separate NUL-separated fields rather than
one composite string.

**Raise it as its own finding, and fix it before the migration lands** —
not folded into the migration commit. Scope discipline aside, the practical
reason is that a change-size figure quoted for a commit measured through this
path is not one anybody should approve a register row from.

#### What the migration costs in counted lines

Measured, not estimated. With rename detection on, a rename plus a small edit to
the moved file reports only the edited lines:

```text
--- numstat (default), tabs shown as spaces ---
2   2   {scripts => .guardrails}/a.mjs
0   0   {scripts => .guardrails}/b.mjs
--- shortstat ---
 2 files changed, 2 insertions(+), 2 deletions(-)
--- --no-renames ---
300   0     .guardrails/a.mjs
0     300   scripts/a.mjs
```

So the migration commit costs roughly the number of lines actually edited —
import paths, the wiring constants, the workflow `run:` lines — not the ~8,900
lines being moved. **The expected counted size is well under the 400-line warn
band, and the migration needs no change-size override.** If it reports otherwise,
rename detection did not fire (check `diff.renameLimit`) and the figure is wrong
rather than the change being large.

### Success and failure criteria — the folder

| Criterion                                                                                                               | Verified by                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| No file under `.guardrails/` imports anything outside `.guardrails/` other than a Node built-in                         | A test walking the directory's `import` statements. This is what makes the folder copyable at all     |
| A clone with no plugin installed runs every gate from `.guardrails/` and produces the same finding set as CI            | CI invokes the same entry points at the same paths; no workflow step reimplements a check inline      |
| `git check-attr guardrail-class -- .guardrails/lib.mjs` returns `tooling` in a consumer and `production` in the toolkit | Two fixtures, one per repository kind                                                                 |
| `node .guardrails/check-script-wiring.mjs` reports zero unwired after the move                                          | The command's own exit status                                                                         |
| Every `docs/**` link that pointed into `scripts/` or `hooks/` resolves                                                  | Gate 2 check 17, on the migration commit itself                                                       |
| The migration commit's counted change size is under the warn band                                                       | `node .guardrails/gate-4-task-completion.mjs`, run on the migration branch, after the rename-path fix |
| Each gate has exactly one entry point, and `.husky/` and `.github/workflows/` contain no check logic of their own       | Read the four husky files and the workflow `run:` steps: each is an invocation, not an implementation |

**Failure.** A layout that needs the plugin present to run a gate. A file under
`.guardrails/` that imports across the boundary, because the next copy of that
directory is broken on arrival. A migration that lands with the standards' prose
still naming `scripts/`. Any change to what a check checks, smuggled in with the
move.

---

## Part 2 — The capability vocabulary

A **capability** is one property the toolkit enforces. It is the key an opt-out
row and an audit finding are written against, so it must survive check
renumbering, tool substitution and gate reordering — all three of which have
already happened during development.

### The rules that decide a capability's edge

Six rules. Applied in order, they answer every assignment this corpus has
produced; the boundary cases below are the ones that needed one of them stated.

1. **A capability is a property, not a gate and not a check number.** A finding
   is assigned by asking what property it says is broken, never which gate
   produced it.
2. **A local check and its named server-side equivalent are one capability.**
   [Local gates are a fast copy; the server gate is the authority](../standards/guardrails/cross-gate-rules.md#local-gates-are-a-fast-copy-the-server-gate-is-the-authority)
   makes them one decision by construction.
3. **The tool implementing a check never decides the capability.** That is
   tuning. `osv-scanner`, `npm audit` and `govulncheck` are three tools for
   `dependency-advisories`.
4. **The tool _hosting_ a rule does decide, where the corpus files the rule
   inside another check.** A security rule running inside the linter is
   `linting`; the same class of rule in a standalone cross-language pass is
   `static-analysis`. This is not rule 3 contradicted — rule 3 is about which
   program runs a check, rule 4 is about which check the corpus puts a rule in.
5. **A register's completeness and its policy are one capability.** Two checks
   at two gates, but a policy check with no register has nothing to judge.
6. **Ids never change.** A rename invalidates every opt-out row written against
   it, silently, which is the exact failure the design chose capability keys to
   avoid. The list is additive; retiring an id needs an ADR.

### The list

Forty-eight capabilities, grouped for reading only — the grouping carries no
meaning a script reads.

#### Source content

| Capability        | Defends                                                      | Spans              |
| ----------------- | ------------------------------------------------------------ | ------------------ |
| `formatting`      | Mechanical shape of the source, honouring `.editorconfig`    | Gate 1.1, gate 2.4 |
| `spelling`        | Tokens absent from the dictionary and file-local vocabulary  | Gate 2.7           |
| `prose-structure` | Prose lint rules, documentation frontmatter, preferred terms | Gate 2.5           |
| `link-integrity`  | Links and anchors resolving, unambiguously                   | Gate 2.17, gate 7  |
| `file-bytes`      | A committed file's size in bytes                             | Gate 2.10          |

#### Security

| Capability                    | Defends                                                   | Spans                      |
| ----------------------------- | --------------------------------------------------------- | -------------------------- |
| `secret-scanning`             | Credentials, keys and tokens in tracked content           | Gate 1.2, gate 2.6, gate 7 |
| `secret-history-scanning`     | The same, in every reachable commit rather than at `HEAD` | Gate 7                     |
| `machine-identifying-content` | Absolute local paths, user names, host layout             | Gate 1.2, gate 2.9, gate 7 |
| `static-analysis`             | Cross-language security and correctness patterns          | Gate 1.2, gate 2.8, gate 7 |
| `untrusted-run-isolation`     | Credentials reachable from a run a stranger can trigger   | Gate 6.9                   |

#### Dependencies

| Capability                  | Defends                                                          | Spans                                    |
| --------------------------- | ---------------------------------------------------------------- | ---------------------------------------- |
| `dependency-lock-integrity` | The resolved dependency set matching the declared one            | Gate 0.3, gate 2.3                       |
| `dependency-advisories`     | Known vulnerabilities in the resolved set                        | Gate 5.3, gate 6.6, gate 6.10, scheduled |
| `dependency-licences`       | Register completeness, licence policy, and the table's own facts | Gate 2.16, gate 6.7, gate 7              |

#### Correctness

| Capability           | Defends                                                          | Spans                    |
| -------------------- | ---------------------------------------------------------------- | ------------------------ |
| `build`              | The build succeeding, warning-free, including compiler analysers | Gate 0.4, 2.12, 6.2, 6.4 |
| `linting`            | The linter and type checker, and the analysers hosted in them    | Gate 2.11                |
| `unit-tests`         | Unit tests passing, counts recorded                              | Gate 0.5, 2.13, 6.4      |
| `architecture-tests` | The code holding the structure it claims                         | Gate 2.13                |
| `integration-tests`  | Orchestration across owned code, externals stubbed               | Gate 5.2                 |
| `end-to-end-tests`   | Journeys against a deployed environment                          | Gate 6.5, gate 8.7       |
| `smoke-tests`        | The deployment did what it claimed                               | Gate 8.6                 |
| `health-checks`      | Liveness and readiness after a deployment                        | Gate 6.5, gate 8.5       |
| `coverage`           | The overall floor and the changed-line floor                     | Gate 5.1, gate 6.8       |
| `test-quarantine`    | Flaky tests declared rather than retried into silence            | Gate 5, gate 6           |

#### Size

| Capability             | Defends                                                            | Spans            |
| ---------------------- | ------------------------------------------------------------------ | ---------------- |
| `change-size`          | Added and deleted lines across a branch, and its override register | Gate 4.1, gate 6 |
| `file-length`          | Lines per file                                                     | Gate 4.2, gate 7 |
| `complexity`           | Cyclomatic complexity, function length, parameter count            | Gate 4.4, gate 7 |
| `agent-context-limits` | Agent-document length and Agent Skills frontmatter validity        | Gate 4.3         |

#### Workspace, history and release

| Capability                  | Defends                                                               | Spans                      |
| --------------------------- | --------------------------------------------------------------------- | -------------------------- |
| `workspace-baseline`        | Rebased onto base, clean tree, not behind the base at push            | Gate 0.1, 0.2, gate 5.4    |
| `staged-content-isolation`  | Every check reading the content actually being committed              | Gate 2.2                   |
| `commit-message-convention` | Message structure, type, scope, breaking footer, scope agreement      | Gate 3.1–3.5               |
| `version-derivation`        | Versions derived from messages, prerelease classes, the no-taint rule | Gate 3, gate 8.2, gate 8.3 |
| `artefact-provenance`       | What is deployed being what was validated, built from the checkout    | Gate 6.1, gate 8.1         |
| `deployment-gating`         | The deployment succeeding, and rollback being proven                  | Gate 8.4, gate 8.8         |

#### Merge control

| Capability         | Defends                                                                                                     | Spans                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `merge-protection` | Required checks binding, up-to-date base, no direct or force push, no administrator override, history shape | Gate 2.1, gate 6.16/17/22/23/24, gate 7 |
| `review-approval`  | Review required, self-approval refused, stale approvals dismissed, conversations resolved                   | Gate 6.18–6.21                          |

#### Records

| Capability             | Defends                                                                | Spans          |
| ---------------------- | ---------------------------------------------------------------------- | -------------- |
| `suppression-register` | Every inline suppression having a complete row                         | Gate 2.15      |
| `approval-provenance`  | An approval being an event, in a commit separate from what it approves | Gate 2, gate 6 |
| `evidence-publication` | Test report, coverage report, SARIF, inventory, logs, run identity     | Gate 6.10–6.15 |
| `diagnostic-logs`      | What a local gate run captures, where it goes, how long it lives       | Cross-cutting  |

#### The toolkit checking itself

| Capability                | Defends                                                                | Spans                  |
| ------------------------- | ---------------------------------------------------------------------- | ---------------------- |
| `file-classification`     | `guardrail-class` and `guardrail-generated` declared and honoured      | Gate 7, cross-cutting  |
| `component-map`           | The map, and the changed-component rule that reads it                  | Gate 2, gate 5, gate 6 |
| `gate-installation`       | Hooks installed in every harness in use, external tools resolvable     | Gate 7                 |
| `root-instruction-file`   | One canonical file, kept equivalent across harnesses                   | Cross-cutting          |
| `platform-features`       | Every platform feature free at this visibility and plan being enabled  | Gate 7                 |
| `workspace-capabilities`  | Long paths, text normalisation, large-file storage                     | Gate 7                 |
| `refusal-proof`           | Every blocking check having a negative fixture and refusing it         | Gate 7, CI             |
| `script-wiring`           | Every quality script invoked by a gate or declared on demand           | Gate 7, CI             |
| `standards-instantiation` | An instantiated corpus tuned to the repository, with removals recorded | Gate 6, gate 7         |

### Boundary cases, decided

Each of these is a case where two people could reasonably disagree. Each is
decided here, with the rule from above that decides it.

| Case                                                              | Decision                                                                                                                                                | Rule |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| A security rule that fires inside the linter                      | `linting`, not `static-analysis`                                                                                                                        | 4    |
| A compiler analyser warning                                       | `build`, not `static-analysis`                                                                                                                          | 4    |
| A function over the function-length band                          | `complexity` — gate 4 check 4 measures it, not check 2                                                                                                  | 1    |
| A file over the byte-size limit                                   | `file-bytes`, not `file-length`. Bytes and lines are different measures, and file bytes is the one Size check that does not vary by class               | 1    |
| A type-check error                                                | `linting` — gate 2 check 11 is one check running both, and splitting it invents a capability the corpus does not have                                   | 1    |
| Gate 0's clean build                                              | `build`. There is no `baseline` capability; `workspace-baseline` covers only the positioning checks                                                     | 1    |
| Gate 0's "dependencies not installed"                             | `dependency-lock-integrity` — the same property gate 2 check 3 defends                                                                                  | 1    |
| Gate 2 check 14, repository-wide tests                            | Not a capability. It is a slot at which several capabilities' repository-scope checks run, and every finding it produces already belongs to one of them | 1    |
| A `nosemgrep` marker with no register row                         | `suppression-register`. The semgrep finding it silences is `static-analysis` — two findings, two capabilities                                           | 1    |
| A coverage report missing from a run                              | `evidence-publication`. A coverage number below the floor is `coverage`                                                                                 | 1    |
| `[large-pr]` with no register row                                 | `change-size`. A row approved in the commit that filed it is `approval-provenance`                                                                      | 1    |
| Gate 3 check 5, scope does not match the paths                    | `commit-message-convention`. The map being wrong is `component-map`                                                                                     | 1    |
| A release resolving an internal dependency to a prerelease        | `version-derivation`, not `deployment-gating`                                                                                                           | 1    |
| Gate 2 check 1 (local) and gate 6 policy 22 (server)              | Both `merge-protection`                                                                                                                                 | 2    |
| `osv-scanner` absent versus `npm audit` clean                     | Both `dependency-advisories`                                                                                                                            | 3    |
| Licence register completeness at gate 2, licence policy at gate 6 | Both `dependency-licences`                                                                                                                              | 5    |
| The overall coverage floor and the changed-line floor             | Both `coverage`. Gate 6 requires both wired, so an opt-out cannot keep one and drop the other                                                           | 5    |
| Machine-identifying content, found by the same tool as a secret   | `machine-identifying-content`. One tool, two capabilities                                                                                               | 3    |
| The history secret scan                                           | `secret-history-scanning`, separate from `secret-scanning` — gate 7 files them as two rows and scanning current files is not scanning the history       | 1    |
| Agent hooks not firing in a second harness                        | `gate-installation`. The root instruction file's equivalence across harnesses is `root-instruction-file`                                                | 1    |

Two capabilities were put to slice 2 as a question — whether
`approval-provenance` and `refusal-proof` may be opted out at all, given that
they are the mechanisms making every other capability's records trustworthy.
**Slice 2 has answered: neither may be, by construction.** They remain ordinary
capabilities in this list — every finding still carries its id, and the ids are
what the exclusion is written against — but a row naming either is refused at
gate 2 and ignored by the reader. The reasoning is
[slice 2's](2026-08-01-slice-2-opt-out-register.md#two-capabilities-that-may-not-be-opted-out)
and is not restated here.

### Where the list lives

Two artefacts, because two readers need it, and one mechanical check so they
cannot drift:

- `.guardrails/capabilities.mjs` exports the frozen id list. It is canonical for
  the ids. Every finding a gate emits carries one, and slice 2's register lookup
  is membership in this list — not a string match against a document.
- `docs/standards/guardrails/capabilities.md` carries the table above. It is
  canonical for what each capability spans.
- `check-capability-vocabulary.mjs` asserts the two id sets are equal, wired at
  gate 7. This is the same shape `check-script-wiring.mjs` already uses to stop
  its own `WIRING` claims drifting from the code they describe.

This is not the configuration file [ADR-0003](../ADR/0003-derive-configuration.md)
refuses. The vocabulary is fixed by the corpus and identical in every repository
— it ships as part of the copied tooling, and nothing about it is derived from,
or varies with, the repository it lands in.

**`capabilities.md` is new standards content, and it is the design's one named
exception.** The overarching design's out-of-scope list originally read "any
change to the standards' content, except gate naming in output", which this
slice would have been in breach of on its first commit. That line has been
amended to permit the capability catalogue, with the reasoning recorded
[there](2026-08-01-distributable-guardrails-design.md#out-of-scope) rather than
here. The exception is exactly this file: this slice changes no other standard's
content, and a slice that wants to is still out of scope.

### Success and failure criteria — the vocabulary

| Criterion                                                                | Verified by                                                                                                                                                                                |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Every finding any gate emits carries a capability id that is in the list | A test running each gate against its negative fixtures and asserting membership                                                                                                            |
| The two artefacts agree                                                  | `node .guardrails/check-capability-vocabulary.mjs`                                                                                                                                         |
| Two people assigning the same finding reach the same capability          | A checked-in table of every check this repository implements against its capability, asserted against what the gate actually emits — a disagreement becomes a failing test, not an opinion |
| A capability id never changes once published                             | The list is append-only in the diff; a removal or rename without an ADR is a review finding                                                                                                |
| No capability is stack-specific                                          | Read the list: no entry names a language, package manager or tool                                                                                                                          |

**Failure.** A capability whose edge is arguable — the stated failure condition
for this slice. A finding that resolves to no capability. Two capabilities that
differ only by which tool implements them. A capability added because a check was
added, rather than because a property was.

---

## Part 3 — Gate names and output

### The nine names

Already titled by the standards; this slice only stops the output discarding
them.

| Number | Name                  | Reference                   |
| ------ | --------------------- | --------------------------- |
| 0      | Baseline              | `gate-0-baseline.md`        |
| 1      | Edit                  | `gate-1-edit.md`            |
| 2      | Commit                | `gate-2-commit.md`          |
| 3      | Commit message        | `gate-3-commit-message.md`  |
| 4      | Task completion       | `gate-4-task-completion.md` |
| 5      | Push                  | `gate-5-push.md`            |
| 6      | Pull request pipeline | `gate-6-pull-request.md`    |
| 7      | On demand             | `gate-7-on-demand.md`       |
| 8      | Release               | `gate-8-release.md`         |

### Output format

Today a finding reads `gate 2: FAIL suppression register (path)` — a number the
reader has to look up, and no statement of what property broke.

**The run header, printed once, carries the number.** It is what lets a reader
find the gate's reference document, and it costs one line per run rather than one
token per finding:

```text
Gate 6 — Pull request pipeline
```

**Every result line carries the gate name and the capability**, in the shape
[a refusal is a diagnosis](../standards/guardrails/cross-gate-rules.md#a-refusal-is-a-diagnosis)
already requires:

```text
<Gate name>: <VERDICT> <check> [<capability>] (<path>)
        <problem>
        <remedy>
```

Worked:

```text
Pull request pipeline: FAIL dependency licence policy [dependency-licences] (package-lock.json)
        Artistic-2.0 records sourceDisclosure: true and this dependency is runtime scope
        Add a register row naming the decision record and its approver, or move the dependency to development scope
Push: SKIP cross-stack dependency scan [dependency-advisories]
        osv-scanner is not on PATH, so nothing was scanned
        Install osv-scanner to enable this check
```

**The verdict tokens** are the corpus's own vocabulary, not a new set:

| Token         | Is                                                              | From                                       |
| ------------- | --------------------------------------------------------------- | ------------------------------------------ |
| `PASS`        | Ran, found nothing                                              | The verdict table                          |
| `WARN`        | Printed; nobody has to respond                                  | The verdict table                          |
| `PUSH BACK`   | Stops and asks; the answer is a resolved decision record        | The verdict table                          |
| `FAIL`        | Blocked                                                         | The verdict table's Block                  |
| `SKIP`        | Inputs did not change, or the check is not configured here      | bypass-and-exceptions' three states        |
| `SUPPRESSED`  | Excluded by decision; names the record                          | bypass-and-exceptions' three states        |
| `UNAVAILABLE` | Could not run, and says why — never a finding it cannot back up | cross-gate-rules, a refusal is a diagnosis |

`UNAVAILABLE` is already required by the corpus and is listed here because the
output format has to have a token for it. Whether every existing check
distinguishes it from `SKIP` today is an audit finding about those checks, not a
change this slice makes.

**An opted-out capability has no token, because it produces no line.** This was
put here as an open question — silent, or reported as suppressed, or named once
in the header — and it is now decided: **the capability is absent from gate
output entirely**, including from the header block this spec proposed as a
compromise.

The reason is categorical, not a preference about verbosity. A **suppression**
tolerates a violation that exists, and `SUPPRESSED` is right for it: the standing
reminder is the point, because somebody may one day be able to fix it. An
**opt-out** asserts that the class of check does not apply to this repository at
all — it is configuration, of the same kind as declaring the stack — so there is
no violation, nothing to be reminded of, and a line about it would be noise
asserting something untrue. Visibility comes from the register in the diff, the
decision record it cites, and the audit, which reports every opted-out capability
on every run.

`SUPPRESSED` therefore stays in the table above, unchanged and unaffected: a
per-check suppression is a different act from a capability-level opt-out, and
[slice 2](2026-08-01-slice-2-opt-out-register.md#an-opt-out-is-configuration-not-a-suppression)
owns the distinction and the standards amendment it implies.

**One compatibility consequence, named.**
`check-report-ci-reconciliation.mjs` matches `^([\w .()-]+?): FAIL (.+)$`, which
`Pull request pipeline: FAIL …` still satisfies — the check keeps working
unchanged. What does break is any report, document or fixture quoting
`gate 6: FAIL …` as a verbatim capture: those become stale the moment the output
changes, and the corpus contains several. They are updated in the same change, or
they are wrong.

### The four-way grouping

Gate numbering is priority by frequency and is the ordering rule for the
standards. It is not what a human wants when asking what will run against them.
The grouping below is by **where the gate is installed**, and it is presentation
— it reorders nothing and every gate belongs to exactly one group.

| Group           | Gates                          | Installed as                                           |
| --------------- | ------------------------------ | ------------------------------------------------------ |
| **Git hooks**   | Commit, Commit message, Push   | `.husky/pre-commit`, `commit-msg`, `pre-push`          |
| **Agent hooks** | Edit, Task completion          | The harness's own hook declaration, per harness in use |
| **CI**          | Pull request pipeline, Release | Workflow files                                         |
| **Run by hand** | Baseline, On demand            | A command a person types                               |

**One gate is in two places and the grouping names the primary one.** Task
completion is installed as an agent hook and is also invoked by hand before a
pull request, and as a subprocess from the pull request pipeline. The group names
where it is _installed_, so the answer to "what do I have to set up" is complete;
it is not a claim that the gate fires nowhere else. Any listing of this grouping
says so, because a grouping that reads as exhaustive and is not is the kind of
false claim this corpus keeps finding.

### Success and failure criteria — gate names

| Criterion                                                                                 | Verified by                                                                                                                   |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| No result line matches `gate \d`                                                          | A test over the output of every gate run against its fixtures                                                                 |
| Each gate prints its header exactly once, with number and name                            | The same test                                                                                                                 |
| Every result line's capability resolves against `capabilities.mjs`                        | The same test                                                                                                                 |
| A disabled capability contributes no line anywhere in the run, header included            | The same test, comparing a run with the capability opted out against a run whose fixture never had it — byte-identical output |
| A reader can name the gate and the property from one line, without a table                | Read the worked example above; there is nothing left to look up                                                               |
| `check-report-ci-reconciliation.mjs` still extracts every `FAIL` line from a real job log | Its own fixtures, re-captured against the new format                                                                          |
| Every document quoting gate output verbatim quotes the new format                         | A search across `docs/` for a `gate <digit>:` result line                                                                     |

**Failure.** Gate output a human has to consult a table to read. A finding line
that names a capability the list does not contain. A grouping presented as the
complete answer to where a gate fires.

---

## Questions

These are unresolved. They are not gaps to be filled by whoever implements this.

The question that stood first here — whether an opted-out capability is silent or
reported as suppressed — is decided, along with the header-line compromise this
spec recommended. See
[an opted-out capability has no token](#output-format); the reasoning is slice
2's and is not restated here.

1. **Does `.husky/` survive?** Git's own `core.hooksPath` would let
   `.guardrails/` hold the git hook scripts directly and remove husky entirely,
   which is the no-new-dependency line's preference and puts one more thing
   inside the folder the design says holds everything. Against it: husky is
   already here and working, `prepare`/lint-staged are wired to it, and swapping
   it is a dependency decision reserved for a human under the
   reuse-trusted-tools versus no-new-dependency conflict. **Recommendation: keep
   husky, out of scope for this slice.** Named here so the decision is visible
   rather than absent.

2. **Agent hooks currently run from the plugin, not from the copy.** The plugin's
   hook manifest invokes `${CLAUDE_PLUGIN_ROOT}/…`, so a developer without the
   plugin gets no Edit gate and no Task-completion gate — which contradicts the
   design's own success criterion that every gate runs without the plugin. This
   slice states the requirement (a consumer's harness configuration points at its
   own `.guardrails/` copy) but the wiring is slice 3's. Flagged because if slice
   3 does not close it, two of the nine gates are plugin-only and this slice's
   criterion is unmet.

3. **Forty-eight capabilities may be more than opt-out needs.** The number falls
   out of the corpus rather than being chosen, and every entry is a property a
   human could sensibly decide does not apply. But nobody has yet written twenty
   real opt-out rows against it, which is the only way to find out whether the
   granularity is right. If slice 2 finds itself writing rows that always come in
   pairs, that pair is one capability and this list is wrong.

4. **Should an unmodified copy of the plugin's reference be discounted from
   change size?** Bytes identical to the plugin's own file carry no author
   decision for a reviewer to review, which is
   [ADR-0005](../ADR/0005-generated-files-discounted-from-change-size.md)'s
   argument almost word for word — and
   [ADR-0008](../ADR/0008-tooling-complexity-band.md) has already rejected the
   nearest version of it, on the grounds that a copy can be edited where a
   generated file cannot. This spec proposes **no change**; it is recorded here
   because it is the obvious next argument and it should be had as its own ADR,
   with a measurement, rather than settled quietly inside an implementation.

---

## References

- [Distributable guardrails — overarching design](2026-08-01-distributable-guardrails-design.md) — the six slices and the decisions already taken.
- [File classes](../standards/guardrails/file-classes.md) — the class model `.guardrails/` declares itself under.
- [Guardrail standards](../standards/guardrail-standards.md) — the nine gates and their titles.
- [Cross-gate rules](../standards/guardrails/cross-gate-rules.md) — the tooling ladder, the local-versus-server rule, and how a refusal must read.
- [Registers](../standards/guardrails/registers.md) — the four product registers, and why the opt-out register is not one of them.
- [Bypass and exceptions](../standards/guardrails/bypass-and-exceptions.md) — the three reporting states `SUPPRESSED` comes from, and why an opt-out is not one of them.
- [ADR-0003](../ADR/0003-derive-configuration.md) — why `.gitattributes` carries the class declaration.
- [ADR-0005](../ADR/0005-generated-files-discounted-from-change-size.md) — the generated-file discount, and the measurement behind the ~8,900-line figure.
- [ADR-0008](../ADR/0008-tooling-complexity-band.md) — why a copied gate script is not a generated file.
- `skills/repository-bootstrap/SKILL.md` — where "this step tunes `docs/standards/`, not `docs/ADR/` or `docs/registers/`" is stated.
- `.guardrails/check-adr-approver.mjs`, `.guardrails/check-dependency-advisories.mjs`, `.guardrails/check-pr-body-artefacts.mjs` — the three checks sharing the `readdirSync` + `try`/`catch` mechanism the `docs/ADR/` convention above cites.
- `.guardrails/check-approval-provenance.mjs` — the fourth check, reaching the same outcome without listing the directory at all.
