import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkLockfileSync } from "../../src/gates/lockfileSync.ts";

function repo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "gr-lock-"));
  for (const [name, body] of Object.entries(files)) {
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

test("a nested package.json is matched with its own lockfile, not the root one", () => {
  // A monorepo stages packages/api/package.json; the root lockfile is irrelevant
  // to it, and pairing them would let a real mismatch through.
  const dir = repo({
    "package.json": "{}\n",
    "package-lock.json": "{}\n",
  });
  const problems = checkLockfileSync(["packages/api/package.json"], dir);
  assert.deepEqual(
    problems,
    [],
    "no lockfile beside it, so nothing to require",
  );
  clean(dir);
});
