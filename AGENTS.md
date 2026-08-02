# Agent instructions

This repository is the guardrails plugin. Its product is the `skills/`
directory and the `templates/` they apply — keep changes there; resist adding
machinery to this repository itself.

Rules:

- **Off-the-shelf over bespoke.** A capability is implemented by the stack's
  own well-known tool. New scripts in this repository or in a consuming
  repository need a reason no existing tool covers.
- **Docs stay short.** One page per topic. If a document needs a table of
  contents, split or cut it. Git history is the narrative; do not write one.
- **Every check must be able to fail.** When adding or changing a gate,
  demonstrate the failing case before claiming it works.
- **Human-owned decisions.** Turning a capability off, or accepting a risk, is
  recorded in the consuming repository's `.guardrails.json` and approved
  through code review — never by an agent alone.
- **Proceed on ambiguity.** Take the reasonable option and record the choice;
  only stop for destructive or externally-visible actions.

Before claiming work complete: `npm run verify` must pass.
