import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSast, SEMGREP_RULESET } from "../../src/gates/sast.ts";
import { semgrepAvailable } from "../support/semgrep.ts";

const canRunSemgrep = semgrepAvailable();

test(
  "passes on innocuous code",
  { skip: !canRunSemgrep && "semgrep not installed (pip install semgrep)" },
  () => {
    const dir = mkdtempSync(join(tmpdir(), "gr-sast-"));
    writeFileSync(join(dir, "a.js"), "function add(a, b) { return a + b; }\n");

    const result = runSast(["a.js"], dir);
    assert.equal(result.pass, true);
  },
);

test(
  "fails on a known-dangerous pattern (eval of dynamic input)",
  { skip: !canRunSemgrep && "semgrep not installed (pip install semgrep)" },
  () => {
    const dir = mkdtempSync(join(tmpdir(), "gr-sast-"));
    writeFileSync(
      join(dir, "a.js"),
      "function run(input) { return eval(input); }\n",
    );

    const result = runSast(["a.js"], dir);
    assert.equal(result.pass, false);
  },
);

test("absent semgrep is surfaced as a named failure, not a silent skip", () => {
  if (canRunSemgrep) {
    // On machines with semgrep installed this is a smoke test of the wrapper's
    // non-zero-exit branch; on machines without it, this is the real absence
    // check. Either way, runSast against a planted finding must not return
    // pass:true for a clean file (that would mean semgrep silently failed to run).
    const dir = mkdtempSync(join(tmpdir(), "gr-sast-absent-"));
    writeFileSync(
      join(dir, "a.js"),
      "function run(input) { return eval(input); }\n",
    );
    const result = runSast(["a.js"], dir);
    assert.equal(result.pass, false);
  } else {
    const dir = mkdtempSync(join(tmpdir(), "gr-sast-absent-"));
    writeFileSync(
      join(dir, "a.js"),
      "function run(input) { return eval(input); }\n",
    );
    assert.throws(
      () => runSast(["a.js"], dir),
      /semgrep.*pip install semgrep/s,
    );
  }
});

test("pins a named ruleset rather than resolving rules dynamically per commit", () => {
  // `--config=auto` re-resolves rules from the registry on every commit: a network
  // round-trip inside the 30s budget, a ruleset that can change under an unchanged
  // commit, and a hard failure when offline. A pre-commit gate must be deterministic.
  assert.notEqual(SEMGREP_RULESET, "auto");
  assert.match(SEMGREP_RULESET, /^p\//);
});
