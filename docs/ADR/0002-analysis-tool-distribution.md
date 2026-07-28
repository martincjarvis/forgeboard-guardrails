---
type: explanation
status: Accepted
decided: 2026-07-28
owner: Toolkit maintainers
summary: Analysis tools distributed on the toolkit's own package registry are bundled; tools distributed elsewhere are resolved from PATH and reported when missing.
read_when: Adding an analysis tool to the toolkit, or asking why one dependency is bundled and another is not.
---

# Analysis tool distribution

## Decision

The line is **how the tool is distributed**, not how valuable it is.

- A tool published on the same registry as the toolkit is **bundled** as a
  dependency. Installing the toolkit installs it, at a pinned version, and every
  consumer resolves the same rules.
- A tool distributed elsewhere is **resolved from `PATH`**. The toolkit does not
  install it, the installation check names it when missing, and the gate that
  needs it fails with an actionable message rather than a crash.

## Why the line is drawn there

A bundled dependency is one the toolkit can pin, upgrade deliberately, and
guarantee is present. That guarantee is what makes "every developer, every agent
and the pipeline resolve the same configuration" true rather than aspirational,
and it is only available within one packaging ecosystem.

Reaching across ecosystems to install something buys the same guarantee at a
much higher price: the toolkit would need to detect an interpreter, manage a
virtual environment, and handle the failure modes of a package manager it does
not own — on every machine and every runner. The failure modes are worse than
the problem, and they arrive at gate time.

The consequence is accepted honestly: a repository that wants those checks must
install those tools. The installation check exists to say so by name, at
adoption, rather than leaving a gate silently unable to run.

## Rejected alternatives

- **Bundle everything, installing across ecosystems.** Rejected for the
  cross-ecosystem failure modes above.
- **Resolve everything from `PATH`, bundle nothing.** Consistent, and it makes
  the toolkit useless out of the box — every consumer would assemble their own
  tool set, which is the drift the standards exist to prevent.
- **Reimplement the external tools' analysis.** Rejected on the ladder's own
  terms: a bespoke check is wrong in ways nobody else has already found.

## Consequences

- The installation check must name every externally-resolved tool the
  configuration depends on, and must run before a repository trusts its gates.
- A gate whose external tool is absent reports it as unavailable, not as a pass.
  A missing scanner that reports green is the failure this whole standard set
  exists to prevent.
- Adding a bundled tool is a dependency decision with its own record. Adding an
  externally-resolved one is a documentation and installation-check change.

## References

- [Guardrail standards](../standards/guardrail-standards.md) — the gates these
  tools serve.
- [Cross-gate rules](../standards/guardrails/cross-gate-rules.md) — the tooling
  tier ladder this decision sits inside.
- [Gate 7 — On demand](../standards/guardrails/gate-7-on-demand.md) — the
  installation check.
