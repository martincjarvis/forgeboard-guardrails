# .NET tooling

Default choices for a .NET repository. An existing equivalent always wins —
but not an outdated platform: target the newest LTS (currently .NET 10). A
repository pinned to an older LTS gets the upgrade proposed at bootstrap and
reported by the audit; an unsupported version is a finding, not a choice.

| Capability        | Tool                       | Notes                                                                       |
| ----------------- | -------------------------- | --------------------------------------------------------------------------- |
| `format`          | `dotnet format`            | `--verify-no-changes` in `verify`; plain `dotnet format` in the hook        |
| `lint`            | SDK analysers              | `AnalysisLevel` latest + `TreatWarningsAsErrors` in Directory.Build.props   |
| `typecheck`       | the compiler               | `dotnet build -warnaserror` — the build is the type check                   |
| `tests`           | TUnit                      | New projects; keep an existing suite's framework, migrate opportunistically |
| `coverage`        | Microsoft.Testing.Platform | `dotnet test -- --coverage`; see the coverage note below                    |
| `commit-messages` | see [shared.md](shared.md) | commitlint                                                                  |
| `secrets`         | see [shared.md](shared.md) | gitleaks `protect --staged` fits a no-Node repo                             |
| `spelling`        | see [shared.md](shared.md) | cspell                                                                      |
| `ci-verify`       | see [shared.md](shared.md) | `verify` runs restore, format check, build, test                            |
| `branch-review`   | see [shared.md](shared.md) | Host branch protection                                                      |
| `supply-chain`    | see [shared.md](shared.md) | NuGet audit runs on restore; Dependabot covers `nuget`                      |

## Central configuration — one decision per repository

- **`Directory.Build.props`** at the root is the enforcement point — no
  per-`.csproj` drift:

  ```xml
  <PropertyGroup>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <AnalysisLevel>latest</AnalysisLevel>
    <EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>
    <Nullable>enable</Nullable>
  </PropertyGroup>
  ```

- **`Directory.Packages.props` — central package management.** Every package
  version lives here (`ManagePackageVersionsCentrally=true`); `.csproj` files
  carry `<PackageReference Include="..." />` with no `Version`. One file to
  review for supply-chain changes, one place Dependabot updates.
- Severities pinned in `.editorconfig`; suppressions carry a reason on the
  same line. SDK pinned in `global.json`; CI reads it
  (`setup-dotnet` with `global-json-file`).

## Testing tiers

- **Unit — TUnit.** Source-generated, Microsoft.Testing.Platform native,
  parallel by default. Runs under `dotnet test` with
  `<TestingPlatformDotnetTestSupport>true</TestingPlatformDotnetTestSupport>`
  in `Directory.Build.props`.
- **Integration / multi-component E2E — .NET Aspire.** The AppHost models the
  components (Functions app, web front-end, databases); tests use
  `Aspire.Hosting.Testing`'s `DistributedApplicationTestingBuilder` to run
  the real component graph locally and drive it over HTTP. This is the local
  E2E story — no cloud deployment needed to exercise a journey.
- **E2E user journeys — Reqnroll.** Gherkin features, one journey per
  product feature, bound to step definitions that drive the Aspire-hosted
  app. The journey is declared before implementation and fails first.
- **Architecture — ArchUnitNET** (or NetArchTest): dependency-rule tests
  asserting the intended slicing, run as ordinary tests.

**Coverage note (verified live).** TUnit runs on Microsoft.Testing.Platform,
where the VSTest-era collectors (coverlet.collector) do not apply. What
works, end to end:

- Opt into the MTP `dotnet test` runner in `global.json`:
  `"test": { "runner": "Microsoft.Testing.Platform" }` (on .NET 10 the old
  VSTest path hard-errors).
- Measure: `dotnet test <sln> -- --coverage --coverage-settings
coverage.settings.xml --coverage-output-format cobertura`. The settings
  file must be the **full RunSettings document**
  (`<RunSettings><DataCollectionRunSettings>…<CodeCoverage>`) — a bare
  `<configuration>` fragment is rejected as invalid. Scope it to production
  code: include the product assembly, exclude tests, `Program.cs` and
  `*.g.cs` (Functions source-gen otherwise dominates the denominator).
- Floor: the extension has no threshold flag; assert the cobertura
  `line-rate` ≥ 0.8 with a small checked-in script in `verify`, and print
  the figure to the PR summary. Demonstrate the floor failing before
  claiming it.

## Wiring

- Hook manager: [Husky.Net](https://alirezanet.github.io/Husky.Net/) as a
  local dotnet tool (`dotnet tool install husky`), or plain git hooks via
  `git config core.hooksPath .githooks` if the team wants zero extra tools.
  - pre-commit: `dotnet format` over staged files, then the staged checks
  - commit-msg: commitlint (see shared.md)
  - pre-push: the `verify` command
- `verify` (script or `Directory.Build.targets` target):
  `dotnet restore --locked-mode && dotnet format --verify-no-changes && dotnet build -warnaserror && dotnet test`
