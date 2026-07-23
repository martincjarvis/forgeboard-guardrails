import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMarkdownLint } from "../../src/gates/markdownLint.ts";

test("passes on a clean markdown file", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-md-lint-"));
  writeFileSync(join(dir, "README.md"), "# Title\n\nBody text.\n");

  const result = runMarkdownLint(["README.md"], dir);
  assert.equal(result.pass, true);
});

test("fails on a markdown file with multiple top-level headings", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-md-lint-"));
  writeFileSync(join(dir, "README.md"), "# Title\n\n# Another Title\n");

  const result = runMarkdownLint(["README.md"], dir);
  assert.equal(result.pass, false);
});

test("a long prose line passes when a .markdownlint.jsonc disables MD013", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-md-long-"));
  writeFileSync(join(dir, ".markdownlint.jsonc"), '{ "MD013": false }\n');
  const longLine = "word ".repeat(60).trim();
  writeFileSync(join(dir, "doc.md"), `# Title\n\n${longLine}\n`);

  const result = runMarkdownLint(["doc.md"], dir);

  assert.equal(result.pass, true);
});

test("the same long line fails without the config, proving MD013 is what the config disables", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-md-long-off-"));
  const longLine = "word ".repeat(60).trim();
  writeFileSync(join(dir, "doc.md"), `# Title\n\n${longLine}\n`);

  const result = runMarkdownLint(["doc.md"], dir);

  assert.equal(result.pass, false);
});
