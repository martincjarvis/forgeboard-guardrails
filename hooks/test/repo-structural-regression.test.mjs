// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis Uncited uncited
// Split from hooks.test.mjs — subject group: repo-structural-regression.
// Cross-cutting regression guards over this repository's own structural state
// (gate-7 robustness, registered suppressions, the hooks/README index, workflow
// SHA pinning, quality-script wiring) — each locks in a past fix against the
// repo's own files. Loaded by hooks/test/hooks.test.mjs; not invoked directly.
import { test } from "node:test";
import { writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { checkSuppressions } from "../../scripts/check-suppressions.mjs";
import { checkScriptWiring } from "../../scripts/check-script-wiring.mjs";
import assert from "node:assert/strict";
import { ROOT, git, scratchRepo, runScript, NOSEMGREP } from "./support.mjs";

test("regression guard: gate 7 reports, rather than crashes, when package.json is absent", () => {
  // A follow-up — caught by running `npm run gate:7` before declaring
  // the fix cycle done. The quality-script wiring
  // audit read package.json unconditionally; check-refusal-proofs.mjs's own
  // semgrep fixture builds a scratch repository with no package.json (it
  // exists only to isolate the semgrep step), so gate 7 threw before it
  // ever reached semgrep — the refusal-proof audit reported the semgrep
  // check as "does not refuse" for a reason that had nothing to do with
  // semgrep. .gitattributes is created here for the same reason the real
  // fixture creates one: gate 7's workspace-capability check already reads
  // it unconditionally, and this test is about the package.json read, not
  // that pre-existing one.
  const dir = scratchRepo();
  writeFileSync(join(dir, ".gitattributes"), "* text=auto eol=lf\n");
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/gate-7-on-demand.mjs", dir);
  assert.equal(
    r.status,
    0,
    "gate 7 reports and never blocks — it must not exit non-zero, let alone crash",
  );
  assert.match(
    r.stderr,
    /quality-script wiring.*package\.json missing or unparseable/,
  );
});

test("regression guard: hooks/lib/run.mjs's spawn-shell-true and detect-child-process findings carry a suppression marker, and each is registered", () => {
  // `semgrep --config auto --error hooks/lib/run.mjs` found three
  // live, unsuppressed findings (one spawn-shell-true, two
  // detect-child-process) with no inline suppression marker and no register
  // row. Closed by registering, not by rewriting the code to dodge the
  // pattern: spawn-shell-true is a genuine OS constraint on Windows,
  // verified directly — even a fully resolved .cmd path still returns
  // EINVAL without a shell, and detect-child-process is inherent to being a
  // generic process-spawning helper.
  //
  // Asserting only "no unregistered marker finding" would pass just as well
  // on the original, unfixed file — it has no marker at all, so there is
  // nothing for checkSuppressions to call unregistered. This first checks
  // the markers actually exist, then that each is registered — the real
  // gate 2 check, not a re-implementation of it, over the real staged file.
  // NOSEMGREP is built by concatenation (declared above): a literal marker
  // string here would flag this test file's own source, the same reason
  // ESLINT_DISABLE and SECRETLINT_DISABLE above it are built the same way.
  const content = readFileSync(join(ROOT, "hooks", "lib", "run.mjs"), "utf8");
  assert.match(
    content,
    new RegExp(`${NOSEMGREP}:.*spawn-shell-true`),
    "the spawn-shell-true finding has no suppression marker",
  );
  assert.match(
    content,
    new RegExp(`${NOSEMGREP}:.*detect-child-process`),
    "the detect-child-process finding has no suppression marker",
  );
  const findings = checkSuppressions(["hooks/lib/run.mjs"]);
  assert.deepEqual(findings, []);
});

test("regression guard: hooks/ carries a README.md indexing every file in it and in hooks/lib", () => {
  // file-classes.md: "The directory carries a README.md indexing
  // every script — what it is for, and why it exists." scripts/ has one;
  // hooks/ did not, in this toolkit or in anything bootstrapped from it. A
  // README that exists but silently falls behind a new hook is the same gap
  // by a slower route, so this checks every current file is actually named
  // in it rather than only that the file exists.
  const readmePath = join(ROOT, "hooks", "README.md");
  assert.ok(existsSync(readmePath), "hooks/README.md is missing");
  const readme = readFileSync(readmePath, "utf8");
  const hooksDir = join(ROOT, "hooks");
  const topLevel = readdirSync(hooksDir).filter((f) => f.endsWith(".mjs"));
  const libFiles = readdirSync(join(hooksDir, "lib")).filter((f) =>
    f.endsWith(".mjs"),
  );
  assert.ok(topLevel.length > 0 && libFiles.length > 0);
  for (const file of [...topLevel, ...libFiles]) {
    assert.match(
      readme,
      new RegExp(file.replace(/\./g, "\\.")),
      `hooks/README.md does not mention ${file}`,
    );
  }
});

test("regression guard: every GitHub Actions `uses:` in every workflow is pinned to a commit SHA, not a mutable tag", () => {
  // semgrep's github-actions-mutable-action-tag rule found exactly
  // this: a workflow written with `uses: actions/checkout@v4` — a tag GitHub
  // itself, or a compromised action's own maintainer, can move to point at
  // different code without this file ever changing. A pinned commit SHA is
  // immutable; a version tag is not.
  const workflowsDir = join(ROOT, ".github", "workflows");
  const files = readdirSync(workflowsDir).filter((f) => f.endsWith(".yml"));
  assert.ok(files.length > 0, "expected at least one workflow file to check");
  const usesRe = /uses:\s*([^\s#]+)@([^\s#]+)/g;
  let checked = 0;
  for (const file of files) {
    const content = readFileSync(join(workflowsDir, file), "utf8");
    for (const [, action, ref] of content.matchAll(usesRe)) {
      assert.ok(ref, "expected a ref");
      checked += 1;
      assert.match(
        ref,
        /^[0-9a-f]{40}$/,
        `${file}: "${action}@${ref}" is not pinned to a 40-character commit SHA`,
      );
    }
  }
  assert.ok(
    checked > 0,
    "expected at least one `uses:` line across the workflows",
  );
});

test("quality-script wiring: every script in this repository's own package.json is accounted for — wired or declared on-demand, nothing unwired", () => {
  // Runs against the real manifest and the real gate/hook source, not
  // a fixture — the whole point is that THIS repository's own scripts are
  // fully accounted for right now. `spell` is wired here specifically
  // because cspell was extended to the code glob; before that this
  // same assertion would have put `spell` in `unwired`.
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  /** @param {string} file */
  const readFile = (file) => readFileSync(join(ROOT, file), "utf8");
  const { wired, onDemand, unwired } = checkScriptWiring(pkg.scripts, readFile);
  assert.deepEqual(unwired, []);
  assert.ok(wired.includes("lint"));
  assert.ok(wired.includes("spell"));
  assert.ok(onDemand.includes("gate:7"));
  // Every script in the manifest lands in exactly one bucket — none silently
  // dropped.
  assert.equal(wired.length + onDemand.length, Object.keys(pkg.scripts).length);
});

test("quality-script wiring: a script with no gate wiring and no on-demand declaration is reported unwired, naming it", () => {
  // A synthetic manifest entry standing in for the exact defect this
  // closes: a script added to package.json that nothing invokes and nobody
  // declared on-demand. checkScriptWiring must not silently pass it.
  const { wired, onDemand, unwired } = checkScriptWiring({
    typecheck: "tsc --noEmit --strict",
  });
  assert.deepEqual(wired, []);
  assert.deepEqual(onDemand, []);
  assert.equal(unwired.length, 1);
  const entry = unwired[0];
  assert.ok(entry, "expected an unwired entry");
  assert.match(entry, /typecheck/);
  assert.match(entry, /no gate.*invokes it/);
});

test("quality-script wiring: a WIRING claim that no longer matches the file's actual content is reported unwired, not trusted blind", () => {
  // Self-verification, not a hardcoded assertion: if `lint`'s declared
  // evidence (the eslint invocation in pre-commit.mjs) drifts away — the
  // flag is renamed, the call is removed — this must catch that rather than
  // keep reporting `lint` as wired forever because a table once said so.
  const { wired, unwired } = checkScriptWiring(
    { lint: "eslint --max-warnings 0 hooks scripts" },
    () => "this file no longer invokes eslint at all",
  );
  assert.deepEqual(wired, []);
  assert.equal(unwired.length, 1);
  const entry = unwired[0];
  assert.ok(entry, "expected an unwired entry");
  assert.match(entry, /lint/);
  assert.match(entry, /drifted/);
});
