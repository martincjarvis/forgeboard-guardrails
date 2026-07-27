import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { checkStagedIsolation } from "../../src/gates/stagedIsolation.ts";

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "gr-iso-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "f@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "F"], { cwd: dir });
  mkdirSync(join(dir, "src"), { recursive: true });
  return dir;
}

test("passes when the working tree matches the index", () => {
  const dir = repo();
  writeFileSync(join(dir, "src", "a.js"), "const x = 1;\n");
  execFileSync("git", ["add", "src/a.js"], { cwd: dir });

  assert.deepEqual(checkStagedIsolation(["src/a.js"], dir), []);
  rmSync(dir, { recursive: true, force: true });
});

test("reports a staged file whose working tree carries unstaged content", () => {
  // The exact shape of the defect: a file staged clean, then modified in the
  // working tree only. If a gate reads this from disk it is judging content the
  // developer never staged — the secret in stagedContent.test.ts is this case.
  const dir = repo();
  writeFileSync(join(dir, "src", "a.js"), "const x = 1;\n");
  execFileSync("git", ["add", "src/a.js"], { cwd: dir });
  writeFileSync(join(dir, "src", "a.js"), "const x = 1;\nSECRET\n");

  const problems = checkStagedIsolation(["src/a.js"], dir);

  assert.equal(problems.length, 1);
  assert.match(problems[0], /src\/a\.js/);
  rmSync(dir, { recursive: true, force: true });
});

test("a file staged for deletion is not reported as a mismatch", () => {
  // Deleted paths have no working-tree content by definition. Treating that as a
  // mismatch would fail every commit that removes a file.
  const dir = repo();
  writeFileSync(join(dir, "src", "a.js"), "const x = 1;\n");
  execFileSync("git", ["add", "src/a.js"], { cwd: dir });
  execFileSync("git", ["commit", "-m", "add", "-q"], { cwd: dir });
  execFileSync("git", ["rm", "-q", "src/a.js"], { cwd: dir });

  assert.deepEqual(checkStagedIsolation(["src/a.js"], dir), []);
  rmSync(dir, { recursive: true, force: true });
});

test("a path that is not in the index is ignored rather than reported", () => {
  const dir = repo();
  writeFileSync(join(dir, "src", "a.js"), "untracked\n");

  assert.deepEqual(checkStagedIsolation(["src/a.js"], dir), []);
  rmSync(dir, { recursive: true, force: true });
});

test("line endings do not manufacture a mismatch", () => {
  // git may normalise CRLF on the way into the index. A byte comparison would
  // then report every file on Windows, which is where this toolkit primarily runs.
  const dir = repo();
  execFileSync("git", ["config", "core.autocrlf", "true"], { cwd: dir });
  writeFileSync(join(dir, "src", "a.js"), "const x = 1;\r\nconst y = 2;\r\n");
  execFileSync("git", ["add", "src/a.js"], { cwd: dir });

  assert.deepEqual(checkStagedIsolation(["src/a.js"], dir), []);
  rmSync(dir, { recursive: true, force: true });
});

test("a repository git cannot read is reported, not passed", () => {
  // The check answers "is the working tree the index?". If it cannot run, the
  // answer is unknown — and unknown must never be reported as yes. Failing open
  // here is worse than useless: the contention that makes git fail is exactly the
  // condition under which the isolation itself is suspected of failing, so the
  // guard would go quiet precisely when it is needed.
  const dir = mkdtempSync(join(tmpdir(), "gr-iso-bare-"));
  writeFileSync(join(dir, "a.js"), "const x = 1;\n");

  const problems = checkStagedIsolation(["a.js"], dir);

  assert.equal(problems.length, 1);
  assert.match(
    problems[0],
    /could not be verified|not a git repository|unknown/i,
  );
  rmSync(dir, { recursive: true, force: true });
});
