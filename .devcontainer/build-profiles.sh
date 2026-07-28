#!/usr/bin/env bash
# Builds a small, evidence-backed set of tagged images, each pre-configured with the
# plugin combination this project's own eval harness found appropriate for a real task
# archetype (docs/mcp-tooling-evaluation.md, Experiment 11's delivery-mode results, and
# CLAUDE.md's summary of both) — for an orchestrator to pick from by task type rather
# than negotiate plugin state at runtime.
#
# Deliberately a small, curated set, not one image per ARG combination (5 ARGs would be
# 32 combinations, almost all of them not corresponding to a real task archetype).
# ponytail and superpowers are the only two ARGs that actually differ across profiles:
# both have a *demonstrated* cost tax/multiplier on tasks that don't need them
# (Experiment 9: ponytail +22.5% cost on a small task; Experiment 11: full
# subagent-driven-development 9-16x more expensive than ad hoc, for identical
# correctness) — the others (context-mode/RTK wiring) showed no such tax and stay on
# throughout. claude-mem differs once, since its own benefit is specifically about
# cross-session continuity, which a one-shot minimal task has no use for.
#
# Usage: bash .devcontainer/build-profiles.sh [profile-name ...]
#   No arguments: builds all profiles.
#   One or more names: builds just those (must match a name below).

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

IMAGE_NAME="mcpeval-agent-stack"

# name:INSTALL_PONYTAIL:INSTALL_SUPERPOWERS:INSTALL_CLAUDE_MEM
PROFILES=(
  "minimal:false:false:false"
  "standard:false:true:true"
  "over-build-guard:true:true:true"
  "full:true:true:true"
)

profile_names() {
  for p in "${PROFILES[@]}"; do echo "${p%%:*}"; done
}

build_one() {
  local spec="$1"
  local name ponytail superpowers claude_mem
  IFS=':' read -r name ponytail superpowers claude_mem <<< "$spec"
  echo "=== Building profile '$name' (ponytail=$ponytail superpowers=$superpowers claude-mem=$claude_mem) ==="
  docker build \
    --target full \
    --build-arg "INSTALL_PONYTAIL=$ponytail" \
    --build-arg "INSTALL_SUPERPOWERS=$superpowers" \
    --build-arg "INSTALL_CLAUDE_MEM=$claude_mem" \
    -t "$IMAGE_NAME:$name" \
    -f .devcontainer/Dockerfile .
  echo "=== Done: $IMAGE_NAME:$name ==="
}

if [ $# -eq 0 ]; then
  requested=($(profile_names))
else
  requested=("$@")
fi

for name in "${requested[@]}"; do
  found=0
  for spec in "${PROFILES[@]}"; do
    if [ "${spec%%:*}" = "$name" ]; then
      build_one "$spec"
      found=1
      break
    fi
  done
  if [ "$found" -eq 0 ]; then
    echo "Unknown profile: $name (known: $(profile_names | tr '\n' ' '))" >&2
    exit 1
  fi
done
