import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classifyFiles } from "../../src/gates/fileClassify.ts";
import type { GuardrailsConfig } from "../../src/config/types.ts";

function baseConfig(agentHooks = {}): GuardrailsConfig {
  return {
    appName: "x",
    defaultBranch: "main",
    statusContract: { enabled: false, ticketIdPattern: "[A-Z]+-\\d+" },
    agentHooks,
    components: {},
  };
}

test("assigns each category by the first-match-wins order", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-cls-"));
  const files = [
    "src/app.ts", // production
    "src/app.test.ts", // test (before production)
    "config.yaml", // config
    "package-lock.json", // generated (lockfile, before config)
    "src/x.generated.ts", // generated (before production)
    "CLAUDE.md", // agent
    ".claude/commands/do.md", // agent
    "docs/adr/0001.md", // other
    "README.md", // other
  ];
  for (const f of files) {
    mkdirSync(join(dir, f, ".."), { recursive: true });
    writeFileSync(join(dir, f), "x\n");
  }
  const b = await classifyFiles(files, dir, baseConfig());
  assert.deepEqual(b.production, ["src/app.ts"]);
  assert.deepEqual(b.test, ["src/app.test.ts"]);
  assert.deepEqual(b.config, ["config.yaml"]);
  assert.deepEqual(b.generated.sort(), [
    "package-lock.json",
    "src/x.generated.ts",
  ]);
  assert.deepEqual(b.agent.sort(), [".claude/commands/do.md", "CLAUDE.md"]);
  assert.deepEqual(b.other.sort(), ["README.md", "docs/adr/0001.md"]);
  rmSync(dir, { recursive: true, force: true });
});

test("honours .prettierignore as generated", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-cls-pi-"));
  writeFileSync(join(dir, ".prettierignore"), "vendored.ts\n");
  writeFileSync(join(dir, "vendored.ts"), "x\n");
  writeFileSync(join(dir, "keep.ts"), "x\n");
  const b = await classifyFiles(["vendored.ts", "keep.ts"], dir, baseConfig());
  assert.deepEqual(b.generated, ["vendored.ts"]);
  assert.deepEqual(b.production, ["keep.ts"]);
  rmSync(dir, { recursive: true, force: true });
});

test("classifies a deleted (non-existent) file by name without reading it", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-cls-del-"));
  // gone.ts is never written to disk — a deletion in a diff.
  const b = await classifyFiles(["gone.ts"], dir, baseConfig());
  assert.deepEqual(b.production, ["gone.ts"]);
  rmSync(dir, { recursive: true, force: true });
});

test("honours custom globs and extensions", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-cls-x-"));
  writeFileSync(join(dir, "a.ts"), "x\n");
  writeFileSync(join(dir, "a.rules"), "x\n");
  const b = await classifyFiles(
    ["a.ts", "a.rules"],
    dir,
    baseConfig({ agentDocs: { globs: ["*.rules"] } }),
  );
  assert.deepEqual(b.agent, ["a.rules"]);
  assert.deepEqual(b.production, ["a.ts"]);
  rmSync(dir, { recursive: true, force: true });
});
