// The toolkit's own gate: templates parse, skills are well-formed, links hold.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

const stripJsonc = (s) =>
  s.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1");

test("JSON and JSONC templates parse", () => {
  const files = [
    "templates/guardrails.json",
    "templates/node/lintstagedrc.json",
    "templates/node/prettierrc.json",
    "templates/node/cspell.json",
    "templates/node/secretlintrc.json",
    "templates/node/markdownlint-cli2.jsonc",
    ".guardrails.json",
  ];
  for (const f of files) {
    const raw = readFileSync(join(root, f), "utf8");
    assert.doesNotThrow(() => JSON.parse(stripJsonc(raw)), `${f} must parse`);
  }
});

test("guardrails.json template covers every capability in docs/standards.md", () => {
  const template = JSON.parse(
    readFileSync(join(root, "templates/guardrails.json"), "utf8"),
  );
  const standards = readFileSync(join(root, "docs/standards.md"), "utf8");
  const capabilities = [...standards.matchAll(/^\| `([a-z-]+)`/gm)].map(
    (m) => m[1],
  );
  assert.ok(capabilities.length >= 10, "standards must list the capabilities");
  for (const c of capabilities) {
    assert.ok(c in template, `template missing capability: ${c}`);
  }
});

test("every SKILL.md has frontmatter with name and description", () => {
  for (const dir of readdirSync(join(root, "skills"))) {
    const path = join(root, "skills", dir, "SKILL.md");
    const text = readFileSync(path, "utf8");
    const fm = text.match(/^---\n([\s\S]*?)\n---/);
    assert.ok(fm, `${dir}/SKILL.md missing frontmatter`);
    assert.match(fm[1], /^name: /m, `${dir} frontmatter missing name`);
    assert.match(fm[1], /^description: /m, `${dir} missing description`);
  }
});

// Link integrity is markdownlint's job now: markdownlint-rule-relative-links
// in .markdownlint-cli2.jsonc, which runs at commit and in the verify sweep.
