import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { runSuppressionRegisterGate } from "../../src/gates/suppressionRegister.ts";

const REGISTER = [
  "# Suppression register",
  "",
  "| Code | Scope | Justification | Removable when | Approved by |",
  "| ---- | ----- | ------------- | -------------- | ----------- |",
];

function repo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "gr-supp-"));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["add", "-A"], { cwd: dir });
  return dir;
}

function clean(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

test("an unregistered suppression is reported, naming the file and the rule", () => {
  const dir = repo({
    "src/a.ts": "// nosemgrep: some.rule.id\nconst x = 1;\n",
    "docs/suppression-register.md": REGISTER.join("\n") + "\n",
  });

  const { problems } = runSuppressionRegisterGate(dir);

  assert.equal(problems.length, 1);
  assert.match(problems[0], /src\/a\.ts/);
  assert.match(problems[0], /some\.rule\.id/);
  clean(dir);
});

test("a registered suppression passes", () => {
  const dir = repo({
    "src/a.ts": "// nosemgrep: some.rule.id\nconst x = 1;\n",
    "docs/suppression-register.md":
      [
        ...REGISTER,
        "| `some.rule.id` | `src/a.ts` | Reason. | When X lands. | Someone |",
      ].join("\n") + "\n",
  });

  assert.deepEqual(runSuppressionRegisterGate(dir).problems, []);
  clean(dir);
});

test("a row for the right rule in the wrong file does not cover it", () => {
  // Otherwise one registered suppression licenses the same rule everywhere, which
  // is the broadened annotation ADR-0011 forbids, arrived at by another route.
  const dir = repo({
    "src/a.ts": "// nosemgrep: some.rule.id\n",
    "src/b.ts": "// nosemgrep: some.rule.id\n",
    "docs/suppression-register.md":
      [
        ...REGISTER,
        "| `some.rule.id` | `src/a.ts` | Reason. | When X lands. | Someone |",
      ].join("\n") + "\n",
  });

  const { problems } = runSuppressionRegisterGate(dir);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /src\/b\.ts/);
  clean(dir);
});

test("each rule on a multi-rule marker needs its own row", () => {
  const dir = repo({
    "src/a.ts": "// nosemgrep: rule.one, rule.two\n",
    "docs/suppression-register.md":
      [
        ...REGISTER,
        "| `rule.one` | `src/a.ts` | Reason. | When X lands. | Someone |",
      ].join("\n") + "\n",
  });

  const { problems } = runSuppressionRegisterGate(dir);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /rule\.two/);
  clean(dir);
});

test("a marker naming no rule is refused even when a row exists", () => {
  // A bare `nosemgrep` silences every rule on the line. There is nothing to
  // register, so registration cannot be the remedy — naming the rule is.
  const dir = repo({
    "src/a.ts": "// nosemgrep\n",
    "docs/suppression-register.md":
      [...REGISTER, "| `*` | `src/a.ts` | Reason. | Never. | Someone |"].join(
        "\n",
      ) + "\n",
  });

  const { problems } = runSuppressionRegisterGate(dir);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /name the rule/i);
  clean(dir);
});

test("a marker quoted inside a fenced code block is documentation, not a suppression", () => {
  // Every plan and ADR in this programme quotes these markers. Reporting the
  // documentation as the offence would make the gate unusable in the repo that
  // documents the mechanism.
  const dir = repo({
    "docs/guide.md": [
      "Use this:",
      "",
      "```ts",
      "// nosemgrep: some.rule.id",
      "```",
      "",
    ].join("\n"),
    "docs/suppression-register.md": REGISTER.join("\n") + "\n",
  });

  assert.deepEqual(runSuppressionRegisterGate(dir).problems, []);
  clean(dir);
});

test("a marker in markdown prose outside a fence is a real suppression", () => {
  const dir = repo({
    "docs/guide.md": "<!-- secretlint-disable @secretlint/rule-pattern -->\n",
    "docs/suppression-register.md": REGISTER.join("\n") + "\n",
  });

  const { problems } = runSuppressionRegisterGate(dir);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /secretlint/);
  clean(dir);
});

test("a missing register is reported rather than silently passing", () => {
  // A repo with suppressions and no register is the state this gate exists to
  // end. Skipping quietly would make adopting the gate a no-op.
  const dir = repo({ "src/a.ts": "// nosemgrep: some.rule.id\n" });

  const { problems } = runSuppressionRegisterGate(dir);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /docs\/suppression-register\.md/);
  clean(dir);
});

test("a repo with no suppressions and no register passes", () => {
  const dir = repo({ "src/a.ts": "const x = 1;\n" });
  assert.deepEqual(runSuppressionRegisterGate(dir).problems, []);
  clean(dir);
});

test("the register is not scanned as source, so it cannot report itself", () => {
  // The register is markdown, and a marker in an HTML comment outside a fence is a
  // real suppression — the test above proves that. So a row that explains a
  // `markdownlint-disable` in prose would make the register report itself and block
  // every commit until someone worked out why.
  //
  // The fixture needs a marker IN the register for that to be true. An earlier
  // version had none, so the gate found nothing there whether or not it skipped the
  // file, and the assertion passed with the skip deleted.
  const dir = repo({
    "src/a.ts": "// nosemgrep: some.rule.id\n",
    "docs/suppression-register.md":
      [
        ...REGISTER,
        "| `some.rule.id` | `src/a.ts` | Reason. | When X lands. | Someone |",
        "",
        "<!-- nosemgrep: other.rule.id -->",
      ].join("\n") + "\n",
  });

  assert.deepEqual(runSuppressionRegisterGate(dir).problems, []);
  clean(dir);
});

test("a marker that is only a word in data is not a suppression", () => {
  // cspell.json lists "nosemgrep" so the spell gate accepts the word in comments.
  // A dictionary entry turns nothing off; treating it as a suppression would make
  // the register a list of vocabulary.
  const dir = repo({
    "cspell.json": '{\n  "words": [\n    "nosemgrep"\n  ]\n}\n',
    "docs/suppression-register.md": REGISTER.join("\n") + "\n",
  });

  assert.deepEqual(runSuppressionRegisterGate(dir).problems, []);
  clean(dir);
});

test("prose in a comment that mentions a marker is not a suppression", () => {
  // The gate's own source, this ADR and every plan discuss these markers in
  // comments and prose. A suppression is the whole comment; a word inside a
  // sentence is someone explaining the mechanism.
  const dir = repo({
    "src/a.ts": [
      "// Semgrep applies a nosemgrep comment only to the line it precedes.",
      "/* An eslint-disable here would be broader than the rule needs. */",
      "const x = 1;",
    ].join("\n"),
    "docs/suppression-register.md": REGISTER.join("\n") + "\n",
  });

  assert.deepEqual(runSuppressionRegisterGate(dir).problems, []);
  clean(dir);
});

test("a marker inside a string literal is a fixture, not a suppression", () => {
  // Tests for this gate, and for the markdown model, embed real markers in string
  // literals. They suppress nothing — the compiler never sees them as comments.
  const dir = repo({
    "test/a.test.ts": [
      'const fixture = "// nosemgrep: some.rule.id";',
      'assert.ok(src.indexOf("// nosemgrep") > 0);',
    ].join("\n"),
    "docs/suppression-register.md": REGISTER.join("\n") + "\n",
  });

  assert.deepEqual(runSuppressionRegisterGate(dir).problems, []);
  clean(dir);
});
