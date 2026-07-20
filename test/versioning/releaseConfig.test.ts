import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateReleaseConfigs, runSemanticReleaseDryRun } from "../../src/versioning/releaseConfig.ts";
import type { GuardrailsConfig } from "../../src/config/types.ts";

const config: GuardrailsConfig = {
  appName: "forgeboard",
  defaultBranch: "main",
  statusContract: { enabled: false, ticketIdPattern: "[A-Z]+-\\d+" },
  components: {
    api: { paths: ["src/api/**"] },
    web: { paths: ["src/web/**"] }
  }
};

test("composes tagFormat from appName and each component key", () => {
  const configs = generateReleaseConfigs(config);
  assert.equal(configs.api.tagFormat, "forgeboard-api@${version}");
  assert.equal(configs.web.tagFormat, "forgeboard-web@${version}");
});

test("configures release on the default branch and prerelease on feature branches", () => {
  const configs = generateReleaseConfigs(config);
  const branches = configs.api.branches as Array<{ name?: string; prerelease?: boolean | string }>;
  assert.ok(branches.some((b) => b === "main" || b.name === "main"));
  assert.ok(branches.some((b) => typeof b === "object" && b.prerelease));
});

function initRepoWithCommit(branch: string, message: string): string {
  const dir = mkdtempSync(join(tmpdir(), "gr-release-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "T"], { cwd: dir });
  execFileSync("git", ["commit", "--allow-empty", "-m", "chore: initial"], { cwd: dir });
  if (branch !== "main") execFileSync("git", ["checkout", "-b", branch], { cwd: dir });
  execFileSync("git", ["commit", "--allow-empty", "-m", message], { cwd: dir });
  return dir;
}

test("dry-run reports a release version for a feat commit on the default branch", async () => {
  const dir = initRepoWithCommit("main", "feat: add widget");
  const releaseConfig = generateReleaseConfigs(config).api;

  const result = await runSemanticReleaseDryRun(dir, releaseConfig);

  assert.ok(result.nextRelease);
  assert.match(result.nextRelease!.version, /^\d+\.\d+\.\d+$/); // release, not pre-release
});

test("dry-run reports a pre-release version for a feat commit on a feature branch", async () => {
  const dir = initRepoWithCommit("feature/FB-0099-test", "feat: add widget");
  const releaseConfig = generateReleaseConfigs(config).api;

  const result = await runSemanticReleaseDryRun(dir, releaseConfig, "feature/FB-0099-test");

  assert.ok(result.nextRelease);
  assert.match(result.nextRelease!.version, /^\d+\.\d+\.\d+-/); // has a pre-release identifier
});
