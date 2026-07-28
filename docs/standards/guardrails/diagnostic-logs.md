---
type: reference
summary: Local gate runs capture every tool's output to an ignored .logs directory, pruned after 24 hours, and a warning in a log is a finding.
read_when: Diagnosing a gate failure after the terminal is gone, or configuring where local gate output goes.
---

<!-- cspell:ignore mmin -->

# Diagnostic logs

Gates 0–5 run on the author's machine, where the output scrolls past and the
terminal is gone by the time anyone asks what happened. Every gate that invokes
a tool captures that tool's output to a log, so a failure can be diagnosed after
the fact rather than reproduced from memory.

This is the local counterpart to the published evidence of
[gate 6](gate-6-pull-request.md), and the two have opposite lifetimes:
server-side artefacts are retained and shared, local logs are private,
short-lived, and never leave the machine.

| Property         | Rule                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------- |
| What is captured | Both output streams of every tool a gate invokes, plus the command and its exit status    |
| Where            | `.logs` at the repository root by default, excluded from version control                  |
| Never            | Committed. Logs carry absolute paths, user names and host layout — they are not shareable |
| Retention        | Logs older than 24 hours are deleted; pruning runs as part of a gate run, not by hand     |
| Referenced by    | Every gate refusal names the log path alongside the diagnosis                             |

**A warning in a log is a finding.** Clean means an empty warning set, not a
zero exit status. A warning that recurs across runs has been decided against
without anyone deciding, and a log that is expected to contain warnings stops
being read at all. Either fix the cause, or record it as an exception the same
way as any other — a [suppression register](registers.md) row.

**The default is `.logs`, overridable in one place.** A repository that needs a
different location states it in its [root instruction file](agent-integration.md)
— the same file that carries the rest of the repository's operating rules —
so there is one answer and it is where someone would look for it. Anywhere else
and half the tooling writes to the old path.

**Excluding logs from version control is not optional.** They are generated,
per-machine, and contain host detail; committing them leaks environment
information and produces a diff on every run. The ignore entry is part of
adopting the standard, not a later tidy-up.

**Retention is a deletion rule, not a size cap.** Twenty-four hours is chosen
against how long a diagnosis stays relevant: a failure older than yesterday is
re-run, not read from a log. Anything that must outlive that window is evidence,
belongs to gate 6, and is published rather than logged.

## Running it by hand

| Purpose                          | Command                                       |
| -------------------------------- | --------------------------------------------- |
| Capture both streams from a tool | `<command> > .logs/<name>.log 2>&1`           |
| Confirm no log is tracked        | `git ls-files .logs` — empty output is a pass |
| Confirm the ignore entry exists  | `git check-ignore -v .logs/test.log`          |
| Prune by age                     | `find .logs -type f -mmin +1440 -delete`      |
| Find warnings across a run       | `grep -riE 'warn(ing)?' .logs`                |

## Verification

- [ ] A failing gate names the log file that holds the tool output.
- [ ] The log contains both output streams, not only the one that failed.
- [ ] The log directory is excluded from version control, and no log is tracked.
- [ ] A log older than 24 hours is removed by the next gate run.
- [ ] A build that exits zero with warnings present is treated as a finding.
- [ ] An accepted, recurring warning has a register entry.

## References

- [Gate 6 — Pull request pipeline](gate-6-pull-request.md) — the published,
  retained counterpart.
- [Gate 2 — Commit](gate-2-commit.md) — the machine-identifying-content check
  that keeps this material out of tracked files.
- [Thresholds](thresholds.md) — the retention window.
