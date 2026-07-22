import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { scaffoldFixtureRepo } from "../fixtures/scaffold.ts";
import { runPreCommitHook } from "../../src/hooks/preCommitHook.ts";
import { skipWithoutSemgrep } from "../support/semgrep.ts";

test(
  "rejects a commit that leaks the author's home directory path",
  { skip: skipWithoutSemgrep },
  async () => {
    const fixture = scaffoldFixtureRepo({ statusContractEnabled: false });
    execFileSync("git", ["checkout", "-b", "feature/FB-0016-x"], {
      cwd: fixture.dir,
    });
    writeFileSync(
      join(fixture.dir, "src", "api", "index.js"),
      `// see ${join(homedir(), "Projects", "example")}\nconst x = 1;\n`,
    );
    execFileSync("git", ["add", "src/api/index.js"], { cwd: fixture.dir });

    const exitCode = await runPreCommitHook(fixture.dir);

    assert.equal(exitCode, 1);
    fixture.cleanup();
  },
);
