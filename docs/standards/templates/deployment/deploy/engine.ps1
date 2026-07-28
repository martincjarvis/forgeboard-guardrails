# cspell:ignore topo fbds FBDS LASTEXITCODE
# Deployment-strategy template — deploy engine (reconciles: deploys only changed).
# Proven in the `forgeboard-deploy-sample` real-CI run; logic copied verbatim.
# Genericized: every `<APP_NAME>_*` env-var prefix is the `<APP_NAME>` placeholder
# (replace `<APP_NAME>` with your app's prefix token on instantiation — see the
# template README). The `DEPLOYED` line and the `.<appName>-version` install
# marker read `appName` from the manifest, so they need no per-app edit.
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Manifest,
  [Parameter(Mandatory)][string]$PackageDir,
  [Parameter(Mandatory)][string]$Target
)
$ErrorActionPreference = 'Stop'

function Get-TopoOrder([hashtable]$components) {
  $names = @($components.Keys)
  $result = New-Object System.Collections.Generic.List[string]
  while ($result.Count -lt $names.Count) {
    $ready = @()
    foreach ($name in $names) {
      if ($result -contains $name) { continue }
      $ok = $true
      foreach ($dep in @($components[$name].dependsOn)) {
        if ($dep -and ($result -notcontains $dep)) { $ok = $false; break }
      }
      if ($ok) { $ready += $name }
    }
    if (-not $ready) { throw "cycle: unresolved dependencies" }
    $ready | Sort-Object | ForEach-Object { $result.Add($_) }
  }
  return $result
}

function Invoke-Phase([string]$component, [string]$phase, $scripts, [string]$version) {
  foreach ($s in @($scripts)) {
    if (-not $s) { continue }
    Write-Host "RUN $component $phase $s"
    $env:<APP_NAME>_TARGET = $Target
    $env:<APP_NAME>_PACKAGE_DIR = $PackageDir
    $env:<APP_NAME>_COMPONENT = $component
    $env:<APP_NAME>_VERSION = $version
    $path = if (Test-Path $s) { $s } else { Join-Path $PackageDir $s }
    & pwsh -NoProfile -File $path
    if ($LASTEXITCODE -ne 0) { throw "component '$component' phase '$phase' failed ($LASTEXITCODE): $s" }
  }
}

try {
  $m = Get-Content $Manifest -Raw | ConvertFrom-Json -AsHashtable
  New-Item -ItemType Directory -Force -Path $Target | Out-Null

  Invoke-Phase 'app' 'preDeploy' $m.app.preDeploy $m.appVersion
  foreach ($name in Get-TopoOrder $m.components) {
    $c = $m.components[$name]
    # Reconcile: deploy a component only when the installed version differs from
    # the manifest (or nothing is installed). Fresh targets install everything.
    $markerDir = Join-Path $Target $name
    $marker = Join-Path $markerDir ".$($m.appName)-version"
    if ((Test-Path $marker) -and (Get-Content $marker -Raw).Trim() -eq $c.version) {
      Write-Host "SKIP $name (installed $($c.version) == manifest)"; continue
    }
    Write-Host "DEPLOY $name $($c.version)"
    Invoke-Phase $name 'preDeploy'  $c.preDeploy  $c.version
    Invoke-Phase $name 'deploy'     $c.deploy     $c.version
    Invoke-Phase $name 'verify'     $c.verify     $c.version
    Invoke-Phase $name 'postDeploy' $c.postDeploy $c.version
    New-Item -ItemType Directory -Force -Path $markerDir | Out-Null
    Set-Content $marker $c.version
  }
  Invoke-Phase 'app' 'verify' $m.app.verify $m.appVersion
  # The deployer (not the app) surfaces the derived appVersion, read from the
  # manifest it is installing. Components carry their own baked-in versions.
  Write-Host "DEPLOYED $($m.appName) $($m.appVersion)"
  exit 0
} catch {
  # EAP is 'Stop' above; relax it here so the ABORT line prints as one clean
  # message (no stack) before the intended exit 1 (abort-on-failure contract).
  $ErrorActionPreference = 'Continue'
  Write-Host "ABORT: $($_.Exception.Message)"
  exit 1
}
