# Deployment-strategy template - STUB install script for the `db` (dbschema) component.
#
# Contract (set by deploy/engine.ps1 around every phase):
#   $env:<APP_NAME>_TARGET        the install target directory
#   $env:<APP_NAME>_PACKAGE_DIR   the component's extracted package payload
#   $env:<APP_NAME>_COMPONENT     the component name ("db")
#   $env:<APP_NAME>_VERSION       the component's resolved version
#   Exit 0 = phase passed; non-zero = ABORT the whole deployment.
#
# Replace this stub with real schema-migration application. The sample copies
# migration scripts under <target>/db/ and writes an applied-version marker.
$ErrorActionPreference = 'Stop'
# TODO: apply migrations. Example:
# $dbDir = Join-Path $env:<APP_NAME>_TARGET 'db'
# New-Item -ItemType Directory -Force -Path $dbDir | Out-Null
# Copy-Item -Recurse -Force (Join-Path $env:<APP_NAME>_PACKAGE_DIR 'migrations/*') $dbDir
# Set-Content (Join-Path $dbDir 'applied-version.txt') $env:<APP_NAME>_VERSION
Write-Host "db install: STUB - replace with real migration apply ($env:<APP_NAME>_VERSION)"
exit 0
