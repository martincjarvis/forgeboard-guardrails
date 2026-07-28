#!/usr/bin/env bash
# Starts a real container from a profile image built by build-profiles.sh, for an
# orchestrator to dispatch a classified task into. Bypasses the devcontainer CLI (which
# only reads one fixed devcontainer.json) in favor of a plain `docker run` with the same
# mounts/lifecycle steps applied by hand — real feature parity except one known,
# accepted gap: the dotnet/python devcontainer *features* only apply through the real
# devcontainer CLI's build pipeline, not a bare `docker build`/`docker run` (the same
# gap `validate-stack.sh`'s own dotnet check already documents for standalone builds).
#
# Credential-store volumes are SHARED across every profile (same real identity/auth
# regardless of which profile is running). The config/data volumes that can hold
# profile-divergent *baked* content are NOT shared -- confirmed live 2026-07-25 that a
# shared opencode-config volume silently shadows a differently-configured image's own
# opencode.json after its first-ever creation (the exact bug reconcile-opencode-
# plugins.sh exists to catch on a *single* image; running multiple genuinely different
# profiles against one shared volume would hit it on every profile switch, not just
# once). Each profile therefore gets its own suffixed set of those volumes.
#
# Usage: bash .devcontainer/run-profile.sh <profile-name> [container-name]

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Git Bash on Windows rewrites absolute-looking container paths (e.g. this script's own
# -w target) as if they were host paths -- confirmed live throughout this project
# (docker exec/cp hit the identical issue). A no-op on real Linux/macOS shells.
export MSYS_NO_PATHCONV=1

IMAGE_NAME="mcpeval-agent-stack"
WORKSPACE_MOUNT="/workspaces/$(basename "$(pwd)")"

profile="${1:-}"
[ -n "$profile" ] || { echo "Usage: $0 <profile-name> [container-name]" >&2; exit 1; }
container_name="${2:-mcpeval-agent-stack-$profile}"

image="$IMAGE_NAME:$profile"
if ! docker image inspect "$image" > /dev/null 2>&1; then
  echo "Image $image not found — build it first: bash .devcontainer/build-profiles.sh $profile" >&2
  exit 1
fi

docker run -d \
  --name "$container_name" \
  --mount "type=bind,source=$(pwd),target=$WORKSPACE_MOUNT,consistency=cached" \
  --mount "type=volume,source=claude-code-credential-store,target=/home/vscode/.claude-credential-store" \
  --mount "type=volume,source=opencode-credential-store,target=/home/vscode/.opencode-credential-store" \
  --mount "type=volume,source=agy-credential-store,target=/home/vscode/.agy-credential-store" \
  --mount "type=volume,source=opencode-config-$profile,target=/home/vscode/.config/opencode" \
  --mount "type=volume,source=claude-mem-data-$profile,target=/home/vscode/.claude-mem" \
  --mount "type=volume,source=context-mode-data-$profile,target=/home/vscode/.claude/context-mode" \
  --mount "type=volume,source=qmd-cache-$profile,target=/home/vscode/.cache/qmd" \
  --mount "type=volume,source=qmd-config-$profile,target=/home/vscode/.config/qmd" \
  -w "$WORKSPACE_MOUNT" \
  "$image" \
  sleep infinity

echo "Started $container_name from $image."

docker exec "$container_name" bash -c "
  cd '$WORKSPACE_MOUNT' &&
  git config --global --add safe.directory '$WORKSPACE_MOUNT' &&
  bash .devcontainer/setup-credential-persistence.sh &&
  bash .devcontainer/reconcile-opencode-plugins.sh &&
  nohup bash .devcontainer/credential-watcher.sh > /tmp/credential-watcher.log 2>&1 &
"

echo "Ready. Dispatch into it with: docker exec $container_name <agent-command>"
echo "Tear down with: docker rm -f $container_name (credential/data volumes persist; workspace is bind-mounted, not a copy)"
