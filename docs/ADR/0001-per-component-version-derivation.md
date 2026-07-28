---
type: explanation
status: Accepted
decided: 2026-07-28
owner: Toolkit maintainers
summary: Versions are derived per component from Conventional Commits by a path-scoped detector in this toolkit, not by a general-purpose release tool.
read_when: Changing how a version is derived, or asking why the toolkit does not delegate this to an established release tool.
---

# Per-component version derivation

## Decision

Each component's version is derived from the Conventional Commits that touch
**its own paths**, by a detector this toolkit owns. A breaking marker takes the
major, otherwise `feat` takes the minor, otherwise `fix` takes the patch,
otherwise nothing is released.

Tags take the form `<appName>-<component>@<version>`, so several components
release independently from one repository without their tags colliding.

## Why not an established release tool

The tooling ladder in the standards says to prefer an established tool, and the
established release tools are mature and well maintained. They were tried, and
the mismatch is structural rather than a matter of configuration:

- They assume **one version line per repository**. A repository holding five
  deployable components needs five, derived from disjoint path sets, and
  bolting that on means running the tool once per component with a synthesised
  view of the history each time.
- They own the **whole release act** — deciding, tagging, publishing, writing
  notes — where what is needed here is only the derivation. The rest is the
  deployment pipeline's, and two owners of the same act is worse than either.
- The **prerelease identifier** must be derived from the branch so concurrent
  branches occupy distinct channels. That is expressible in some tools and
  awkward in all of them.

The detector that replaces them is small, reads the commit history directly, and
does one thing. That is the exception the ladder allows: a gap the available
tools do not cover, recorded rather than assumed.

## Rejected alternatives

- **A general-purpose release tool per component.** Rejected for the reasons
  above; the synthesised per-component history is the part that would have gone
  wrong quietly.
- **One version for the whole repository.** Simplest by far, and it makes every
  component's version move whenever anything moves — which destroys the signal
  the version exists to carry, and forces a deployment of everything on every
  change.
- **Hand-maintained versions.** Rejected outright: a version a human edits
  competes with any derivation and stops describing the change that produced it.

## Consequences

- The derivation is this toolkit's to maintain, including its edge cases.
- A commit whose scope disagrees with the paths it touches versions the wrong
  component, which is why the commit-message gate checks scope agreement rather
  than treating the scope as a label.
- Anything consuming the versions — the deployment descriptor, the release
  notes — reads them from the derivation rather than deriving its own.

## References

- [Deployment strategy](../standards/deployment-strategy.md) — consumes this decision.
- [Gate 3 — Commit message](../standards/guardrails/gate-3-commit-message.md) —
  the derivation's input, and the checks that keep it honest.
