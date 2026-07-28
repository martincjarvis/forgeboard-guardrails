#!/bin/sh
# Gate 1 — Edit. Fires after a file is written.
#
# Two checks with deliberately opposite verdicts: the formatter never fails an
# edit, the security scan does — and only for a file git already tracks.
# See docs/standards/guardrails/gate-1-edit.md.
#
# A tool that is not installed is reported as unavailable, never as a pass
# (ADR-0002). Exit 0 lets the edit stand; exit 2 fails it.

set -u
path=$(sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
[ -n "${path:-}" ] || exit 0
[ -f "$path" ] || exit 0

# Check 1 — format. Best effort: a formatter fault must not stop work.
if command -v npx >/dev/null 2>&1; then
  npx --no-install prettier --write "$path" >/dev/null 2>&1 || true
fi

# Check 2 — security, tracked files only.
git ls-files --error-unmatch "$path" >/dev/null 2>&1 || exit 0

if command -v npx >/dev/null 2>&1 && npx --no-install secretlint --version >/dev/null 2>&1; then
  if ! npx --no-install secretlint "$path" >/tmp/gate1.$$ 2>&1; then
    echo "gate 1: security finding in $path" >&2
    cat /tmp/gate1.$$ >&2
    rm -f /tmp/gate1.$$
    exit 2
  fi
  rm -f /tmp/gate1.$$
else
  echo "gate 1: secret scan unavailable — secretlint is not installed, so this file was not scanned" >&2
fi
exit 0
