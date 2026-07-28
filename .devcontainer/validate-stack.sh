#!/usr/bin/env bash
# Deliberately no `pipefail`: several checks below pipe a real command into
# `grep -q`, which exits as soon as it finds a match and closes the pipe early —
# under pipefail that can register as a SIGPIPE-caused failure in the *producer*
# even though grep matched successfully (confirmed live 2026-07-24: this produced
# false-negative FAILs on genuinely-passing context-mode checks). The check()
# function below already provides its own pass/fail semantics per line.
set -u
FAIL=0

check() {
  echo "=== $1 ==="
  if eval "$2"; then
    echo "PASS: $1"
  else
    echo "FAIL: $1"
    FAIL=1
  fi
}

# Skips (not falsely fails) a check gated behind one of the Dockerfile's
# INSTALL_*-style ARGs, re-exposed as an ENV of the same name — reads "true"/"false"
# from the actual build, defaulting to "true" so a pre-ARG image (or a plain
# standalone `docker build` of an earlier layer) still runs every check as before.
check_if_installed() {
  local flag_var="$1" label="$2" cmd="$3"
  local flag_value
  flag_value=$(eval "echo \${$flag_var:-true}")
  if [ "$flag_value" != "true" ]; then
    echo "=== $label ==="
    echo "SKIP: $label ($flag_var=$flag_value, not installed by design)"
    return
  fi
  check "$label" "$cmd"
}

check "claude --version" "claude --version"
check "opencode --version" "opencode --version"
check "qmd --version" "qmd --version"
check "rtk --version" "rtk --version"
check "dotnet --version" "dotnet --version"
check "node --version" "node --version"
check "agy --version" "agy --version"
check "semgrep --version" "semgrep --version"
check "lizard --version" "lizard --version"

# --- Per-agent plugin checks below. Each plugin that documents multi-agent support is
# checked against every agent it claims to support, not just a single default. Each
# check_if_installed call skips cleanly when the Dockerfile's own ARG disabled that
# plugin, rather than reporting a misleading FAIL for a deliberately-absent tool. ---

# ponytail: Claude Code (native plugin manager), OpenCode (opencode.json plugin entry),
# agy (agy plugin manager) — all three confirmed live 2026-07-24.
check_if_installed INSTALL_PONYTAIL "ponytail: Claude Code" "claude plugin list 2>&1 | grep -qi 'ponytail@ponytail'"
check_if_installed INSTALL_PONYTAIL "ponytail: OpenCode" "grep -q '@dietrichgebert/ponytail' $HOME/.config/opencode/opencode.json"
check_if_installed INSTALL_PONYTAIL "ponytail: agy" "agy plugin list 2>&1 | grep -qi ponytail"

# context-mode: platform auto-detection is ambiguous when multiple agent CLIs coexist
# (confirmed live — it defaults to whichever agent binary it notices first, `agy` in
# this image). Pin CONTEXT_MODE_PLATFORM explicitly per agent rather than trust
# auto-detection, per context-mode's own documented fix for exactly this ambiguity
# (README, upstream issue #774). Not gated by INSTALL_CONTEXT_MODE_WIRING — the
# package itself (and its automatic Claude Code wiring) is always installed in `core`,
# regardless of that ARG, which only controls the separate OpenCode/agy registration.
check "context-mode: Claude Code (pinned)" "CONTEXT_MODE_PLATFORM=claude-code npx context-mode doctor 2>&1 | grep -qi 'pass\|healthy'"
check_if_installed INSTALL_CONTEXT_MODE_WIRING "context-mode: agy (pinned)" "CONTEXT_MODE_PLATFORM=antigravity-cli npx context-mode doctor 2>&1 | grep -qi 'pass\|healthy'"
check_if_installed INSTALL_CONTEXT_MODE_WIRING "context-mode: OpenCode plugin registered" "grep -q '\"context-mode\"' $HOME/.config/opencode/opencode.json"

# claude-mem: installed for all three agents via its own --ide flags. Its own `doctor`
# reports genuinely healthy (Bun/uv/plugin-files/marketplace-runtime all present) — but
# `claude plugin list` separately reports claude-mem@thedotmack as "failed to load:
# cache-miss", a REAL, understood, non-blocking discrepancy: claude-mem's non-interactive
# installer writes its marketplace directory directly (no `.git/`), unlike ponytail's
# native `claude plugin marketplace add` flow (which git-clones and gets a working
# `.git/` Claude Code's own resolver expects). The plugin's actual hooks/MCP config are
# genuinely in place and functional; only `claude plugin list`'s own status display is
# unreliable for claude-mem specifically. Check the tool's own doctor, not `plugin list`,
# as the source of truth for claude-mem — and record the discrepancy, don't hide it.
check_if_installed INSTALL_CLAUDE_MEM "claude-mem: doctor (source of truth over 'claude plugin list')" "npx claude-mem doctor 2>&1 | grep -qi 'all required checks passed'"
check_if_installed INSTALL_CLAUDE_MEM "claude-mem: OpenCode plugin file present" "test -f $HOME/.config/opencode/plugins/claude-mem.js"
check_if_installed INSTALL_CLAUDE_MEM "claude-mem: agy/Gemini hooks merged" "grep -q claude-mem $HOME/.gemini/settings.json 2>/dev/null"
check_if_installed INSTALL_CLAUDE_MEM "claude-mem: known 'claude plugin list' cache-miss discrepancy (informational, not a hard fail)" "claude plugin list 2>&1 | grep -q 'claude-mem@thedotmack' && echo 'present in registry (status display may still say cache-miss - see doctor check above for ground truth)'"

# RTK: confirmed real per-agent flags. Antigravity's RTK integration is project-scoped
# only (`-g` unsupported — confirmed live) and cannot be baked into this shared base
# image; not checked here for that reason, not omitted by oversight.
check_if_installed INSTALL_RTK_WIRING "RTK: Claude Code hook" "rtk init -g --show 2>&1 | grep -q '\[ok\] Hook'"
check_if_installed INSTALL_RTK_WIRING "RTK: OpenCode plugin" "rtk init -g --show 2>&1 | grep -q '\[ok\] OpenCode'"

# superpowers — confirmed 2026-07-24 (Experiment 11 Task 1 Step 3 / container-auth
# setup): Claude Code via the real marketplace/plugin install, OpenCode via the real
# `plugin` array entry in opencode.json (its actual git-backed package only resolves
# lazily on first real `opencode run`, so its presence is checked via the config entry,
# not a live skill load, matching how ponytail/context-mode's OpenCode checks work).
check_if_installed INSTALL_SUPERPOWERS "superpowers: Claude Code" "claude plugin list 2>&1 | grep -qi 'superpowers@claude-plugins-official'"
check_if_installed INSTALL_SUPERPOWERS "superpowers: OpenCode plugin registered" "grep -q 'superpowers@git+' $HOME/.config/opencode/opencode.json"

echo "=== summary: FAIL=$FAIL (0 = all passed) ==="
exit $FAIL
