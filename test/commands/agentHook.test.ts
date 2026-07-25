import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAgentHook } from "../../src/commands/agentHook.ts";

test("dispatches post-edit and formats the file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-ah-"));
  const file = join(dir, "a.ts");
  writeFileSync(file, "const x=1\n");
  const stdin = JSON.stringify({ tool_input: { file_path: file } });
  const code = await runAgentHook("post-edit", dir, stdin);
  assert.equal(code, 0);
  assert.equal(readFileSync(file, "utf8"), "const x = 1;\n");
  rmSync(dir, { recursive: true, force: true });
});

test("unknown agent-hook name returns 1", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-ah-bad-"));
  assert.equal(await runAgentHook("nope", dir, ""), 1);
  rmSync(dir, { recursive: true, force: true });
});
