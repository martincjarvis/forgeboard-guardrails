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

test("captures stderr from a local tool, which is where the diagnosis often is", () => {
  // cspell is the right probe precisely because it puts this on stderr and writes
  // *nothing* to stdout — the shape that produced gate failures with no message.
  // tsc, the obvious choice, reports to stdout and so passes even when stderr is
  // being dropped: this assertion survived that mutation before it was rewritten.
  // An unknown flag: cspell warns on stderr, prints nothing to stdout, and exits
  // zero. That is the harder half of the requirement — a warning on a run that
  // succeeded is exactly what a zero-warnings check needs and what a
  // failures-only capture never sees.
  const warned = runLocalBin("cspell", ["--not-a-real-flag"], process.cwd());

  assert.equal(
    warned.pass,
    true,
    "an unknown flag is a warning, not a failure",
  );
  assert.match(
    warned.output,
    /unknown option/,
    "a warning on a passing run must survive; it is only ever on stderr",
  );

  const passing = runLocalBin("cspell", ["--version"], process.cwd());
  assert.equal(passing.pass, true);
  assert.match(passing.output, /\d+\.\d+/);
});
