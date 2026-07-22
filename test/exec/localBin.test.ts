import { test } from "node:test";
import assert from "node:assert/strict";
import { runLocalBin } from "../../src/exec/localBin.ts";

test("runs a resolvable local binary and captures output", () => {
  const result = runLocalBin("tsc", ["--version"], process.cwd());
  assert.equal(result.pass, true);
  assert.match(result.output, /Version/);
});

test("throws naming the binary when it cannot be resolved", () => {
  assert.throws(
    () => runLocalBin("nonexistent-tool-xyz", [], process.cwd()),
    /nonexistent-tool-xyz/,
  );
});
