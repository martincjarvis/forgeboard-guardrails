import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config/load.ts";

function writeConfig(dir: string, content: unknown) {
  mkdirSync(join(dir, ".forgeboard"), { recursive: true });
  writeFileSync(
    join(dir, ".forgeboard", "guardrails.config.json"),
    JSON.stringify(content),
  );
}

test("loadConfig fills in statusContract defaults when omitted", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-config-"));
  writeConfig(dir, {
    appName: "acme",
    defaultBranch: "main",
    components: { web: { paths: ["src/web/**"] } },
  });

  const config = loadConfig(dir);

  assert.equal(config.statusContract.enabled, false);
  assert.equal(config.statusContract.ticketIdPattern, "[A-Z]+-\\d+");
});

test("loadConfig throws naming the missing file when config absent", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-config-"));
  assert.throws(() => loadConfig(dir), /guardrails\.config\.json/);
});

test("loadConfig throws on schema-invalid config", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-config-"));
  writeConfig(dir, { appName: "acme" }); // missing defaultBranch, components
  assert.throws(() => loadConfig(dir), /defaultBranch|components/);
});

test("loadConfig accepts a top-level coverage command", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-cfg-"));
  mkdirSync(join(dir, ".forgeboard"), { recursive: true });
  writeFileSync(
    join(dir, ".forgeboard", "guardrails.config.json"),
    JSON.stringify({
      appName: "x",
      defaultBranch: "main",
      statusContract: { enabled: false, ticketIdPattern: "[A-Z]+-\\d+" },
      coverage: ["npm run cov", "lcov-check --min 80"],
      components: {},
    }),
  );
  const config = loadConfig(dir);
  assert.deepEqual(config.coverage, ["npm run cov", "lcov-check --min 80"]);
  rmSync(dir, { recursive: true, force: true });
});

test("accepts an agentHooks block", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-cfg-ah-"));
  writeConfig(dir, {
    appName: "x",
    defaultBranch: "main",
    components: { c: { paths: ["src/**"] } },
    agentHooks: {
      prSize: { warn: 300, error: 700 },
      maxFileLines: 500,
      codeExtensions: [".ts"],
      exclude: ["**/vendor/**"],
      complexity: { ccn: 12, functionLines: 50, params: 4 },
    },
  });
  const config = loadConfig(dir);
  assert.equal(config.agentHooks?.prSize?.error, 700);
});

test("rejects an unknown property inside agentHooks", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-cfg-ah-bad-"));
  writeConfig(dir, {
    appName: "x",
    defaultBranch: "main",
    components: { c: { paths: ["src/**"] } },
    agentHooks: { bogus: true },
  });
  assert.throws(() => loadConfig(dir), /Invalid guardrails.config.json/);
});

test("accepts the new agentHooks classification fields", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-cfg-cls-"));
  writeConfig(dir, {
    appName: "x",
    defaultBranch: "main",
    components: { c: { paths: ["src/**"] } },
    agentHooks: {
      configExtensions: [".json", ".yaml"],
      testGlobs: ["**/*.spec.ts"],
      agentDocs: { globs: ["CLAUDE.md"], warn: 150, error: 400 },
    },
  });
  const config = loadConfig(dir);
  assert.equal(config.agentHooks?.agentDocs?.error, 400);
  assert.deepEqual(config.agentHooks?.testGlobs, ["**/*.spec.ts"]);
});

test("rejects an unknown property inside agentDocs", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-cfg-cls-bad-"));
  writeConfig(dir, {
    appName: "x",
    defaultBranch: "main",
    components: { c: { paths: ["src/**"] } },
    agentHooks: { agentDocs: { bogus: true } },
  });
  assert.throws(() => loadConfig(dir), /Invalid guardrails.config.json/);
});
