# cspell:ignore LASTEXITCODE
# Deployment-strategy template - STUB verify script for the `api` component.
#
# Verify runs after `deploy` for this component. The api is a provider; its
# verify is a SELF-CHECK only - it must never inspect `web` (its consumer), per
# the one-directional dependency rule. The composition assertion (api healthy +
# web present) belongs to the app-level smoke, which runs after every component.
#
# Contract (set by deploy/engine.ps1 around every phase):
#   $env:<APP_NAME>_TARGET        the install target directory
#   $env:<APP_NAME>_VERSION       the component's resolved version (baked in)
#   Exit 0 = verify passed; non-zero = ABORT the whole deployment.
#
# Replace this stub with real verification. The sample runs the api's own
# `--health` self-check and asserts a clean exit.
$ErrorActionPreference = 'Stop'
# TODO: verify api health. Example:
# & (Join-Path $env:<APP_NAME>_TARGET 'api/Api.exe') --health
# if ($LASTEXITCODE -ne 0) { Write-Error 'api health failed'; exit 1 }
Write-Host 'api verify: STUB - replace with real health self-check'
exit 0
