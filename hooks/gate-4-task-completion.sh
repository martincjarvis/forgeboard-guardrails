#!/bin/sh
# Gate 4 — Task completion. Fires when work is handed back.
#
# Measures the whole branch against its base and reports every finding in one
# pass. See docs/standards/guardrails/gate-4-task-completion.md.
#
# Exit 0 reports; exit 2 blocks the hand-off.

set -u
base=$(git rev-parse --abbrev-ref origin/HEAD 2>/dev/null || echo origin/main)
git rev-parse --verify "$base" >/dev/null 2>&1 || exit 0

findings=0

# Change size — production and configuration lines, added plus deleted.
size=$(git diff --numstat "$base"...HEAD 2>/dev/null \
  | awk '$3 !~ /(^|\/)(test|tests|spec|__tests__)\// && $3 !~ /\.(md|txt)$/ {a+=$1; d+=$2} END {print a+d+0}')
if [ "${size:-0}" -gt 800 ]; then
  if ! git log "$base"..HEAD --format=%B 2>/dev/null | grep -q '\[large-pr\]'; then
    echo "gate 4: change size ${size} lines exceeds the error threshold (800)." >&2
    echo "        Split it, or amend a commit to carry the [large-pr] marker." >&2
    findings=$((findings + 1))
  fi
elif [ "${size:-0}" -gt 400 ]; then
  echo "gate 4: change size ${size} lines is in the warn band (400). Split it, or record why this one is justified." >&2
fi

# File length — production and test files still present on disk.
git diff --name-only --diff-filter=ACMR "$base"...HEAD 2>/dev/null | while read -r f; do
  [ -f "$f" ] || continue
  case "$f" in *.md|*.txt|*.json|*.lock) continue ;; esac
  n=$(wc -l < "$f" 2>/dev/null || echo 0)
  [ "$n" -gt 400 ] && echo "gate 4: $f is $n lines (> 400); split it." >&2
done

[ "$findings" -gt 0 ] && exit 2
exit 0
