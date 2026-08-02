# Infrastructure-as-code

IaC files are code: the `format`, `lint`, `secrets` and `spelling`
capabilities apply to them with the IaC tool's own commands. No new
capability — record the tool beside the stack's in `.guardrails.json`
(e.g. `"lint": { "tool": "eslint + bicep lint" }`).

| IaC            | Format          | Lint / validate                                   |
| -------------- | --------------- | ------------------------------------------------- |
| Bicep          | `bicep format`  | `bicep lint` (`bicep build` compiles = validates) |
| Terraform      | `terraform fmt` | `terraform validate`; tflint if already in use    |
| ARM / CFN      | prettier (JSON) | the platform's validate command                   |
| GitHub Actions | prettier (YAML) | actionlint if already in use                      |

Wiring: add the format/lint commands to the repository's `verify` chain and,
where cheap, to lint-staged for the matching file globs. Secret and spell
scanning already sweep these files — infra directories must not be added to
their ignore lists.

CI setup: use only actions you have verified exist — there is **no**
`azure/setup-bicep`; install the release binary
(`curl -sSL https://github.com/Azure/bicep/releases/latest/download/bicep-linux-x64`,
`chmod +x`). dotnet comes from `actions/setup-dotnet` with
`global-json-file`. An action name that merely sounds right fails the whole
job at setup.

Deployment pipelines (azd, SWA deploy, terraform apply) are **not**
guardrails and are never rewritten by bootstrap: they stay as found, gain
nothing but the verify job beside them. Whether a deployment verifies its
own health is `deployment-review`'s checklist, not a commit gate.
