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
  findCspellResidue,
  checkCspellResidue,
  findHardcodedCommitSha,
  checkHardcodedCommitSha,
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

// --- fix 55 — instantiation residue outside docs/standards/**. Audit 14
// found four dead .NET words (Roslynator, Meziantou, xunit, warnaserror) in
// a Node-only repository's cspell.json, each with zero occurrences anywhere
// else in the tree, copied wholesale from this toolkit's own multi-stack
// word list. Kept conservative: an unused word alone is not a finding, only
// one that also names a stack outside the derived list.

test("findCspellResidue: a word absent everywhere else that names a stack outside the derived list is a finding", () => {
  const words = ["Roslynator", "warnaserror"];
  const corpus = "This repository runs npm test and eslint.\n";
  const findings = findCspellResidue(words, corpus, new Set(["node"]));
  assert.equal(findings.length, 2);
  assert.deepEqual(
    findings.map((f) => f.stack),
    ["dotnet", "dotnet"],
  );
});

test("findCspellResidue: a word that occurs elsewhere in the tree is legitimate vocabulary, not residue", () => {
  const words = ["Roslynator"];
  const corpus = "Roslynator is mentioned here as an example .NET tool.\n";
  assert.deepEqual(findCspellResidue(words, corpus, new Set(["node"])), []);
});

test("findCspellResidue: an unused word that names no stack is not a finding on its own — flagging every unused word gets a checker turned off", () => {
  const words = ["dogfoods", "finalised"];
  const corpus = "Nothing here uses either word.\n";
  assert.deepEqual(findCspellResidue(words, corpus, new Set(["node"])), []);
});

test("findCspellResidue: a word naming a stack that IS in the derived list is not a finding, however unused", () => {
  const words = ["eslint"];
  const corpus = "No occurrence of the word itself here.\n";
  assert.deepEqual(findCspellResidue(words, corpus, new Set(["node"])), []);
});

test("checkCspellResidue: a Node-only repository's cspell.json carrying dead .NET vocabulary is refused, naming the word and the stack (fix 55, audit 14's exact case)", () => {
  const files = ["cspell.json", "package.json", "docs/README.md"];
  const contents = {
    "cspell.json": JSON.stringify({
      words: ["Roslynator", "Meziantou", "xunit", "warnaserror"],
    }),
    "package.json": JSON.stringify({ name: "x" }),
    "docs/README.md": "# Docs\n\nRun `npm test` before merging.\n",
  };
  const findings = checkCspellResidue({
    files,
    readFile: (f) => contents[f],
    isToolkit: () => false,
  });
  assert.equal(findings.length, 4);
  assert.ok(findings.every((f) => f.path === "cspell.json"));
  assert.match(findings[0].problem, /'Roslynator'.*dotnet/);
});

test("checkCspellResidue: the same word list passes clean once the .NET manifest is actually present — the stack is no longer outside the derived list", () => {
  const files = ["cspell.json", "app.csproj"];
  const contents = {
    "cspell.json": JSON.stringify({ words: ["Roslynator"] }),
    "app.csproj": "<Project />",
  };
  const findings = checkCspellResidue({
    files,
    readFile: (f) => contents[f],
    isToolkit: () => false,
  });
  assert.deepEqual(findings, []);
});

test("checkCspellResidue: this toolkit's own repository is exempt outright, whatever its cspell.json lists", () => {
  const findings = checkCspellResidue({
    files: ["cspell.json"],
    readFile: () => JSON.stringify({ words: ["Roslynator"] }),
    isToolkit: () => true,
  });
  assert.deepEqual(findings, []);
});

test("checkCspellResidue: run for real against this toolkit's own repository, exits clean — the same cspell.json audit 14's demonstrated words came from, verified not to fire here (fix 55)", () => {
  // Two separate reasons this must stay clean, both worth proving rather
  // than assuming: the toolkit exemption (isToolkit, the default here since
  // this repository carries .claude-plugin/plugin.json), AND — checked
  // independently below with the exemption forced off — every word in this
  // repository's real cspell.json that names a non-derived stack actually
  // occurs elsewhere in this corpus's own multi-stack prose, because this
  // is the canonical corpus documenting every stack it supports.
  const withExemption = checkCspellResidue();
  assert.deepEqual(
    withExemption,
    [],
    "the toolkit exemption alone keeps this clean",
  );

  const withoutExemption = checkCspellResidue({ isToolkit: () => false });
  assert.deepEqual(
    withoutExemption,
    [],
    "even with the exemption forced off, every non-derived-stack word in this repository's real cspell.json occurs elsewhere in its own prose — not residue",
  );
});

test("checkCspellResidue: an occurrence only in a file classed `tooling` does not count as 'used elsewhere' (fix 59) — the ported checker's own fixtures must not vote for their own vocabulary", () => {
  // Audit 15's structural finding: checkCspellResidue's original corpus was
  // every tracked text file, which — once this module and its test file are
  // themselves ported into the repository they inspect — includes this
  // checker's own source and fixtures containing the literal dead-stack
  // words. The corpus must be built from files NOT classed `tooling`
  // (file-classes.md), so a word's own checker cannot vouch for it.
  const files = [
    "cspell.json",
    "package.json",
    "scripts/check-standards-instantiation.mjs",
  ];
  const contents = {
    "cspell.json": JSON.stringify({ words: ["Roslynator"] }),
    "package.json": JSON.stringify({ name: "x" }),
    "scripts/check-standards-instantiation.mjs":
      "// fixture word used in this ported checker's own tests: Roslynator\n",
  };
  const classes = {
    "scripts/check-standards-instantiation.mjs": "tooling",
  };
  const findingsWithClassExcluded = checkCspellResidue({
    files,
    readFile: (f) => contents[f],
    classify: (f) => classes[f] ?? "production",
    isToolkit: () => false,
  });
  assert.equal(
    findingsWithClassExcluded.length,
    1,
    "a word appearing only in a tooling-classed file is still residue",
  );
  assert.match(findingsWithClassExcluded[0].problem, /'Roslynator'.*dotnet/);

  // The same corpus, with the tooling file left unclassified (every file
  // reads as production) — this is the pre-fix-59 shape, and it must NOT
  // flag the word, because the ported checker's own source now "uses" it.
  const findingsWithoutClassExcluded = checkCspellResidue({
    files,
    readFile: (f) => contents[f],
    classify: () => "production",
    isToolkit: () => false,
  });
  assert.deepEqual(
    findingsWithoutClassExcluded,
    [],
    "unclassified, the ported checker's own fixture registers as 'used elsewhere' and hides the residue — this is the bug fix 59 closes",
  );
});

test("regression guard: check-standards-instantiation.mjs run for real, against a scratch tree whose cspell.json carries dead .NET vocabulary with zero other occurrences, refuses and names it (fix 55)", () => {
  const dir = scratchRepo();
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x" }));
  writeFileSync(
    join(dir, "cspell.json"),
    JSON.stringify({
      words: ["Roslynator", "Meziantou", "xunit", "warnaserror"],
    }),
  );
  mkdirSync(join(dir, "docs", "standards"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "standards", "testing-strategy.md"),
    "# Testing\n\nRun `npm test` before merging.\n",
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-standards-instantiation.mjs", dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /cspell\.json.*'Roslynator'.*dotnet/);
  rmSync(dir, { recursive: true, force: true });
});

test("regression guard: check-standards-instantiation.mjs run for real, the same cspell.json words actually used in prose elsewhere in the tree, passes clean", () => {
  const dir = scratchRepo();
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x" }));
  writeFileSync(
    join(dir, "cspell.json"),
    JSON.stringify({ words: ["Roslynator"] }),
  );
  mkdirSync(join(dir, "docs", "standards"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "standards", "testing-strategy.md"),
    "# Testing\n\nRoslynator is mentioned here as an example only.\n",
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-standards-instantiation.mjs", dir);
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stderr, /cspell\.json/);
  rmSync(dir, { recursive: true, force: true });
});

test("regression guard: check-standards-instantiation.mjs run for real, against a scratch tree that has ported the checker itself into its tooling directory, still refuses on the real four words (fix 59) — the non-exempt path, exercised directly", () => {
  // The exact shape audit 15 found: a Node-only consuming repository whose
  // own tooling directory carries this checker (and a test file exercising
  // it), so the tree tracks a copy of scripts/check-standards-instantiation.mjs
  // containing the literal fixture words this test's own cspell.json also
  // lists — deriveComponent() finds no .claude-plugin/plugin.json under
  // `dir`, so isToolkit() is false here and this check's real, non-exempt
  // path runs — the path fix 59's lesson says must be exercised directly,
  // not assumed clean because the canonical toolkit's own run is exempt.
  const dir = scratchRepo();
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x" }));
  writeFileSync(
    join(dir, "cspell.json"),
    JSON.stringify({
      words: ["Roslynator", "Meziantou", "xunit", "warnaserror"],
    }),
  );
  mkdirSync(join(dir, "docs", "standards"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "standards", "testing-strategy.md"),
    "# Testing\n\nRun `npm test` before merging.\n",
  );
  mkdirSync(join(dir, "scripts", "test"), { recursive: true });
  writeFileSync(
    join(dir, "scripts", "check-standards-instantiation.mjs"),
    "// ported checker; its own fixtures name Roslynator, Meziantou, xunit, warnaserror\n",
  );
  writeFileSync(
    join(dir, "scripts", "test", "check-standards-instantiation.test.mjs"),
    "// exercises the ported checker with the same fixtures: Roslynator, Meziantou, xunit, warnaserror\n",
  );
  writeFileSync(
    join(dir, ".gitattributes"),
    "scripts/** guardrail-class=tooling\n",
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-standards-instantiation.mjs", dir);
  assert.equal(
    r.status,
    2,
    "the ported checker's own fixtures must not vote their dead vocabulary 'used elsewhere'",
  );
  assert.match(r.stderr, /cspell\.json.*'Roslynator'.*dotnet/);
  assert.match(r.stderr, /cspell\.json.*'Meziantou'.*dotnet/);
  assert.match(r.stderr, /cspell\.json.*'xunit'.*dotnet/);
  assert.match(r.stderr, /cspell\.json.*'warnaserror'.*dotnet/);
  rmSync(dir, { recursive: true, force: true });
});

// --- scripts/check-standards-instantiation.mjs — fix 60. An implementer
// removed, by hand, two toolkit self-checks that had made it into a ported
// test file: one reading this toolkit's own commit daa59d0c…, one asserting
// this toolkit's own ADR-0004 was Accepted with a named approver. Both would
// fail deterministically on every consuming repository's first CI run —
// nothing mechanical caught it, since the checks above read
// docs/standards/** and cspell.json, never test files. The narrow, mechanical
// proxy: a full 40-character commit SHA hard-coded in a file classed `test`.

test("findHardcodedCommitSha: a full 40-character commit SHA is found, naming the line", () => {
  const text =
    'line one\nconst sha = "daa59d0cf1d039b997b830eb1029a49d2aa7d099";\n';
  const findings = findHardcodedCommitSha(text);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 2);
  assert.equal(findings[0].sha, "daa59d0cf1d039b997b830eb1029a49d2aa7d099");
});

test("findHardcodedCommitSha: a short-form SHA (8 characters) is not a finding — only a full 40-character one is precise enough to be mechanical", () => {
  const findings = findHardcodedCommitSha(
    "commit daa59d0c approved the risk\n",
  );
  assert.deepEqual(findings, []);
});

test("findHardcodedCommitSha: a 40-character run embedded inside a longer hex string (a sha256 digest, say) is not a finding — a word boundary never falls in the middle of an unbroken hex run", () => {
  const longHex = "a".repeat(64);
  const findings = findHardcodedCommitSha(`digest: ${longHex}\n`);
  assert.deepEqual(findings, []);
});

test("checkHardcodedCommitSha: a full SHA in a file classed `test` is a finding, naming the file, line and SHA (fix 60)", () => {
  const files = ["hooks/test/x.test.mjs"];
  const contents = {
    "hooks/test/x.test.mjs":
      'const sha = "daa59d0cf1d039b997b830eb1029a49d2aa7d099";\n',
  };
  const findings = checkHardcodedCommitSha({
    files,
    readFile: (f) => contents[f],
    classify: () => "test",
    isToolkit: () => false,
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].path, "hooks/test/x.test.mjs");
  assert.match(findings[0].problem, /daa59d0cf1d039b997b830eb1029a49d2aa7d099/);
  assert.match(findings[0].problem, /consuming repository's history does not/);
});

test("checkHardcodedCommitSha: the identical SHA in a file NOT classed `test` is out of scope — a configuration-classed CI workflow pinning a GitHub Action to its commit SHA is a security practice, not this defect", () => {
  const files = [".github/workflows/pull-request.yml"];
  const contents = {
    ".github/workflows/pull-request.yml":
      "uses: actions/checkout@daa59d0cf1d039b997b830eb1029a49d2aa7d099\n",
  };
  const findings = checkHardcodedCommitSha({
    files,
    readFile: (f) => contents[f],
    classify: () => "configuration",
    isToolkit: () => false,
  });
  assert.deepEqual(findings, []);
});

test("checkHardcodedCommitSha: this toolkit's own repository is exempt outright, whatever its test files carry", () => {
  const findings = checkHardcodedCommitSha({
    files: ["hooks/test/x.test.mjs"],
    readFile: () => 'const sha = "daa59d0cf1d039b997b830eb1029a49d2aa7d099";\n',
    classify: () => "test",
    isToolkit: () => true,
  });
  assert.deepEqual(findings, []);
});

test("checkHardcodedCommitSha: run for real against this toolkit's own repository, the exemption verified rather than assumed (fix 60, hazard 4)", () => {
  // hooks/test/hooks.test.mjs itself legitimately carries a full 40-character
  // SHA (fix 49, hazard 3: daa59d0cf1d039b997b830eb1029a49d2aa7d099, this
  // repository's own real history) — the exact recursion the brief warns
  // about. isToolkit() defaults to true here (this repository carries
  // .claude-plugin/plugin.json), so the check must return no findings.
  const withExemption = checkHardcodedCommitSha();
  assert.deepEqual(
    withExemption,
    [],
    "the toolkit exemption keeps this repository's own real SHA from being flagged",
  );

  // Fix 59's lesson applied here: an exemption that hides a path from a
  // check also hides it from every test that only ever runs under that
  // exemption. Forcing the exemption off exercises the non-exempt path for
  // real, against this repository's own tree, rather than assuming it would
  // have worked.
  const withoutExemption = checkHardcodedCommitSha({ isToolkit: () => false });
  assert.ok(
    withoutExemption.some((f) =>
      f.problem.includes("daa59d0cf1d039b997b830eb1029a49d2aa7d099"),
    ),
    "with the exemption forced off, this repository's own real SHA in hooks/test/hooks.test.mjs must be found — proof the non-exempt path actually runs, not only that the exemption hides it",
  );
});

test("regression guard: check-standards-instantiation.mjs run for real, against a scratch tree whose ported test file hard-codes a full commit SHA, refuses and names the file, line and SHA (fix 60)", () => {
  const dir = scratchRepo();
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x" }));
  mkdirSync(join(dir, "docs", "standards"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "standards", "testing-strategy.md"),
    "# Testing\n\nRun `npm test` before merging.\n",
  );
  mkdirSync(join(dir, "hooks", "test"), { recursive: true });
  writeFileSync(
    join(dir, "hooks", "test", "hooks.test.mjs"),
    'test("regression guard: the source repository\'s own history (commit daa59d0cf1d039b997b830eb1029a49d2aa7d099)", () => {});\n',
  );
  writeFileSync(
    join(dir, ".gitattributes"),
    "hooks/test/** guardrail-class=test\n",
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-standards-instantiation.mjs", dir);
  assert.equal(r.status, 2);
  assert.match(
    r.stderr,
    /hooks\/test\/hooks\.test\.mjs:1: hard-codes a full 40-character commit SHA \(daa59d0cf1d039b997b830eb1029a49d2aa7d099\)/,
  );
  rmSync(dir, { recursive: true, force: true });
});
