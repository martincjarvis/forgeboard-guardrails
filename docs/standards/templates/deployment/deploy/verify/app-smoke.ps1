# cspell:ignore LASTEXITCODE
# Deployment-strategy template - STUB app-level launch-smoke (app.verify).
#
# This is the APP-LEVEL smoke: it runs AFTER every component is installed and is
# the composition check no individual component may make. It asserts the whole
# composition starts healthily - e.g. a provider's health check passes AND a
# consumer's bundle is present. This is where a provider (api) may finally
# reference its consumer (web), never inside the component's own verify.
#
# Contract (set by deploy/engine.ps1 for app phases):
#   $env:<APP_NAME>_TARGET        the install target directory
#   $env:<APP_NAME>_VERSION       the derived appVersion (surfaced by the deployer)
#   Exit 0 = smoke passed; non-zero = ABORT the deployment.
#
# Replace this stub with real launch-smoke checks for your composition.
$ErrorActionPreference = 'Stop'
# TODO: app-level smoke. Example (sample):
# & (Join-Path $env:<APP_NAME>_TARGET 'api/Api.exe') --health
# if ($LASTEXITCODE -ne 0) { Write-Error 'app smoke: api health failed'; exit 1 }
# if (-not (Test-Path (Join-Path $env:<APP_NAME>_TARGET 'web/version.json'))) { Write-Error 'app smoke: web bundle missing'; exit 1 }
Write-Host 'app-smoke: STUB - replace with real composition launch-smoke'
exit 0
