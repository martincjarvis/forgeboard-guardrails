import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runComplexityGate } from "../../src/gates/complexity.ts";
import { GateFailure } from "../../src/errors/GateFailure.ts";
import { lizardAvailable } from "../support/lizard.ts";
import type { GuardrailsConfig } from "../../src/config/types.ts";

const canRunLizard = lizardAvailable();

function config(complexity?: {
  ccn?: number;
  functionLines?: number;
  params?: number;
}): GuardrailsConfig {
  return {
    appName: "x",
    defaultBranch: "main",
    statusContract: { enabled: false, ticketIdPattern: "[A-Z]+-\\d+" },
    agentHooks: complexity ? { complexity } : {},
    components: {},
  };
}

// A function with high cyclomatic complexity (many branches).
const COMPLEX = `def f(n):
${Array.from({ length: 20 }, (_, i) => `    if n == ${i}:\n        return ${i}`).join("\n")}
    return -1
`;

test("no-op when complexity is unconfigured", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-cx-off-"));
  writeFileSync(join(dir, "a.py"), COMPLEX);
  assert.doesNotThrow(() => runComplexityGate(["a.py"], dir, config()));
  rmSync(dir, { recursive: true, force: true });
});

test(
  "throws GateFailure on an over-threshold function when configured",
  { skip: !canRunLizard && "lizard not installed (pip install lizard)" },
  () => {
    const dir = mkdtempSync(join(tmpdir(), "gr-cx-fail-"));
    writeFileSync(join(dir, "a.py"), COMPLEX);
    assert.throws(
      () => runComplexityGate(["a.py"], dir, config({ ccn: 5 })),
      (err: unknown) => err instanceof GateFailure && err.gate === "complexity",
    );
    rmSync(dir, { recursive: true, force: true });
  },
);

test(
  "passes a simple function when configured",
  { skip: !canRunLizard && "lizard not installed (pip install lizard)" },
  () => {
    const dir = mkdtempSync(join(tmpdir(), "gr-cx-ok-"));
    writeFileSync(join(dir, "a.py"), "def add(a, b):\n    return a + b\n");
    assert.doesNotThrow(() =>
      runComplexityGate(["a.py"], dir, config({ ccn: 15 })),
    );
    rmSync(dir, { recursive: true, force: true });
  },
);

test("configured-but-absent Lizard is a named GateFailure, not a silent skip", () => {
  if (canRunLizard) return; // only meaningful when Lizard is genuinely absent
  const dir = mkdtempSync(join(tmpdir(), "gr-cx-absent-"));
  writeFileSync(join(dir, "a.py"), COMPLEX);
  assert.throws(
    () => runComplexityGate(["a.py"], dir, config({ ccn: 5 })),
    (err: unknown) =>
      err instanceof GateFailure && /pip install lizard/.test(err.message),
  );
  rmSync(dir, { recursive: true, force: true });
});
