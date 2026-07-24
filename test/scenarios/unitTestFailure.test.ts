import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { scaffoldFixtureRepo } from "../fixtures/scaffold.ts";
import { runPreCommitHook } from "../../src/hooks/preCommitHook.ts";
import { skipWithoutSemgrep } from "../support/semgrep.ts";

test(
  "a failing unit test rejects the commit",
  { skip: skipWithoutSemgrep },
  async () => {
    const fixture = scaffoldFixtureRepo({ statusContractEnabled: false });
    execFileSync("git", ["checkout", "-b", "feature/FB-0019-x"], {
      cwd: fixture.dir,
    });
    const configPath = join(
      fixture.dir,
      ".forgeboard",
      "guardrails.config.json",
    );
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    config.components.api.unitTest =
      "node -e \"console.error('1 failing'); process.exit(1)\"";
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    writeFileSync(
      join(fixture.dir, "src", "api", "index.js"),
      "const x = 1;\n",
    );
    // Config override must be staged — unstaged changes are stashed before gates run.
    execFileSync("git", ["add", "."], { cwd: fixture.dir });

    const exitCode = await runPreCommitHook(fixture.dir);

    assert.equal(exitCode, 1);
    fixture.cleanup();
  },
);

test(
  "passes once the unit test is green",
  { skip: skipWithoutSemgrep },
  async () => {
    const fixture = scaffoldFixtureRepo({ statusContractEnabled: false });
    execFileSync("git", ["checkout", "-b", "feature/FB-0019-y"], {
      cwd: fixture.dir,
    });
    writeFileSync(
      join(fixture.dir, "src", "api", "index.js"),
      "const x = 2;\n",
    );
    execFileSync("git", ["add", "."], { cwd: fixture.dir });

    const exitCode = await runPreCommitHook(fixture.dir);

    assert.equal(exitCode, 0);
    fixture.cleanup();
  },
);
