#!/usr/bin/env bash
# Background daemon: repairs a credential-persistence symlink the instant an agent's own
# write replaces it with a plain file. Confirmed live 2026-07-25: Claude Code's
# `.credentials.json` gets replaced outright (an atomic rename over the symlink path,
# not a write through it) on *every* write — both `claude auth login` and its own
# background OAuth-refresh cycle — which silently orphans the persisted volume after the
# very first refresh (a routine, roughly-hourly event for a long-lived container), well
# before any deliberate container rebuild. A one-shot re-link in
# setup-credential-persistence.sh (postCreateCommand/postStartCommand) only runs at
# container start, so it can't catch this mid-session — hence a real, always-running
# watcher instead of a periodic poll.
#
# OpenCode's `auth.json` (a static Z.AI API key, not an OAuth access/refresh pair) and
# agy's `antigravity-oauth-token` (real Google OAuth, architecturally the same
# refresh-rotation risk as Claude's, even though it hasn't been observed breaking yet)
# are watched too, on the same mechanism, for the same reason.
set -u

# Guard against duplicate instances: postStartCommand runs on every container start
# (not just first creation), so a naive background launch would stack a new watcher on
# top of any still-running one from a prior start. /tmp is container-local and resets
# naturally on a real recreate, so a stale PID here only ever refers to this same
# container's own prior process, never a different container's.
PIDFILE="/tmp/credential-watcher.pid"
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "[credential-watcher] already running (pid $(cat "$PIDFILE")), not starting another"
  exit 0
fi
echo $$ > "$PIDFILE"

repair() {
  local store_file="$1" target="$2"
  if [ -e "$target" ] && [ ! -L "$target" ]; then
    cp "$target" "$store_file" && rm -f "$target" && ln -sfn "$store_file" "$target"
    echo "[credential-watcher] repaired: $target -> $store_file"
  fi
}

watch_and_repair() {
  local watch_dir="$1" filename="$2" store_file="$3" target="$4"
  mkdir -p "$watch_dir"
  inotifywait -m -e create -e moved_to -e close_write --format '%f' "$watch_dir" 2>/dev/null |
  while read -r changed; do
    [ "$changed" = "$filename" ] || continue
    repair "$store_file" "$target"
  done
}

watch_and_repair "$HOME/.claude" ".credentials.json" \
  "$HOME/.claude-credential-store/.credentials.json" "$HOME/.claude/.credentials.json" &

watch_and_repair "$HOME/.local/share/opencode" "auth.json" \
  "$HOME/.opencode-credential-store/auth.json" "$HOME/.local/share/opencode/auth.json" &

watch_and_repair "$HOME/.gemini/antigravity-cli" "antigravity-oauth-token" \
  "$HOME/.agy-credential-store/antigravity-oauth-token" "$HOME/.gemini/antigravity-cli/antigravity-oauth-token" &

wait
