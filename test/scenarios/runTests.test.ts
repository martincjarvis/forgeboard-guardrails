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
import { buildArgs, childEnv, TIERS } from "../../scripts/run-tests.mjs";
import { readdirSync } from "node:fs";

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

test("the wrapper refuses to recurse beyond one level of nesting", () => {
  // The end-to-end test above legitimately spawns the wrapper from inside a run
  // the wrapper started — one level. Beyond that is the runaway case: if the
  // caller flags ever land after the positional patterns, node drops --test-only,
  // the nested run executes this very file, and it spawns again without limit.
  //
  // The guard must not be a flag: --test-only is itself position-sensitive, so it
  // is disarmed by the exact defect it would be guarding against. An environment
  // variable survives argument-order bugs entirely.
  const result = spawnSync(process.execPath, ["scripts/run-tests.mjs"], {
    encoding: "utf8",
    shell: false,
    env: { ...process.env, FORGEBOARD_TEST_DEPTH: "2" },
  });

  assert.notEqual(result.status, 0, "a third nesting level must not run");
  assert.match(result.stderr, /nested/i);
});

test("each spawned run is handed a depth one greater than its own", () => {
  // Without this the depth never increases, the guard never trips, and the
  // recursion is unbounded again.
  assert.equal(childEnv({}).FORGEBOARD_TEST_DEPTH, "1");
  assert.equal(
    childEnv({ FORGEBOARD_TEST_DEPTH: "1" }).FORGEBOARD_TEST_DEPTH,
    "2",
  );
  // Unrelated variables must survive: the child needs PATH and the rest.
  assert.equal(childEnv({ PATH: "/x" }).PATH, "/x");
});

test("the suite's children never inherit git's location variables", () => {
  // A run started from inside a git hook carries GIT_DIR and GIT_WORK_TREE, and
  // GIT_DIR overrides the cwd a fixture passes. Every fixture git call then writes
  // to the host repository instead of the fixture — which is how this repo's shared
  // config acquired `user.name = Fixture` and 51 commits were authored by a test
  // scaffold. Scrubbed once here because there are ~154 such calls in the suite.
  const polluted = {
    GIT_DIR: "/host/.git",
    GIT_WORK_TREE: "/host",
    GIT_INDEX_FILE: "/host/.git/index",
    GIT_OBJECT_DIRECTORY: "/host/.git/objects",
    GIT_ALTERNATE_OBJECT_DIRECTORIES: "/other/.git/objects",
    GIT_PREFIX: "sub/",
    PATH: "/keep/me",
  };

  const child = childEnv(polluted);

  for (const name of Object.keys(polluted)) {
    if (name === "PATH") continue;
    assert.equal(child[name], undefined, `${name} must not reach a fixture`);
  }
  assert.equal(child.PATH, "/keep/me", "unrelated variables must survive");
});

test("every test file lives in exactly one tier directory", () => {
  // Membership is the directory, so this asserts the directories stay pure: a
  // test placed in a unit directory that scaffolds a repo would run at
  // pre-commit again, which is the defect the split exists to fix. A new
  // directory matching neither list is the other failure — it would stop running
  // at both gates and in CI while the suite still reported green.
  const globs = [...TIERS.UNIT, ...TIERS.INTEGRATION];
  const covered = new Set<string>();
  for (const glob of globs) {
    const dir = glob.slice(0, glob.lastIndexOf("/"));
    if (!glob.includes("*")) {
      covered.add(glob);
      continue;
    }
    for (const f of readdirSync(dir)) {
      if (f.endsWith(".test.ts")) covered.add(dir + "/" + f);
    }
  }

  const onDisk: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = dir + "/" + e.name;
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".test.ts")) onDisk.push(full);
    }
  };
  walk("test");

  // test/timing has its own script and belongs to neither gate, deliberately.
  const orphans = onDisk.filter(
    (f) => !covered.has(f) && !f.startsWith("test/timing/"),
  );
  assert.deepEqual(
    orphans,
    [],
    `these files are in no tier:\n${orphans.join("\n")}`,
  );

  const both = TIERS.UNIT.filter((g) => TIERS.INTEGRATION.includes(g));
  assert.deepEqual(both, [], "no directory may be in both tiers");
});
