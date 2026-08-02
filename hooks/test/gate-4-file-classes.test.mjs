// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis Uncited uncited unpushed Unpushed
// Split from hooks.test.mjs — subject group: gate-4-file-classes.
// Loaded by hooks/test/hooks.test.mjs; not invoked directly by the test runner.
import { test } from "node:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { git, scratchRepo, runHook, lines } from "./support.mjs";

test("gate 4 does not count files classed as test or documentation toward change size", () => {
  // Classification is derived from .gitattributes through guardrail-class
  // (file-classes.md, ADR-0003), so the scratch repo must declare the classes
  // the real repository does — a path regex is no longer what decides this.
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  writeFileSync(
    join(dir, ".gitattributes"),
    "tests/** guardrail-class=test\n*.md guardrail-class=documentation\n",
  );
  mkdirSync(join(dir, "tests"), { recursive: true });
  writeFileSync(join(dir, "tests", "huge.test.ts"), lines(2000));
  writeFileSync(join(dir, "NOTES.md"), lines(2000));
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "test: plenty"]);
  const r = runHook("gate-4-task-completion.mjs", dir);
  assert.equal(
    r.status,
    0,
    "test and documentation files do not count toward change size",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("a file classed as test via guardrail-class does not count toward change size", () => {
  // Decisive proof: a 1000-line file that would blow past the 800-line error
  // threshold is allowed because it is classed as test, not because it is small.
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  writeFileSync(join(dir, ".gitattributes"), "spec/** guardrail-class=test\n");
  mkdirSync(join(dir, "spec"), { recursive: true });
  writeFileSync(join(dir, "spec", "big.spec.ts"), lines(1000));
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "test: big spec file"]);
  assert.equal(runHook("gate-4-task-completion.mjs", dir).status, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("a file classed as configuration counts toward change size but has no length limit", () => {
  // file-classes.md: configuration counts toward change size but has no length
  // limit. A single 900-line config file is long but legitimate; its lines still
  // count, and here 900 crosses the change-size error threshold on its own.
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  writeFileSync(
    join(dir, ".gitattributes"),
    "*.config guardrail-class=configuration\n",
  );
  writeFileSync(join(dir, "big.config"), lines(900));
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "build: large config"]);
  const r = runHook("gate-4-task-completion.mjs", dir);
  assert.equal(r.status, 2, "configuration counts toward change size");
  assert.match(r.stderr, /change size/);
  assert.doesNotMatch(
    r.stderr,
    /split it into smaller units/,
    "configuration has no length limit",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("a file classed as tooling counts toward change size but has no length limit", () => {
  // file-classes.md: "Configuration and tooling count toward change size but
  // carry no length limit" — tooling is Yes in the class table's "Counted in
  // change size" column, the same as configuration above. A single 900-line
  // tooling file crosses the change-size error threshold on its own.
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  writeFileSync(
    join(dir, ".gitattributes"),
    "tools/** guardrail-class=tooling\n",
  );
  mkdirSync(join(dir, "tools"), { recursive: true });
  writeFileSync(join(dir, "tools", "big.mjs"), lines(900));
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "build: large tooling script"]);
  const r = runHook("gate-4-task-completion.mjs", dir);
  assert.equal(r.status, 2, "tooling counts toward change size");
  assert.match(r.stderr, /change size/);
  assert.doesNotMatch(
    r.stderr,
    /split it into smaller units/,
    "tooling has no length limit",
  );
  rmSync(dir, { recursive: true, force: true });
});

// --- A generated file has no remedy: nobody can meaningfully split
// or shrink a lock file, and any hand edit to one is discarded by the next
// `npm install`. file-classes.md: "A generated file counts toward neither
// change size nor the length limit" — declared through its own
// `guardrail-generated` attribute, a separate boolean git already resolves
// (`git check-attr guardrail-generated -- <path>`), never a sixth
// guardrail-class. The file's own `guardrail-class` is untouched by any of
// these — file-classes.md's own checkpoint: "keeps its guardrail-class for
// every other check."

test("a file marked guardrail-generated does not count toward change size", () => {
  // A configuration-classed lock file — the worked example — well past the
  // change-size error threshold on its own, discounted entirely once marked.
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  writeFileSync(
    join(dir, ".gitattributes"),
    "*.lock guardrail-class=configuration\n" + "big.lock guardrail-generated\n",
  );
  writeFileSync(join(dir, "big.lock"), lines(900));
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "chore: regenerate the lock file"]);
  const r = runHook("gate-4-task-completion.mjs", dir);
  assert.equal(
    r.status,
    0,
    "a generated file contributes nothing to change size",
  );
  assert.doesNotMatch(r.stderr, /change size/);
  rmSync(dir, { recursive: true, force: true });
});

test("a hand-written configuration file of the same size still counts toward change size — the distinction is the marker, not the extension", () => {
  // Decisive contrast with the case above: same class, same size, same
  // extension even — the only difference is the absence of the
  // guardrail-generated attribute, and that alone is what change size reads.
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  writeFileSync(
    join(dir, ".gitattributes"),
    "*.lock guardrail-class=configuration\n",
  );
  writeFileSync(join(dir, "big.lock"), lines(900));
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "chore: hand-edit a large lock-shaped file"]);
  const r = runHook("gate-4-task-completion.mjs", dir);
  assert.equal(
    r.status,
    2,
    "an unmarked file counts toward change size regardless of its name",
  );
  assert.match(r.stderr, /change size/);
  rmSync(dir, { recursive: true, force: true });
});

test("a code-generated production file (*.g.cs) is discounted from change size the same as a lock file", () => {
  // The point: generated code, not only a lock file, carries the
  // same "no remedy" property. Unclassified .cs falls out to production
  // (file-classes.md's fail-safe default), so this also proves the
  // discount applies independently of guardrail-class.
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  writeFileSync(join(dir, ".gitattributes"), "*.g.cs guardrail-generated\n");
  writeFileSync(join(dir, "Widget.g.cs"), lines(900));
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "chore: regenerate the designer file"]);
  const r = runHook("gate-4-task-completion.mjs", dir);
  assert.equal(r.status, 0, "generated production code is discounted too");
  assert.doesNotMatch(r.stderr, /change size/);
  rmSync(dir, { recursive: true, force: true });
});

test("a generated production file is also exempt from the length limit, not only change size", () => {
  // file-classes.md: "A generated file counts toward neither change size nor
  // the length limit." A single generated file below the change-size error
  // threshold isolates the length-limit half of the claim.
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  writeFileSync(join(dir, ".gitattributes"), "*.g.cs guardrail-generated\n");
  writeFileSync(join(dir, "Widget.g.cs"), lines(500));
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "chore: regenerate one designer file"]);
  const r = runHook("gate-4-task-completion.mjs", dir);
  assert.equal(r.status, 0, "a generated file is exempt from the length limit");
  assert.doesNotMatch(r.stderr, /split it into smaller units/);
  rmSync(dir, { recursive: true, force: true });
});

test("guardrail-generated absent (unspecified) is not treated as generated — the fail-safe direction", () => {
  // Negative fixture, per the brief: git check-attr reports every path,
  // `unspecified` for one no .gitattributes pattern ever names. Only `set`
  // may discount a file; absence must count it, the same fail-safe direction
  // classOf() already takes for guardrail-class.
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  // No .gitattributes at all: guardrail-generated is unspecified for every
  // path, and the file is unclassified production by the existing default.
  writeFileSync(join(dir, "big.lock"), lines(900));
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "chore: add an unclassified large file"]);
  const r = runHook("gate-4-task-completion.mjs", dir);
  assert.equal(
    r.status,
    2,
    "no .gitattributes declares guardrail-generated, so nothing is discounted",
  );
  assert.match(r.stderr, /change size/);
  rmSync(dir, { recursive: true, force: true });
});
