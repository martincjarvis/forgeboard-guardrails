#!/usr/bin/env node
// Gate 1 — Edit. Fires after a file is written.
//
// Two checks with deliberately opposite verdicts: the formatter never fails an
// edit, the security scan does — and only for a file git already tracks.
// See docs/standards/guardrails/gate-1-edit.md.
//
// Exit 0 lets the edit stand. Exit 2 fails it.
import { existsSync } from "node:fs";
import { run, git, have, readEvent } from "./lib/run.mjs";

const event = await readEvent();
const path = event?.tool_input?.file_path;
if (!path || !existsSync(path)) process.exit(0);

// Check 1 — format. Best effort: a formatter fault must not stop work in
// progress, so every failure here is swallowed deliberately.
if (have("npx", ["--no-install", "prettier", "--version"])) {
  run("npx", ["--no-install", "prettier", "--write", path], {
    stdio: "ignore",
  });
}

// Check 2 — security, tracked files only. An untracked file is a scratch or a
// spike; it is caught at the commit gate the moment it is staged.
const tracked = git(["ls-files", "--error-unmatch", path]);
if (tracked.status !== 0) process.exit(0);

if (have("npx", ["--no-install", "secretlint", "--version"])) {
  // JSON output lets a real finding be told apart from a tool or config error:
  // secretlint emits a JSON array of messages when it finds something, and a
  // stack trace when it cannot run. An error is not a breach, and a gate never
  // claims one the scan did not establish (cross-gate rules).
  const scan = run("npx", [
    "--no-install",
    "secretlint",
    "--format",
    "json",
    path,
  ]);
  if (scan.status !== 0) {
    let messages;
    try {
      const parsed = JSON.parse(scan.stdout);
      messages = Array.isArray(parsed) ? parsed : (parsed?.messages ?? null);
    } catch {
      messages = null;
    }
    if (Array.isArray(messages) && messages.length > 0) {
      process.stderr.write(`gate 1: security finding in ${path}\n`);
      process.stderr.write(`${JSON.stringify(messages, null, 2)}\n`);
      process.exit(2);
    }
    process.stderr.write(
      `gate 1: secret scan unavailable for ${path} — secretlint did not complete cleanly ` +
        `(not a confirmed finding); gate 2 re-checks at commit\n`,
    );
    process.stderr.write(`${scan.stdout || ""}${scan.stderr || ""}\n`);
  }
} else {
  // A tool that is not installed is reported as unavailable, never as a pass.
  process.stderr.write(
    `gate 1: secret scan unavailable — secretlint is not installed, so ${path} was not scanned\n`,
  );
}

process.exit(0);
