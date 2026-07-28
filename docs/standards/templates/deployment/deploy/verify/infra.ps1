# Deployment-strategy template - STUB verify script for the `infra` component.
#
# Verify runs after `deploy` for this component and asserts the component's own
# post-install state. A component's verify may assume ONLY its `dependsOn`
# closure is already deployed (one-directional dependency rule) - never a
# component that depends on it.
#
# Contract (set by deploy/engine.ps1 around every phase):
#   $env:<APP_NAME>_TARGET        the install target directory
#   $env:<APP_NAME>_VERSION       the component's resolved version
#   Exit 0 = verify passed; non-zero = ABORT the whole deployment.
#
# Replace this stub with real verification. The sample asserts the target dir
# exists and a runtime prerequisite is on PATH.
$ErrorActionPreference = 'Stop'
# TODO: verify infra state. Example:
# if (-not (Test-Path $env:<APP_NAME>_TARGET)) { Write-Error 'target dir missing'; exit 1 }
Write-Host 'infra verify: STUB - replace with real verification'
exit 0
