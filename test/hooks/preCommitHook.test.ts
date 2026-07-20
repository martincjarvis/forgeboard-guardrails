import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { runPreCommitHook } from "../../src/hooks/preCommitHook.ts";

function initRepoWithConfig(config: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "gr-precommit-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
  execFileSync("git", ["commit", "--allow-empty", "-m", "chore: initial"], { cwd: dir });
  execFileSync("git", ["checkout", "-b", "feature/FB-0001-x"], { cwd: dir });
  mkdirSync(join(dir, ".forgeboard"), { recursive: true });
  writeFileSync(join(dir, ".forgeboard", "guardrails.config.json"), JSON.stringify(config));
  // The hook invokes bundled gates that read these configs; install would scaffold
  // them in production. Mirror that for the unit test so the gates find configs.
  const pkgRoot = process.cwd();
  copyFileSync(join(pkgRoot, ".secretlintrc.json"), join(dir, ".secretlintrc.json"));
  copyFileSync(join(pkgRoot, "cspell.json"), join(dir, "cspell.json"));
  return dir;
}

test("passes and writes status/events when statusContract is enabled and all gates pass", async () => {
  const dir = initRepoWithConfig({
    appName: "acme",
    defaultBranch: "main",
    statusContract: { enabled: true, ticketIdPattern: "[A-Z]+-\\d+" },
    components: {
      web: {
        paths: ["src/web/**"],
        build: "node -e \"process.exit(0)\"",
        unitTest: "node -e \"process.exit(0)\""
      }
    }
  });
  mkdirSync(join(dir, "src", "web"), { recursive: true });
  writeFileSync(join(dir, "src", "web", "index.js"), "console.log('ok');\n");
  execFileSync("git", ["add", "."], { cwd: dir });

  const exitCode = await runPreCommitHook(dir);

  assert.equal(exitCode, 0);
  assert.ok(existsSync(join(dir, ".forgeboard", "state", "FB-0001", "status.json")));
  assert.ok(existsSync(join(dir, ".forgeboard", "state", "FB-0001", "events.ndjson")));
});

test("fails when default branch is checked out, before writing any status", async () => {
  const dir = initRepoWithConfig({
    appName: "acme",
    defaultBranch: "main",
    statusContract: { enabled: true, ticketIdPattern: "[A-Z]+-\\d+" },
    components: {}
  });
  execFileSync("git", ["checkout", "main"], { cwd: dir });

  const exitCode = await runPreCommitHook(dir);

  assert.equal(exitCode, 1);
});

test("skips status/event emission entirely when statusContract is disabled", async () => {
  const dir = initRepoWithConfig({
    appName: "acme",
    defaultBranch: "main",
    components: {}
  });

  const exitCode = await runPreCommitHook(dir);

  assert.equal(exitCode, 0);
  assert.equal(existsSync(join(dir, ".forgeboard", "state")), false);
});
