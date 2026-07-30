# Suppression register

Every gate suppression in this repository, with the grounds it was accepted on and
the condition that would retire it. The `suppression-register` gate refuses a
suppression that has no row here, so this list cannot silently fall behind the code.

A row authorises **one rule at one path**. The same rule elsewhere needs its own row
— otherwise a single accepted exception quietly licenses that rule across the
repository, which is the broadened
annotation the standards forbid, reached by another route.

This is a limit on a row's _scope_, not on how many suppressions may share a
line. A marker naming several rules is legal — two analysers can flag the same
defect under different identifiers, or one analyser can fire more than once at
a site — and every rule it names gets its own row below. What is refused is a
marker that names **no** rule: that silences everything at its site, which is
the blanket suppression this register exists to prevent.

Every row also carries a removal condition that is not "never" and, once a
human has looked at it, that human's name in Approved by. A row missing only
the approver is not refused here — gate 2 lets it through as a push back, and
gate 6 is what blocks the merge on it — but a row missing anything else, or
naming an automated worker or a team as approver, is refused outright.

**What belongs here:** anything that turns a gate off for a line or a block —
`nosemgrep`, `eslint-disable`, `secretlint-disable`, `markdownlint-disable`,
`@ts-expect-error`, coverage ignores.

**What does not:** dictionary entries in `cspell.json`. A word the spell gate accepts
turns no check off; it teaches one vocabulary. Nor rules disabled wholesale in a
tool's own configuration — `MD013` in `.markdownlint.jsonc` is a project-wide style
decision documented where it is made, not an exception to a rule the project
otherwise keeps.

## Register

| Code                                                               | Scope             | Justification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Removable when                                                                                                                                                                                                                                                  | Approved by   |
| ------------------------------------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| javascript.lang.security.audit.spawn-shell-true.spawn-shell-true   | hooks/lib/run.mjs | npm's own Windows executables (`npm`, `npx`) are `.cmd` shims. Since Node's CVE-2024-27980 fix, spawning a `.cmd`/`.bat` file without a shell returns `EINVAL` — verified directly on this host: resolving to the full absolute path (with the `.cmd` extension) and spawning with `shell: false` still fails. Windows has no native way to execute a `.cmd`/`.bat` file's content without delegating to a shell interpreter, so this is an OS constraint a more precise path resolution cannot remove. The arguments reaching this call are always built by this repository's own gate and hook code (`run.mjs`'s own top-of-file comment) — never from untrusted input — which is the condition that makes `shell: true` safe here. | Node ships a way to execute a `.cmd`/`.bat` shim without a shell (none exists as of the CVE-2024-27980 fix), or this project drops support for spawning npm's own `.cmd`-shimmed binaries on Windows.                                                           | Martin Jarvis |
| javascript.lang.security.detect-child-process.detect-child-process | hooks/lib/run.mjs | This function's purpose is to spawn a command its caller supplies — every gate and hook in this repository routes its subprocess calls through it (`scripts/lib.mjs` re-exports it rather than repeating it). The rule fires on any `child_process` call whose command argument is a variable, which is inherent to being a generic process-spawning helper rather than a defect in one call. As with the row above, the command and arguments reaching this function are always constructed by this repository's own code, never from user or repository content, so there is no injection surface the rule is warning about here.                                                                                                   | This project stops centralising subprocess calls through a shared helper (the alternative is repeating the same spawn call, and the same CVE-2024-27980 handling, at every call site), or semgrep gains a way to mark a wrapper function as a trusted boundary. | Martin Jarvis |

Two rows, both `hooks/lib/run.mjs`: `spawn-shell-true` fires once (the Windows
branch); `detect-child-process` fires twice (the Windows branch and the POSIX
branch below it) but is one rule at one path, not two rows, per the rule
above.

The **Removable when** column is the point of the exercise. A suppression with no
stated removal condition is permanent by default, and nobody notices when the
condition that justified it stops holding.
