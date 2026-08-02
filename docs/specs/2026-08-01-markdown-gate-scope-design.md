---
type: reference
summary: Markdown lint runs repo-wide at the commit gate, so unrelated work in the tree refuses an unrelated commit — split it into a staged-scope check at commit and a whole-set check at push.
read_when: Implementing the split, or asking why a commit was refused for a file it did not touch.
---

<!-- cspell:ignore lintstagedrc -->

# Markdown gate scope

## The defect

`.lintstagedrc.json` passes the staged markdown paths to `markdownlint-cli2`.
`.markdownlint-cli2.jsonc` also sets:

```jsonc
"globs": ["**/*.md"],
```

The CLI **unions** its configured globs with the paths given as arguments rather
than letting the arguments win. Measured:

```text
with    "globs": ["**/*.md"]   →  Finding: README.md **/*.md …   Linting: 78 file(s)
without                        →  Finding: README.md …           Linting: 1 file(s)
```

So every commit lints the entire tree. The config's own comment states the
intent — _"the same rules run whether invoked with explicit paths (lint-staged) or
with none (the gate sweeps)"_ — which is right about the **rules** and wrong about
the **file set**: `globs` fixes both together.

### What it costs

- An unrelated draft anywhere in the working tree refuses a commit that does not
  touch it. Two agents working concurrently block each other on files neither has
  committed.
- It contradicts the gate model. Gates 1 to 6 are change-scoped by construction —
  staged paths, pushed range — and gate 7 is the unconditional sweep. Markdown
  lint at gate 2 is the exception, and nothing says it is deliberate.

## The split

| Gate         | Scope                                   | Why                                                                                                                           |
| ------------ | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **2 Commit** | staged `.md` only                       | Per-file rules — heading style, emphasis, spacing. Answerable from the index alone, and a commit need only be self-consistent |
| **5 Push**   | repo-wide markdown lint, link integrity | Cross-file by nature. A pushed series is where the complete set exists                                                        |

Link integrity moves with it. A link from one document to a heading in another
cannot be judged from a single staged file, so the commit gate is the wrong place
for it — and `check-links.mjs` currently reads **tracked** files, which is the
mirror-image defect: it silently ignores a document until it is staged, which is
exactly when a link error is introduced.

Under the split, both stop disagreeing about what "the repository" means at commit
time.

## The change

1. Remove `globs` from `.markdownlint-cli2.jsonc`, leaving `ignores`. Lint-staged
   then lints what it passes.
2. Supply the glob at the call site that sweeps — gate 5 — rather than in shared
   configuration, so the two scopes are visible where they are chosen.
3. Move link integrity from gate 2 to gate 5.
4. State both scopes in
   [gate-2-commit](../standards/guardrails/gate-2-commit.md) and
   [gate-5-push](../standards/guardrails/gate-5-push.md).

## Success

- A commit touching one markdown file lints one markdown file.
- A repository with an unrelated malformed draft in the working tree accepts a
  commit that does not touch it.
- A push carrying a series that ends consistent succeeds; one ending inconsistent
  is refused.
- Link integrity covers untracked documents at push, because the push is where the
  complete set exists.

## Failure

- The commit gate stops catching anything, because the staged scope was applied
  and the push check was never wired — the exit-0 class, arriving through a
  scoping change.
- A rule that genuinely needs cross-file context left at gate 2, where it cannot
  see what it needs.
- Two configurations of the same rule set, one per scope, drifting apart.

```gherkin
Given a working tree containing an unrelated malformed markdown file
When a commit is made touching a different, well-formed markdown file
Then the commit succeeds

Given a staged markdown file that breaks a per-file rule
When a commit is made
Then it is refused, naming that file

Given a series of commits whose final state has a broken cross-document link
When the series is pushed
Then the push is refused

Given an untracked markdown document with a broken link
When it is staged and pushed
Then the push is refused
```

## Accepted consequence

An intermediate commit in a series may carry a broken cross-document link and
remain pushable, provided the series ends consistent. That is already true of
every other change-scoped gate, so it is consistent rather than new — but
bisecting to a mid-series commit can land on one whose links do not resolve.

## References

- [Gate 2 — Commit](../standards/guardrails/gate-2-commit.md)
- [Gate 5 — Push](../standards/guardrails/gate-5-push.md)
- [Cross-gate rules](../standards/guardrails/cross-gate-rules.md) — change scoping,
  and the rule that a check unable to run says so rather than passing
