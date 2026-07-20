import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPrettierFormat } from "../../src/gates/prettierFormat.ts";

test("formats a badly-formatted JSON file in place", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-prettier-"));
  writeFileSync(join(dir, "a.json"), '{"a":1,"b":2}');

  const result = await runPrettierFormat(["a.json"], dir);

  assert.equal(result.pass, true);
  assert.deepEqual(result.formatted, ["a.json"]);
  const content = readFileSync(join(dir, "a.json"), "utf8");
  assert.match(content, /\n/); // prettier adds newlines/indentation
});

test("ignores an extension prettier does not recognise, without failing", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-prettier-"));
  writeFileSync(join(dir, "a.cs"), "class A {}");

  const result = await runPrettierFormat(["a.cs"], dir);

  assert.equal(result.pass, true);
  assert.deepEqual(result.formatted, []);
});
