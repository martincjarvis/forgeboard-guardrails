import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { scaffoldFixtureRepo } from "../fixtures/scaffold.ts";
import { runPreCommitHook } from "../../src/hooks/preCommitHook.ts";
import { skipWithoutSemgrep } from "../support/semgrep.ts";

test(
  "rejects a staged file with a SAST finding",
  { skip: skipWithoutSemgrep },
  async () => {
    const fixture = scaffoldFixtureRepo({ statusContractEnabled: false });
    execFileSync("git", ["checkout", "-b", "feature/FB-0012-x"], {
      cwd: fixture.dir,
    });
    // eval of non-literal input — flagged by the pinned pack's javascript audit rules.
    writeFileSync(
      join(fixture.dir, "src", "api", "index.js"),
      "const input = process.argv[2];\neval(input);\n",
    );
    execFileSync("git", ["add", "src/api/index.js"], { cwd: fixture.dir });

    const exitCode = await runPreCommitHook(fixture.dir);

    assert.equal(exitCode, 1);
    fixture.cleanup();
  },
);

test(
  "accepts the commit once the dangerous construct is removed",
  { skip: skipWithoutSemgrep },
  async () => {
    const fixture = scaffoldFixtureRepo({ statusContractEnabled: false });
    execFileSync("git", ["checkout", "-b", "feature/FB-0012-y"], {
      cwd: fixture.dir,
    });
    writeFileSync(
      join(fixture.dir, "src", "api", "index.js"),
      "const input = process.argv[2];\nconsole.log(input);\n",
    );
    execFileSync("git", ["add", "src/api/index.js"], { cwd: fixture.dir });

    const exitCode = await runPreCommitHook(fixture.dir);

    assert.equal(exitCode, 0);
    fixture.cleanup();
  },
);
