import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runSast } from "../../src/gates/sast.ts";

function semgrepAvailable(): boolean {
  const result = spawnSync("semgrep", ["--version"], {
    shell: process.platform === "win32",
    encoding: "utf8",
  });
  return result.status === 0;
}

const canRunSemgrep = semgrepAvailable();

test("passes on innocuous code", { skip: !canRunSemgrep && "semgrep not installed (pip install semgrep)" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-sast-"));
  writeFileSync(join(dir, "a.js"), "function add(a, b) { return a + b; }\n");

  const result = runSast(["a.js"], dir);
  assert.equal(result.pass, true);
});

test("fails on a known-dangerous pattern (eval of dynamic input)", { skip: !canRunSemgrep && "semgrep not installed (pip install semgrep)" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-sast-"));
  writeFileSync(join(dir, "a.js"), "function run(input) { return eval(input); }\n");

  const result = runSast(["a.js"], dir);
  assert.equal(result.pass, false);
});

test("absent semgrep is surfaced as a named failure, not a silent skip", () => {
  if (canRunSemgrep) {
    // On machines with semgrep installed this is a smoke test of the wrapper's
    // non-zero-exit branch; on machines without it, this is the real absence
    // check. Either way, runSast against a planted finding must not return
    // pass:true for a clean file (that would mean semgrep silently failed to run).
    const dir = mkdtempSync(join(tmpdir(), "gr-sast-absent-"));
    writeFileSync(join(dir, "a.js"), "function run(input) { return eval(input); }\n");
    const result = runSast(["a.js"], dir);
    assert.equal(result.pass, false);
  } else {
    const dir = mkdtempSync(join(tmpdir(), "gr-sast-absent-"));
    writeFileSync(join(dir, "a.js"), "function run(input) { return eval(input); }\n");
    assert.throws(() => runSast(["a.js"], dir), /semgrep.*pip install semgrep/s);
  }
});
