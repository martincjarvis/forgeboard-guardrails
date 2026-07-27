import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { Ajv } from "ajv";
// ajv-formats is CommonJS whose module.exports IS the function, while its types
// declare `export default`. Under NodeNext those disagree, so the namespace is
// typed as non-callable even though it is callable at runtime. One cast states
// the true shape rather than reshaping the import at every call site.
import * as ajvFormats from "ajv-formats";
const addFormats = ajvFormats.default as unknown as (ajv: unknown) => void;
import { scaffoldFixtureRepo } from "../fixtures/scaffold.ts";
import { runPreCommitHook } from "../../src/hooks/preCommitHook.ts";
import { skipWithoutSemgrep } from "../support/semgrep.ts";
import schema from "../../schemas/status.v1.json" with { type: "json" };

test(
  "status.json validates against schema v1, keyed by the ADR-0003 ticket id, reflecting real outcomes",
  { skip: skipWithoutSemgrep },
  async () => {
    const fixture = scaffoldFixtureRepo({ statusContractEnabled: true });
    execFileSync("git", ["checkout", "-b", "feature/FB-0006-x"], {
      cwd: fixture.dir,
    });
    writeFileSync(
      join(fixture.dir, "src", "api", "index.js"),
      "console.log('changed');\n",
    );
    execFileSync("git", ["add", "."], { cwd: fixture.dir });

    const exitCode = await runPreCommitHook(fixture.dir);
    assert.equal(exitCode, 0);

    // The shape the schema validates, asserted on below.
    const status: {
      ticketId: string;
      build: { status: string };
      tests: { unit: { status: string } };
    } = JSON.parse(
      readFileSync(
        join(fixture.dir, ".forgeboard", "state", "FB-0006", "status.json"),
        "utf8",
      ),
    );

    const ajv = new Ajv();
    addFormats(ajv);
    const validate = ajv.compile(schema);
    assert.ok(validate(status), JSON.stringify(validate.errors));
    assert.equal(status.ticketId, "FB-0006");
    assert.equal(status.build.status, "pass");
    assert.equal(status.tests.unit.status, "pass");

    fixture.cleanup();
  },
);
