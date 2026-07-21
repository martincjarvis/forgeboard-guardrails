import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runFileGates } from "../../src/commands/gate.ts";
import { skipWithoutSemgrep } from "../support/semgrep.ts";

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "gr-gate-"));
  writeFileSync(join(dir, ".prettierignore"), "node_modules\n");
  // The bundled secretlint and cspell gates read these configs; `guardrails install`
  // would scaffold them in production. Mirror that here so the gates find configs,
  // matching the pattern in test/hooks/preCommitHook.test.ts and test/gates/secretScan.test.ts.
  const pkgRoot = process.cwd();
  copyFileSync(join(pkgRoot, ".secretlintrc.json"), join(dir, ".secretlintrc.json"));
  copyFileSync(join(pkgRoot, "cspell.json"), join(dir, "cspell.json"));
  return dir;
}

test("formats in place and passes on clean content", { skip: skipWithoutSemgrep }, async () => {
  const dir = scratch();
  writeFileSync(join(dir, "a.js"), "const x   =    1\n");

  const code = await runFileGates(["a.js"], dir);

  assert.equal(code, 0);
  assert.equal(readFileSync(join(dir, "a.js"), "utf8"), "const x = 1;\n");
  rmSync(dir, { recursive: true, force: true });
});

test("returns 1 naming the gate when a built-in rejects", { skip: skipWithoutSemgrep }, async () => {
  const dir = scratch();
  writeFileSync(join(dir, "a.md"), "# One\n\n# Two\n");

  const code = await runFileGates(["a.md"], dir);

  assert.equal(code, 1);
  rmSync(dir, { recursive: true, force: true });
});

test("passes an empty file list without invoking any tool", async () => {
  const dir = scratch();

  const code = await runFileGates([], dir);

  assert.equal(code, 0);
  rmSync(dir, { recursive: true, force: true });
});

import { mkdirSync } from "node:fs";
import { runComponentGatesCommand } from "../../src/commands/gate.ts";

function componentFixture(buildCommand: string): string {
  const dir = mkdtempSync(join(tmpdir(), "gr-comp-"));
  mkdirSync(join(dir, ".forgeboard"), { recursive: true });
  writeFileSync(
    join(dir, ".forgeboard", "guardrails.config.json"),
    JSON.stringify({
      appName: "fixture",
      defaultBranch: "main",
      repo: {},
      components: { api: { paths: ["src/api/**"], build: buildCommand, unitTest: 'node -e "console.log(\'2 passing\')"' } }
    })
  );
  return dir;
}

test("writes a report the caller can read back after the subprocess exits", () => {
  const dir = componentFixture('node -e "process.exit(0)"');
  const outPath = join(mkdtempSync(join(tmpdir(), "gr-report-")), "report.json");

  const code = runComponentGatesCommand(["api"], outPath, dir);

  assert.equal(code, 0);
  const report = JSON.parse(readFileSync(outPath, "utf8"));
  assert.equal(report.components[0].component, "api");
  assert.equal(report.components[0].build.pass, true);
  assert.match(report.components[0].unitTest.steps[0].output, /2 passing/);
  rmSync(dir, { recursive: true, force: true });
});

test("returns 1 and still writes the report when a component build fails", () => {
  const dir = componentFixture('node -e "process.exit(1)"');
  const outPath = join(mkdtempSync(join(tmpdir(), "gr-report-")), "report.json");

  const code = runComponentGatesCommand(["api"], outPath, dir);

  assert.equal(code, 1);
  const report = JSON.parse(readFileSync(outPath, "utf8"));
  assert.equal(report.components[0].build.pass, false);
  rmSync(dir, { recursive: true, force: true });
});
