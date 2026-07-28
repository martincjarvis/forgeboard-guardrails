# cspell:ignore fbds
# Deployment-strategy template — tag + release publishing.
# Proven in the `forgeboard-deploy-sample` real-CI run; logic copied verbatim.
# Genericized: every `fbds-...` tag literal is the `<APP_NAME>` placeholder.
$ErrorActionPreference = 'Stop'
$m = Get-Content version-manifest.json -Raw | ConvertFrom-Json -AsHashtable
$isDefault = (git rev-parse --abbrev-ref HEAD) -eq 'main'

# Per-component tags + releases: stable on main, branch-namespaced prerelease on a
# feature branch (so a branch deploy is real and reproducible; the id carries `-`).
foreach ($name in $m.components.Keys) {
  $ver = $m.components[$name].version
  $tag = "<APP_NAME>-$name@$ver"
  # Backstop tag-exists skip. The version itself is already unique-by-construction
  # (build-counter qualifier, see compute-versions.ps1), so this rarely fires; it
  # is a git-tag safety net. Publishing the same package to an IMMUTABLE registry
  # (NuGet/npm/ADO Artifact Feed) is safe precisely because the version is unique.
  if (git tag --list $tag) { Write-Host "immutable: $tag exists, skipping"; continue }
  git tag $tag
  git push origin $tag
  $ghArgs = @($tag, "out/packages/$($m.components[$name].package)", '--title', $tag, '--notes', "$($m.appName) $name $ver")
  if ($ver -match '-') { $ghArgs += '--prerelease' }
  gh release create @ghArgs
}

# deploy + app tags are the DEFAULT branch's job only: they anchor
# deployToolVersion and the previous-appVersion lookup, which stay on stable
# versions (a feature branch must not write a prerelease <APP_NAME>-app@).
if ($isDefault) {
  $deployTag = "<APP_NAME>-deploy@$($m.deployToolVersion)"
  if (git tag --list $deployTag) { Write-Host "immutable: $deployTag exists, skipping" }
  else {
    git tag $deployTag
    git push origin $deployTag
    gh release create $deployTag "out/packages/$($m.appName)-deploy@$($m.deployToolVersion).zip" --title $deployTag --notes "$($m.appName) deploy $($m.deployToolVersion)"
  }
  $appTag = "<APP_NAME>-app@$($m.appVersion)"
  if (git tag --list $appTag) { Write-Host "immutable: $appTag exists, skipping" }
  else { git tag $appTag; git push origin $appTag }
}
