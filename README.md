# forgeboard-guardrails

An agent plugin that bootstraps and audits hard quality guardrails in a
repository — formatting, linting, type checks, tests, commit hygiene, secret
scanning, and CI parity — using the stack's own off-the-shelf tools. The plugin
ships no runtime code to the consuming repository: after bootstrap, every gate
runs for every contributor whether or not they have the plugin.

## Use

Install the plugin, then in any repository:

- **"Set this repository up"** — runs [repository-bootstrap](skills/repository-bootstrap/SKILL.md).
  Detects the stack, reuses tooling already present, wires the missing gates,
  verifies each one can fail, and leaves the repository enforcing its own
  standards.
- **"Audit this repository"** — runs [guardrail-audit](skills/guardrail-audit/SKILL.md).
  Reports each capability as present, partial, absent, or off, with a concrete
  fix per gap.

Review skills (`testing-review`, `logging-review`, `docs-review`,
`deployment-review`) carry the checklists for their standards.

## How it holds together

- **Capabilities, not tools.** Ten capabilities (see
  [docs/standards.md](docs/standards.md)). Each is implemented by whichever
  well-known tool fits the stack — the tables live in the bootstrap skill's
  [references](skills/repository-bootstrap/references/).
- **One record.** `.guardrails.json` in the consuming repository maps each
  capability to the tool that implements it, or marks it `off` with a reason
  and an owner. A `CODEOWNERS` entry makes any change to it require human
  review — the host's review machinery is the approval system; there is no
  bespoke one.
- **One verify command.** The same `verify` entry point runs locally and in CI,
  so a green local run means a green pipeline.

## Layout

| Path         | What                                                        |
| ------------ | ----------------------------------------------------------- |
| `skills/`    | The product: bootstrap, audit, and review skills            |
| `templates/` | Config files bootstrap copies or adapts (Node, GitHub CI)   |
| `docs/`      | The standards, for humans — one page                        |
| `test/`      | Checks that templates parse and skill references stay valid |

This repository holds itself to its own baseline: prettier, markdownlint,
cspell, commitlint, husky + lint-staged, and `npm run verify` in CI.
