import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSecretScan } from "../../src/gates/secretScan.ts";

function setupDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "gr-secretscan-"));
  copyFileSync(join(process.cwd(), ".secretlintrc.json"), join(dir, ".secretlintrc.json"));
  return dir;
}

test("passes on a file with no secrets", () => {
  const dir = setupDir();
  writeFileSync(join(dir, "config.ts"), "export const port = 3000;\n");

  const result = runSecretScan(["config.ts"], dir);
  assert.equal(result.pass, true);
});

test("fails on a planted private key block", () => {
  const dir = setupDir();
  writeFileSync(
    join(dir, "config.ts"),
    [
      "-----BEGIN RSA PRIVATE KEY-----",
      "MIIBOgIBAAJBALR1c4ZxKp1jrK2j9hZbT0YxYzM5PjU0Qk5ONm1ZVBlinijjA+4M",
      "8p9Ni+iJkUTz4L7+/G9Ljkz9Q7CvSbxgZW0cE+Li8PDarzcH/2DcfXgiT0cDwdaD",
      "3n9+HwIDAQAB",
      "-----END RSA PRIVATE KEY-----",
      ""
    ].join("\n")
  );

  const result = runSecretScan(["config.ts"], dir);
  assert.equal(result.pass, false);
});
