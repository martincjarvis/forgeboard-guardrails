import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLintStagedPlan, runLintStagedPlan } from "../../src/gates/lintStaged.ts";
import type { LintRule } from "../../src/gates/lintStaged.ts";
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

const pass = 'node -e "process.exit(0)"';
const fail = 'node -e "process.exit(1)"';

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

test("a component-scoped command runs on files inside the component's paths", () => {
  const rules: LintRule[] = [{ glob: "**/*.json", command: fail, paths: ["src/web/**"] }];
  const result = runLintStagedPlan(rules, ["src/web/a.json"], process.cwd());
  assert.equal(result.pass, false); // it ran (and this one fails) on the in-scope file
});

test("a component-scoped command does not run on files outside the component's paths", () => {
  const rules: LintRule[] = [{ glob: "**/*.json", command: fail, paths: ["src/web/**"] }];
  const result = runLintStagedPlan(rules, ["src/api/b.json"], process.cwd());
  assert.equal(result.pass, true); // path-scoped out — the failing command never ran
});

test("a component entry overrides a same-glob top-level entry for the component's own files", () => {
  const rules: LintRule[] = [
    { glob: "**/*.json", command: fail }, // top-level would fail
    { glob: "**/*.json", command: pass, paths: ["src/web/**"] } // component wins for web files
  ];
  const result = runLintStagedPlan(rules, ["src/web/a.json"], process.cwd());
  assert.equal(result.pass, true); // web's passing command overrode the top-level failing one
});

test("the top-level entry still applies to files outside the overriding component's paths", () => {
  const rules: LintRule[] = [
    { glob: "**/*.json", command: fail }, // top-level
    { glob: "**/*.json", command: pass, paths: ["src/web/**"] } // scoped to web only
  ];
  const result = runLintStagedPlan(rules, ["src/api/b.json"], process.cwd());
  assert.equal(result.pass, false); // api file falls through to the failing top-level rule
});

test("skips a rule with no matching staged files entirely", () => {
  const rules: LintRule[] = [{ glob: "*.cs", command: fail }];
  const result = runLintStagedPlan(rules, ["a.ts"], process.cwd());
  assert.equal(result.pass, true);
});
