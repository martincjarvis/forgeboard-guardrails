#!/usr/bin/env node
// Gate 0 — Session start. Fires when a session (or task) begins.
//
// `AGENTS.md`'s "before starting any work" is prose an agent already skipped
// once, spending its whole run discovering that a fresh worktree has no
// `node_modules` and committing nothing. This hook makes gate 0 fire on its
// own at the moment that matters, surfacing the baseline cheaply so the
// cheap failures are caught before any work starts.
//
// Non-blocking at the hook: it prints what gate 0 found and the command that
// fixes each, and lets the operator decide. Never auto-rebase — a rebase
// under an agent holding uncommitted work is destructive, which is gate 0's
// own stated reason for reporting instead of acting.
//
// Cheap by design. The signals that actually caused failures — behind base,
// dirty tree, missing `node_modules` — cost milliseconds; the build and the
// full suite do not, so they are reported as a named skip rather than run
// synchronously. See docs/standards/guardrails/gate-0-baseline.md (and the
// --quick mode of scripts/gate-0-baseline.mjs) for what runs and what is
// deferred.
//
// Exit 0 always. A baseline finding here is a prompt, not a block.
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// The hook ships with the plugin; gate-0-baseline.mjs is its sibling under
// scripts/. Resolved from this file's own location, never a machine-specific
// path. The script runs against the repository the agent is working in
// (process.cwd()); its own git/npm calls target that cwd, wherever the script
// itself lives.
const HOOK_DIR = dirname(fileURLToPath(import.meta.url));
const GATE_0 = join(HOOK_DIR, "..", "scripts", "gate-0-baseline.mjs");

const r = spawnSync(process.execPath, [GATE_0, "--quick"], {
  cwd: process.cwd(),
  encoding: "utf8",
});

// Surface everything gate 0 wrote — skips, FAIL lines, remedies — exactly as
// gate 0 emitted it, then a one-line prompt that this is the start hook and is
// non-blocking. An exit code from gate 0 is deliberately not propagated: a
// baseline finding stops a human who reads it, not the session that just began.
if (r.stdout) process.stderr.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
if (r.error) {
  process.stderr.write(
    `gate 0: could not run the baseline — ${r.error.message}\n`,
  );
}
process.stderr.write(
  "gate 0 (session start): the above is the quick baseline (behind base, clean tree, node_modules). " +
    "Rebase is yours to run, never automatic. Run `npm run gate:0` for the full build and test suite.\n",
);

process.exit(0);
