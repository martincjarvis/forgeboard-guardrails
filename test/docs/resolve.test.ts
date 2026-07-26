import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTarget } from "../../src/docs/resolve.ts";

const corpus = [
  "docs/ADR/0011-semgrep.md",
  "docs/standards/delivery-workflow.md",
  "docs/projects/0001-x/streams/stream-a.md",
  "docs/dup/notes.md",
  "docs/other/notes.md",
];

test("a target that exists resolves ok", () => {
  const r = resolveTarget(
    "docs/standards/docs-style.md",
    "../ADR/0011-semgrep.md",
    corpus,
  );
  assert.deepEqual(r, { kind: "ok" });
});

test("a moved target with a unique basename is repaired to the new path", () => {
  const r = resolveTarget(
    "docs/standards/docs-style.md",
    "../decisions/0011-semgrep.md",
    corpus,
  );
  assert.deepEqual(r, { kind: "fixed", to: "../ADR/0011-semgrep.md" });
});

test("an ambiguous basename is never guessed", () => {
  const r = resolveTarget("docs/standards/x.md", "../gone/notes.md", corpus);
  assert.deepEqual(r, {
    kind: "ambiguous",
    candidates: ["docs/dup/notes.md", "docs/other/notes.md"],
  });
});

test("a basename matching nothing is dead", () => {
  const r = resolveTarget("docs/standards/x.md", "./no-such-file.md", corpus);
  assert.deepEqual(r, { kind: "dead" });
});

test("a directory target resolves when the corpus contains files beneath it", () => {
  const r = resolveTarget("docs/projects/README.md", "../ADR/", corpus);
  assert.deepEqual(r, { kind: "ok" });
});

test("a target that escapes the repo is left alone, not called dead", () => {
  const r = resolveTarget("README.md", "../OtherRepo/docs/thing.md", corpus);
  assert.deepEqual(r, { kind: "ok" });
});

test("external and mail links are not our business", () => {
  assert.deepEqual(resolveTarget("a.md", "https://example.com", corpus), {
    kind: "ok",
  });
  assert.deepEqual(resolveTarget("a.md", "mailto:x@example.com", corpus), {
    kind: "ok",
  });
});

test("an empty target is a same-file fragment and always resolves", () => {
  assert.deepEqual(resolveTarget("docs/a.md", "", corpus), { kind: "ok" });
});
