import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseTestOutput,
  extractFailingTests,
  describeFailure,
} from "../../src/status/testOutputParsers.ts";

// British spelling used in a test name
// cspell:ignore unrecognised

test("parses dotnet test summary output", () => {
  const output =
    "Passed!  - Failed: 0, Passed: 42, Skipped: 0, Total: 42, Duration: 1 s";
  assert.deepEqual(parseTestOutput(output), {
    passed: 42,
    failed: 0,
    total: 42,
  });
});

test("parses a mocha-style summary", () => {
  const output = "  40 passing (200ms)\n  2 failing";
  assert.deepEqual(parseTestOutput(output), {
    passed: 40,
    failed: 2,
    total: 42,
  });
});

test("returns null for an unrecognised format", () => {
  assert.equal(parseTestOutput("some arbitrary script output"), null);
});

test("names the failing tests from node:test spec output", () => {
  const output = [
    "✔ a passing test (1.2ms)",
    "✖ guardrails gates", // fixture noise: a gate label, not a test result
    "✖ failing tests:",
    "",
    "✖ report mode writes both artifacts (382.5ms)",
    "✖ a second failure (1.0ms)",
  ].join("\n");

  assert.deepEqual(extractFailingTests(output), [
    "report mode writes both artifacts",
    "a second failure",
  ]);
});

test("names failing tests from TAP and dotnet output", () => {
  assert.deepEqual(
    extractFailingTests("ok 1 - fine\nnot ok 2 - the broken one\n"),
    ["the broken one"],
  );
  assert.deepEqual(
    extractFailingTests("  Failed Namespace.ClassName.TheTest [12 ms]"),
    ["Namespace.ClassName.TheTest"],
  );
});

test("returns nothing when no failing test can be named", () => {
  assert.deepEqual(extractFailingTests("everything was fine\n"), []);
  assert.deepEqual(extractFailingTests(""), []);
});

test("describeFailure leads with the failing test names, then the output", () => {
  const output = ["✖ failing tests:", "✖ the broken one (5ms)"].join("\n");
  const detail = describeFailure(output, "fallback");

  // The names must come first: the output below them is thousands of lines of
  // coverage table, and the point is not having to search it.
  assert.match(detail, /^1 failing test:\n {2}- the broken one\n/);
  assert.match(detail, /✖ failing tests:/);
});

test("describeFailure falls back only when the command produced nothing at all", () => {
  assert.equal(
    describeFailure("", "coverage command failed"),
    "coverage command failed",
  );
  assert.equal(describeFailure("   \n ", "fallback"), "fallback");
  // Output with no nameable test is passed through rather than replaced.
  assert.equal(
    describeFailure("ENOENT: no such file", "fallback"),
    "ENOENT: no such file",
  );
});
