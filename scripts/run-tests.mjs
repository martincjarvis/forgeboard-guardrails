import { spawnSync } from "node:child_process";

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

/**
 * Builds the node argument vector. Caller arguments MUST land before the
 * positional patterns: node silently ignores coverage and reporter flags
 * that appear after them (exit 0, no warning, no artifact written), which
 * is why this wrapper exists instead of `npm run test:coverage -- <flags>`.
 */
export function buildArgs(argv) {
  const on = (flag) => argv.includes(flag);
  const passthrough = argv.filter((a) => a !== "--coverage");
  return [
    "--import",
    "tsx",
    "--test",
    ...(on("--coverage") ? COVERAGE : []),
    ...passthrough,
    ...PATTERNS,
  ];
}

if (import.meta.main) {
  const result = spawnSync(process.execPath, buildArgs(process.argv.slice(2)), {
    stdio: "inherit",
  });
  process.exit(result.status ?? 1);
}
