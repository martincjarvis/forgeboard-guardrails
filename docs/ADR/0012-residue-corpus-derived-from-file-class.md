---
type: explanation
status: Accepted
decided: 2026-08-01
owner: Toolkit maintainers
summary: The cspell residue check decides its own scope — the "used elsewhere" corpus is built from files not classed `tooling`, and the toolkit's own exemption is carried inside the check rather than left to the consuming repository to configure. Both halves are the same choice: a check that inspects the repository it lives in cannot let that repository define what counts as evidence.
read_when: Asking why the residue corpus excludes tooling-classed files, why the toolkit exemption lives in the check rather than in configuration, or writing another "does this word appear elsewhere" check.
---

# The residue corpus is derived from file class, and the check carries its own exemption

## The problem

`checkCspellResidue` (`scripts/standards-instantiation-lib.mjs`) reads a
consuming repository's `cspell.json` word list and asks, of each word,
whether it is used anywhere else in the tree — a word that occurs nowhere
else _and_ names a stack outside the derived stack list is instantiation
residue. The demonstrated case is a Node-only repository carrying
`Roslynator`, `Meziantou`, `xunit` and `warnaserror`, copied wholesale from
this toolkit's own multi-stack word list.

The check is ported into the repository it inspects. That is what makes the
question of scope a decision rather than an implementation detail:

- Once the module and its test file live in the inspected tree, "every
  tracked file" includes the checker's own source and fixtures — which
  necessarily contain `Roslynator`, `Meziantou`, `xunit` and `warnaserror`
  as literal fixtures. Those fixtures then vote the words "used elsewhere",
  and the check never fires in the one repository it exists to protect.
- This toolkit's own corpus legitimately lists every stack it documents, so
  the check must not run here at all — and something has to decide that.

## Decision

**The check derives its own scope, from file class, inside the check.**

- The "used elsewhere" corpus is built from tracked files **not** classed
  `tooling` ([file-classes.md](../standards/guardrails/file-classes.md)),
  excluding `cspell.json` itself — the same attribute
  `check-tooling-class.mjs` already derives, applied to one more consumer of
  it. A word's own checker, and that checker's own fixtures, no longer get a
  vote on whether the word is legitimate product vocabulary.
- The toolkit exemption is carried by the check: `checkCspellResidue`
  returns no findings when `isToolkit()` (`scripts/lib.mjs`) is true. That
  test reads `.claude-plugin/plugin.json` and compares its `name` against
  `forgeboard-guardrails` — the plugin's name decides, not the manifest's
  existence, so a repository developing some other Claude plugin is not
  exempted and a fork that renames is a consumer of these standards. An
  unreadable or malformed manifest is not proof, and resolves toward running
  the check rather than skipping it.

These are one decision, not two: both answer _who decides what this check
looks at_, and both answer it the same way — the check does, from an
attribute it derives, rather than the inspected repository deciding by what
it happens to track or configure.

## Rejected alternatives

**Corpus built from every tracked file.** This is what the check did
originally, and it is the fixture-vote failure above. Worse, it was
invisible from here: the toolkit exemption means the corpus-composition path
never runs in this repository, so no test that only exercises this
repository can reach the bug. A bug in a path an exemption always skips is
invisible to a suite that only ever exercises the exempt side — which is why
the general rule below is proved against a scratch repository that has
actually ported the checker, not against this one.

**Exempting the toolkit from outside the check** — a flag in the consuming
repository's own configuration, or simply relying on nobody running the
check against this corpus. Refused on two grounds. First, it puts the
exemption where the reader of the check cannot see it: a person reading
`checkCspellResidue` would have no way to tell why it is silent here, and
the reason (this corpus documents every stack it supports, on purpose) is
part of the check's meaning, not part of a repository's setup. Second, it
fails open in the wrong direction — the check is cheap enough to run
unconditionally, so a repository that forgets to configure the exemption
flags its own canonical corpus, and the first fix anyone reaches for when a
check fires on a false finding is to stop running it.

## Consequences

- A word present only in `tooling`-classed files does not count as "used
  elsewhere" for a residue finding.
- The check stays conservative on its other axis, unchanged by this record:
  an unused word alone is not a finding, only one that also names a stack
  outside the derived list. A checker that flags every unused word gets
  turned off.
- **The general rule, for the next "does this appear elsewhere" check**: a
  corpus built from everything tracked will include the check's own source
  and fixtures once the check is ported into the repository it inspects;
  derive it from file class instead, and prove it by exercising the
  non-exempt path directly — a scratch repository that has ported the
  checker — not only by re-checking this toolkit's own, exempt repository.
  [docs-style.md](../standards/docs-style.md#enforcement) states this for an
  implementer.
- `checkHardcodedCommitSha` reuses both halves of this decision
  ([ADR-0013](0013-hardcoded-sha-detects-a-shape.md)): file-class scoping,
  and the same `isToolkit()` exemption carried in the check.

## References

- [docs-style.md](../standards/docs-style.md#enforcement) — the rule as
  stated for an implementer, and the three-step porting instruction.
- [File classes](../standards/guardrails/file-classes.md) — the `tooling`
  class this corpus is derived from.
- [ADR-0013](0013-hardcoded-sha-detects-a-shape.md) — the sibling check that
  reuses this scoping.
- `scripts/standards-instantiation-lib.mjs` — `checkCspellResidue` and
  `findCspellResidue`; `scripts/lib.mjs` — `isToolkit`.
