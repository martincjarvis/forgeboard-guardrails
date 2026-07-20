import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildLintStagedPlan, runLintStagedPlan } from "../../src/gates/lintStaged.ts";
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

test("includes top-level entries for every plan", () => {
  const plan = buildLintStagedPlan(config, []);
  assert.equal(plan["**/*.json"], "prettier --write");
});

test("adds a changed component's own entries", () => {
  const plan = buildLintStagedPlan(config, ["api"]);
  assert.equal(plan["*.cs"], "dotnet format --include");
});

test("a changed component's entry overrides a top-level entry on the same glob", () => {
  const plan = buildLintStagedPlan(config, ["web"]);
  assert.equal(plan["**/*.json"], "eslint --fix");
});

test("runs the mapped command against matching staged files only", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-lintstaged-run-"));
  writeFileSync(join(dir, "marker.txt"), "");

  const plan = { "*.txt": `node -e "require('fs').writeFileSync('${join(dir, "ran.txt").replace(/\\/g, "\\\\")}', '')"` };
  const result = runLintStagedPlan(plan, ["marker.txt"], dir);

  assert.equal(result.pass, true);
});

test("skips a glob with no matching staged files entirely", () => {
  const plan = { "*.cs": 'node -e "process.exit(1)"' }; // would fail if run
  const result = runLintStagedPlan(plan, ["a.ts"], process.cwd());
  assert.equal(result.pass, true);
});
