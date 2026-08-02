// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis Uncited uncited bypassable
// Split from hooks.test.mjs — subject group: gate-5-markdown-push.
// The push-time markdown gate: cross-document link/anchor integrity at push,
// the tree-wide markdownlint sweep wired into gate 6, and its wiring guard.
// Loaded by hooks/test/hooks.test.mjs; not invoked directly by the test runner.
import { test } from "node:test";
import { writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { run } from "../lib/run.mjs";
import assert from "node:assert/strict";
import { ROOT, CLEAN_ENV, scratchRepo, git, runScript } from "./support.mjs";

test("link integrity at push: a broken cross-document anchor in the pushed set is refused", () => {
  // docs/specs/2026-08-01-markdown-gate-scope-design.md. Link integrity moved
  // from gate 2 to gate 5: a link from one document to a heading in another
  // cannot be judged from a single staged file, and the push is where the
  // complete set exists. checkLinks() is the function gate-5-push.mjs calls
  // (check 6); a non-empty result is a refusal. Run as a subprocess against a
  // scratch repository's tracked files — the same shape gate 5 sees at push,
  // where every file in the pushed series is tracked, so the broken
  // cross-document link is caught.
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  writeFileSync(
    join(dir, "index.md"),
    "# Index\n\nSee the [details](details.md#missing).\n",
  );
  writeFileSync(
    join(dir, "details.md"),
    "# Details\n\nNo anchor named missing here.\n",
  );
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "docs: cross-link to details"]);
  const r = runScript("scripts/check-links.mjs", dir);
  assert.notEqual(
    r.status,
    0,
    "a broken cross-document link must be refused at push, not silently passed",
  );
  assert.match(r.stderr, /link\/anchor integrity/);
  assert.match(
    (r.stderr || "") + (r.stdout || ""),
    /anchor does not exist/,
    "the refusal must name the broken anchor, not merely that a problem exists",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("gate 6 markdown sweep: a tracked markdown file that breaks a structural rule is refused", () => {
  // The tree-wide markdown sweep ran only in gate 5's pre-push hook (local,
  // bypassable with --no-verify) and gate 7 (manual) after the scope split;
  // CI never ran it — the exit-0 class in a new form. Wired into gate 6 beside
  // checkLinks(), the same whole-corpus reasoning applies: a structural rule
  // is judged against the complete tree, and CI is where a green merge rests.
  // Proved refusing the same way the link test above proves its check — run
  // the exact sweep command gate 6 runs against a scratch repository's tracked
  // corpus, and assert a structural violation (no top-level heading) is
  // caught. Full gate 6 is not invoked here: it would also run semgrep
  // --config auto (network-bound) and the whole build/test pipeline, none of
  // which is the unit under test.
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  // Give the base README a valid heading so the only structural violation is
  // the fixture below — the refusal is attributable to the file under test.
  writeFileSync(join(dir, "README.md"), "# Base\n\nClean prose.\n");
  writeFileSync(
    join(dir, "broken.md"),
    "no top-level heading — a structural per-file violation\n",
  );
  // The configs the sweep loads: the rules file and the CLI config.
  writeFileSync(
    join(dir, ".markdownlint.jsonc"),
    readFileSync(join(ROOT, ".markdownlint.jsonc"), "utf8"),
  );
  writeFileSync(
    join(dir, ".markdownlint-cli2.jsonc"),
    readFileSync(join(ROOT, ".markdownlint-cli2.jsonc"), "utf8"),
  );
  // The exact sweep gate 6 runs (beside checkLinks): the whole-tree glob at
  // the call site. Resolved through the toolkit's own binary the way the
  // gate-2 commit-scope test resolves markdownlint-cli2.
  const md = join(ROOT, "node_modules", ".bin", "markdownlint-cli2");
  const r = run(md, ["**/*.md"], { cwd: dir, env: CLEAN_ENV });
  assert.notEqual(
    r.status,
    0,
    "a tracked markdown file that breaks a structural rule must be refused by the gate-6 sweep",
  );
  assert.match(
    (r.stdout || "") + (r.stderr || ""),
    /MD041/,
    "the refusal must name the structural rule violated, not merely that a problem exists",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("regression guard: scripts/gate-6-pull-request.mjs wires the repo-wide markdown sweep beside checkLinks", () => {
  // Same shape as the gate-4/base wiring guard in gate-1-4-task-completion:
  // re-reads the real source rather than trusting a comment, so a future edit
  // that drops the sweep is caught here rather than only in production. Gate 6
  // is the CI command; without this invocation the structural rules have no
  // server-side enforcement.
  const text = readFileSync(
    join(ROOT, "scripts", "gate-6-pull-request.mjs"),
    "utf8",
  );
  assert.match(
    text,
    /markdownlint-cli2/,
    "gate 6 must invoke the repo-wide markdown sweep, beside checkLinks",
  );
});
