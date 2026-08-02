---
type: reference
summary: The gate that runs before a unit of work starts — rebased, clean, installed, building without warnings, tests green and counted.
read_when: Starting a unit of work, or deciding whether an inherited failure belongs to the change in hand.
---

# Gate 0 — Baseline

Runs before a unit of work starts, in the workspace that work will happen in.
Establishes that the starting state is known-good, so any failure that appears
later belongs to the change rather than to what was inherited.

| #   | Check                | Type        | Fails when                                                                  |
| --- | -------------------- | ----------- | --------------------------------------------------------------------------- |
| 1   | Rebased onto base    | Integrity   | The workspace is behind the default branch after a fetch                    |
| 2   | Clean tree           | Integrity   | Uncommitted changes are present that the author did not make                |
| 3   | Dependencies present | Integrity   | Declared dependencies are not installed at the versions the lock file names |
| 4   | Clean build          | Correctness | The build fails, **or emits a warning**                                     |
| 5   | Green test suite     | Correctness | Any test fails, or the counts are not recorded                              |

**Rebase first, then build.** Building the workspace as found proves only that
the author's last state still works. Building it rebased onto the current
default branch is what surfaces an incompatibility introduced by work that
landed meanwhile — and it surfaces it now, when it belongs to whoever caused it,
rather than at the merge, when it looks like the author's fault.

**A failing baseline stops the work.** Do not implement through a red starting
state. Two things are lost: the ability to tell an inherited failure from a
caused one, and the meaning of the red-to-green cycle, which proves nothing when
measured from a red start. Report the baseline failure as its own finding.

**Record the counts.** Tests passed, skipped, failed; warnings zero. A baseline
nobody wrote down cannot be compared against later, which is the only thing a
baseline is for.

## Running it by hand

| Check                | Any stack                                         | Node            | .NET                           |
| -------------------- | ------------------------------------------------- | --------------- | ------------------------------ |
| Rebased onto base    | `git fetch && git rebase origin/main`             | —               | —                              |
| Clean tree           | `git status --porcelain` — empty output is a pass | —               | —                              |
| Dependencies present | —                                                 | `npm ci`        | `dotnet restore --locked-mode` |
| Clean build          | —                                                 | `npm run build` | `dotnet build -warnaserror`    |
| Green test suite     | —                                                 | `npm test`      | `dotnet test`                  |

`npm ci` and `--locked-mode` are the point rather than `npm install` and a plain
restore: both fail when the lock file and manifest disagree, which is check 3.
Installing whatever resolves today answers a different question.

## Session start: the quick baseline

`npm run gate:0` runs all five checks, including a build and the full suite.
That is right for a human starting work, and wrong for a hook that fires on
every session: two minutes gets the hook disabled. The session-start hook
(`hooks/gate-0-session-start.mjs`, fired by the harness on `SessionStart`) runs
gate 0 in `--quick` mode, which keeps the millisecond checks and defers the
rest:

- **Runs synchronously** — check 1 (behind base, against the last-known
  `origin/HEAD` and without a fetch), check 2 (clean tree), and check 3 as a
  `node_modules`-present probe rather than `npm ci`. These are the signals that
  actually caused failures: behind base, a dirty tree, a fresh worktree with
  nothing installed.
- **Reported, not run** — the build and the full suite appear as a named skip
  pointing at `npm run gate:0`, never a silent absence.

The hook is non-blocking and never rebases. A rebase under an agent holding
uncommitted work is destructive — the same reason gate 0 reports rebase state
rather than performing it — so a baseline finding at session start is a prompt
naming the command, and the operator decides.

## Verification

- [ ] The workspace was fetched and rebased before the build, not after.
- [ ] The tree held no uncommitted changes the author did not make.
- [ ] The build emitted zero warnings and zero errors.
- [ ] Test counts are recorded and quoted, not summarised as "passing".
- [ ] A fresh workspace has its dependencies installed before the first test run.
- [ ] A red baseline stops the work and is reported rather than worked through.

## References

- [Cross-gate rules](cross-gate-rules.md) — the zero-warning line this gate applies.
- [Gate 2 — Commit](gate-2-commit.md) — the next gate to fire, and the one that
  assumes this one passed.
