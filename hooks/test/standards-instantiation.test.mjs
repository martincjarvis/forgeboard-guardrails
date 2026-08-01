// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis Uncited uncited lede
// Split from hooks.test.mjs (fix 79) — subject group: standards-instantiation.
// Loaded by hooks/test/hooks.test.mjs; not invoked directly by the test runner.
import { test } from "node:test";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  deriveStackList,
  findStackReferencesOutsideList,
  findMultiComponentContent,
  findComponentCountContradiction,
  findRemovalsOutsideEnforcementMap,
} from "../../scripts/check-standards-instantiation.mjs";
import assert from "node:assert/strict";
import { ROOT, git, scratchRepo, runScript } from "./support.mjs";

// --- scripts/check-standards-instantiation.mjs — reference implementation
// for two of the seven "instantiated docs are tuned to the repository"
// checkpoints (docs-style.md#standards-in-a-consuming-repository): a stack
// name outside the derived list, and multi-component content when the
// repository has one component. Fixture-based, not run against this
// toolkit's own docs/standards — that is the canonical corpus, not an
// instantiated copy, and legitimately names every stack it supports.

test("deriveStackList: a repository with only package.json derives node alone, not the stacks it has no manifest for", () => {
  const stacks = deriveStackList([
    "package.json",
    "src/index.ts",
    "docs/README.md",
  ]);
  assert.deepEqual([...stacks], ["node"]);
});

test("deriveStackList: a manifest nested under a path is still found, and an unrelated file with a similar name is not mistaken for one", () => {
  const stacks = deriveStackList(["services/api/go.mod", "go.mod.txt"]);
  assert.deepEqual([...stacks], ["go"]);
});

test("findStackReferencesOutsideList: a stack keyword absent from the derived list is a finding, naming the stack, the keyword and the line", () => {
  const text = "Line one.\nRun `dotnet test` before merging.\n";
  const findings = findStackReferencesOutsideList(text, new Set(["node"]));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].stack, "dotnet");
  assert.equal(findings[0].line, 2);
});

test("findStackReferencesOutsideList: a keyword for a stack that IS in the derived list raises nothing — a repository naming its own tools is not a finding", () => {
  const text = "Run `npm test` before merging.\n";
  const findings = findStackReferencesOutsideList(text, new Set(["node"]));
  assert.deepEqual(findings, []);
});

test("findMultiComponentContent: a multi-component heading is a finding when the repository has one component", () => {
  const text =
    "# Deployment\n\n## Per-component prerelease (no taint)\n\nRules.\n";
  const findings = findMultiComponentContent(text, 1);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 3);
});

test("findMultiComponentContent: the same heading raises nothing once the repository actually has more than one component", () => {
  const text = "## Per-component prerelease (no taint)\n";
  const findings = findMultiComponentContent(text, 3);
  assert.deepEqual(findings, []);
});

// --- findComponentCountContradiction — fix 72. findMultiComponentContent
// above is a heading search; audit 17's demonstrated case (docs/standards/
// deployment-strategy.md, 567 of 568 lines retained) carried its own
// contradiction in the frontmatter `summary` field, which is never a
// Markdown heading, so the heading search read the document as clean.

test("findComponentCountContradiction: a frontmatter summary reading multi-component is a finding when the repository has one component", () => {
  const text =
    "---\ntype: reference\nsummary: How a multi-component app is versioned.\nread_when: Setting up deployment.\n---\n\n# Deployment strategy\n";
  const findings = findComponentCountContradiction(text, 1);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].field, "frontmatter");
  assert.equal(findings[0].line, 3);
});

test("findComponentCountContradiction: a title reading multi-component is a finding, distinct from the frontmatter", () => {
  const text =
    "---\ntype: reference\nsummary: fine\n---\n\n# The multi-component release process\n";
  const findings = findComponentCountContradiction(text, 1);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].field, "title");
});

test("findComponentCountContradiction: raises nothing once the repository actually has more than one component", () => {
  const text =
    "---\nsummary: How a multi-component app is versioned.\n---\n\n# Deployment\n";
  assert.deepEqual(findComponentCountContradiction(text, 3), []);
});

test("findComponentCountContradiction: a lede reading multi-component is a finding, distinct from the frontmatter and the title (fix 81, audit 19's demonstrated case)", () => {
  const text =
    "---\ntype: reference\nsummary: How this repository is packaged and released.\n---\n\n" +
    "# Deployment strategy\n\nHow a multi-component app is versioned per-component, packaged, and deployed.\n";
  const findings = findComponentCountContradiction(text, 1);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].field, "lede");
});

test("findComponentCountContradiction: a clean frontmatter, title and lede raise nothing — body prose past the lede is not scanned", () => {
  const text =
    "---\ntype: reference\nsummary: How this repository is packaged and released.\n---\n\n" +
    "# Deployment strategy\n\nHow this repository is packaged and released, end to end.\n\n" +
    "This further paragraph mentions a multi-component app in passing, describing what the standard used to cover.\n";
  assert.deepEqual(
    findComponentCountContradiction(text, 1),
    [],
    "the offending word sits in a paragraph past the lede, and this check deliberately never reads body prose generally",
  );
});

test("regression guard: findComponentCountContradiction run for real against this toolkit's own docs/standards/deployment-strategy.md, at component count 1, refuses on its frontmatter (fix 72, audit 17's exact case)", () => {
  const text = readFileSync(
    join(ROOT, "docs", "standards", "deployment-strategy.md"),
    "utf8",
  );
  const findings = findComponentCountContradiction(text, 1);
  assert.ok(
    findings.length > 0,
    "deployment-strategy.md's own frontmatter still reads as multi-component; this is the retained-standard defect fix 72 exists to catch, not a false positive",
  );
  assert.equal(findings[0].field, "frontmatter");
});

test("findMultiComponentContent: the phrase inside a paragraph rather than a heading is not a finding — only the section itself is", async (t) => {
  const text = "This paragraph mentions cross-component effects in passing.\n";
  const findings = findMultiComponentContent(text, 1);
  assert.deepEqual(findings, []);
  // findRemovalsOutsideEnforcementMap — fix 53. docs-style.md requires every
  // instantiation removal be recorded "in a PROVENANCE note or a short section
  // of the enforcement map." A bootstrapped repository instead recorded every
  // removal in docs/bootstrap-report.md — a one-time session report — while
  // docs/standards-enforcement.md carried no removal record at all. This does
  // not judge whether the removal's stated reason is honest; only whether it
  // was written down somewhere durable.
  //
  // Nested with awaited t.test(), not a further top-level test() — fix 58. A
  // top-level test() nested inside a running one races the parent's
  // completion instead of being awaited by it, and under load the parent can
  // be marked done before the child reports, which node:test then cancels as
  // "did not finish before its parent". See flaky-tests.md.

  await t.test(
    "findRemovalsOutsideEnforcementMap: a removals heading in a session report with no removals record anywhere durable is refused, naming the report",
    () => {
      const findings = findRemovalsOutsideEnforcementMap({
        reportFiles: [
          {
            path: "docs/bootstrap-report.md",
            text: "## Removals\n\nDropped the .NET rows — no .csproj in this repository.\n",
          },
        ],
        enforcementMapText:
          "# Standards enforcement\n\n| Standard | Enforced by |\n",
        instantiatedDocFiles: [],
      });
      assert.equal(findings.length, 1);
      assert.equal(findings[0].path, "docs/bootstrap-report.md");
      assert.match(
        findings[0].problem,
        /neither the enforcement map nor any instantiated standard/,
      );
    },
  );

  await t.test(
    "findRemovalsOutsideEnforcementMap: the same report raises nothing once the enforcement map carries its own removals section",
    () => {
      const findings = findRemovalsOutsideEnforcementMap({
        reportFiles: [
          {
            path: "docs/bootstrap-report.md",
            text: "## Removals\n\nDropped the .NET rows.\n",
          },
        ],
        enforcementMapText:
          "# Standards enforcement\n\n## Removals\n\nDropped the .NET rows — no .csproj in this repository.\n",
        instantiatedDocFiles: [],
      });
      assert.deepEqual(findings, []);
    },
  );

  await t.test(
    "findRemovalsOutsideEnforcementMap: a PROVENANCE note on the instantiated standard itself also satisfies the requirement",
    () => {
      const findings = findRemovalsOutsideEnforcementMap({
        reportFiles: [
          {
            path: "docs/bootstrap-report.md",
            text: "## Removals\n\nDropped the .NET rows.\n",
          },
        ],
        enforcementMapText: "# Standards enforcement\n",
        instantiatedDocFiles: [
          {
            path: "docs/standards/testing-strategy.md",
            text: "# Testing strategy\n\nBody.\n\n## PROVENANCE\n\nCopied from forgeboard-guardrails; .NET rows dropped, no .csproj here.\n",
          },
        ],
      });
      assert.deepEqual(findings, []);
    },
  );

  await t.test(
    "findRemovalsOutsideEnforcementMap: a report with no removals heading at all is not this check's concern",
    () => {
      const findings = findRemovalsOutsideEnforcementMap({
        reportFiles: [
          {
            path: "docs/bootstrap-report.md",
            text: "## Summary\n\nEverything passed.\n",
          },
        ],
        enforcementMapText: null,
        instantiatedDocFiles: [],
      });
      assert.deepEqual(findings, []);
    },
  );
});

test("regression guard: check-standards-instantiation.mjs run for real, against a scratch tree with a stack reference outside the derived list, refuses and names it", () => {
  // Fix 40 — this script was found ported, unit-tested (the three exported
  // functions above) and never wired: its own isMain block, the shape a
  // consuming repository's gate 7 actually invokes, had never been run by
  // anything in this suite. This exercises that CLI path directly, the same
  // way a consuming repository's own gate 7 would, against a Node-only
  // scratch repository whose docs/standards/ names .NET tooling it has no
  // manifest for — the exact defect class audit 11 measured in the wild.
  const dir = scratchRepo();
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x" }));
  mkdirSync(join(dir, "docs", "standards"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "standards", "testing-strategy.md"),
    "# Testing\n\nRun `dotnet test` before merging.\n",
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-standards-instantiation.mjs", dir);
  assert.equal(
    r.status,
    2,
    "a stack reference outside the derived list must refuse",
  );
  assert.match(
    r.stderr,
    /testing-strategy\.md:3: references dotnet \("dotnet"\) — not in the derived stack list \(node\)/,
  );
  assert.match(r.stderr, /standards instantiation: 1 finding/);
  rmSync(dir, { recursive: true, force: true });
});

test("regression guard: check-standards-instantiation.mjs run for real, against a tuned scratch tree, passes clean", async (t) => {
  const dir = scratchRepo();
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x" }));
  mkdirSync(join(dir, "docs", "standards"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "standards", "testing-strategy.md"),
    "# Testing\n\nRun `npm test` before merging.\n",
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-standards-instantiation.mjs", dir);
  assert.equal(r.status, 0);
  assert.match(r.stderr, /standards instantiation: 0 findings/);
  rmSync(dir, { recursive: true, force: true });

  // Nested with awaited t.test(), not a further top-level test() — fix 58.
  // See flaky-tests.md and the note beside the earlier instance of this
  // pattern in this file.
  await t.test(
    "regression guard: check-standards-instantiation.mjs run for real, against a scratch tree recording a removal only in a session report, refuses and names it (fix 53)",
    () => {
      const dir = scratchRepo();
      writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x" }));
      mkdirSync(join(dir, "docs", "standards"), { recursive: true });
      writeFileSync(
        join(dir, "docs", "standards", "testing-strategy.md"),
        "# Testing\n\nRun `npm test` before merging.\n",
      );
      writeFileSync(
        join(dir, "docs", "bootstrap-report.md"),
        "# Bootstrap report\n\n## Removals\n\nDropped the .NET rows — no .csproj in this repository.\n",
      );
      writeFileSync(
        join(dir, "docs", "standards-enforcement.md"),
        "# Standards enforcement\n\n| Standard | Enforced by |\n| --- | --- |\n",
      );
      git(dir, ["add", "-A"]);
      const r = runScript("scripts/check-standards-instantiation.mjs", dir);
      assert.equal(r.status, 2);
      assert.match(r.stderr, /docs\/bootstrap-report\.md/);
      assert.match(
        r.stderr,
        /neither the enforcement map nor any instantiated standard/,
      );
      rmSync(dir, { recursive: true, force: true });
    },
  );

  await t.test(
    "regression guard: check-standards-instantiation.mjs run for real, the same removal recorded in the enforcement map too, passes clean",
    () => {
      const dir = scratchRepo();
      writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x" }));
      mkdirSync(join(dir, "docs", "standards"), { recursive: true });
      writeFileSync(
        join(dir, "docs", "standards", "testing-strategy.md"),
        "# Testing\n\nRun `npm test` before merging.\n",
      );
      writeFileSync(
        join(dir, "docs", "bootstrap-report.md"),
        "# Bootstrap report\n\n## Removals\n\nDropped the .NET rows — no .csproj in this repository.\n",
      );
      writeFileSync(
        join(dir, "docs", "standards-enforcement.md"),
        "# Standards enforcement\n\n## Removals\n\nDropped the .NET rows — no .csproj in this repository.\n",
      );
      git(dir, ["add", "-A"]);
      const r = runScript("scripts/check-standards-instantiation.mjs", dir);
      assert.equal(r.status, 0);
      rmSync(dir, { recursive: true, force: true });
    },
  );
});
