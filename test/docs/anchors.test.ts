import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMarkdown } from "../../src/docs/model.ts";
import { checkAnchor } from "../../src/docs/anchors.ts";

const model = parseMarkdown(
  [
    "## Definition of Done & quality gates",
    "",
    "## Test-integrity requirements",
  ].join("\n"),
);

test("a fragment matching a heading slug is ok", () => {
  assert.deepEqual(checkAnchor("definition-of-done--quality-gates", model), {
    ok: true,
  });
});

test("a shortened fragment fails and names the closest slug", () => {
  assert.deepEqual(checkAnchor("definition-of-done", model), {
    ok: false,
    closest: "definition-of-done--quality-gates",
  });
});

test("a fragment resembling nothing fails without a suggestion", () => {
  assert.deepEqual(checkAnchor("totally-unrelated", model), { ok: false });
});
