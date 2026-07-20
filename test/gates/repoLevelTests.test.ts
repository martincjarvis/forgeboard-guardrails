import { test } from "node:test";
import assert from "node:assert/strict";
import { runRepoLevelTests } from "../../src/gates/repoLevelTests.ts";
import type { GuardrailsConfig } from "../../src/config/types.ts";

test("runs every repo-block command regardless of which component changed", () => {
  const config: GuardrailsConfig = {
    appName: "acme",
    defaultBranch: "main",
    statusContract: { enabled: false, ticketIdPattern: "[A-Z]+-\\d+" },
    repo: { architectureTest: "node -e \"process.exit(0)\"" },
    components: {}
  };

  const results = runRepoLevelTests(config, process.cwd());
  assert.equal(results.length, 1);
  assert.equal(results[0].pass, true);
});

test("returns an empty array when no repo block is configured", () => {
  const config: GuardrailsConfig = {
    appName: "acme",
    defaultBranch: "main",
    statusContract: { enabled: false, ticketIdPattern: "[A-Z]+-\\d+" },
    components: {}
  };

  assert.deepEqual(runRepoLevelTests(config, process.cwd()), []);
});
