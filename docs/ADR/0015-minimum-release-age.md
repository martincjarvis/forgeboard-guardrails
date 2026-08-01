---
type: explanation
status: Accepted
decided: 2026-08-01
owner: Toolkit maintainers
summary: A minimum release age is gated at gate 6, refusing a dependency whose resolved version was published inside a 7-day window unless a human-approved register row admits it. Advisory reporting and a gate with no exception route were both rejected; the rows are self-expiring and a staleness check reports aged-out ones.
read_when: Asking why a recently published dependency was refused, or auditing the minimum-release-age register.
---

<!-- cspell:ignore packument bypassable -->

# Minimum release age is gated at gate 6

## Decision

A dependency published very recently is the supply-chain attack window: a
compromised release is typically caught and yanked within days, so refusing to
adopt anything younger than a set age costs little and removes most of the
exposure. [Gate 6 check 11](../standards/guardrails/gate-6-pull-request.md#61-revalidation)
refuses a dependency whose resolved version was published inside the window,
and a human-approved row in the [minimum-release-age
register](../registers/minimum-release-age-register.md) admits it.

### The window value, and where it lives

The window is **7 days**, declared in `.npmrc` as `min-release-age` (npm's own
setting) and read by the check through `npm config get min-release-age` rather
than typed a second time. One value, in the place npm already keeps it, derived
rather than duplicated
([ADR-0003](0003-derive-configuration.md)).

The basis for seven: most compromised releases are identified and yanked within
hours to a few days, and seven days covers that detection tail. A longer window
would fight the advisory gate — the fixed version of an advisory is itself a
young release, and the advisory check demands it be adopted quickly. Seven is
short enough that an urgent security patch can wait it out in the common case,
and where it cannot, the exception register is the route that admits the fix
without weakening the rule for everything else.

### The tooling ladder, and the rung this stopped at

[Cross-gate rules](../standards/guardrails/cross-gate-rules.md#prefer-established-tooling-to-bespoke-checks)
says climb the ladder before writing a check from scratch.

1. **Platform capability** — no host offers a native minimum-release-age gate.
2. **Established tool** — npm ships `--min-release-age <days>` (and the
   `min-release-age` key in `.npmrc`), which constrains the _resolver_ at
   install time. That is the declared policy here, and the publish dates the
   check reads come from `npm view <name> time --json` — the registry's own
   packument time object, not a hand-written registry client.
3. **Bespoke** — the gate-6 _check_ itself.

This stopped at rung 2 for the rule and the data, and added a rung-3 check
only because npm's flag is a resolver constraint, not a pull-request check that
reads the resolved tree and an exception register, and it has no exception
route. The resolver flag alone cannot be the authority: it is bypassed by a
different package manager, by `--no-min-release-age`, or by a lock file
generated before the policy was set, and gate 6 exists precisely to re-validate
server-side what a local resolution decided. The check builds on rung 2's own
data — the resolver's window and the registry's dates — rather than inventing a
parallel resolver of this repository's.

## Rejected alternatives

### Advisory rather than gated

A check that reports a young dependency and cannot fail is the exit-0 class
this repository exists to prevent, and a supply-chain control is the last place
to accept it. Reporting-only would let every young dependency merge with the
finding somewhere in the log; refused is the only shape that actually removes
the exposure the policy exists for. Rejected.

### Gated, with no exception route at all

A hard gate with no way through forces a choice between two bad outcomes every
time the advisory gate demands a young release (the fixed version of a critical
advisory is itself days old): either block the security fix, or weaken the
window globally for everything. The first is unsafe; the second is the
broadening this repository's registers exist to prevent. The third path — a
per-dependency, per-version exception that a human approves on the record — is
exactly what every other accepted finding in this repository already gets. The
exception route is not a hole in the gate; it is the same shape as the licence
register and the change-size override, and it carries the same human-approver
requirement.

## The register is self-expiring

A row pins a version, and a pinned version eventually passes the window on its
own. Left to itself, that turns every exception into a permanent exemption that
nobody revisits — the silent accumulation the "removal condition" column exists
to stop, made mechanical. The staleness check (the same gate 6 check, run over
the register) reports any row whose `Published` date is older than the window,
so a row is removed the moment it stops doing work. The `Published` column is
what makes that checkable from the row alone, offline and deterministic, rather
than a value the check re-fetches every run — staleness must not be
network-dependent.

## What this does not cover

A release older than the window is not thereby safe — only past the attack
window this policy targets. Other gates (advisory scanning, licence policy,
osv-scanner) hold their own obligations over the same dependencies, and nothing
here relaxes them. The window is also bypassable on a network failure: if the
registry cannot be reached, a dependency's age is undeterminable and the check
reports that visibly as undetermined rather than passing — but a determined
attacker who can deny the registry can push the check to skip, the same
residual every network-bound gate here carries.

## References

- [Gate 6 — Pull request pipeline](../standards/guardrails/gate-6-pull-request.md)
  — check 11, the minimum-release-age gate.
- [Registers](../standards/guardrails/registers.md) — the shared column set and
  the self-expiring property this register instantiates.
- [ADR-0003](0003-derive-configuration.md) — the window is derived from npm's
  own config, not duplicated.
