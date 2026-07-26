import { test } from "node:test";
import assert from "node:assert/strict";
import { buildArgs } from "../../scripts/run-tests.mjs";

test("caller flags land before the positional patterns", () => {
  const args = buildArgs(["--coverage", "--test-coverage-lines=80"]);

  const flagIndex = args.indexOf("--test-coverage-lines=80");
  const firstPattern = args.findIndex((a) => a.startsWith("test/"));

  assert.ok(flagIndex !== -1, "the caller flag must be forwarded");
  assert.ok(firstPattern !== -1, "the suite patterns must be present");
  // Node silently ignores coverage/reporter flags that appear AFTER the
  // positional globs — exit 0, no warning, no artifact. Ordering is the
  // whole point of this wrapper.
  assert.ok(
    flagIndex < firstPattern,
    `caller flag at ${flagIndex} must precede the first pattern at ${firstPattern}`,
  );
});

test("--coverage expands to the coverage flags and is not forwarded to node", () => {
  const args = buildArgs(["--coverage"]);

  assert.ok(args.includes("--experimental-test-coverage"));
  assert.ok(args.includes("--test-coverage-exclude=test/**"));
  assert.ok(args.includes("--test-coverage-exclude=schemas/**"));
  // node would reject the sentinel as an unknown option.
  assert.ok(!args.includes("--coverage"));
});

test("a plain invocation emits no coverage flags", () => {
  const args = buildArgs([]);

  assert.ok(!args.some((a) => a.startsWith("--experimental-test-coverage")));
  assert.ok(!args.some((a) => a.startsWith("--test-coverage")));
  // `npm test` must keep its current behaviour and runtime.
  assert.deepEqual(args.slice(0, 3), ["--import", "tsx", "--test"]);
});
