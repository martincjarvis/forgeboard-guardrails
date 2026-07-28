# .NET tooling

Defaults for a repository with a `.csproj` or `.sln`. Stack-independent checks
are in `tooling-shared.md` — this covers only what needs to understand C#.

| Check                   | Gate | Default                                   | Invocation                                              |
| ----------------------- | ---- | ----------------------------------------- | ------------------------------------------------------- |
| Format                  | 1, 2 | `dotnet format`                           | `dotnet format --verify-no-changes`                     |
| Analysers               | 1, 2 | The SDK analysers, plus a third-party set | Run inside the build; nothing extra to invoke           |
| Build, warnings fatal   | 2    | `dotnet build`                            | `dotnet build -warnaserror`                             |
| Unit tests              | 2    | `dotnet test`                             | `dotnet test --filter Category!=Integration`            |
| Coverage                | 5    | `coverlet`, via the SDK collector         | `dotnet test --collect:"XPlat Code Coverage"`           |
| Integration, end-to-end | 5    | `dotnet test` with a category filter      | `dotnet test --filter Category=Integration`             |
| Dependency install      | 0    | `dotnet restore --locked-mode`            | Fails when the lock file and manifest disagree          |
| Advisories              | 6    | The SDK itself                            | `dotnet list package --vulnerable --include-transitive` |
| Resolved dependencies   | 2, 6 | The SDK itself                            | `dotnet list package --include-transitive`              |
| Project graph           | —    | The solution file                         | `dotnet sln list`                                       |

## Notes that matter

**Analysers belong in the build, not in a separate pass.** The SDK ships
analysers that run during compilation; enable them at the level the standard
asks for and set warnings fatal. This is the clearest case of the standard's
rule that native analysis rides the existing step — there is nothing to invoke
separately and nothing to drift.

Enable in `Directory.Build.props` so it applies to every project at once, rather
than per `.csproj` where it will be missed on the next one added:

```xml
<PropertyGroup>
  <AnalysisLevel>latest-recommended</AnalysisLevel>
  <EnableNETAnalyzers>true</EnableNETAnalyzers>
  <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
</PropertyGroup>
```

**Lock files are opt-in and off by default.** `RestorePackagesWithLockFile`
must be set for `packages.lock.json` to exist at all, and gate 0's
`--locked-mode` and gate 2's lock-sync check both depend on it. A .NET
repository with no lock file has no dependency-integrity check to audit — that
is the finding, before anything about licences or advisories.

**Advisories are native; licences are not.** `dotnet list package --vulnerable`
needs nothing extra. Licence data comes from package metadata and needs a reader
— check whether the host's dependency graph already provides it before adding
one.

**Central package management** (`Directory.Packages.props`) is what makes
"analysers are pinned dependencies" hold across a solution. Without it, each
project pins its own and they drift.

**Test results are TRX natively**: `dotnet test --logger trx`. Whether that
satisfies gate 6's evidence row 10 depends on the host — Azure DevOps ingests
TRX directly, so converting to JUnit XML there adds a package for nothing. A
host that reads only JUnit XML needs a logger package. Check the host first;
this is exactly the case the standard's "native ingestion" rule is written for.

**Coverage is Cobertura natively** through the collector, which every major host
reads. No conversion.

## What this stack does not have natively

- **A single-file lint invocation for gate 1.** `dotnet format` works on a file,
  but the analysers run at build scope. Gate 1's security lint for this stack is
  therefore the stack-independent scanners plus whatever the editor surfaces
  live; the analyser findings arrive at gate 2.
- **SARIF from the compiler analysers** without an ERRORLOG setting. Add
  `<ErrorLog>$(OutputPath)analysis.sarif,version=2.1</ErrorLog>` to publish gate
  6's evidence row 12 for this stack.
