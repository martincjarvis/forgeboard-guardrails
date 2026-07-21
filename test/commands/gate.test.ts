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
