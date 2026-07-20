import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { scaffoldFixtureRepo } from "../fixtures/scaffold.ts";
import { runPreCommitHook } from "../../src/hooks/preCommitHook.ts";

test("rejects a staged file containing a planted secret", async () => {
  const fixture = scaffoldFixtureRepo({ statusContractEnabled: false });
  execFileSync("git", ["checkout", "-b", "feature/FB-0002-x"], { cwd: fixture.dir });
  // Planted RSA private-key block (preset-recommend's privatekey rule catches this by default;
  // AWS AKIA access-key IDs are not detected unless enableIDScanRule is enabled, which the
  // bundled .secretlintrc.json doesn't do).
  writeFileSync(
    join(fixture.dir, "src", "api", "config.js"),
    [
      "-----BEGIN RSA PRIVATE KEY-----",
      "MIIBOgIBAAJBALR1c4ZxKp1jrK2j9hZbT0YxYzM5PjU0Qk5ONm1ZVBlinijjA+4M",
      "8p9Ni+iJkUTz4L7+/G9Ljkz9Q7CvSbxgZW0cE+Li8PDarzcH/2DcfXgiT0cDwdaD",
      "3n9+HwIDAQAB",
      "-----END RSA PRIVATE KEY-----",
      ""
    ].join("\n")
  );
  execFileSync("git", ["add", "src/api/config.js"], { cwd: fixture.dir });

  const exitCode = await runPreCommitHook(fixture.dir);

  assert.equal(exitCode, 1);
  fixture.cleanup();
});

test("accepts the commit once the secret is removed", async () => {
  const fixture = scaffoldFixtureRepo({ statusContractEnabled: false });
  execFileSync("git", ["checkout", "-b", "feature/FB-0002-x"], { cwd: fixture.dir });
  writeFileSync(join(fixture.dir, "src", "api", "config.js"), "const port = 3000;\n");
  execFileSync("git", ["add", "src/api/config.js"], { cwd: fixture.dir });

  const exitCode = await runPreCommitHook(fixture.dir);

  assert.equal(exitCode, 0);
  fixture.cleanup();
});
