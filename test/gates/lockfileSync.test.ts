import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkLockfileSync } from "../../src/gates/lockfileSync.ts";

function repo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "gr-lock-"));
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(join(dir, name, ".."), { recursive: true });
    writeFileSync(join(dir, name), body);
  }
  return dir;
}

const clean = (dir: string) => rmSync(dir, { recursive: true, force: true });

test("staging package.json without its lockfile is reported", () => {
  // The case that motivated this: `engines` was added to package.json and the
  // lockfile still described the package without it, so `npm ci` and `npm install`
  // disagreed and the next fresh worktree silently rewrote the lockfile.
  const dir = repo({
    "package.json": '{ "name": "x", "engines": { "node": ">=24.2" } }\n',
    "package-lock.json": '{ "name": "x", "packages": { "": {} } }\n',
  });

  const problems = checkLockfileSync(["package.json"], dir);

  assert.equal(problems.length, 1);
  assert.match(problems[0], /package-lock\.json/);
  clean(dir);
});

test("staging both together passes", () => {
  const dir = repo({
    "package.json": "{}\n",
    "package-lock.json": "{}\n",
  });

  assert.deepEqual(
    checkLockfileSync(["package.json", "package-lock.json"], dir),
    [],
  );
  clean(dir);
});

test("a commit touching neither is not this gate's business", () => {
  const dir = repo({ "package.json": "{}\n", "package-lock.json": "{}\n" });
  assert.deepEqual(checkLockfileSync(["src/a.ts", "README.md"], dir), []);
  clean(dir);
});

test("a repo with no lockfile at all is left alone", () => {
  // Not every project uses npm, and inventing a lockfile requirement for one that
  // does not have one would block commits in repos this gate has no business in.
  const dir = repo({ "package.json": "{}\n" });
  assert.deepEqual(checkLockfileSync(["package.json"], dir), []);
  clean(dir);
});

test("a nested manifest is checked against the lockfile beside it", () => {
  // The half that matters, and the half an earlier version of this test missed: it
  // staged a nested manifest in a fixture with no nested lockfile, so it only
  // exercised the "no lockfile, nothing to require" skip. A gate that ignored
  // nested manifests entirely passed it — and passed the whole suite.
  const dir = repo({
    "package.json": "{}\n",
    "package-lock.json": "{}\n",
    "packages/api/package.json": '{ "name": "api" }\n',
    "packages/api/package-lock.json": '{ "name": "api" }\n',
  });

  const problems = checkLockfileSync(["packages/api/package.json"], dir);

  assert.equal(problems.length, 1, "the nested manifest must be checked");
  assert.match(problems[0], /packages\/api\/package-lock\.json/);
  assert.doesNotMatch(
    problems[0],
    /^package-lock\.json/m,
    "and blamed on its own lockfile, not the repository root's",
  );
  clean(dir);
});

test("a nested manifest staged with its own lockfile passes", () => {
  const dir = repo({
    "packages/api/package.json": '{ "name": "api" }\n',
    "packages/api/package-lock.json": '{ "name": "api" }\n',
  });

  assert.deepEqual(
    checkLockfileSync(
      ["packages/api/package.json", "packages/api/package-lock.json"],
      dir,
    ),
    [],
  );
  clean(dir);
});

test("a nested manifest with no lockfile beside it is left alone", () => {
  // The original case, kept: the root lockfile must not be pressed into service
  // for a package that does not have one.
  const dir = repo({ "package.json": "{}\n", "package-lock.json": "{}\n" });
  assert.deepEqual(checkLockfileSync(["packages/api/package.json"], dir), []);
  clean(dir);
});
