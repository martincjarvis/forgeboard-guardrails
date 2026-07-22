import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { scaffoldFixtureRepo } from "../fixtures/scaffold.ts";
import { runPreCommitHook } from "../../src/hooks/preCommitHook.ts";
import { skipWithoutSemgrep } from "../support/semgrep.ts";

test(
  "deleting a component's file still runs that component's gates",
  { skip: skipWithoutSemgrep },
  async () => {
    const fixture = scaffoldFixtureRepo({ statusContractEnabled: false });
    execFileSync("git", ["checkout", "-b", "feature/FB-0015-x"], {
      cwd: fixture.dir,
    });

    // api's build now fails. Deleting one of api's files must be enough to run it.
    const configPath = join(
      fixture.dir,
      ".forgeboard",
      "guardrails.config.json",
    );
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    config.components.api.build = 'node -e "process.exit(1)"';
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    execFileSync("git", ["add", ".forgeboard/guardrails.config.json"], {
      cwd: fixture.dir,
    });

    rmSync(join(fixture.dir, "src", "api", "index.js"));
    execFileSync("git", ["add", "-A"], { cwd: fixture.dir });

    const exitCode = await runPreCommitHook(fixture.dir);

    assert.equal(
      exitCode,
      1,
      "a delete-only change must not skip the component's build gate",
    );
    fixture.cleanup();
  },
);
