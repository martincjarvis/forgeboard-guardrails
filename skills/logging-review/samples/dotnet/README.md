# .NET logging samples

This is an **illustrative** corpus for the `logging-review` skill — illustrative source only, **not** built or referenced by any component of this repository (its components mapping stays empty). It is the durable regression set the skill reviews against. None of these files are wired into any buildable project or test gate.

## Running in scratch (throwaway, outside the repo)

Create a throwaway xUnit project **outside** the repo, add the test-time logging packages, drop in the conformant pair, and run:

```bash
dotnet new xunit -o logging-scratch
cd logging-scratch
dotnet add package Microsoft.Extensions.Diagnostics.Testing
dotnet add package Microsoft.Extensions.Logging.Abstractions
# copy in conformant/OrderProcessor.cs and conformant/OrderProcessorLoggingTests.cs
dotnet test   # green
```

## Seeing the red

To prove the test has teeth, swap `OrderProcessor.cs` for `violating/OrderProcessor.cs` after changing its `namespace LoggingSamples.Violating;` to `namespace LoggingSamples.Conformant;`, keep the same test, and re-run `dotnet test`. The test fails on the PII assertion (`Assert.DoesNotContain("jane@example.com", audit.Message)`), proving the audit emitted customer PII at INFO. This confirms the test reaches the PII check (the violating `ConfirmOrder` emits exactly one INFO, so `Assert.Single` passes first).
