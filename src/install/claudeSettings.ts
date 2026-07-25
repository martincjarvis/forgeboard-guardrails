import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";

interface HookLeaf {
  type: string;
  command: string;
}
interface HookEntry {
  matcher?: string;
  hooks: HookLeaf[];
}
interface Settings {
  hooks?: Record<string, HookEntry[]>;
  [key: string]: unknown;
}

/**
 * Merge our two agent-hook entries into the consumer repo's .claude/settings.json,
 * preserving any user-defined hooks and not duplicating our own on re-install (match
 * on the command string). Creating the file when absent. Idempotent — re-running is a
 * no-op — which A3's idempotent-install AC relies on.
 */
export function writeClaudeSettings(cwd: string, cliPath: string): void {
  const path = join(cwd, ".claude", "settings.json");
  const settings: Settings = existsSync(path)
    ? JSON.parse(readFileSync(path, "utf8"))
    : {};
  settings.hooks ??= {};

  ensureEntry(settings.hooks, "PostToolUse", {
    matcher: "Edit|Write|MultiEdit",
    hooks: [command(`npx tsx "${cliPath}" agent-hook post-edit`)],
  });
  ensureEntry(settings.hooks, "Stop", {
    hooks: [command(`npx tsx "${cliPath}" agent-hook task-complete`)],
  });

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(settings, null, 2) + "\n");
}

function command(cmd: string): HookLeaf {
  return { type: "command", command: cmd };
}

/** Append `entry` under `event` unless an entry with the same command already exists. */
function ensureEntry(
  hooks: Record<string, HookEntry[]>,
  event: string,
  entry: HookEntry,
): void {
  const list = (hooks[event] ??= []);
  const ourCommand = entry.hooks[0].command;
  const present = list.some((e) =>
    e.hooks?.some((h) => h.command === ourCommand),
  );
  if (!present) list.push(entry);
}
