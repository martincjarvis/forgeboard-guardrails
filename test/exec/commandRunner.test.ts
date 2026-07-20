import { test } from "node:test";
import assert from "node:assert/strict";
import { runCommandSequence } from "../../src/exec/commandRunner.ts";

test("undefined command sequence vacuously passes", () => {
  const result = runCommandSequence(undefined, process.cwd());
  assert.equal(result.pass, true);
  assert.deepEqual(result.steps, []);
});

test("single string command runs once", () => {
  const result = runCommandSequence("node -e \"process.exit(0)\"", process.cwd());
  assert.equal(result.pass, true);
  assert.equal(result.steps.length, 1);
});

test("array of commands runs in order, fail-fast on first failure", () => {
  const result = runCommandSequence(
    ["node -e \"process.exit(0)\"", "node -e \"process.exit(1)\"", "node -e \"process.exit(0)\""],
    process.cwd()
  );
  assert.equal(result.pass, false);
  assert.equal(result.steps.length, 2); // third command never runs
  assert.equal(result.steps[0].pass, true);
  assert.equal(result.steps[1].pass, false);
  assert.equal(result.steps[1].index, 1);
  assert.equal(result.steps[1].total, 3);
});
