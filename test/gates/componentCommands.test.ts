import { test } from "node:test";
import assert from "node:assert/strict";
import { runComponentGates } from "../../src/gates/componentCommands.ts";
import type { GuardrailsConfig } from "../../src/config/types.ts";

const config: GuardrailsConfig = {
  appName: "acme",
  defaultBranch: "main",
  statusContract: { enabled: false, ticketIdPattern: "[A-Z]+-\\d+" },
  components: {
    api: {
      paths: ["src/api/**"],
      build: 'node -e "process.exit(0)"',
      unitTest: 'node -e "process.exit(0)"',
    },
    web: {
      paths: ["src/web/**"],
      build: 'node -e "process.exit(1)"',
    },
  },
};

test("runs build and unitTest for each changed component", () => {
  const results = runComponentGates(config, ["api"], process.cwd());
  assert.equal(results.length, 1);
  assert.equal(results[0].component, "api");
  assert.equal(results[0].build.pass, true);
  assert.equal(results[0].unitTest.pass, true);
});

test("reports a failing build without requiring unitTest to be declared", () => {
  const results = runComponentGates(config, ["web"], process.cwd());
  assert.equal(results[0].build.pass, false);
  assert.equal(results[0].unitTest.pass, true); // undeclared -> vacuous pass
});
