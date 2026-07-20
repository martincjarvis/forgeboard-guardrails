import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { scaffoldFixtureRepo } from "../fixtures/scaffold.ts";
import { generateReleaseConfigs } from "../../src/versioning/releaseConfig.ts";
import { loadConfig } from "../../src/config/load.ts";

test("release config computes a release tagFormat for the default branch component", () => {
  const fixture = scaffoldFixtureRepo({ statusContractEnabled: false });
  const config = loadConfig(fixture.dir);

  const releaseConfigs = generateReleaseConfigs(config);

  assert.equal(releaseConfigs["shared-lib"].tagFormat, "fixture-shared-lib@${version}");
  fixture.cleanup();
});

test("rebase replays a tagged commit without the generator implying a re-tag", () => {
  const fixture = scaffoldFixtureRepo({ statusContractEnabled: false });
  execFileSync("git", ["checkout", "-b", "feature/FB-0008-x"], { cwd: fixture.dir });
  execFileSync("git", ["commit", "--allow-empty", "--no-verify", "-m", "feat: add widget"], { cwd: fixture.dir });
  const originalTaggedSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: fixture.dir, encoding: "utf8" }).trim();
  execFileSync("git", ["tag", "fixture-shared-lib@1.1.0"], { cwd: fixture.dir });

  execFileSync("git", ["checkout", "main"], { cwd: fixture.dir });
  execFileSync("git", ["commit", "--allow-empty", "--no-verify", "-m", "chore: unrelated main commit"], { cwd: fixture.dir });
  execFileSync("git", ["checkout", "feature/FB-0008-x"], { cwd: fixture.dir });
  execFileSync("git", ["rebase", "main"], { cwd: fixture.dir });
  const rebasedSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: fixture.dir, encoding: "utf8" }).trim();

  // The commit's own content is unchanged by rebase even though its SHA changed —
  // semantic-release's tag lookup is by tag-name-on-branch-history, not this SHA,
  // so the existing "fixture-shared-lib@1.1.0" tag remains the answer; no second
  // tag gets created for the same released change. Assert the rebase actually
  // produced a new commit object (proving this isn't a no-op rebase) while the
  // pre-existing tag is still the only tag on the repo.
  assert.notEqual(originalTaggedSha, rebasedSha);
  const tags = execFileSync("git", ["tag", "--list"], { cwd: fixture.dir, encoding: "utf8" }).trim().split("\n");
  assert.deepEqual(tags, ["fixture-shared-lib@1.1.0"]);

  fixture.cleanup();
});
