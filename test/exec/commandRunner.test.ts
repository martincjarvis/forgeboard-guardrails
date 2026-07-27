import { test } from "node:test";
import assert from "node:assert/strict";
import { runCommandSequence } from "../../src/exec/commandRunner.ts";

test("undefined command sequence vacuously passes", () => {
  const result = runCommandSequence(undefined, process.cwd());
  assert.equal(result.pass, true);
  assert.deepEqual(result.steps, []);
});

test("single string command runs once", () => {
  const result = runCommandSequence('node -e "process.exit(0)"', process.cwd());
  assert.equal(result.pass, true);
  assert.equal(result.steps.length, 1);
});

test("gate commands do not inherit the git-hook environment", () => {
  // Simulate git invoking a hook: GIT_DIR/GIT_INDEX_FILE are exported into the
  // process. A gate command must not see them, or its own git operations would
  // target the outer repo's transient index instead of its working tree.
  const prior = {
    GIT_DIR: process.env.GIT_DIR,
    GIT_INDEX_FILE: process.env.GIT_INDEX_FILE,
  };
  process.env.GIT_DIR = "C:/nonexistent/.git";
  process.env.GIT_INDEX_FILE = "C:/nonexistent/index";
  try {
    const result = runCommandSequence(
      'node -e "process.stdout.write(process.env.GIT_DIR ?? \\"\\")"',
      process.cwd(),
    );
    assert.equal(result.pass, true);
    assert.equal(result.steps[0].output, "");
  } finally {
    if (prior.GIT_DIR === undefined) delete process.env.GIT_DIR;
    else process.env.GIT_DIR = prior.GIT_DIR;
    if (prior.GIT_INDEX_FILE === undefined) delete process.env.GIT_INDEX_FILE;
    else process.env.GIT_INDEX_FILE = prior.GIT_INDEX_FILE;
  }
});

test("array of commands runs in order, fail-fast on first failure", () => {
  const result = runCommandSequence(
    [
      'node -e "process.exit(0)"',
      'node -e "process.exit(1)"',
      'node -e "process.exit(0)"',
    ],
    process.cwd(),
  );
  assert.equal(result.pass, false);
  assert.equal(result.steps.length, 2); // third command never runs
  assert.equal(result.steps[0].pass, true);
  assert.equal(result.steps[1].pass, false);
  assert.equal(result.steps[1].index, 1);
  assert.equal(result.steps[1].total, 3);
});

test("a failing command captures stderr as well as stdout", () => {
  // A command that diagnoses on stderr is the common case — node, dotnet and most
  // linters do it. Capturing stdout alone leaves the gate reporting a failure with
  // no statement of what failed, which is the whole reason this is captured at all.
  const result = runCommandSequence(
    [
      "node -e \"console.log('on stdout'); console.error('on stderr'); process.exit(1)\"",
    ],
    process.cwd(),
  );

  assert.equal(result.pass, false);
  assert.match(result.steps[0].output, /on stdout/);
  assert.match(result.steps[0].output, /on stderr/);
});

test("a passing command captures stderr as well as stdout", () => {
  // The harder half of the requirement, and the one a failures-only capture never
  // sees: a tool that exits zero while printing "no configuration found, using
  // defaults" is indistinguishable from one that worked. Checking a build for zero
  // warnings needs this path, not the failing one.
  const result = runCommandSequence(
    [
      "node -e \"console.log('42 passing'); console.error('deprecation warning')\"",
    ],
    process.cwd(),
  );

  assert.equal(result.pass, true);
  assert.match(result.steps[0].output, /42 passing/);
  assert.match(
    result.steps[0].output,
    /deprecation warning/,
    "a warning on a zero-exit run is exactly what the log exists to preserve",
  );
});

test("a command that writes only to stderr still yields output", () => {
  // The exact shape that produced an empty gate message: everything on stderr.
  const result = runCommandSequence(
    ["node -e \"console.error('lines 72% < 80%'); process.exit(1)\""],
    process.cwd(),
  );

  assert.equal(result.pass, false);
  assert.match(result.steps[0].output, /lines 72% < 80%/);
});
