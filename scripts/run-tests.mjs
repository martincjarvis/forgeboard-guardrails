import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
  renameSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * The single source of truth for which files the suite runs. Kept in this
 * order deliberately. `npm test`, the coverage gate, and the report run all
 * read this one list — do not re-declare it in package.json.
 */
const PATTERNS = [
  "test/scenarios/*.test.ts",
  "test/config/*.test.ts",
  "test/docs/*.test.ts",
  "test/git/*.test.ts",
  "test/exec/*.test.ts",
  "test/gates/*.test.ts",
  "test/status/*.test.ts",
  "test/hooks/*.test.ts",
  "test/commands/*.test.ts",
  "test/versioning/*.test.ts",
  "test/fixtures/*.test.ts",
  "test/scripts/*.test.ts",
  "test/cli.test.ts",
];

const COVERAGE = [
  "--experimental-test-coverage",
  "--test-coverage-exclude=test/**",
  // The JSON schemas are counted as covered source otherwise, putting
  // meaningless rows in the coverage table.
  "--test-coverage-exclude=schemas/**",
];

const LCOV = "coverage/lcov.info";

/**
 * `--test-reporter` REPLACES the default reporter rather than adding to it.
 * Omitting spec->stdout here yields zero bytes of human-readable output and
 * loses the coverage table from every CI log.
 */
const REPORT = [
  "--test-reporter=spec",
  "--test-reporter-destination=stdout",
  "--test-reporter=lcov",
  `--test-reporter-destination=${LCOV}`,
  "--test-reporter=junit",
  "--test-reporter-destination=coverage/junit.xml",
];

/**
 * Builds the node argument vector. Caller arguments MUST land before the
 * positional patterns: node silently ignores coverage and reporter flags
 * that appear after them (exit 0, no warning, no artifact written), which
 * is why this wrapper exists instead of `npm run test:coverage -- <flags>`.
 */
export function buildArgs(argv) {
  const on = (flag) => argv.includes(flag);
  const passthrough = argv.filter(
    (a) => a !== "--coverage" && a !== "--report",
  );
  return [
    "--import",
    "tsx",
    "--test",
    ...(on("--coverage") ? COVERAGE : []),
    ...(on("--report") ? REPORT : []),
    ...passthrough,
    ...PATTERNS,
  ];
}

/**
 * How deep a wrapper run is nested inside another wrapper run.
 *
 * One level is legitimate and deliberate: the end-to-end test spawns the wrapper
 * from inside a run the wrapper started. Two is the runaway case — the nested run
 * executes the test file that spawns again, without limit.
 *
 * The guard is an environment variable rather than a flag on purpose. The obvious
 * alternative, leaning on `--test-only` to make the nested run execute nothing, is
 * a positional flag: if caller arguments ever land after the patterns, node
 * silently drops it, and the guard is disarmed by the very defect this wrapper
 * exists to prevent. The environment survives argument-order bugs entirely.
 */
const DEPTH_VAR = "FORGEBOARD_TEST_DEPTH";
const MAX_DEPTH = 1;

/**
 * The suite runs the real gates against fixture repos, so every fixture command
 * lands in the diagnostics log — 611 of 1,653 entries in this repo's log were
 * `node -e "process.exit(0)"` and friends, drowning the entries a developer was
 * actually looking for. Tests get their own directory, thrown away afterwards.
 */
const TEST_LOG_DIR = join(tmpdir(), "forgeboard-test-logs");

export function childEnv(env) {
  return {
    ...env,
    [DEPTH_VAR]: String(Number(env[DEPTH_VAR] ?? "0") + 1),
    FORGEBOARD_LOG_DIR: TEST_LOG_DIR,
    // Each test process gets its own file rather than inheriting this one's, so a
    // suite run does not serialise a dozen writers onto a single handle.
    FORGEBOARD_LOG_SESSION: "",
  };
}

if (import.meta.main) {
  const depth = Number(process.env[DEPTH_VAR] ?? "0");
  if (depth > MAX_DEPTH) {
    console.error(
      `run-tests: refusing to run, nested ${depth} levels deep inside itself.\n` +
        `This means a spawned run executed the suite instead of skipping it — check that\n` +
        `caller flags still precede the positional patterns in buildArgs().`,
    );
    process.exit(1);
  }

  const args = buildArgs(process.argv.slice(2));

  // Reporter flags and destination flags are positional pairs: the Nth
  // --test-reporter is written to the Nth --test-reporter-destination. Pair
  // them so we act on the destinations actually in use, not a hard-coded path
  // — the caller may point lcov anywhere, and the tests do exactly that.
  const reporters = [];
  const destinations = [];
  for (const arg of args) {
    if (arg.startsWith("--test-reporter=")) {
      reporters.push(arg.slice("--test-reporter=".length));
    } else if (arg.startsWith("--test-reporter-destination=")) {
      destinations.push(arg.slice("--test-reporter-destination=".length));
    }
  }

  // Node opens reporter destinations directly and does not mkdir -p them:
  // a missing directory is exit 7 (ENOENT) before any test runs.
  for (const dest of destinations) {
    if (dest !== "stdout" && dest !== "stderr") {
      mkdirSync(dirname(dest), { recursive: true });
    }
  }

  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    env: childEnv(process.env),
  });
  // A failed run's logs are moved somewhere this will never sweep, then the working
  // directory is cleared either way.
  //
  // Keeping them in place and deleting only on success was not enough: the natural
  // response to an intermittent failure is to re-run, and the passing re-run then
  // deleted the failing run's evidence. That happened to a reviewer chasing exactly
  // the defect these logs exist for, which is the second time this instrument has
  // erased the thing it was built to capture.
  if (result.status !== 0) {
    const kept = `${TEST_LOG_DIR}-failed-${Date.now()}`;
    try {
      renameSync(TEST_LOG_DIR, kept);
      console.error(`\nSuite failed. Command logs kept at: ${kept}`);
    } catch {
      console.error(`\nSuite failed. Command logs at: ${TEST_LOG_DIR}`);
    }
  }
  rmSync(TEST_LOG_DIR, { recursive: true, force: true });

  // On Windows the lcov reporter emits backslashed SF: paths, which common
  // lcov consumers cannot resolve. Windows is the primary platform.
  // Normalise the lcov destination actually used — NOT a hard-coded path.
  // Hard-coding it would leave a caller-supplied destination untouched
  // while read-modify-writing the repo's own coverage/lcov.info on every run,
  // corrupting the gate's artifact from inside a nested test spawn.
  const lcovDest = destinations[reporters.indexOf("lcov")];
  if (lcovDest && existsSync(lcovDest)) {
    writeFileSync(
      lcovDest,
      readFileSync(lcovDest, "utf8").replaceAll("\\", "/"),
    );
  }

  process.exit(result.status ?? 1);
}
