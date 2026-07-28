---
type: reference
summary: The gate that fires on every file write — the formatter never fails an edit, the security linter does, and only for tracked files.
read_when: Configuring editor or agent write hooks, or deciding whether a rule can run on a single file.
---

# Gate 1 — Edit

Fires on every file write. Two checks with deliberately opposite verdicts: the
formatter never fails an edit, and the security linter does.

| #   | Check                   | Type     | Scope                  | Fails when                                    |
| --- | ----------------------- | -------- | ---------------------- | --------------------------------------------- |
| 1   | Format the written file | Format   | Every written file     | Never — best effort, always passes            |
| 2   | Security lint           | Security | **Tracked** files only | A security rule matches the file just written |

**A formatter fault must not stop work in progress**, so check 1 swallows its
own errors. A security finding is the opposite case: it is cheaper to fix in the
seconds after writing the line than at any later gate, and an author who writes
three more files on top of it now has three files to revisit.

**Tracked files only, and the boundary is deliberate.** A file already in the
repository is code the project owns; blocking there is proportionate. An
untracked file is a scratch, a spike or an experiment, and failing every write
to it makes exploration hostile. Untracked files are not exempt from the rule —
they are caught the moment they are staged, by the commit gate, which is the
first point at which the project is being asked to own them.

**Which rules run here.** Every security-typed check the commit gate runs — the
secret scan, the static analysis and the machine-identifying-content scan —
restricted to what is decidable from a single file. A rule needing whole-project
context, such as one following a tainted value across module boundaries, cannot
reach a verdict on one file and stays at the commit gate, where the whole staged
set is available.

That restriction is about **inputs, not severity**. Within the rules that can
run, this is the same rule set at the same configuration: a finding that blocks
here must block at the commit gate, or the author learns the earlier gate can be
outrun by not saving. A rule that is merely slow is not a candidate for
exclusion; a rule that is structurally undecidable on one file is.

## Running it by hand

Each command takes the single path just written.

| Check          | Node                          | .NET                             | Any stack                             |
| -------------- | ----------------------------- | -------------------------------- | ------------------------------------- |
| Format         | `npx prettier --write <path>` | `dotnet format --include <path>` | —                                     |
| Security lint  | `npx eslint <path>`           | Runs in the build; see gate 2    | `npx secretlint <path>`               |
| Is it tracked? | —                             | —                                | `git ls-files --error-unmatch <path>` |

The tracked test is what gates check 2: a non-zero exit means the file is
untracked, and the check does not fire.

## Verification

- [ ] A written file comes back formatted without the author invoking anything.
- [ ] A formatter error leaves the edit intact and the session running.
- [ ] Files excluded from formatting are left untouched.
- [ ] A security finding written into a tracked file fails the edit, and the
      failure names the rule and the line.
- [ ] The same content in an untracked file does not fail the edit, and does
      fail the commit gate once staged.
- [ ] The rule set here and at the commit gate are the same set, at the same
      configuration.
- [ ] Any rule not run here is absent because it is undecidable on one file, not
      because it is slow, and it runs at the commit gate.

## References

- [Gate 2 — Commit](gate-2-commit.md) — the same rule set over the staged set.
- [Cross-gate rules](cross-gate-rules.md) — why a local-only check is advisory.
