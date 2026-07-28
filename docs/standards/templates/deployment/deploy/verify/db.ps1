# Deployment-strategy template - STUB verify script for the `db` (dbschema) component.
#
# Verify runs after `deploy` for this component and asserts its post-install
# state (dependsOn closure only - one-directional dependency rule).
#
# Contract (set by deploy/engine.ps1 around every phase):
#   $env:<APP_NAME>_TARGET        the install target directory
#   $env:<APP_NAME>_VERSION       the component's resolved version
#   Exit 0 = verify passed; non-zero = ABORT the whole deployment.
#
# Replace this stub with real verification. The sample asserts the expected
# migration file and an applied-version marker are present.
$ErrorActionPreference = 'Stop'
# TODO: verify db state. Example:
# $dbDir = Join-Path $env:<APP_NAME>_TARGET 'db'
# if (-not (Test-Path (Join-Path $dbDir 'applied-version.txt'))) { Write-Error 'version marker missing'; exit 1 }
Write-Host 'db verify: STUB - replace with real verification'
exit 0
