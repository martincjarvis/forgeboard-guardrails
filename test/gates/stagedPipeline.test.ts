import { test } from "node:test";
import assert from "node:assert/strict";
import { buildUserRuleCommands } from "../../src/gates/stagedPipeline.ts";
import type { GuardrailsConfig } from "../../src/config/types.ts";

const config = {
  appName: "fixture",
  defaultBranch: "main",
  statusContract: { enabled: false, ticketIdPattern: "[A-Z]+-\\d+" },
  lintStaged: { "*.js": "eslint --fix" },
  components: { api: { paths: ["src/api/**"] } }
} as unknown as GuardrailsConfig;

test("builds a command per matching rule, scoped to the files that rule owns", () => {
  const commands = buildUserRuleCommands(config, ["api"], ["src/api/a.js", "docs/b.md"]);

  assert.equal(commands.length, 1);
  assert.match(commands[0], /^eslint --fix /);
  assert.match(commands[0], /"src\/api\/a\.js"/);
  assert.ok(!commands[0].includes("b.md"), "a .md file must not be handed to a *.js rule");
});

test("quotes every path so filenames containing spaces survive shell parsing", () => {
  const commands = buildUserRuleCommands(config, ["api"], ["src/api/my file.js"]);

  assert.match(commands[0], /"src\/api\/my file\.js"/);
});

test("produces nothing when no configured rule matches the staged files", () => {
  const commands = buildUserRuleCommands(config, ["api"], ["docs/b.md"]);

  assert.deepEqual(commands, []);
});
