import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { scaffoldFixtureRepo } from "../fixtures/scaffold.ts";
import { runPreCommitHook } from "../../src/hooks/preCommitHook.ts";
import { skipWithoutSemgrep } from "../support/semgrep.ts";
import schema from "../../schemas/status.v1.json" with { type: "json" };

test("status.json validates against schema v1, keyed by the ADR-0003 ticket id, reflecting real outcomes", { skip: skipWithoutSemgrep }, async () => {
  const fixture = scaffoldFixtureRepo({ statusContractEnabled: true });
  execFileSync("git", ["checkout", "-b", "feature/FB-0006-x"], { cwd: fixture.dir });
  writeFileSync(join(fixture.dir, "src", "api", "index.js"), "console.log('changed');\n");
  execFileSync("git", ["add", "."], { cwd: fixture.dir });

  const exitCode = await runPreCommitHook(fixture.dir);
  assert.equal(exitCode, 0);

  const status = JSON.parse(readFileSync(join(fixture.dir, ".forgeboard", "state", "FB-0006", "status.json"), "utf8"));

  const ajv = new Ajv();
  addFormats(ajv);
  const validate = ajv.compile(schema);
  assert.ok(validate(status), JSON.stringify(validate.errors));
  assert.equal(status.ticketId, "FB-0006");
  assert.equal(status.build.status, "pass");
  assert.equal(status.tests.unit.status, "pass");

  fixture.cleanup();
});
