import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPipelineCommands } from "../../src/gates/stagedPipeline.ts";
import type { GuardrailsConfig } from "../../src/config/types.ts";

const config = {
  appName: "fixture",
  defaultBranch: "main",
  statusContract: { enabled: false, ticketIdPattern: "[A-Z]+-\\d+" },
  lintStaged: { "*.js": "eslint --fix" },
  components: { api: { paths: ["src/api/**"] } }
} as unknown as GuardrailsConfig;

const ctx = { config, changedComponents: ["api"], cliPath: "C:\\tk\\src\\cli.ts", reportPath: "C:\\tmp\\r.json" };

test("runs the built-in file gates first, over every staged file", () => {
  const commands = buildPipelineCommands(["src/api/a.js", "docs/b.md"], ctx);

  assert.match(commands[0], /gate file-gates --/);
  assert.match(commands[0], /"src\/api\/a\.js"/);
  assert.match(commands[0], /"docs\/b\.md"/);
});

test("runs configured lintStaged rules after the built-ins, scoped to matching files", () => {
  const commands = buildPipelineCommands(["src/api/a.js", "docs/b.md"], ctx);

  const eslint = commands.find((c) => c.startsWith("eslint --fix"));
  assert.ok(eslint, "expected the configured rule to run");
  assert.match(eslint, /"src\/api\/a\.js"/);
  assert.ok(!eslint.includes("b.md"), "a .md file must not be handed to a *.js rule");
});

test("runs the component gates last, naming the changed components and the report path", () => {
  const commands = buildPipelineCommands(["src/api/a.js"], ctx);

  const last = commands.at(-1) ?? "";
  assert.match(last, /gate components --out "C:\\tmp\\r\.json" -- "api"/);
});

test("quotes every path so filenames containing spaces survive argv parsing", () => {
  const commands = buildPipelineCommands(["src/api/my file.js"], ctx);

  assert.match(commands[0], /"src\/api\/my file\.js"/);
});
