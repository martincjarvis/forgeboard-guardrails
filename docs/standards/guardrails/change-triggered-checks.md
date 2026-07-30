---
type: reference
summary: The checks that run only when their inputs move, which of them also run on a schedule, and why a skipped trigger must still be reported.
read_when: Deciding how often a dependency check should run, or diagnosing a check that reported nothing.
---

# Change-triggered checks

Most checks read the change and are cheap enough to run whenever their gate
fires. A few read something that only moves when a specific input moves, and
running those every time is waste that trains people to skip the gate. **A check
runs when its inputs change, and reports a visible skip when they have not.**

| Check                       | Runs when                                                                                                            | Not when                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Dependency lock sync        | A dependency manifest is in the change                                                                               | Any other file changed                                                                          |
| Lock file regeneration      | A manifest changed, or a deliberate upgrade is stated — enforced by gate 2 check 3                                   | Routinely, and never as a step in an unrelated change                                           |
| Dependency licence register | A lock file is in the change                                                                                         | No lock file changed                                                                            |
| Dependency licence policy   | The resolved dependency set changed — a lock file diff                                                               | The dependency set is untouched                                                                 |
| Dependency advisory scan    | The resolved dependency set changed, **or** on a schedule                                                            | —                                                                                               |
| Licence table re-validation | Invoked (adding a licence, or on demand)                                                                             | Never on a schedule                                                                             |
| Whole-repository scan       | Invoked, or on a schedule                                                                                            | Per commit                                                                                      |
| Corpus instantiation tuning | The range touches `docs/standards/` — blocking at gate 6, **and** unconditionally at gate 7                          | Neither trigger fires the other's absence away — gate 7's sweep runs regardless of what changed |
| Tooling test suite          | The range touches a `tooling`-classed file — blocking at gate 6, **and** unconditionally at gate 7 and on a schedule | A change to product code alone; the suite reports a visible skip naming why                     |

## Licence and advisory differ, and the difference matters

A licence is a property of a dependency at a version: pinned inputs give the
same answer forever, so re-deriving it on a change that touched no dependency
proves nothing. An advisory is a property of the _world_: a dependency that was
clean this morning can carry a critical advisory this afternoon with nothing in
the repository having moved.

So the licence check is purely change-triggered, and the advisory check is
change-triggered **plus** scheduled — the schedule is what catches the advisory
published against code nobody is currently editing.

**The licence table's own facts are governed by the same reasoning, not a
special case of it.** A licence's text does not change once published, and its
permissions and conditions are fixed with it — the only thing that can move is
OSI's _classification_, rarely, and never retroactively invalidating a decision
already recorded against a pinned version. Re-validating
[`scripts/licence-table.mjs`](../../../scripts/licence-table.mjs) against its
own recorded references is therefore an **invoked** task at [gate
7](gate-7-on-demand.md) — run when adding a licence, or when someone wants to
confirm the table is current — never a scheduled one. Putting it on a cron
alongside the advisory scan's schedule would cost a run against nothing that
moves and would imply the two are the same kind of check; they are not, for
exactly the reason the licence check above is purely change-triggered while
the advisory check also runs on a schedule.

## A check can be both change-triggered and unconditional at once

Corpus instantiation tuning is the shape the advisory scan is not quite: the
advisory check is change-triggered **plus** scheduled, two runs of the _same_
check at two different tiers. This one is two different _consequences_ at two
different tiers. Gate 7's sweep runs every time, unconditionally, and only
ever reports — it exists so a stack added later, which touches no file under
`docs/standards/` at all, still gets noticed. Gate 6 asks a narrower question
only when the range gives it a reason to: did this change touch the
instantiated corpus, and if so, did it leave it clean? A change that never
touches `docs/standards/` is not asked, and nothing about that skip weakens
gate 7's own sweep — the two do not substitute for each other.
[docs-style.md's enforcement section](../docs-style.md#enforcement) is the
full account, including why a bootstrapped repository missing the gate 6 half
is the exact failure an audit already found: findings reported, nothing
blocking on them.

## The rule generalises past dependencies

Every row above reads as a rule about dependencies because that is where this
document's examples happen to come from, not because the rule is about
dependencies. Stated once, at the level it actually holds: **a check runs
when the thing it verifies could have moved, and is skipped, visibly, when it
could not have.** A dependency set is one such thing. The instantiated corpus
above is another. **A repository's own gate and check scripts — the code
classed `tooling` ([file-classes.md](file-classes.md)) — are a third, and the
shape is identical to the corpus row above:** change-triggered and blocking
at gate 6 when the range touches a `tooling`-classed file, and unconditional
at gate 7 and on a schedule, because a gate script can break without anyone
editing it — a dependency it calls changes behaviour, a platform API it reads
drifts — the same reason the advisory scan carries a schedule alongside its
own trigger.

[Testing strategy](../testing-strategy.md#tooling-code-is-excluded-from-the-products-coverage-floor-not-from-testing)
is the full account of the `tooling tests` suite this produces. Two audit
iterations given the identical guidance produced opposite answers — one made
the suite required and unconditional on every pull request, the other built
none — which is exactly the failure mode "never generalised" produces: the
next reader has no rule to apply to a subject the existing rows never
mentioned, so they invent one.

## Staying current is itself scheduled

A dependency set that only moves when a feature needs it moves in large, risky
jumps, and the advisory check then arrives as an emergency rather than as
maintenance. Automated update proposals on a schedule are the answer, and they
are a level-1 capability on most platforms — each proposal arrives as an ordinary
pull request and passes through every gate like any other change. Nothing about
being machine-raised exempts it from review.

## A lock file is regenerated for a reason or not at all

Regenerating it as a routine step silently moves transitive versions nobody
asked to move, inside a change about something else, past a reviewer reading a
diff about something else. The manifest changed, or an upgrade was intended:
those are the reasons.

## A skipped trigger is reported, not silent

The same rule as any other skipped check. "Licence check skipped: no dependency
change" is information; nothing at all is indistinguishable from a check that
has quietly stopped working.

## Running it by hand

| Purpose                          | Command                                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| Did the change touch a manifest? | `git diff --name-only origin/main...HEAD -- '*package.json' '*.csproj' 'Directory.Packages.props'` |
| Did it touch a lock file?        | `git diff --name-only origin/main...HEAD -- 'package-lock.json' 'packages.lock.json'`              |
| Regenerate deliberately, Node    | `npm install --package-lock-only`                                                                  |
| Regenerate deliberately, .NET    | `dotnet restore --force-evaluate`                                                                  |

## Verification

- [ ] A change touching no dependency reports the dependency checks as skipped,
      with the reason, rather than silently.
- [ ] The advisory scan runs on its schedule as well as on change.
- [ ] A newly published advisory is caught without anyone editing a dependency.
- [ ] No lock file in the change was regenerated without a manifest change or a
      stated upgrade.
- [ ] Dependency update proposals are raised on a schedule and pass the same gates.
- [ ] The licence table's own re-validation runs on demand, and nowhere in the
      toolkit or a consuming repository is it wired to a schedule.
- [ ] A pull request that touches `docs/standards/` is blocked at gate 6
      while the instantiation check reports a finding; one that does not
      touch it is not asked about it.
- [ ] A repository carrying ported gate or check scripts runs a `tooling
    tests` suite: change-triggered and blocking at gate 6 when the range
      touches a `tooling`-classed file, and unconditional at gate 7 and on a
      schedule.

## References

- [Gate 2 — Commit](gate-2-commit.md) — lock sync and licence register completeness.
- [Gate 6 — Pull request pipeline](gate-6-pull-request.md) — advisory and licence policy.
- [Thresholds](thresholds.md) — the schedules and severity bands.
- [Registers](registers.md) — what the licence register holds.
- [Docs style](../docs-style.md#enforcement) — porting and wiring the
  instantiation check.
- [File classes](file-classes.md) — what `tooling` is.
- [Testing strategy](../testing-strategy.md#tooling-code-is-excluded-from-the-products-coverage-floor-not-from-testing) —
  the `tooling tests` suite in full.
- [Branch protection](branch-protection.md#a-required-check-that-legitimately-skips-must-still-report) —
  the trap in making a conditionally-skipped check required.
