import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMarkdownLint } from "../../src/gates/markdownLint.ts";

test("passes on a clean markdown file", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-mdlint-"));
  writeFileSync(join(dir, "README.md"), "# Title\n\nBody text.\n");

  const result = runMarkdownLint(["README.md"], dir);
  assert.equal(result.pass, true);
});

test("fails on a markdown file with multiple top-level headings", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-mdlint-"));
  writeFileSync(join(dir, "README.md"), "# Title\n\n# Another Title\n");

  const result = runMarkdownLint(["README.md"], dir);
  assert.equal(result.pass, false);
});
