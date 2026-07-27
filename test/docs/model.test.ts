import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMarkdown } from "../../src/docs/model.ts";

test("extracts links outside code, and ignores links inside a fenced block", () => {
  const src = [
    "# Title",
    "",
    "See [real](./a.md) and [anchored](./b.md#some-heading).",
    "",
    "````markdown",
    "[example](./not-a-real-link.md)",
    "```typescript",
    "const x = 1;",
    "```",
    "````",
    "",
    "Tail [after](./c.md).",
  ].join("\n");

  const model = parseMarkdown(src);
  const targets = model.links.map((l) => l.target);

  assert.deepEqual(targets, ["./a.md", "./b.md", "./c.md"]);
  assert.equal(model.links[1].fragment, "some-heading");
  assert.equal(model.links[0].fragment, undefined);
});

test("derives GitHub slugs for headings, including punctuation", () => {
  const src = ["## Phase → state mapping", "", "### PII rule"].join("\n");
  const model = parseMarkdown(src);
  assert.deepEqual(
    model.headings.map((h) => h.slug),
    ["phase--state-mapping", "pii-rule"],
  );
});

test("parses frontmatter into a key map, and reports its absence", () => {
  const withFm = [
    "---",
    "type: reference",
    "summary: A line.",
    "---",
    "",
    "# T",
  ].join("\n");
  assert.deepEqual(parseMarkdown(withFm).frontmatter, {
    type: "reference",
    summary: "A line.",
  });
  assert.equal(parseMarkdown("# T").frontmatter, undefined);
});

test("records the character range of each link node", () => {
  const src = "Prose [x](./a.md) more.";
  const [link] = parseMarkdown(src).links;
  assert.equal(src.slice(link.start, link.end), "[x](./a.md)");
});

test("collects inline code spans", () => {
  const model = parseMarkdown("Run `src/gates/prSize.ts` now.");
  assert.deepEqual(
    model.codeSpans.map((c) => c.value),
    ["src/gates/prSize.ts"],
  );
});

test("records the character range of every fenced and indented code block", () => {
  // Documentation about a suppression is not a suppression. Every plan and ADR in
  // this programme quotes markers inside fences, so a scanner that cannot tell
  // prose from code reports the documentation as the offence.
  const src = [
    "Prose mentioning nosemgrep in passing.",
    "",
    "```ts",
    "// nosemgrep: some.rule.id",
    "```",
    "",
    "Tail.",
  ].join("\n");

  const model = parseMarkdown(src);
  assert.equal(model.codeBlocks.length, 1);

  const [block] = model.codeBlocks;
  const inside = src.indexOf("// nosemgrep");
  assert.ok(
    inside > block.start && inside < block.end,
    "the fenced marker must fall inside the recorded range",
  );
  assert.ok(
    src.indexOf("Prose mentioning") < block.start,
    "prose before the fence must fall outside it",
  );
});
