import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { scaffoldFixtureRepo } from "../fixtures/scaffold.ts";
import { runPreCommitHook } from "../../src/hooks/preCommitHook.ts";
import { skipWithoutSemgrep } from "../support/semgrep.ts";

// cspell:ignore someone
// Assembled at runtime via `U` so this test source does not contain the
// contiguous git-bash path form — otherwise the dogfood secretlint gate would
// block the very commit that adds the rule under test.
const U = "Users";
const FORWARD_SLASH_HOMEDIR_LEAK = `/c/${U}/someone/project`;

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

test(
  "rejects a commit that leaks a forward-slash local machine path",
  { skip: skipWithoutSemgrep },
  async () => {
    // The git-bash / WSL form `/c/Users/<user>/...` is exactly the gap that
    // secretlint-rule-no-homedir (which matches the scanning machine's own
    // backslash home only) leaves open. The generic pattern rule must catch it
    // for any user, not just the author.
    const fixture = scaffoldFixtureRepo({ statusContractEnabled: false });
    execFileSync("git", ["checkout", "-b", "feature/FB-0017-x"], {
      cwd: fixture.dir,
    });
    writeFileSync(
      join(fixture.dir, "src", "api", "index.js"),
      `// see ${FORWARD_SLASH_HOMEDIR_LEAK}\nconst x = 1;\n`,
    );
    execFileSync("git", ["add", "src/api/index.js"], { cwd: fixture.dir });

    const exitCode = await runPreCommitHook(fixture.dir);

    assert.equal(exitCode, 1);
    fixture.cleanup();
  },
);
