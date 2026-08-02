#!/usr/bin/env bash
# Codifies the three real, per-agent mechanisms for disabling specific skills/plugins
# for a single controlled run — discovered live against this container's original
# project, after an assumed mechanism turned out not to exist for two of the three
# agents. None of the three agents share a common toggle mechanism or even the same
# *kind* of mechanism — this script exists so nobody has to rediscover that fact, or
# any of the three, again.
#
# Usage:
#   toggle-skills.sh claude off <plugin@marketplace> [<plugin@marketplace> ...]
#     Prints a --settings JSON string to stdout. Scoped to ONE invocation — pass it
#     directly: claude -p "..." --settings "$(toggle-skills.sh claude off superpowers@claude-plugins-official)"
#     Confirmed sufficient on its own for superpowers (Task 1 Step 2) — no
#     `claude plugin disable`/`enable` fallback needed, unlike ponytail in Experiment 9.
#
#   toggle-skills.sh opencode off <target-dir> [<skill-name> ...]
#     Writes a project-level opencode.json into <target-dir> with permission.skill deny
#     rules for the given skill names. Scoped to whatever directory OpenCode is run from
#     — confirmed live that a project-level `plugin` array does NOT override the global
#     one (they merge), so this denies by *skill name*, not by removing a plugin entry.
#     Skill names are superpowers' real, bare names (NOT `superpowers-`-prefixed,
#     confirmed live) — pass `superpowers` as shorthand for all 14 real skill names, or
#     name specific ones directly.
#     `--pure` (disables ALL external plugins) was considered and rejected as a
#     substitute: it also silently disables ponytail/claude-mem/context-mode, changing
#     what's actually being controlled.
#
#   toggle-skills.sh agy off <plugin-name> [<plugin-name> ...]
#     Runs `agy plugin disable <name>` directly. Unlike the other two, this is a
#     STATEFUL, GLOBAL toggle (agy plugin enable/disable), not scoped to one invocation
#     — it persists until you run `toggle-skills.sh agy on <plugin-name>` again. Operates
#     on whole plugins (agy has no finer-grained per-skill permission system like
#     OpenCode's).
#
# All three "on" variants reverse their matching "off" variant exactly.

set -euo pipefail

SUPERPOWERS_SKILLS=(
  brainstorming dispatching-parallel-agents executing-plans
  finishing-a-development-branch receiving-code-review requesting-code-review
  subagent-driven-development systematic-debugging test-driven-development
  using-git-worktrees using-superpowers verification-before-completion
  writing-plans writing-skills
)

usage() {
  echo "Usage:" >&2
  echo "  $0 claude   <on|off> <plugin@marketplace> [...]" >&2
  echo "  $0 opencode <on|off> <target-dir> [<skill-name>|superpowers ...]" >&2
  echo "  $0 agy      <on|off> <plugin-name> [...]" >&2
  exit 1
}

[ $# -ge 3 ] || usage
agent="$1"; state="$2"; shift 2

case "$agent" in
  claude)
    [ "$state" = "on" ] || [ "$state" = "off" ] || usage
    enabled="false"; [ "$state" = "on" ] && enabled="true"
    entries=""
    for plugin in "$@"; do
      entries="${entries:+$entries,}\"$plugin\":$enabled"
    done
    echo "{\"enabledPlugins\":{$entries}}"
    ;;

  opencode)
    [ "$state" = "on" ] || [ "$state" = "off" ] || usage
    [ $# -ge 1 ] || usage
    target_dir="$1"; shift
    mkdir -p "$target_dir"
    action="allow"; [ "$state" = "off" ] && action="deny"

    names=()
    for name in "$@"; do
      if [ "$name" = "superpowers" ]; then
        names+=("${SUPERPOWERS_SKILLS[@]}")
      else
        names+=("$name")
      fi
    done

    {
      echo '{'
      echo '  "$schema": "https://opencode.ai/config.json",'
      echo '  "permission": {'
      echo '    "skill": {'
      echo '      "*": "allow"'
      for name in "${names[@]}"; do
        echo "      ,\"$name\": \"$action\""
      done
      echo '    }'
      echo '  }'
      echo '}'
    } > "$target_dir/opencode.json"
    echo "Wrote $target_dir/opencode.json (${#names[@]} skill(s) set to '$action')" >&2
    ;;

  agy)
    [ "$state" = "on" ] || [ "$state" = "off" ] || usage
    [ $# -ge 1 ] || usage
    subcmd="disable"; [ "$state" = "on" ] && subcmd="enable"
    for plugin in "$@"; do
      agy plugin "$subcmd" "$plugin"
      echo "agy plugin $subcmd $plugin" >&2
    done
    ;;

  *)
    usage
    ;;
esac
