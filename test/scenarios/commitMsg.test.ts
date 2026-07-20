import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffoldFixtureRepo } from "../fixtures/scaffold.ts";
import { runCommitMsgHook } from "../../src/hooks/commitMsgHook.ts";

test("rejects a non-conventional commit message naming the expected format", () => {
  const fixture = scaffoldFixtureRepo({ statusContractEnabled: false });
  const msgFile = join(mkdtempSync(join(tmpdir(), "gr-msg-")), "COMMIT_EDITMSG");
  writeFileSync(msgFile, "did some stuff");

  const exitCode = runCommitMsgHook(fixture.dir, msgFile);

  assert.equal(exitCode, 1);
  fixture.cleanup();
});

test("accepts a conforming conventional-commit message", () => {
  const fixture = scaffoldFixtureRepo({ statusContractEnabled: false });
  const msgFile = join(mkdtempSync(join(tmpdir(), "gr-msg-")), "COMMIT_EDITMSG");
  writeFileSync(msgFile, "feat: add widget");

  const exitCode = runCommitMsgHook(fixture.dir, msgFile);

  assert.equal(exitCode, 0);
  fixture.cleanup();
});
