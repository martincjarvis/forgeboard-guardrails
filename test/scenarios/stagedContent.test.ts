import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { scaffoldFixtureRepo } from "../fixtures/scaffold.ts";
import { runPreCommitHook } from "../../src/hooks/preCommitHook.ts";
import { skipWithoutSemgrep } from "../support/semgrep.ts";

// base64 key fixture data, not prose
// cspell:ignore IDAQAB

const SECRET = [
  "-----BEGIN RSA PRIVATE KEY-----",
  "MIIBOgIBAAJBALR1c4ZxKp1jrK2j9hZbT0YxYzM5PjU0Qk5ONm1ZVBlinijjA+4M",
  "8p9Ni+iJkUTz4L7+/G9Ljkz9Q7CvSbxgZW0cE+Li8PDarzcH/2DcfXgiT0cDwdaD",
  "3n9+HwIDAQAB",
  "-----END RSA PRIVATE KEY-----",
  "",
].join("\n");

test(
  "an unstaged secret does not block a clean staged change",
  { skip: skipWithoutSemgrep },
  async () => {
    const fixture = scaffoldFixtureRepo({ statusContractEnabled: false });
    const file = join(fixture.dir, "src", "api", "index.js");
    execFileSync("git", ["checkout", "-b", "feature/FB-0013-x"], {
      cwd: fixture.dir,
    });

    writeFileSync(file, "const port = 3000;\n");
    execFileSync("git", ["add", "src/api/index.js"], { cwd: fixture.dir });
    writeFileSync(file, `const port = 3000;\n${SECRET}`); // working tree only — never staged

    const exitCode = await runPreCommitHook(fixture.dir);

    assert.equal(
      exitCode,
      0,
      "gates must read the index, not the working tree",
    );
    assert.match(
      readFileSync(file, "utf8"),
      /BEGIN RSA PRIVATE KEY/,
      "the unstaged edit must be restored",
    );
    fixture.cleanup();
  },
);

test(
  "a staged secret still blocks even when the working tree is clean",
  { skip: skipWithoutSemgrep },
  async () => {
    const fixture = scaffoldFixtureRepo({ statusContractEnabled: false });
    const file = join(fixture.dir, "src", "api", "index.js");
    execFileSync("git", ["checkout", "-b", "feature/FB-0013-y"], {
      cwd: fixture.dir,
    });

    writeFileSync(file, `const port = 3000;\n${SECRET}`);
    execFileSync("git", ["add", "src/api/index.js"], { cwd: fixture.dir });
    writeFileSync(file, "const port = 3000;\n"); // secret removed from disk, still in the index

    const exitCode = await runPreCommitHook(fixture.dir);

    assert.equal(exitCode, 1, "the index content is what is being committed");
    fixture.cleanup();
  },
);

test(
  "a staged deletion does not fail the gates",
  { skip: skipWithoutSemgrep },
  async () => {
    const fixture = scaffoldFixtureRepo({ statusContractEnabled: false });
    execFileSync("git", ["checkout", "-b", "feature/FB-0013-z"], {
      cwd: fixture.dir,
    });

    rmSync(join(fixture.dir, "src", "api", "index.js"));
    execFileSync("git", ["add", "-A"], { cwd: fixture.dir });

    const exitCode = await runPreCommitHook(fixture.dir);

    assert.equal(
      exitCode,
      0,
      "a removed path must not be handed to a content-reading gate",
    );
    fixture.cleanup();
  },
);
