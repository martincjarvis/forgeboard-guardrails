// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis Uncited uncited lede
// Split from standards-instantiation.test.mjs — subject group: instantiation-residue.
// Loaded by hooks/test/hooks.test.mjs; not invoked directly by the test runner.
import { test } from "node:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  findCspellResidue,
  checkCspellResidue,
} from "../../scripts/check-standards-instantiation.mjs";
import assert from "node:assert/strict";
import { git, scratchRepo, runScript } from "./support.mjs";

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
