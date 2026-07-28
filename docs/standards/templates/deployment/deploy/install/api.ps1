# Deployment-strategy template - STUB install script for the `api` component.
#
# Contract (set by deploy/engine.ps1 around every phase):
#   $env:<APP_NAME>_TARGET        the install target directory
#   $env:<APP_NAME>_PACKAGE_DIR   the component's extracted package payload
#   $env:<APP_NAME>_COMPONENT     the component name ("api")
#   $env:<APP_NAME>_VERSION       the component's resolved version (baked into
#                                 the artefact at build - the app never reads
#                                 the manifest to learn its own version)
#   Exit 0 = phase passed; non-zero = ABORT the whole deployment.
#
# Replace this stub with real installation. The sample copies a self-contained
# .NET publish under <target>/api/. A provider never depends on its consumer
# being present (one-directional dependency rule) - do NOT check for `web` here.
$ErrorActionPreference = 'Stop'
# TODO: install the api payload. Example:
# $apiDir = Join-Path $env:<APP_NAME>_TARGET 'api'
# New-Item -ItemType Directory -Force -Path $apiDir | Out-Null
# Copy-Item -Recurse -Force (Join-Path $env:<APP_NAME>_PACKAGE_DIR '*') $apiDir
Write-Host "api install: STUB - replace with real install ($env:<APP_NAME>_VERSION)"
exit 0
