import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config/load.ts";

function writeConfig(dir: string, content: unknown) {
  mkdirSync(join(dir, ".forgeboard"), { recursive: true });
  writeFileSync(join(dir, ".forgeboard", "guardrails.config.json"), JSON.stringify(content));
}

test("loadConfig fills in statusContract defaults when omitted", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-config-"));
  writeConfig(dir, {
    appName: "acme",
    defaultBranch: "main",
    components: { web: { paths: ["src/web/**"] } }
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
