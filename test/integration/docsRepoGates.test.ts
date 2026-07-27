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
import { runDocsRepoGate } from "../../src/gates/docsRepoGates.ts";

function repo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "gr-docs-"));
  for (const [rel, body] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  }
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["add", "-A"], { cwd: dir });
  return dir;
}

test("a dead link with no basename match is reported", () => {
  const dir = repo({ "a.md": "[x](./gone.md)\n" });
  const { problems } = runDocsRepoGate(dir, []);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /a\.md/);
  assert.match(problems[0], /gone\.md/);
  rmSync(dir, { recursive: true, force: true });
});

test("a unique basename match is repaired when the file is staged", () => {
  const dir = repo({ "a.md": "[x](./old/t.md)\n", "new/t.md": "# T\n" });
  const { fixes, problems } = runDocsRepoGate(dir, ["a.md"], { fix: true });
  assert.deepEqual(problems, []);
  assert.equal(fixes.length, 1);
  assert.match(readFileSync(join(dir, "a.md"), "utf8"), /\(new\/t\.md\)/);
  rmSync(dir, { recursive: true, force: true });
});

test("a fixable link in an UNSTAGED file is reported, never rewritten", () => {
  const dir = repo({ "a.md": "[x](./old/t.md)\n", "new/t.md": "# T\n" });
  const before = readFileSync(join(dir, "a.md"), "utf8");
  const { problems, fixes } = runDocsRepoGate(dir, [], { fix: true });
  assert.deepEqual(fixes, []);
  assert.equal(problems.length, 1);
  assert.equal(readFileSync(join(dir, "a.md"), "utf8"), before);
  rmSync(dir, { recursive: true, force: true });
});

test("an ambiguous basename blocks and lists the candidates", () => {
  const dir = repo({
    "a.md": "[x](./gone/n.md)\n",
    "p/n.md": "#\n",
    "q/n.md": "#\n",
  });
  const { problems } = runDocsRepoGate(dir, ["a.md"], { fix: true });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /p\/n\.md/);
  assert.match(problems[0], /q\/n\.md/);
  rmSync(dir, { recursive: true, force: true });
});

test("a dead anchor is reported with the closest slug", () => {
  const dir = repo({
    "a.md": "[x](./b.md#done)\n",
    "b.md": "## Done & dusted\n",
  });
  const { problems } = runDocsRepoGate(dir, []);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /done--dusted/);
  rmSync(dir, { recursive: true, force: true });
});

test("a fix rewrites only the link node, never matching text elsewhere", () => {
  const dir = repo({
    "a.md": [
      "[real](./old/t.md)",
      "",
      "````markdown",
      "[example](./old/t.md)",
      "````",
      "",
      "Prose mentioning (./old/t.md literally.",
    ].join("\n"),
    "new/t.md": "# T\n",
  });
  runDocsRepoGate(dir, ["a.md"], { fix: true });
  const after = readFileSync(join(dir, "a.md"), "utf8");
  assert.match(after, /\[real\]\(new\/t\.md\)/);
  assert.match(after, /\[example\]\(\.\/old\/t\.md\)/); // fenced example untouched
  assert.match(after, /Prose mentioning \(\.\/old\/t\.md literally\./); // prose untouched
  rmSync(dir, { recursive: true, force: true });
});

test("the same broken target twice yields two fixes and two rewrites", () => {
  const dir = repo({
    "a.md": "[one](./old/t.md) and [two](./old/t.md)\n",
    "new/t.md": "# T\n",
  });
  const { fixes } = runDocsRepoGate(dir, ["a.md"], { fix: true });
  assert.equal(fixes.length, 2);
  // Exact content, not a substring count. Applying edits first-first instead of
  // last-first corrupts the second link while still leaving two matches of
  // "new/t.md" in the file, so a count-based assertion passes against a broken
  // write path.
  assert.equal(
    readFileSync(join(dir, "a.md"), "utf8"),
    "[one](new/t.md) and [two](new/t.md)\n",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("a same-file fragment link is validated against its own headings", () => {
  const dir = repo({
    "a.md": "## Real Heading\n\n[up](#real-heading) [bad](#nope)\n",
  });
  const { problems } = runDocsRepoGate(dir, []);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /#nope/);
  rmSync(dir, { recursive: true, force: true });
});

test("a link inside a fenced code block is not checked", () => {
  const dir = repo({ "a.md": "```markdown\n[x](./gone.md)\n```\n" });
  assert.deepEqual(runDocsRepoGate(dir, []).problems, []);
  rmSync(dir, { recursive: true, force: true });
});
