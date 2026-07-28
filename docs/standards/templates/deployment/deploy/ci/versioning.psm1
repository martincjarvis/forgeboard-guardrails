# cspell:ignore pscustomobject topo Pathspec
# Deployment-strategy template — path-scoped versioning helpers (pure logic).
# Proven in the `forgeboard-deploy-sample` real-CI run; copied here VERBATIM.
# Nothing here is app-specific: app and component names flow in as parameters,
# so the template carries this module unchanged.
Set-StrictMode -Version Latest

function ConvertTo-BumpKind {
  param([pscustomobject[]]$Commits)
  $rank = @{ major = 3; minor = 2; patch = 1 }
  $best = $null; $bestRank = 0
  foreach ($c in @($Commits)) {
    $kind = $null
    if ($c.Subject -match '^\w+(\([^)]*\))?!:' -or $c.Body -match '(?m)^BREAKING CHANGE:') { $kind = 'major' }
    elseif ($c.Subject -match '^feat(\([^)]*\))?:') { $kind = 'minor' }
    elseif ($c.Subject -match '^fix(\([^)]*\))?:') { $kind = 'patch' }
    if ($kind -and $rank[$kind] -gt $bestRank) { $best = $kind; $bestRank = $rank[$kind] }
  }
  return $best
}

function Get-Pathspec {
  param([string[]]$Paths)
  $Paths | ForEach-Object {
    if ($_.StartsWith('!')) { ":(exclude,glob)$($_.Substring(1))" } else { ":(glob)$_" }
  }
}

function Get-NextVersion {
  param([string]$LastStable, [string]$Bump, [bool]$IsBranch, [string]$Channel, [string]$BuildId)
  $p = ($LastStable -replace '-.*','').Split('.')
  [int]$maj = $p[0]; [int]$min = $p[1]; [int]$pat = $p[2]
  switch ($Bump) {
    'major' { $maj++; $min = 0; $pat = 0 }
    'minor' { $min++; $pat = 0 }
    'patch' { $pat++ }
    default { return $LastStable }   # unchanged
  }
  $base = "$maj.$min.$pat"
  if ($IsBranch) { return "$base-$Channel.$BuildId" }
  return $base
}

function Get-LastStableVersion {
  param([string[]]$Tags, [string]$AppName, [string]$Component)
  $stable = $Tags |
    Where-Object { $_ -like "$AppName-$Component@*" } |
    ForEach-Object { $_ -replace '.*@','' } |
    Where-Object { $_ -notmatch '-' }
  if (-not $stable) { return '0.0.0' }
  ($stable | Sort-Object { [version]$_ } | Select-Object -Last 1)
}

function Get-PathScopedCommits {
  param([string]$Range, [string[]]$Pathspec)
  # %x1f = unit sep between subject/body, %x1e = record sep between commits
  $fmt = '%s%x1f%b%x1e'
  $raw = & git log $Range --pretty=format:$fmt -- @Pathspec
  if (-not $raw) { return @() }
  ($raw -join "`n") -split "`x1e" | Where-Object { $_.Trim() } | ForEach-Object {
    $parts = $_ -split "`x1f", 2
    [pscustomobject]@{ Subject = $parts[0].Trim("`n"); Body = if ($parts.Count -gt 1) { $parts[1] } else { '' } }
  }
}

Export-ModuleMember -Function ConvertTo-BumpKind, Get-Pathspec, Get-NextVersion, Get-LastStableVersion, Get-PathScopedCommits
