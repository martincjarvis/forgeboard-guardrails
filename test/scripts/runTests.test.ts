import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  existsSync,
  statSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  assert.ok(!args.some((a) => a.startsWith("--test-reporter")));
  // `npm test` must keep its current behaviour and runtime.
  assert.deepEqual(args.slice(0, 3), ["--import", "tsx", "--test"]);
});

test("--report expands to the reporter set and is not forwarded to node", () => {
  const args = buildArgs(["--report"]);

  assert.ok(args.includes("--test-reporter=spec"));
  assert.ok(args.includes("--test-reporter-destination=stdout"));
  assert.ok(args.includes("--test-reporter=lcov"));
  assert.ok(args.includes("--test-reporter=junit"));
  assert.ok(!args.includes("--report"));
});

test("report mode writes both artifacts into a directory that does not yet exist", () => {
  // A directory that does NOT exist: node exits 7 with ENOENT if the wrapper
  // fails to create it, which is exactly the fresh-clone / CI-runner case.
  const dir = join(mkdtempSync(join(tmpdir(), "gr-rt-")), "coverage");
  const lcov = join(dir, "lcov.info");
  const junit = join(dir, "junit.xml");

  // CRITICAL: node:test sets NODE_TEST_CONTEXT=child-v8 in this process and a
  // spawned child inherits it. The child then warns "node:test run() is being
  // called recursively within a test file. skipping running files", runs
  // NOTHING, and exits 0 — a silent green. Delete it from the child's env.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;

  const result = spawnSync(
    process.execPath,
    [
      "scripts/run-tests.mjs",
      "--coverage",
      "--test-reporter=spec",
      "--test-reporter-destination=stdout",
      "--test-reporter=lcov",
      `--test-reporter-destination=${lcov}`,
      "--test-reporter=junit",
      `--test-reporter-destination=${junit}`,
      "--test-only",
    ],
    { encoding: "utf8", shell: false, env },
  );

  // Assert the real outcome, not the absence of one failure mode: a bare
  // `notEqual(status, 7)` passes vacuously on the recursive-skip path, and
  // would stay green even with the wrapper's mkdirSync loop deleted.
  assert.equal(
    result.status,
    0,
    `expected a clean run, got ${result.status}: ${result.stderr}`,
  );
  assert.ok(
    !result.stderr.includes("skipping running files"),
    "the child skipped every file — NODE_TEST_CONTEXT leaked into its env",
  );
  assert.ok(existsSync(lcov), "lcov.info must exist");
  assert.ok(existsSync(junit), "junit.xml must exist");
  assert.ok(statSync(lcov).size > 0, "lcov.info must be non-empty");
  assert.ok(statSync(junit).size > 0, "junit.xml must be non-empty");

  // --test-reporter REPLACES the default reporter; without an explicit
  // spec->stdout the human-readable output is zero bytes.
  assert.ok(
    result.stdout.length > 0,
    "human-readable output must not be empty",
  );

  // lcov consumers cannot resolve Windows separators.
  for (const line of readFileSync(lcov, "utf8").split("\n")) {
    if (line.startsWith("SF:")) {
      assert.ok(
        !line.includes("\\"),
        `lcov path must be forward-slashed: ${line}`,
      );
    }
  }

  rmSync(dir, { recursive: true, force: true });
});
