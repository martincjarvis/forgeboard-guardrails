# Platform capabilities

Level 1 of the tooling ladder: what the host already offers, which is always
cheaper than running the same check in the pipeline. Enable these before
proposing a tool, and record any you deliberately leave off.

## What to look for, on any host

| Gate | Capability                         | Why it is level 1                                                   |
| ---- | ---------------------------------- | ------------------------------------------------------------------- |
| 6    | Required status checks             | The only thing that makes a verdict block a merge                   |
| 6    | Branch protection                  | Approval rules, stale dismissal, force-push refusal, history shape  |
| 6    | Code scanning with SARIF intake    | Findings annotated on changed lines and tracked across runs         |
| 6    | Test and coverage report intake    | Renders the result on the pull request instead of in an artefact    |
| 6    | Untrusted-run credential policy    | Fork runs without secrets, configured once rather than per pipeline |
| 7    | Secret scanning, including history | The one check that reads past HEAD                                  |
| 7    | Dependency graph and advisories    | Already resolving the transitive set the licence check needs        |
| —    | Scheduled dependency updates       | Proposals as ordinary pull requests through every gate              |

## GitHub

| Capability                                | Where                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| Required checks, approvals, history shape | Branch protection or a ruleset on the default branch                        |
| Code scanning                             | SARIF upload action; findings appear on the diff                            |
| Secret scanning                           | Repository security settings; scans history as well as HEAD                 |
| Dependency advisories                     | Dependency graph plus the vulnerability alerts it feeds                     |
| Scheduled updates                         | The dependency update bot, configured per ecosystem                         |
| Untrusted runs                            | Fork pull requests get no secrets by default — verify nobody has widened it |

Inspect with `gh api repos/:owner/:repo/branches/main/protection`.

Test results have **no first-party intake** — a marketplace action renders them,
and the common ones accept both JUnit XML and TRX. That makes the format choice
free here, so pick whichever the stack emits without an extra package.

## Azure DevOps

| Capability                 | Where                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Required checks, approvals | Branch policies on the default branch                                                                                                      |
| Test result intake         | The publish-test-results step — reads TRX, JUnit, NUnit, xUnit                                                                             |
| Coverage intake            | The publish-coverage step — reads Cobertura directly                                                                                       |
| Advisories, licences       | The dependency scanning extension, where licensed                                                                                          |
| Untrusted runs             | Fork build settings — **verify explicitly**, since making secrets available to fork builds is a supported option somebody may have enabled |

Inspect with `az repos policy list --branch main`.

TRX being native here is why a .NET repository on this host should not add a
JUnit converter: the host reads what the SDK already writes.

## What to record

A capability the host offers and the repository does not use is either a gap or
a decision. Both need writing down:

- **Not enabled, no reason** — a finding at gate 7's platform capability audit.
- **Deliberately not enabled** — a decision record, so the next audit does not
  raise it again.

The most common real reason is licensing: a capability behind a tier the
organisation has not bought. That is a legitimate decision record, and it
changes the answer for that check to level 2 rather than to nothing.
