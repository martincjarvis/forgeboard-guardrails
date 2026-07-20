import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { runInstall } from "../../src/commands/install.ts";

test("install copies the guardrails-config skill and adds a $schema pointer", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-skill-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: dir });

  await runInstall(dir);

  assert.ok(existsSync(join(dir, ".claude", "skills", "guardrails-config", "SKILL.md")));
  const config = JSON.parse(readFileSync(join(dir, ".forgeboard", "guardrails.config.json"), "utf8"));
  assert.match(config.$schema, /guardrails\.config\.schema\.json/);
});
