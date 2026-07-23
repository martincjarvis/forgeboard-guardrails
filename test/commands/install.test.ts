import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { runInstall } from "../../src/commands/install.ts";

function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "gr-install-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: dir });
  return dir;
}

test("scaffolds config, editorconfig, gitattributes, prettierignore, and hook shims", async () => {
  const dir = initRepo();

  await runInstall(dir);

  assert.ok(existsSync(join(dir, ".forgeboard", "guardrails.config.json")));
  assert.ok(existsSync(join(dir, ".editorconfig")));
  assert.ok(existsSync(join(dir, ".gitattributes")));
  assert.ok(existsSync(join(dir, ".prettierignore")));
  assert.ok(existsSync(join(dir, ".markdownlint.jsonc")));
  assert.ok(existsSync(join(dir, ".git", "hooks", "commit-msg")));
  assert.ok(existsSync(join(dir, ".git", "hooks", "pre-commit")));
});

test("adds .forgeboard/state/ to .gitignore", async () => {
  const dir = initRepo();
  await runInstall(dir);
  const gitignore = readFileSync(join(dir, ".gitignore"), "utf8");
  assert.match(gitignore, /\.forgeboard\/state\//);
});

test("is idempotent: never overwrites an existing config", async () => {
  const dir = initRepo();
  await runInstall(dir);
  // Replace with a valid-but-custom config that differs from the starter template.
  // (Must stay schema-valid: runInstall calls loadConfig for the doctor check.)
  const custom = {
    appName: "custom-app",
    defaultBranch: "main",
    components: { bespoke: { paths: ["src/bespoke/**"] } },
  };
  writeFileSync(
    join(dir, ".forgeboard", "guardrails.config.json"),
    JSON.stringify(custom),
  );

  await runInstall(dir);

  const config = JSON.parse(
    readFileSync(join(dir, ".forgeboard", "guardrails.config.json"), "utf8"),
  );
  assert.equal(config.appName, "custom-app");
  assert.deepEqual(Object.keys(config.components), ["bespoke"]);
});
