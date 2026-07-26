import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { runDocs } from "../../src/commands/docs.ts";

function repo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "gr-docs-command-"));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["add", "-A"], { cwd: dir });
  return dir;
}

test("exits 0 on a clean corpus", () => {
  const dir = repo({ "a.md": "[x](./b.md)\n", "b.md": "# B\n" });
  assert.equal(runDocs(dir, []), 0);
  rmSync(dir, { recursive: true, force: true });
});

test("exits 2 and reports when a link is dead", () => {
  const dir = repo({ "a.md": "[x](./gone.md)\n" });
  assert.equal(runDocs(dir, []), 2);
  rmSync(dir, { recursive: true, force: true });
});

test("--fix repairs across the whole corpus, not just staged files", () => {
  const dir = repo({ "a.md": "[x](./old/t.md)\n", "new/t.md": "# T\n" });
  assert.equal(runDocs(dir, ["--fix"]), 0);
  assert.match(readFileSync(join(dir, "a.md"), "utf8"), /\(new\/t\.md\)/);
  rmSync(dir, { recursive: true, force: true });
});
