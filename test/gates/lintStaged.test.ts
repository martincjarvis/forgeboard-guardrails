import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildLintStagedPlan,
  resolveFilesByRule,
  type LintRule,
} from "../../src/gates/lintStaged.ts";
import type { GuardrailsConfig } from "../../src/config/types.ts";

const config: GuardrailsConfig = {
  appName: "acme",
  defaultBranch: "main",
  statusContract: { enabled: false, ticketIdPattern: "[A-Z]+-\\d+" },
  lintStaged: { "**/*.json": "prettier --write" },
  components: {
    api: {
      paths: ["src/api/**"],
      lintStaged: { "*.cs": "dotnet format --include" },
    },
    web: { paths: ["src/web/**"], lintStaged: { "**/*.json": "eslint --fix" } },
  },
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
        JSON.stringify(r.paths) === JSON.stringify(["src/api/**"]),
    ),
  );
});

test("resolves a file to the component rule that overrides a same-glob top-level rule", () => {
  const rules: LintRule[] = [
    { glob: "**/*.json", command: "prettier --write" },
    { glob: "**/*.json", command: "eslint --fix", paths: ["src/web/**"] },
  ];
  const resolved = resolveFilesByRule(rules, ["src/web/a.json"]);
  assert.deepEqual(resolved.get(1), ["src/web/a.json"]);
  assert.equal(resolved.get(0), undefined);
});

test("leaves files outside the overriding component with the top-level rule", () => {
  const rules: LintRule[] = [
    { glob: "**/*.json", command: "prettier --write" },
    { glob: "**/*.json", command: "eslint --fix", paths: ["src/web/**"] },
  ];
  const resolved = resolveFilesByRule(rules, ["src/api/b.json"]);
  assert.deepEqual(resolved.get(0), ["src/api/b.json"]);
  assert.equal(resolved.get(1), undefined);
});

test("does not apply a component-scoped rule to files outside its paths", () => {
  const rules: LintRule[] = [
    { glob: "*.cs", command: "dotnet format", paths: ["src/api/**"] },
  ];
  const resolved = resolveFilesByRule(rules, ["src/web/x.cs"]);
  assert.equal(resolved.size, 0);
});

test("skips a file that no rule matches", () => {
  const rules: LintRule[] = [{ glob: "*.js", command: "eslint" }];
  const resolved = resolveFilesByRule(rules, ["docs/readme.md"]);
  assert.equal(resolved.size, 0);
});
