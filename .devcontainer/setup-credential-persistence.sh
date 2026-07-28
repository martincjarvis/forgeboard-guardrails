#!/usr/bin/env bash
# 1. Fixes ownership of every named-volume mount point declared in devcontainer.json's
#    "mounts" list — Docker mounts a brand-new named volume as root:root by default,
#    regardless of the container's configured user (confirmed live 2026-07-24: this is
#    not a one-time artifact of reused test volumes, every one of these 8 mount points
#    comes up root-owned the first time a non-root container attaches it, including
#    ones the Dockerfile itself writes into at build time — e.g. context-mode's session
#    directory is created lazily on first real use, not at image-build time, so it
#    doesn't inherit vscode ownership from the image the way a build-time-populated
#    path would). `sudo` here is narrowly scoped to exactly these mount points, matching
#    the "avoid root by default, elevate only where genuinely required" principle this
#    image otherwise follows throughout.
# 2. Symlinks each agent's actual credential file into its own small, dedicated
#    persisted volume, so ONLY the auth token survives a container rebuild for each —
#    not history.jsonl, session transcripts, CLAUDE.md, skills, opencode.db (152MB+ of
#    session/tool-call history on the host, and the same WAL-mode sqlite file that
#    already corrupted once under a naive Windows bind mount earlier in this project),
#    or anything else in each agent's broader config directory.
set -euo pipefail

fix_mount_ownership() {
  local dir="$1"
  [ -d "$dir" ] || sudo mkdir -p "$dir"
  if [ "$(stat -c '%U' "$dir" 2>/dev/null)" != "$(id -un)" ]; then
    sudo chown -R "$(id -u):$(id -g)" "$dir"
    echo "Fixed ownership: $dir (was not owned by $(id -un))"
  fi
}

# Every mount point from devcontainer.json's "mounts" list — kept in sync with that
# file by hand (JSON can't reference this script, and this script can't parse JSONC
# reliably without a real parser); if a mount is added there, add it here too.
for dir in \
  "$HOME/.claude-credential-store" \
  "$HOME/.opencode-credential-store" \
  "$HOME/.claude-mem" \
  "$HOME/.claude/context-mode" \
  "$HOME/.cache/qmd" \
  "$HOME/.config/qmd" \
  "$HOME/.agy-credential-store"
do
  fix_mount_ownership "$dir"
done

link_credential() {
  local store_dir="$1" cred_file="$2" target="$3"
  mkdir -p "$store_dir" "$(dirname "$target")"
  [ -f "$cred_file" ] || echo '{}' > "$cred_file"
  if [ -e "$target" ] && [ ! -L "$target" ]; then
    echo "REFUSING to overwrite a non-symlink $target — investigate before proceeding." >&2
    return 1
  fi
  ln -sfn "$cred_file" "$target"
  echo "Credential persistence: $target -> $cred_file (only this file persists across rebuilds)"
}

# $HOME resolves to whatever user is actually running this script (set by the shell/OS
# itself) — genuinely dynamic, no hardcoded username needed here at all, unlike the
# Dockerfile/devcontainer.json where the value has to exist before any process is
# running to derive it from.
link_credential \
  "$HOME/.claude-credential-store" \
  "$HOME/.claude-credential-store/.credentials.json" \
  "$HOME/.claude/.credentials.json"

link_credential \
  "$HOME/.opencode-credential-store" \
  "$HOME/.opencode-credential-store/auth.json" \
  "$HOME/.local/share/opencode/auth.json"

# agy (Antigravity CLI) — confirmed live 2026-07-24, correcting Experiment 12's original
# assumption: auth is NOT OS-keyring-based on this image. A real login writes a plain
# OAuth token file to ~/.gemini/antigravity-cli/antigravity-oauth-token (that directory
# also holds conversation history/logs/cache, which stays out of persistence on purpose,
# same principle as Claude Code's/OpenCode's broader config dirs).
link_credential \
  "$HOME/.agy-credential-store" \
  "$HOME/.agy-credential-store/antigravity-oauth-token" \
  "$HOME/.gemini/antigravity-cli/antigravity-oauth-token"
