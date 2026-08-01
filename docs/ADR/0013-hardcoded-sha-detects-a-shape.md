---
type: explanation
status: Accepted
decided: 2026-08-01
owner: Toolkit maintainers
summary: The ported-test residue check flags one thing — a full 40-character hex commit SHA in a file classed `test` — and makes no attempt to detect that an assertion tests the source repository's own state. The semantic version was considered and refused because it must anticipate an author's intent, and a checker that does that fails silently.
read_when: Asking why the ported-test check looks only for a SHA shape, why it ignores a workflow pinning an action to a commit, or designing another residue check.
---

# The ported-SHA check detects a shape, not a meaning

## The problem

Instantiation residue is not confined to prose or configuration: a **ported
test** carries it too. Two toolkit self-checks once reached a consuming
repository's test file — one asserting this toolkit's own commit
`daa59d0c…`, one asserting this toolkit's own ADR-0004 was `Accepted` with a
named approver. Both fail deterministically on the consumer's first CI run,
because a consumer's history does not, and cannot, contain another
repository's commits. Nothing mechanical caught either: the instantiation
checks beside them read `docs/standards/**` and `cspell.json`, never test
files. An implementer noticing by hand closed the gap that time.

## Decision

**`checkHardcodedCommitSha` (`scripts/standards-instantiation-lib.mjs`)
flags a full 40-character hex token in a file classed `test`, and nothing
else.**

- The signal is `\b[0-9a-f]{40}\b`, applied per line — precise, mechanical,
  and carrying no judgement. The word boundaries mean a 40-hex-character
  _substring_ of a longer hash (a sha256 digest, a content-addressed id)
  does not match, because a longer unbroken hex run offers no transition out
  of a word character in its middle.
- Scope is files classed `test`
  ([file-classes.md](../standards/guardrails/file-classes.md)) — the same
  file-class scoping [ADR-0012](0012-residue-corpus-derived-from-file-class.md)
  applies to the residue corpus, applied again.
- The toolkit's own repository is exempt, by the same `isToolkit()` the
  sibling check carries and for the same reason: this repository's test
  suite legitimately asserts its own real history, which is a fact about the
  canonical repository rather than residue.

## Rejected alternatives

**Detect the defect semantically — an assertion that tests the source
repository's state.** This is the thing actually worth catching, and it was
refused anyway. It cannot be done without inferring what an author meant a
value to be: a hash used as arbitrary test data, a content-addressed
identifier and a ported assertion about upstream history are the same token
in the same position, distinguished only by intent. A heuristic that guesses
produces false positives on legitimate fixtures, and **a checker that must
anticipate an author's intent fails silently** — it reads green on the case
it did not anticipate, which is the whole class this corpus keeps closing.
The same reasoning is already written into `check-adr-approver.mjs`, whose
vocabulary test is explicitly a fallback for exactly this reason ("a
detector that must anticipate an author's vocabulary is one that fails
silently").

**Search the whole tree for the SHA shape.** Refused because it
false-positives on the opposite of this defect: a `configuration`-classed CI
workflow pinning a third-party GitHub Action to its commit SHA is a security
practice, not ported residue. Scoping to `test` keeps the check free of the
judgement a tree-wide search would immediately need.

## Consequences

- The check catches the demonstrated case — a ported test asserting a commit
  that exists only in the repository it was copied from — and is honest
  about catching nothing else.
- It does **not** catch the second half of the same live defect: the ported
  assertion about this toolkit's own ADR-0004 carries no SHA and is
  invisible to this check. That is accepted. A narrow mechanical check whose
  scope a reader can state exactly is worth more than a broad one whose
  misses nobody can enumerate, and the remaining ground stays where
  [docs-style.md](../standards/docs-style.md#enforcement) already puts it:
  judgement, exercised at instantiation, with the rule written down.
- Instantiation tunes code as well as prose. A ported test asserting the
  source repository's own state is the same defect class as a ported
  standard naming a stack the consumer lacks, and is checked at the same two
  places — unconditionally at [gate 7](../standards/guardrails/gate-7-on-demand.md),
  and blocking at [gate 6](../standards/guardrails/gate-6-pull-request.md)
  when the change touches the instantiated corpus.

## References

- [docs-style.md](../standards/docs-style.md#enforcement) — the rule as
  stated for an implementer, and the residue checks it sits among.
- [ADR-0012](0012-residue-corpus-derived-from-file-class.md) — the
  file-class scoping and toolkit exemption this check reuses.
- [File classes](../standards/guardrails/file-classes.md) — the `test` class
  the check is scoped to.
- `scripts/standards-instantiation-lib.mjs` — `findHardcodedCommitSha` and
  `checkHardcodedCommitSha`, the mechanical form.
