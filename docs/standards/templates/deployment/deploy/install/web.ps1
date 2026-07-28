# Deployment-strategy template - STUB install script for the `web` (ui) component.
#
# Contract (set by deploy/engine.ps1 around every phase):
#   $env:<APP_NAME>_TARGET        the install target directory
#   $env:<APP_NAME>_PACKAGE_DIR   the component's extracted package payload
#   $env:<APP_NAME>_COMPONENT     the component name ("web")
#   $env:<APP_NAME>_VERSION       the component's resolved version (baked into
#                                 dist/version.json at build)
#   Exit 0 = phase passed; non-zero = ABORT the whole deployment.
#
# Replace this stub with real installation. The sample copies a static React
# bundle (with a baked version.json) under <target>/web/.
$ErrorActionPreference = 'Stop'
# TODO: install the web payload. Example:
# $webDir = Join-Path $env:<APP_NAME>_TARGET 'web'
# New-Item -ItemType Directory -Force -Path $webDir | Out-Null
# Copy-Item -Recurse -Force (Join-Path $env:<APP_NAME>_PACKAGE_DIR '*') $webDir
Write-Host "web install: STUB - replace with real install ($env:<APP_NAME>_VERSION)"
exit 0
