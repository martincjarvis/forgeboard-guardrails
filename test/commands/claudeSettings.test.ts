import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeClaudeSettings } from "../../src/install/claudeSettings.ts";

const CLI = "/toolkit/src/cli.ts";

function read(dir: string): any {
  return JSON.parse(
    readFileSync(join(dir, ".claude", "settings.json"), "utf8"),
  );
}

test("writes both hook entries into a fresh settings file", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-cs-"));
  writeClaudeSettings(dir, CLI);
  const settings = read(dir);
  assert.equal(settings.hooks.PostToolUse[0].matcher, "Edit|Write|MultiEdit");
  assert.match(
    settings.hooks.PostToolUse[0].hooks[0].command,
    /agent-hook post-edit/,
  );
  assert.match(
    settings.hooks.Stop[0].hooks[0].command,
    /agent-hook task-complete/,
  );
  rmSync(dir, { recursive: true, force: true });
});

test("merge preserves a pre-existing unrelated hook", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-cs-merge-"));
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(
    join(dir, ".claude", "settings.json"),
    JSON.stringify({
      hooks: {
        PostToolUse: [
          { matcher: "Bash", hooks: [{ type: "command", command: "echo hi" }] },
        ],
      },
    }),
  );
  writeClaudeSettings(dir, CLI);
  const settings = read(dir);
  const commands = settings.hooks.PostToolUse.flatMap((e: any) =>
    e.hooks.map((h: any) => h.command),
  );
  assert.ok(commands.includes("echo hi"));
  assert.ok(commands.some((c: string) => /agent-hook post-edit/.test(c)));
  rmSync(dir, { recursive: true, force: true });
});

test("re-install does not duplicate our entries", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-cs-idem-"));
  writeClaudeSettings(dir, CLI);
  writeClaudeSettings(dir, CLI);
  const settings = read(dir);
  const postEdit = settings.hooks.PostToolUse.flatMap((e: any) =>
    e.hooks.map((h: any) => h.command),
  ).filter((c: string) => /agent-hook post-edit/.test(c));
  assert.equal(postEdit.length, 1);
  rmSync(dir, { recursive: true, force: true });
});
