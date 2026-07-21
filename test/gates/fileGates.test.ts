import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runFileGates } from "../../src/gates/fileGates.ts";
import { GateFailure } from "../../src/errors/GateFailure.ts";
import { skipWithoutSemgrep } from "../support/semgrep.ts";

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "gr-filegates-"));
  writeFileSync(join(dir, ".prettierignore"), "node_modules\n");
  // The bundled secretlint and cspell gates read these configs; `guardrails install`
  // scaffolds them in production. Mirror that here or the secret-scan gate fails with
  // "secretlint config is not found" — matching test/hooks/preCommitHook.test.ts and
  // test/gates/secretScan.test.ts.
  const pkgRoot = process.cwd();
  copyFileSync(join(pkgRoot, ".secretlintrc.json"), join(dir, ".secretlintrc.json"));
  copyFileSync(join(pkgRoot, "cspell.json"), join(dir, "cspell.json"));
  return dir;
}

test("formats in place and resolves on clean content", { skip: skipWithoutSemgrep }, async () => {
  const dir = scratch();
  writeFileSync(join(dir, "a.js"), "const x   =    1\n");

  await runFileGates(["a.js"], dir);

  assert.equal(readFileSync(join(dir, "a.js"), "utf8"), "const x = 1;\n");
  rmSync(dir, { recursive: true, force: true });
});

test("throws a GateFailure naming the gate when a built-in rejects", { skip: skipWithoutSemgrep }, async () => {
  const dir = scratch();
  writeFileSync(join(dir, "a.md"), "# One\n\n# Two\n");

  await assert.rejects(() => runFileGates(["a.md"], dir), (error: unknown) => {
    assert.ok(error instanceof GateFailure);
    assert.match((error as GateFailure).message, /markdown-lint/);
    return true;
  });
  rmSync(dir, { recursive: true, force: true });
});

test("resolves on an empty file list without invoking any tool", async () => {
  const dir = scratch();

  await runFileGates([], dir);

  rmSync(dir, { recursive: true, force: true });
});
