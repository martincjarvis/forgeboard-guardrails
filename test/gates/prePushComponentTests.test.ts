import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPrePushComponentTests } from "../../src/gates/prePushComponentTests.ts";
import { GateFailure } from "../../src/errors/GateFailure.ts";
import type { GuardrailsConfig } from "../../src/config/types.ts";

function cfg(components: GuardrailsConfig["components"]): GuardrailsConfig {
  return {
    appName: "x",
    defaultBranch: "main",
    statusContract: { enabled: false, ticketIdPattern: "[A-Z]+-\\d+" },
    components,
  };
}

test("runs integration and e2e for each changed component and passes", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-cmp-"));
  const results = runPrePushComponentTests(
    cfg({
      api: {
        paths: ["src/api/**"],
        integrationTest: 'node -e "process.exit(0)"',
        e2eTest: 'node -e "process.exit(0)"',
      },
    }),
    ["api"],
    dir,
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].component, "api");
  assert.equal(results[0].integration.pass, true);
  assert.equal(results[0].e2e.pass, true);
  rmSync(dir, { recursive: true, force: true });
});

test("throws GateFailure when a component integration test fails", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-cmp-"));
  assert.throws(
    () =>
      runPrePushComponentTests(
        cfg({
          api: {
            paths: ["src/api/**"],
            integrationTest: 'node -e "process.exit(1)"',
          },
        }),
        ["api"],
        dir,
      ),
    (err: unknown) =>
      err instanceof GateFailure && err.gate === "integration-test",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("skips components with no integration or e2e commands", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-cmp-"));
  const results = runPrePushComponentTests(
    cfg({ api: { paths: ["src/api/**"] } }),
    ["api"],
    dir,
  );
  assert.equal(results[0].integration.pass, true); // empty sequence passes
  assert.equal(results[0].e2e.pass, true);
  rmSync(dir, { recursive: true, force: true });
});
