# Deployment-strategy template - STUB install script for the `infra` component.
#
# Contract (set by deploy/engine.ps1 around every phase):
#   $env:<APP_NAME>_TARGET        the install target directory
#   $env:<APP_NAME>_PACKAGE_DIR   the component's extracted package payload
#   $env:<APP_NAME>_COMPONENT     the component name ("infra")
#   $env:<APP_NAME>_VERSION       the component's resolved version
#   Exit 0 = phase passed; non-zero = ABORT the whole deployment.
#
# Replace this stub with real provisioning. The sample provisions the target
# directory and verifies a runtime prerequisite (e.g. the .NET runtime present).
$ErrorActionPreference = 'Stop'
# TODO: provision the target. Example:
# New-Item -ItemType Directory -Force -Path $env:<APP_NAME>_TARGET | Out-Null
Write-Host "infra install: STUB - replace with real provisioning ($env:<APP_NAME>_VERSION)"
exit 0
