# Suppression register

Every gate suppression in this repository, with the grounds it was accepted on and
the condition that would retire it. The `suppression-register` gate refuses a
suppression that has no row here, so this list cannot silently fall behind the code.

A row authorises **one rule at one path**. The same rule elsewhere needs its own row
— otherwise a single accepted exception quietly licenses that rule across the
repository, which is the broadened
annotation the standards forbid, reached by another route.

**What belongs here:** anything that turns a gate off for a line or a block —
`nosemgrep`, `eslint-disable`, `secretlint-disable`, `markdownlint-disable`,
`@ts-expect-error`, coverage ignores.

**What does not:** dictionary entries in `cspell.json`. A word the spell gate accepts
turns no check off; it teaches one vocabulary. Nor rules disabled wholesale in a
tool's own configuration — `MD013` in `.markdownlint.jsonc` is a project-wide style
decision documented where it is made, not an exception to a rule the project
otherwise keeps.

## Register

| Code | Scope | Justification | Removable when | Approved by |
| ---- | ----- | ------------- | -------------- | ----------- |

_No rows._ The source this register described was removed when the toolkit was
rebuilt from an empty tree. Those suppressions belong to the implementation
archived at `archive/main-pre-rebuild`, not to this one — a register with no rows
is compliant, a register naming paths that do not exist is not.

The **Removable when** column is the point of the exercise. A suppression with no
stated removal condition is permanent by default, and nobody notices when the
condition that justified it stops holding.
