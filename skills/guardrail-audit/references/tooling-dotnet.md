# .NET tooling

Defaults for a repository with a `.csproj` or `.sln`. Stack-independent checks
are in `tooling-shared.md` — this covers only what needs to understand C#.

| Check                 | Gate | Default                                      | Invocation                                              |
| --------------------- | ---- | -------------------------------------------- | ------------------------------------------------------- |
| Format                | 1, 2 | `dotnet format`                              | `dotnet format --verify-no-changes`                     |
| Analysers             | 1, 2 | The SDK analysers, plus two third-party sets | Run inside the build; nothing extra to invoke           |
| Build, warnings fatal | 2    | `dotnet build`                               | `dotnet build -warnaserror`                             |
| Unit tests            | 2    | `dotnet test`                                | `dotnet test --filter Category!=Integration`            |
| Architecture tests    | 2    | An architecture-assertion library            | Runs as part of the unit tier                           |
| Coverage              | 5    | `coverlet`, via the SDK collector            | `dotnet test --collect:"XPlat Code Coverage"`           |
| Integration tests     | 5    | `dotnet test` with a category filter         | `dotnet test --filter Category=Integration`             |
| Dependency install    | 0    | `dotnet restore --locked-mode`               | Fails when the lock file and manifest disagree          |
| Advisories            | 6    | The SDK itself                               | `dotnet list package --vulnerable --include-transitive` |
| Resolved dependencies | 2, 6 | The SDK itself                               | `dotnet list package --include-transitive`              |
| Project graph         | —    | The solution file                            | `dotnet sln list`                                       |

## Analysers, in three layers

Adopt them in order. A single large install produces thousands of findings
nobody triages, and the team learns to skim the output — which is the failure
these standards care most about.

### Layer 1 — the SDK's own analysers, non-negotiable

`Microsoft.CodeAnalysis.NetAnalyzers` ships **in the SDK**, so it tracks the
language version by construction: no lag, no compatibility risk, no package to
pin. Turn it up rather than adding anything:

```xml
<PropertyGroup>
  <AnalysisLevel>latest-Recommended</AnalysisLevel>
  <EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>
  <Nullable>enable</Nullable>
  <PublishReadyToRun>true</PublishReadyToRun>
</PropertyGroup>
```

That plus a solid `.editorconfig` covers the CA and IDE rules. `.editorconfig`
is where severities are pinned — the same file the
[cross-gate tooling preference](../../../docs/standards/guardrails/cross-gate-rules.md)
asks every tool to honour, and this stack reads it natively.

**ReadyToRun rather than trimming or native AOT.** ReadyToRun improves start-up
without constraining what the code may do. `EnableTrimAnalyzer` and
`IsAotCompatible` produce real diagnostics, but they also impose reflection and
dynamic-code restrictions most services do not need and will spend time
fighting. Enable them only where a component is genuinely being trimmed or
published native.

### Layer 2 — two packages worth their build cost

- **Meziantou.Analyzer** — the strongest correctness, async and performance rule
  set, and actively maintained. Has a `MeziantouAnalysisMode` switch, and
  publishes a list of its rules that duplicate other well-known analysers, which
  makes de-duplication tractable rather than guesswork.
- **SonarAnalyzer.CSharp** — breadth nothing else matches: several hundred C#
  rules across bugs, vulnerabilities and code smells, including cognitive
  complexity thresholds and subtler security findings. A plain NuGet package; no
  server required.

Check the current version at adoption rather than copying one from a document.
A version pinned in a reference is stale the week after it is written; what
belongs here is the reasoning for the choice, which is not.

### Layer 3 — targeted, per project

- `Microsoft.CodeAnalysis.BannedApiAnalyzers` — the mechanism for encoding
  organisational rules. This is what enforces the logging standard's _no static
  logging_ rule, through a `BannedSymbols.txt`.
- `Microsoft.VisualStudio.Threading.Analyzers` — the async rules.
- `Microsoft.CodeAnalysis.PublicApiAnalyzers` — for a shared library, where an
  unnoticed public-surface change is a breaking change nobody versioned.
- Framework-specific sets: the cloud SDK's, the logging library's, the test
  framework's own.

### What to drop

**StyleCop.Analyzers.** It has never shipped a stable 1.2.0 — the newest package
is still a beta from December 2023, predating several language versions. Modern
`.editorconfig` IDE rules plus `dotnet format --verify-no-changes` cover the
formatting ground without carrying a stale dependency. Roslynator falls the same
way: useful, not carrying its weight against the three layers above.

## Pipeline orchestration — the one place to ask

The default is the host's own pipeline syntax plus the shared Node tooling for
stack-independent checks, which works and needs no decision.

A team working wholly in .NET may prefer its pipeline written in C# rather than
YAML — [ModularPipelines](https://github.com/thomhurst/ModularPipelines) is the
established option. What it buys is real: the pipeline is typed, testable,
debuggable and open to refactoring by the same people and tools as the product, instead
of being a YAML dialect nobody can run locally. What it costs is a dependency,
a build step for the pipeline itself, and a smaller pool of people who have seen
it before.

**Surface it, do not decide it.** Name the option, state both sides, and let the
team choose — then record the choice, since a pipeline runtime binds everything
downstream of it.

## Centralise, do not scatter

`Directory.Build.props` and `Directory.Packages.props` at the repository root.
The rule set becomes one decision for the repository rather than a per-project
one that drifts the moment somebody adds a project and forgets to copy it. This
is also what makes "analysers are pinned dependencies" true across a solution —
central package management pins once.

## De-duplicate deliberately

The three layers overlap significantly. Do not guess which rules lose:

1. Build once with everything enabled.
2. Export the diagnostics: `dotnet build -p:ErrorLog=analysis.sarif,version=2.1`.
3. Group by message and location, and disable the losers **explicitly** in
   `.editorconfig`, with a comment naming the rule that survives.

Silent overlap costs build time and reports one defect twice, which teaches
people to skim.

## Budget the build cost

Analysers are not free. Measure rather than assume:

```text
dotnet build -p:ReportAnalyzer=true
```

Compare before and after adopting each layer. Where the editor becomes
unresponsive, `<RunAnalyzersDuringLiveAnalysis>false</RunAnalyzersDuringLiveAnalysis>`
keeps them in the build without keeping them in the editor.

## The zero-warning line, and adopting into existing code

The standard is unambiguous: **a warning is a failure**, and
`TreatWarningsAsErrors` is how this stack holds it. A repository starting fresh
turns it on and leaves it on.

Adopting these analysers over an existing codebase surfaces hundreds of findings
at once, and a big-bang cleanup is usually the wrong change to make. Two ramps
are legitimate:

- `<WarningsNotAsErrors>` listing the specific rules being deferred, so new code
  is held to the full line and the exceptions are visible by name.
- A baseline `.editorconfig` in the legacy folders lowering specific severities
  there, leaving the rest of the tree strict.

**Either is an exception, not a setting.** Record it as one: what was deferred,
why, what would let it be removed, and an expiry. A ramp with no end date is not
a ramp — it is the zero-warning line quietly abandoned, and the next reader has
no way to tell the two apart.

## Notes that matter

**`dotnet restore --locked-mode` needs lock files switched on.**
`RestorePackagesWithLockFile` must be set for `packages.lock.json` to exist at
all, and both gate 0's install check and gate 2's lock-sync check depend on it.
A .NET repository with no lock file has no dependency-integrity check to audit —
that is the finding, before anything about licences or advisories.

**Advisories are native; licences are not.** `dotnet list package --vulnerable`
needs nothing extra. Licence data comes from package metadata and needs a
reader — check whether the host's dependency graph already provides it before
adding one.

**Analyser findings are not dependency scanning.** Sonar's security rules
examine your code and say nothing about a vulnerable package you depend on.
Gate 6's advisory scan is a separate check and stays separate.

**Test results are TRX natively**: `dotnet test --logger trx`. Whether that
satisfies gate 6's evidence row depends on the host — one that ingests TRX
directly needs no converter, and adding one is the bolt-on the tooling ladder
tells you to avoid. Check the host first.

**Coverage is Cobertura natively** through the collector, which every major host
reads. No conversion.

**SARIF needs an explicit error log.** Add
`-p:ErrorLog=analysis.sarif,version=2.1` to publish gate 6's static-analysis
evidence for this stack. Without it the diagnostics stay in the build log, where
nobody annotates a diff with them.

## What this stack does not have natively

- **A single-file lint invocation for gate 1.** `dotnet format` works on one
  file, but the analysers run at build scope. Gate 1's security lint here is the
  stack-independent scanners plus whatever the editor surfaces live; the
  analyser findings arrive at gate 2.
