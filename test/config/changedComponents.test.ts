import { test } from "node:test";
import assert from "node:assert/strict";
import { computeChangedComponents } from "../../src/config/changedComponents.ts";
import type { GuardrailsConfig } from "../../src/config/types.ts";

const config: GuardrailsConfig = {
  appName: "acme",
  defaultBranch: "main",
  statusContract: { enabled: false, ticketIdPattern: "[A-Z]+-\\d+" },
  components: {
    "shared-lib": { paths: ["src/shared/**"] },
    api: { paths: ["src/api/**"], dependsOn: ["shared-lib"] },
    web: { paths: ["src/web/**"], dependsOn: ["shared-lib"] },
    infra: { paths: ["infra/**"] },
  },
};

test("matches components whose paths glob a staged file", () => {
  const result = computeChangedComponents(config, ["src/api/handler.ts"]);
  assert.deepEqual(new Set(result), new Set(["api"]));
});

test("propagates through dependsOn transitively", () => {
  const result = computeChangedComponents(config, ["src/shared/util.ts"]);
  assert.deepEqual(new Set(result), new Set(["shared-lib", "api", "web"]));
});

test("returns empty when nothing staged matches any component", () => {
  const result = computeChangedComponents(config, ["README.md"]);
  assert.deepEqual(result, []);
});
