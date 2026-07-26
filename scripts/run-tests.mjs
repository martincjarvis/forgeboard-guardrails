import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";

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

if (import.meta.main) {
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

  const result = spawnSync(process.execPath, args, { stdio: "inherit" });

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
