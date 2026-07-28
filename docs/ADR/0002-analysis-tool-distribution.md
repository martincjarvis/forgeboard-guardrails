---
type: explanation
status: Accepted
decided: 2026-07-28
owner: Toolkit maintainers
summary: The toolkit bundles no analysis tools. A consuming repository installs them through its own package manager and the toolkit supplies opinionated configuration and orchestration.
read_when: Adding an analysis tool, or asking why the toolkit does not install the tools it runs.
---

# Analysis tool distribution

## Decision

**The toolkit bundles nothing.** It supplies opinionated configuration, the gate
that runs at the right moment, and a default answer for each check. The tools
themselves are installed by the consuming repository, through its own package
manager, and are used the way their own maintainers intend.

Opinionated, because a repository that adopts the toolkit gets a working default
for every check without assembling one. Adaptable, because replacing a default
is a configuration change in that repository rather than a fork of this one.

## Why not bundle

Bundling was the earlier position and it does not survive contact with the goal.

- **It makes the opinion unavoidable.** A bundled analyser is one a consuming
  repository cannot swap without forking the toolkit or fighting it. Adaptable
  and bundled are close to contradictory.
- **It drags a dependency tree into every consumer**, including the tools that
  repository will never run, because the toolkit cannot know at publish time
  which stacks it will meet.
- **It could never be consistent.** Useful analysis tools are distributed across
  several ecosystems; a rule that bundles what happens to share the toolkit's
  registry and resolves the rest from `PATH` is a rule about packaging accident,
  not about anything a reader would recognise as principled.
- **It duplicates a job the consuming repository already does well.** That
  repository already has a manifest, a lock file and a way to install and pin
  things. Reusing it costs nothing and inherits its guarantees.

## What replaces it

- **The toolkit declares the default tool for each check**, and the
  configuration it should run with. Those defaults are what "opinionated" means
  in practice, and they are documented per stack.
- **The consuming repository installs them** — as development dependencies where
  the ecosystem matches, through its own environment where it does not — and
  pins them in its own lock file. "Analysers are pinned dependencies" holds
  through that lock file rather than through this package.
- **The installation check names what is missing.** A configured tool that is
  not installed is reported by name, at adoption, rather than leaving a gate
  quietly unable to run.
- **Bespoke code is the last resort**, and each instance carries a recorded
  reason no available tool covered the check.

## Rejected alternatives

- **Bundle everything within one ecosystem, resolve the rest from `PATH`** — the
  previous position. Rejected above: inconsistent by construction, and it makes
  the toolkit's opinions unavoidable rather than merely default.
- **Bundle nothing and recommend nothing.** Consistent and useless: every
  consumer assembles their own tool set, which is exactly the drift the
  standards exist to prevent. The opinion is the product.
- **Reimplement the analysis inside the toolkit.** Rejected on the tooling
  ladder's own terms: a bespoke check is wrong in ways nobody else has already
  found and fixed, and it is a maintenance liability disguised as control.

## Consequences

- Adopting the toolkit is a two-part act: install the toolkit, and install the
  tools its configuration names. The adoption path must say so plainly and the
  installation check must verify it.
- A gate whose tool is absent reports it as unavailable, never as a pass.
- Replacing a default is a local decision in the consuming repository, recorded
  there. The toolkit does not need to know.
- The toolkit's own dependency footprint stays small, which keeps its own supply
  chain reviewable.

## References

- [Cross-gate rules](../standards/guardrails/cross-gate-rules.md) — the tooling
  tier ladder this decision sits inside: platform capability first, established
  tool second, bespoke last.
- [Gate 7 — On demand](../standards/guardrails/gate-7-on-demand.md) — the
  installation check that makes a missing tool visible.
