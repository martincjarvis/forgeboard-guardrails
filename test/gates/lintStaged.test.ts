import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLintStagedPlan } from "../../src/gates/lintStaged.ts";
import type { GuardrailsConfig } from "../../src/config/types.ts";

const config: GuardrailsConfig = {
  appName: "acme",
  defaultBranch: "main",
  statusContract: { enabled: false, ticketIdPattern: "[A-Z]+-\\d+" },
  lintStaged: { "**/*.json": "prettier --write" },
  components: {
    api: { paths: ["src/api/**"], lintStaged: { "*.cs": "dotnet format --include" } },
    web: { paths: ["src/web/**"], lintStaged: { "**/*.json": "eslint --fix" } }
  }
};

test("top-level entries become path-agnostic rules", () => {
  const rules = buildLintStagedPlan(config, []);
  assert.deepEqual(rules, [{ glob: "**/*.json", command: "prettier --write" }]);
});

test("a changed component's entries are scoped to that component's paths", () => {
  const rules = buildLintStagedPlan(config, ["api"]);
  assert.ok(
    rules.some(
      (r) =>
        r.glob === "*.cs" &&
        r.command === "dotnet format --include" &&
        JSON.stringify(r.paths) === JSON.stringify(["src/api/**"])
    )
  );
});
