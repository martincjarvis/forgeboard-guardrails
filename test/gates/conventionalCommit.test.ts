import { test } from "node:test";
import assert from "node:assert/strict";
import { checkConventionalCommit } from "../../src/gates/conventionalCommit.ts";
import { GateFailure } from "../../src/errors/GateFailure.ts";

test("accepts a conforming conventional-commit message", () => {
  assert.doesNotThrow(() => checkConventionalCommit("feat: add login flow"));
  assert.doesNotThrow(() => checkConventionalCommit("fix(api): handle null response"));
});

test("rejects a non-conforming message naming the expected format", () => {
  assert.throws(() => checkConventionalCommit("added login flow"), (err: unknown) => {
    assert.ok(err instanceof GateFailure);
    assert.match(err.remediation, /type\(scope\): subject|conventional/i);
    return true;
  });
});
