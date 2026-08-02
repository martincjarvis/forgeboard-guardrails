// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis Uncited uncited
// Split from links-and-suppressions.test.mjs — subject group: link-integrity.
// Loaded by hooks/test/hooks.test.mjs; not invoked directly by the test runner.
import { test } from "node:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { git, scratchRepo, runScript } from "./support.mjs";

// --- scripts/check-links.mjs — resolveTarget's branches (link/anchor
// integrity, docs/standards/guardrails/gate-2-commit.md check 17). No test
// covered this module at all before refactoring resolveTarget below CCN 15,
// so these are added first, exercising it through the public checkLinks/CLI
// surface rather than the unexported helper itself.

test("link check: a link to a file that exists passes; one to nothing is refused", () => {
  const dir = scratchRepo();
  writeFileSync(join(dir, "target.md"), "# Target\n");
  writeFileSync(
    join(dir, "source.md"),
    "[ok](target.md) and [broken](nope.md)\n",
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-links.mjs", dir, ["source.md"]);
  assert.equal(r.status, 2, "one of the two links is broken");
  assert.match(r.stderr, /links to nothing: nope\.md/);
  assert.doesNotMatch(r.stderr, /links to nothing: target\.md/);
  rmSync(dir, { recursive: true, force: true });
});

test("link check: an anchor that exists in the target passes; one that does not is refused", () => {
  const dir = scratchRepo();
  writeFileSync(join(dir, "target.md"), "# Target\n\n## Real Heading\n");
  writeFileSync(
    join(dir, "source.md"),
    "[good](target.md#real-heading) and [bad](target.md#missing-heading)\n",
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-links.mjs", dir, ["source.md"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /anchor does not exist: #missing-heading/);
  assert.doesNotMatch(r.stderr, /anchor does not exist: #real-heading/);
  rmSync(dir, { recursive: true, force: true });
});

test("link check: an anchor-only link resolves against its own file", () => {
  const dir = scratchRepo();
  writeFileSync(
    join(dir, "source.md"),
    "# Source\n\n## A Section\n\n[jump](#a-section) and [missing](#nowhere)\n",
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-links.mjs", dir, ["source.md"]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /anchor does not exist: #nowhere/);
  assert.doesNotMatch(r.stderr, /anchor does not exist: #a-section/);
  rmSync(dir, { recursive: true, force: true });
});

test("link check: a bare directory link resolves via its README, and a query string is stripped before resolving", () => {
  const dir = scratchRepo();
  mkdirSync(join(dir, "sub"), { recursive: true });
  writeFileSync(join(dir, "sub", "README.md"), "# Sub\n");
  writeFileSync(
    join(dir, "source.md"),
    "[dir](sub) and [q](sub/README.md?x=1)\n",
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-links.mjs", dir, ["source.md"]);
  assert.equal(
    r.status,
    0,
    "GitHub's directory-to-README resolution and query stripping both pass",
  );
  rmSync(dir, { recursive: true, force: true });
});
