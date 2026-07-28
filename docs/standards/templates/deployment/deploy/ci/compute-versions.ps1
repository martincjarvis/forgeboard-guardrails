# cspell:ignore prid buildId pscustomobject Pathspec
# Deployment-strategy template — per-component version computation (path-scoped).
# Proven in the `forgeboard-deploy-sample` real-CI run; logic copied verbatim.
# Reads component names + their `paths` from `.forgeboard/guardrails.config.json`
# (no hardcoded component list to adapt). semantic-release is NOT used: the bump
# is detected directly from the Conventional Commits that touch each component's
# own `paths`, so an untouched component stays at its last release. The
# `release/*.json` files remain as the toolkit-contract placeholder (the AC1 swap
# point) — they are not executed here.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'versioning.psm1') -Force

$cfg = Get-Content '.forgeboard/guardrails.config.json' -Raw | ConvertFrom-Json
$appName = $cfg.appName
$branch = (git rev-parse --abbrev-ref HEAD)
$isBranch = $branch -like 'feature/*'
$channel = ($branch -replace '[^a-zA-Z0-9-]','-')
$buildId = if ($env:CI_BUILD_NUMBER) {
  if ($env:CI_BUILD_ATTEMPT -and $env:CI_BUILD_ATTEMPT -ne '1') { "$($env:CI_BUILD_NUMBER)-$($env:CI_BUILD_ATTEMPT)" }
  else { $env:CI_BUILD_NUMBER }
} else { '0' }

$allTags = git tag --list
$results = [ordered]@{}
foreach ($name in $cfg.components.PSObject.Properties.Name) {
  $paths = @($cfg.components.$name.paths)
  $lastStable = Get-LastStableVersion $allTags $appName $name
  # @(...) keeps an unchanged component's empty result an empty array (a bare
  # function return of @() unwraps to $null), so ConvertTo-BumpKind and .Count stay safe
  $commits = @(Get-PathScopedCommits "$appName-$name@$lastStable..HEAD" (Get-Pathspec $paths))
  # if the component has no stable tag yet, diff from the empty tree (first release)
  if ($lastStable -eq '0.0.0' -and -not (git tag --list "$appName-$name@0.0.0")) {
    $commits = @(Get-PathScopedCommits 'HEAD' (Get-Pathspec $paths))
  }
  $bump = ConvertTo-BumpKind $commits
  $version = Get-NextVersion $lastStable $bump $isBranch $channel $buildId
  $changed = [bool]$bump
  $prerelease = $changed -and $isBranch
  if ($changed) {
    Write-Host "VERSION ${name}: $lastStable -> $version bump=$bump ($($commits.Count) releasable commits in paths)"
  } else {
    Write-Host "VERSION ${name}: unchanged ($($commits.Count) commits in paths, none releasable)"
  }
  $results[$name] = @{ version = $version; prerelease = $prerelease; bump = $bump; changed = $changed }
}
$results | ConvertTo-Json -Depth 5 | Set-Content results.json
