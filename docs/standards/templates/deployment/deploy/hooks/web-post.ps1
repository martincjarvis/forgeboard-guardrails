# Deployment-strategy template - STUB post-deploy hook for the `web` component.
#
# `postDeploy` runs after `verify` for this component. Hooks are optional arrays
# of commands; this file is one such command, referenced from
# deployment.json's components.web.postDeploy. Adapt or remove per your needs.
#
# Contract (set by deploy/engine.ps1 around every phase):
#   $env:<APP_NAME>_TARGET        the install target directory
#   $env:<APP_NAME>_PACKAGE_DIR   the component's extracted package payload
#   $env:<APP_NAME>_COMPONENT     the component name ("web")
#   $env:<APP_NAME>_VERSION       the component's resolved version
#   Exit 0 = hook passed; non-zero = ABORT the whole deployment.
#
# Replace this stub with a real post-deploy step. The sample performs a cache
# warm (a no-op demonstration) after installing the web bundle.
$ErrorActionPreference = 'Stop'
# TODO: real post-deploy step (e.g. cache warm).
Write-Host "web postDeploy: STUB - replace with real post-deploy hook ($env:<APP_NAME>_VERSION)"
exit 0
