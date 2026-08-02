# .NET tooling

Default choices for a .NET repository. An existing equivalent always wins —
but not an outdated platform: target the newest LTS (currently .NET 10). A
repository pinned to an older LTS gets the upgrade proposed at bootstrap and
reported by the audit; an unsupported version is a finding, not a choice.

| Capability        | Tool                          | Notes                                                                     |
| ----------------- | ----------------------------- | ------------------------------------------------------------------------- |
| `format`          | `dotnet format`               | `--verify-no-changes` in `verify`; plain `dotnet format` in the hook      |
| `lint`            | SDK analysers                 | `AnalysisLevel` latest + `TreatWarningsAsErrors` in Directory.Build.props |
| `typecheck`       | the compiler                  | `dotnet build -warnaserror` — the build is the type check                 |
| `tests`           | `dotnet test`                 | Keep the repo's existing framework (xunit/NUnit/MSTest)                   |
| `coverage`        | coverlet (`coverlet.msbuild`) | `dotnet test -p:CollectCoverage=true -p:Threshold=80`; fails below floor  |
| `commit-messages` | see [shared.md](shared.md)    | commitlint                                                                |
| `secrets`         | see [shared.md](shared.md)    | gitleaks `protect --staged` fits a no-Node repo                           |
| `spelling`        | see [shared.md](shared.md)    | cspell                                                                    |
| `ci-verify`       | see [shared.md](shared.md)    | `verify` runs restore, format check, build, test                          |
| `branch-review`   | see [shared.md](shared.md)    | Host branch protection                                                    |

Wiring:

- `Directory.Build.props` at the repo root is the enforcement point — one
  decision for every project, no per-`.csproj` drift:

  ```xml
  <PropertyGroup>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <AnalysisLevel>latest</AnalysisLevel>
    <EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>
    <Nullable>enable</Nullable>
  </PropertyGroup>
  ```

- Severities are pinned in `.editorconfig`; suppressions carry a reason on the
  same line.
- Hook manager: [Husky.Net](https://alirezanet.github.io/Husky.Net/) as a
  local dotnet tool (`dotnet tool install husky`), or plain git hooks via
  `git config core.hooksPath .githooks` if the team wants zero extra tools.
  - pre-commit: `dotnet format` over staged files, then the staged checks
  - commit-msg: commitlint (see shared.md)
  - pre-push: the `verify` command
- `verify` (script or `Directory.Build.targets` target):
  `dotnet restore --locked-mode && dotnet format --verify-no-changes && dotnet build -warnaserror && dotnet test -p:CollectCoverage=true -p:Threshold=80 -p:ThresholdType=line -p:ThresholdStat=total`
- Pin the SDK in `global.json` and use that version in CI setup-dotnet.
