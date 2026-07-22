import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { scaffoldFixtureRepo } from "../fixtures/scaffold.ts";
import {
  generateReleaseConfigs,
  runSemanticReleaseDryRun,
} from "../../src/versioning/releaseConfig.ts";
import { loadConfig } from "../../src/config/load.ts";

const git = (args: string[], cwd: string): string =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

test("release config computes a release tagFormat for the default branch component", () => {
  const fixture = scaffoldFixtureRepo({ statusContractEnabled: false });
  const config = loadConfig(fixture.dir);

  const releaseConfigs = generateReleaseConfigs(config);

  assert.equal(
    releaseConfigs["shared-lib"].tagFormat,
    "fixture-shared-lib@${version}",
  );
  fixture.cleanup();
});

test("a rebase does not make semantic-release rebuild an already-tagged version number", async () => {
  const fixture = scaffoldFixtureRepo({ statusContractEnabled: false });
  const releaseConfig = generateReleaseConfigs(loadConfig(fixture.dir))[
    "shared-lib"
  ];

  // Release a feat on the default branch and tag it, exactly as a CI release would.
  git(
    ["commit", "--allow-empty", "--no-verify", "-m", "feat: base feature"],
    fixture.dir,
  );
  const released = await runSemanticReleaseDryRun(
    fixture.dir,
    releaseConfig,
    "main",
  );
  assert.ok(
    released.nextRelease,
    "the first feat should compute a release version",
  );
  assert.equal(released.nextRelease.version, "1.0.0");
  git(["tag", released.nextRelease.gitTag], fixture.dir);

  // Re-running against the same tagged history proposes nothing — the tagged version
  // is not rebuilt (this is the property that must survive a rebase).
  const rerun = await runSemanticReleaseDryRun(
    fixture.dir,
    releaseConfig,
    "main",
  );
  assert.equal(rerun.nextRelease, false);

  // A feature branch adds a new releasable commit; capture its pre-rebase version.
  git(["checkout", "-b", "feature/FB-0008-x"], fixture.dir);
  git(
    ["commit", "--allow-empty", "--no-verify", "-m", "fix: feature work"],
    fixture.dir,
  );
  const beforeRebase = await runSemanticReleaseDryRun(
    fixture.dir,
    releaseConfig,
    "feature/FB-0008-x",
  );
  assert.ok(beforeRebase.nextRelease);

  // Advance main and rebase the feature branch onto it — rewriting the feature
  // commit's SHA while the 1.0.0 tag stays reachable on the mainline.
  git(["checkout", "main"], fixture.dir);
  git(
    ["commit", "--allow-empty", "--no-verify", "-m", "chore: main moves on"],
    fixture.dir,
  );
  git(["checkout", "feature/FB-0008-x"], fixture.dir);
  git(["rebase", "main"], fixture.dir);
  const afterRebase = await runSemanticReleaseDryRun(
    fixture.dir,
    releaseConfig,
    "feature/FB-0008-x",
  );
  assert.ok(afterRebase.nextRelease);

  // The computed version is stable across the rebase and is an increment above the
  // already-tagged 1.0.0 — never a rebuild of it. No spurious tag was created.
  assert.equal(
    afterRebase.nextRelease.version,
    beforeRebase.nextRelease.version,
  );
  assert.notEqual(afterRebase.nextRelease.version, "1.0.0");
  assert.match(afterRebase.nextRelease.version, /^1\.0\.1-/);
  assert.deepEqual(git(["tag", "--list"], fixture.dir).split("\n"), [
    "fixture-shared-lib@1.0.0",
  ]);

  fixture.cleanup();
});
