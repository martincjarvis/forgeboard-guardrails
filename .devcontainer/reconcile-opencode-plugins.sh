#!/usr/bin/env bash
# ~/.config/opencode/ is a persisted named volume (devcontainer.json's "opencode-config"
# mount) — Docker only copies the image's own content into it the *first* time the
# volume is created, empty. Every subsequent container recreation mounts the existing,
# possibly-stale volume over that path instead, silently shadowing whatever the
# Dockerfile's own plugin-wiring RUN steps baked into a *newer* image build (confirmed
# live 2026-07-25: rebuilding the image to add superpowers had no effect on an
# already-provisioned deployment, since the volume still held the pre-superpowers
# opencode.json from when it was first created). Re-applying the same idempotent
# set-union logic here, keyed off the same INSTALL_*-named env vars the Dockerfile
# exposes, keeps the live plugin list in sync with the current image's intent on every
# container start — not just a one-time bake.
set -euo pipefail

CONFIG="$HOME/.config/opencode/opencode.json"
mkdir -p "$(dirname "$CONFIG")"
[ -f "$CONFIG" ] || echo '{}' > "$CONFIG"

reconcile_plugin() {
  local flag_var="$1" entry="$2"
  local want
  want=$(eval "echo \${$flag_var:-true}")
  node -e "
    const fs = require('fs');
    const p = '$CONFIG';
    const entry = '$entry';
    const want = '$want' === 'true';
    let c = {};
    if (fs.existsSync(p)) c = JSON.parse(fs.readFileSync(p, 'utf8'));
    const current = new Set(c.plugin || []);
    if (want) current.add(entry); else current.delete(entry);
    c.plugin = [...current];
    fs.writeFileSync(p, JSON.stringify(c, null, 2));
  "
}

reconcile_plugin INSTALL_PONYTAIL '@dietrichgebert/ponytail'
reconcile_plugin INSTALL_CONTEXT_MODE_WIRING 'context-mode'
reconcile_plugin INSTALL_SUPERPOWERS 'superpowers@git+https://github.com/obra/superpowers.git'

echo "OpenCode plugin config reconciled: $(cat "$CONFIG")"
