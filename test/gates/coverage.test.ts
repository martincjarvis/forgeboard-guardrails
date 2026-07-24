import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCoverageGate } from "../../src/gates/coverage.ts";
import { GateFailure } from "../../src/errors/GateFailure.ts";
import type { GuardrailsConfig } from "../../src/config/types.ts";

function baseConfig(coverage?: string | string[]): GuardrailsConfig {
  return {
    appName: "x",
    defaultBranch: "main",
    statusContract: { enabled: false, ticketIdPattern: "[A-Z]+-\\d+" },
    coverage,
    components: {},
  };
}

test("passes when the coverage command exits zero", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-cov-"));
  assert.doesNotThrow(() =>
    runCoverageGate(baseConfig('node -e "process.exit(0)"'), dir),
  );
  rmSync(dir, { recursive: true, force: true });
});

test("throws GateFailure when the coverage command exits non-zero", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-cov-"));
  assert.throws(
    () =>
      runCoverageGate(
        baseConfig(
          "node -e \"console.error('lines 72% < 80%'); process.exit(1)\"",
        ),
        dir,
      ),
    (err: unknown) => err instanceof GateFailure && err.gate === "coverage",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("no-op when coverage is unset", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-cov-"));
  assert.doesNotThrow(() => runCoverageGate(baseConfig(undefined), dir));
  rmSync(dir, { recursive: true, force: true });
});
