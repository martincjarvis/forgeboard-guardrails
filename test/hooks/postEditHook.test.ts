import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPostEditHook } from "../../src/hooks/postEditHook.ts";

function event(filePath: string): string {
  return JSON.stringify({
    hook_event_name: "PostToolUse",
    tool_name: "Edit",
    tool_input: { file_path: filePath },
  });
}

test("formats the edited file and exits 0", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-pe-"));
  const file = join(dir, "a.ts");
  writeFileSync(file, "const x=1\n"); // prettier will reflow to `const x = 1;`
  const code = await runPostEditHook(dir, event(file));
  assert.equal(code, 0);
  assert.equal(readFileSync(file, "utf8"), "const x = 1;\n");
  rmSync(dir, { recursive: true, force: true });
});

test("no-ops (exit 0) on unparseable JSON", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-pe-bad-"));
  assert.equal(await runPostEditHook(dir, "not json"), 0);
  rmSync(dir, { recursive: true, force: true });
});

test("no-ops (exit 0) on a missing file (edit was a delete)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-pe-del-"));
  assert.equal(await runPostEditHook(dir, event(join(dir, "gone.ts"))), 0);
  rmSync(dir, { recursive: true, force: true });
});

test("no-ops (exit 0) on a path outside cwd", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-pe-out-"));
  const outside = mkdtempSync(join(tmpdir(), "gr-pe-elsewhere-"));
  const file = join(outside, "a.ts");
  writeFileSync(file, "const x=1\n");
  assert.equal(await runPostEditHook(dir, event(file)), 0);
  // untouched: still the unformatted original
  assert.equal(readFileSync(file, "utf8"), "const x=1\n");
  rmSync(dir, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});
