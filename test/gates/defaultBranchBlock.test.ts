import { test } from "node:test";
import assert from "node:assert/strict";
import { checkNotDefaultBranch } from "../../src/gates/defaultBranchBlock.ts";
import { GateFailure } from "../../src/errors/GateFailure.ts";

test("allows commits on a feature branch", () => {
  assert.doesNotThrow(() => checkNotDefaultBranch("feature/FB-0001-x", "main"));
});

test("rejects commits directly on the default branch", () => {
  assert.throws(() => checkNotDefaultBranch("main", "main"), GateFailure);
});
