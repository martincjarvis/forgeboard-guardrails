import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { filterCodeFiles } from "../../src/gates/codeFiles.ts";
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

test("keeps code extensions and drops non-code and excluded files", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-cf-"));
  for (const f of ["a.ts", "b.cs", "readme.md", "c.generated.ts"]) {
    writeFileSync(join(dir, f), "x\n");
  }
  const result = await filterCodeFiles(
    ["a.ts", "b.cs", "readme.md", "c.generated.ts"],
    dir,
    baseConfig(),
  );
  assert.deepEqual(result.sort(), ["a.ts", "b.cs"]);
  rmSync(dir, { recursive: true, force: true });
});

test("honours .prettierignore", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-cf-pi-"));
  writeFileSync(join(dir, ".prettierignore"), "vendored.ts\n");
  writeFileSync(join(dir, "vendored.ts"), "x\n");
  writeFileSync(join(dir, "keep.ts"), "x\n");
  const result = await filterCodeFiles(
    ["vendored.ts", "keep.ts"],
    dir,
    baseConfig(),
  );
  assert.deepEqual(result, ["keep.ts"]);
  rmSync(dir, { recursive: true, force: true });
});

test("honours custom exclude globs and custom extensions", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-cf-x-"));
  mkdirSync(join(dir, "gen"), { recursive: true });
  writeFileSync(join(dir, "gen", "z.ts"), "x\n");
  writeFileSync(join(dir, "keep.ts"), "x\n");
  writeFileSync(join(dir, "skip.cs"), "x\n");
  const result = await filterCodeFiles(
    ["gen/z.ts", "keep.ts", "skip.cs"],
    dir,
    baseConfig({ codeExtensions: [".ts"], exclude: ["**/gen/**"] }),
  );
  assert.deepEqual(result, ["keep.ts"]);
  rmSync(dir, { recursive: true, force: true });
});
