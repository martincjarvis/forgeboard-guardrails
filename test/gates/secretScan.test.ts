import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { runSecretScan } from "../../src/gates/secretScan.ts";

// mkdtemp prefix and base64 key fixture, not prose
// cspell:ignore secretscan IDAQAB
function setupDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "gr-secretscan-"));
  copyFileSync(
    join(process.cwd(), ".secretlintrc.json"),
    join(dir, ".secretlintrc.json"),
  );
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
      "",
    ].join("\n"),
  );

  const result = runSecretScan(["config.ts"], dir);
  assert.equal(result.pass, false);
});

test("rejects content containing the author's own home directory path", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-homedir-"));
  copyFileSync(
    join(process.cwd(), ".secretlintrc.json"),
    join(dir, ".secretlintrc.json"),
  );
  // Built from os.homedir() so the test asserts the real behaviour on whatever
  // machine runs it, rather than hard-coding a path (which would itself be the
  // leak this gate exists to prevent).
  writeFileSync(
    join(dir, "notes.md"),
    `Plan step: cd ${join(homedir(), "Projects", "example")}\n`,
  );

  const result = runSecretScan(["notes.md"], dir);

  assert.equal(result.pass, false);
  assert.match(result.output, /homedir/i);
});
