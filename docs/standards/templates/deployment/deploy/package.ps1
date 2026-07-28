# Deployment-strategy template — packaging script.
# Proven in the `forgeboard-deploy-sample` real-CI run; logic copied verbatim.
# Genericized: tag/package names derive from `$m.appName`, so no per-app edit is
# needed there. The PAYLOAD-STAGING block below is sample-specific (it stages
# the sample's `api`/`web`/`db`/`infra` payloads) — adapt it to your components'
# built artefacts. The per-component zip emission + the `deploy` package are
# generic and need no change.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$Manifest, [string]$Out = 'out')
$ErrorActionPreference = 'Stop'
$m = Get-Content $Manifest -Raw | ConvertFrom-Json -AsHashtable
$bundle = Join-Path $Out 'bundle'
Remove-Item -Recurse -Force $Out -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $bundle | Out-Null

# --- PAYLOAD-STAGING (sample-specific: adapt to your components) -------------
# Stage each component's built artefacts under `$bundle/<component>/`. The
# sample stages a .NET publish, a React build, migration scripts, and a
# script-only `infra` component. Replace these Copy-Item lines with your own
# components' build outputs, keyed to the same names as `deployment.json`.
Copy-Item -Recurse -Force 'publish/api'      (Join-Path $bundle 'api')
Copy-Item -Recurse -Force 'src/Web/dist'     (Join-Path $bundle 'web')
Copy-Item -Recurse -Force 'db'               (Join-Path $bundle 'db')
Copy-Item -Recurse -Force 'deploy'           (Join-Path $bundle 'deploy')
Copy-Item -Force $Manifest                   (Join-Path $bundle 'version-manifest.json')

# A script-only component (no build output) stages its own install/verify
# scripts so it still gets a real per-component package like every other node.
$infra = Join-Path $bundle 'infra'
New-Item -ItemType Directory -Force -Path (Join-Path $infra 'install') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $infra 'verify')  | Out-Null
Copy-Item -Force 'deploy/install/infra.ps1' (Join-Path $infra 'install/infra.ps1')
Copy-Item -Force 'deploy/verify/infra.ps1'  (Join-Path $infra 'verify/infra.ps1')
# --- /PAYLOAD-STAGING --------------------------------------------------------

$pkgDir = Join-Path $Out 'packages'
New-Item -ItemType Directory -Force -Path $pkgDir | Out-Null
foreach ($name in $m.components.Keys) {
  if (Test-Path (Join-Path $bundle $name)) {
    Compress-Archive -Force -Path (Join-Path $bundle "$name/*") -DestinationPath (Join-Path $pkgDir $m.components[$name].package)
  } else {
    throw "no payload staged for component '$name' - cannot emit $($m.components[$name].package)"
  }
}

# `deploy` is a first-class versioned component (rule 4) but IS the deployer, so
# it lives outside the deployed `components` map / DAG. It still gets its own
# package, tagged as <appName>-deploy@<deployToolVersion>.
Compress-Archive -Force -Path (Join-Path $bundle 'deploy/*') `
  -DestinationPath (Join-Path $pkgDir "$($m.appName)-deploy@$($m.deployToolVersion).zip")

Write-Host "packaged app $($m.appName) $($m.appVersion) -> $Out"
