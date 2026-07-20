import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTestOutput } from "../../src/status/testOutputParsers.ts";

test("parses dotnet test summary output", () => {
  const output = "Passed!  - Failed: 0, Passed: 42, Skipped: 0, Total: 42, Duration: 1 s";
  assert.deepEqual(parseTestOutput(output), { passed: 42, failed: 0, total: 42 });
});

test("parses a mocha-style summary", () => {
  const output = "  40 passing (200ms)\n  2 failing";
  assert.deepEqual(parseTestOutput(output), { passed: 40, failed: 2, total: 42 });
});

test("returns null for an unrecognised format", () => {
  assert.equal(parseTestOutput("some arbitrary script output"), null);
});
