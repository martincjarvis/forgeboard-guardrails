# Reviewing a change here

Load this before reviewing anything in this repository — as a reviewer, or when
dispatching a review to a subagent. It names the skills that carry the detail, so
they reach the reviewer's context rather than being remembered approximately.

## Load the skill that owns the thing you are reviewing

Each skill holds the checklist for its own standard. Invoke it rather than
recalling what it says.

| Reviewing                                         | Load                   |
| ------------------------------------------------- | ---------------------- |
| Anything under `/docs`                            | `docs-review`          |
| Tests, coverage, or which kind a test is          | `testing-review`       |
| Logging or diagnostics in changed code            | `logging-review`       |
| Versioning, packaging, release                    | `deployment-review`    |
| Whether a repository meets the standards at all   | `guardrail-audit`      |
| A repository adopting or bootstrapping guardrails | `repository-bootstrap` |

A change touching several of these loads several. A change touching none of them
still gets the rest of this file.

## Comments

**A comment explains what is surprising about the code beside it. Nothing else.**

Delete a comment that says what the code already says, records how a defect was
found, or narrates the history of a fix. That material belongs in the commit
message, the ADR, or nowhere.

If the explanation is longer than the code, the explanation is wrong — either the
code needs to be clearer or the comment is defending a choice rather than
describing one.

Worth keeping:

- Why a non-obvious approach was taken, where the obvious one fails
- A constraint the reader cannot see — a platform quirk, an ordering requirement
- A deliberate simplification and its ceiling, marked `ponytail:` with the
  upgrade path

Cut on sight:

- The archaeology of a bug: which round found it, what it used to do, why the
  previous attempt was wrong
- Restating the standard the code implements — link it instead
- A paragraph where a clause would do

## Code

**Reuse before writing.** A helper, type or pattern already in this repository
beats a new one. Re-implementing what sits a few files over is the most common
defect here.

**No unrequested abstraction.** No interface with one implementation, no factory
for one product, no configuration for a value that never changes.

**A fix addresses the root, not the reported symptom.** Grep every caller before
editing one. A guard in the shared function is a smaller diff than a guard in
each caller, and leaves no sibling broken.

**Deletion over addition.** The shortest change that works, once the problem is
actually understood. A small diff in the wrong place is a second defect.

## Checks

**A check that cannot fail is worse than no check.** For any check added or
changed, ask what input makes it report a finding, and confirm a test supplies
that input. A check tested only against a passing case has never been shown to
work.

**A fixture built from real output, not a constructed string.** A hand-written
input agrees with whoever wrote it. Where a check parses a tool's output, the
fixture is that tool's actual output.

**An exemption hides the path it exempts.** Where a check skips somewhere — a
class of file, a repository, an environment — confirm the non-exempt path still
has a test. An exemption that removes the only coverage ships the check broken.

## Claims

**State only what was checked, and name the check.** "I verified X" must mean the
check covered X rather than part of it. A test whose name matches a requirement is
not evidence the requirement is met.

**A figure is re-run, not re-explained.** A number quoted from an earlier run goes
stale silently. Where a discrepancy has no established cause, report it as
unexplained — a wrong explanation is believed, an unexplained gap gets
investigated.

## Reserved decisions

These are never a reviewer's to settle, and never an agent's:

- Approving a suppression, an accepted risk, a licence, or an opt-out
- Applying the change-size override marker
- Resolving a conflict between two standing directives

Fill in every column except the approval, name the decision plainly, and put it to
a human. See [`AGENTS.md`](AGENTS.md) for the full rule.

## References

- [`AGENTS.md`](AGENTS.md) — the operating rules a change is held to
- [`docs/standards/guardrail-standards.md`](docs/standards/guardrail-standards.md)
  — the gates and what each checks
- [`docs/standards/docs-style.md`](docs/standards/docs-style.md) — document
  structure, and where each kind of document lives
