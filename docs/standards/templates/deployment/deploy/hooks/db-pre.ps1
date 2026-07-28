# Deployment-strategy template - STUB pre-deploy hook for the `db` component.
#
# `preDeploy` runs before `deploy` for this component. Hooks are optional arrays
# of commands; this file is one such command, referenced from deployment.json's
# components.db.preDeploy. Adapt or remove per your component's needs.
#
# Contract (set by deploy/engine.ps1 around every phase):
#   $env:<APP_NAME>_TARGET        the install target directory
#   $env:<APP_NAME>_PACKAGE_DIR   the component's extracted package payload
#   $env:<APP_NAME>_COMPONENT     the component name ("db")
#   $env:<APP_NAME>_VERSION       the component's resolved version
#   Exit 0 = hook passed; non-zero = ABORT the whole deployment.
#
# Replace this stub with a real pre-deploy step. The sample performs a backup
# check (a no-op demonstration) before applying schema migrations.
$ErrorActionPreference = 'Stop'
# TODO: real pre-deploy step (e.g. backup check).
Write-Host "db preDeploy: STUB - replace with real pre-deploy hook ($env:<APP_NAME>_VERSION)"
exit 0
