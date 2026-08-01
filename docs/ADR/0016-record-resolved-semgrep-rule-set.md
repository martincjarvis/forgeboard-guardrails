---
type: explanation
status: Accepted
decided: 2026-08-01
owner: Toolkit maintainers
summary: `semgrep --config auto`'s resolved rule set is recorded into each gate 7 run's output, so drift between runs is visible after the fact. Pinning to a versioned registry ruleset and vendoring rules were both rejected. Scans remain non-reproducible and network-dependent — this records what happened, it does not make it happen again.
read_when: Asking why a semgrep scan that passed yesterday fails today (or covers less), or auditing the semgrep-resolved-rules.json a run left behind.
---

<!-- cspell:ignore ruleset rulesets PYTHONUTF -->

# Record the resolved SAST rule set per run

## Decision

Gate 7's semgrep scan runs `semgrep --config auto`, which resolves its rule set
from the Semgrep registry at run time. The rule set can therefore change with
no commit in this repository: a scan that passed yesterday can fail today, or
stop covering something, with nothing in the history to explain it.

**The rule set semgrep actually resolved is recorded into the run's output**,
alongside the findings, so drift is visible after the fact. Semgrep emits the
resolved set itself, in the SARIF's `runs[].tool.driver.rules` (every rule the
registry returned, including those that found nothing); gate 7 captures that
list into `semgrep-resolved-rules.json` and reports the resolved count in its
own transcript. Someone comparing two runs can see that the rules differed.

`--config auto` is **kept**. It is neither pinned nor vendored.

## Why semgrep can emit this directly

`--json` was the first candidate and is not enough: its output carries
`results`, `errors` and `skipped_rules` but no list of the rules the run
resolved — only the rules that produced findings. The SARIF output is the one
that carries the full set: the SARIF spec's `runs[].tool.driver.rules` is the
driver's complete rule list, and semgrep populates it with every resolved rule
regardless of findings (verified directly: a probe scan resolved 1074 rules and
listed all 1074 in the SARIF while producing a single result). So the flag is
`--sarif`, and the capture is structural, not a parse of human-readable text.

(One Windows wrinkle, already documented at gate 6: semgrep's SARIF writer
defaults to the console code page and throws on a rule message it cannot
encode, so the file is only written with `PYTHONUTF8=1`. Without it there is no
SARIF and therefore no rule set to record.)

## What this does not buy

This is stated plainly, because an ADR that lists only benefits is not a
decision record:

- **Scans remain non-reproducible.** Two runs of the same commit can resolve
  different rule sets, and this change does nothing to prevent that. It records
  what each run resolved; it does not make a later run resolve the same thing.
- **Scans remain network-dependent.** The registry is reached at run time; an
  offline or denied run resolves nothing, and the recording degrades to a skip.
- **Drift is visible only after the fact.** A run that resolved fewer rules is
  recorded as such, but nothing here fails the run for it — coverage narrows
  silently in the record, not in the gate, because there is no baseline to
  compare against at run time without pinning, which the decision below
  refuses.

## Rejected alternatives

### Pin to a versioned registry ruleset

Pinning (`--config p/<ruleset>@<version>`, or a resolved ruleset fetched and
referenced by hash) would make scans reproducible: the same commit + the same
pinned ruleset = the same result. Reproducibility is exactly what is _not_
being bought here. The trade-off was made deliberately: `--config auto` keeps
coverage as broad as the registry chooses on each run, which means new rules
land as soon as they are published rather than whenever somebody bumps a pin.
That breadth is judged more valuable than reproducibility for this scan, and
the recording is what makes the resulting drift visible rather than invisible.
Pin when reproducibility matters more than breadth; this gate chose breadth.

### Vendor rules into the repository

Vendoring (checking the rule YAML into the repository) is the far end of
pinning: fully reproducible, fully offline, and fully this repository's job to
maintain. It carries the same loss of breadth as pinning, adds the maintenance
cost of tracking upstream rule changes by hand, and was rejected for the same
reason — the breadth `--config auto` provides is the point. Vendoring is the
right answer for a repository that wants a frozen, reviewed rule set of its
own; it is not this gate's answer.

## The recording degrades honestly

A run records one of three states, kept distinct so an unavailable result never
reads as a clean one — the same confusion has already cost this project a false
result elsewhere:

- **resolved** — semgrep ran and its rule list was read.
- **skipped** — semgrep was not on PATH; the run did not happen, so there is no
  rule set. Distinct from a clean resolved set, never "passed".
- **unavailable** — semgrep ran but wrote no readable rule list (it crashed
  before writing the SARIF). Distinct from both, and never "resolved zero".

## References

- [Gate 7 — On demand](../standards/guardrails/gate-7-on-demand.md) — the sweep
  this recording lives inside.
- [Cross-gate rules](../standards/guardrails/cross-gate-rules.md#a-check-that-did-not-enforce-says-why)
  — the three-state discipline (a skip is not a pass) this recording follows.
