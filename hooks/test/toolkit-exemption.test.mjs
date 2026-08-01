// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis Uncited uncited lede
// Split from standards-instantiation.test.mjs — subject group: toolkit-exemption.
// Loaded by hooks/test/hooks.test.mjs; not invoked directly by the test runner.
import { test } from "node:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  findHardcodedCommitSha,
  checkHardcodedCommitSha,
} from "../../scripts/check-standards-instantiation.mjs";
import { isToolkit, TOOLKIT_PLUGIN_NAME } from "../../scripts/lib.mjs";
import assert from "node:assert/strict";
import { ROOT, CLEAN_ENV, git, scratchRepo, runScript } from "./support.mjs";

// --- scripts/check-standards-instantiation.mjs — fix 60. An implementer
// removed, by hand, two toolkit self-checks that had made it into a ported
// test file: one reading this toolkit's own commit daa59d0c…, one asserting
// this toolkit's own ADR-0004 was Accepted with a named approver. Both would
// fail deterministically on every consuming repository's first CI run —
// nothing mechanical caught it, since the checks above read
// docs/standards/** and cspell.json, never test files. The narrow, mechanical
// proxy: a full 40-character commit SHA hard-coded in a file classed `test`.

test("findHardcodedCommitSha: a full 40-character commit SHA is found, naming the line", () => {
  const text =
    'line one\nconst sha = "daa59d0cf1d039b997b830eb1029a49d2aa7d099";\n';
  const findings = findHardcodedCommitSha(text);
  assert.equal(findings.length, 1);
  const finding = findings[0];
  assert.ok(finding, "expected one finding");
  assert.equal(finding.line, 2);
  assert.equal(finding.sha, "daa59d0cf1d039b997b830eb1029a49d2aa7d099");
});

test("findHardcodedCommitSha: a short-form SHA (8 characters) is not a finding — only a full 40-character one is precise enough to be mechanical", () => {
  const findings = findHardcodedCommitSha(
    "commit daa59d0c approved the risk\n",
  );
  assert.deepEqual(findings, []);
});

test("findHardcodedCommitSha: a 40-character run embedded inside a longer hex string (a sha256 digest, say) is not a finding — a word boundary never falls in the middle of an unbroken hex run", () => {
  const longHex = "a".repeat(64);
  const findings = findHardcodedCommitSha(`digest: ${longHex}\n`);
  assert.deepEqual(findings, []);
});

test("checkHardcodedCommitSha: a full SHA in a file classed `test` is a finding, naming the file, line and SHA (fix 60)", () => {
  const files = ["hooks/test/x.test.mjs"];
  /** @type {Record<string, string>} */
  const contents = {
    "hooks/test/x.test.mjs":
      'const sha = "daa59d0cf1d039b997b830eb1029a49d2aa7d099";\n',
  };
  const findings = checkHardcodedCommitSha({
    files,
    readFile: (f) => contents[f] ?? "",
    classify: () => "test",
    isToolkit: () => false,
  });
  assert.equal(findings.length, 1);
  const finding = findings[0];
  assert.ok(finding, "expected one finding");
  assert.equal(finding.path, "hooks/test/x.test.mjs");
  assert.match(finding.problem, /daa59d0cf1d039b997b830eb1029a49d2aa7d099/);
  assert.match(finding.problem, /consuming repository's history does not/);
});

test("checkHardcodedCommitSha: the identical SHA in a file NOT classed `test` is out of scope — a configuration-classed CI workflow pinning a GitHub Action to its commit SHA is a security practice, not this defect", () => {
  const files = [".github/workflows/pull-request.yml"];
  /** @type {Record<string, string>} */
  const contents = {
    ".github/workflows/pull-request.yml":
      "uses: actions/checkout@daa59d0cf1d039b997b830eb1029a49d2aa7d099\n",
  };
  const findings = checkHardcodedCommitSha({
    files,
    readFile: (f) => contents[f] ?? "",
    classify: () => "configuration",
    isToolkit: () => false,
  });
  assert.deepEqual(findings, []);
});

test("checkHardcodedCommitSha: this toolkit's own repository is exempt outright, whatever its test files carry", () => {
  const findings = checkHardcodedCommitSha({
    files: ["hooks/test/x.test.mjs"],
    readFile: () => 'const sha = "daa59d0cf1d039b997b830eb1029a49d2aa7d099";\n',
    classify: () => "test",
    isToolkit: () => true,
  });
  assert.deepEqual(findings, []);
});

test("checkHardcodedCommitSha: run for real against this toolkit's own repository, the exemption verified rather than assumed (fix 60, hazard 4)", () => {
  // hooks/test/hooks.test.mjs itself legitimately carries a full 40-character
  // SHA (fix 49, hazard 3: daa59d0cf1d039b997b830eb1029a49d2aa7d099, this
  // repository's own real history) — the exact recursion the brief warns
  // about. isToolkit() defaults to true here (this repository carries
  // .claude-plugin/plugin.json), so the check must return no findings.
  const withExemption = checkHardcodedCommitSha();
  assert.deepEqual(
    withExemption,
    [],
    "the toolkit exemption keeps this repository's own real SHA from being flagged",
  );

  // Fix 59's lesson applied here: an exemption that hides a path from a
  // check also hides it from every test that only ever runs under that
  // exemption. Forcing the exemption off exercises the non-exempt path for
  // real, against this repository's own tree, rather than assuming it would
  // have worked.
  const withoutExemption = checkHardcodedCommitSha({ isToolkit: () => false });
  assert.ok(
    withoutExemption.some((f) =>
      f.problem.includes("daa59d0cf1d039b997b830eb1029a49d2aa7d099"),
    ),
    "with the exemption forced off, this repository's own real SHA in hooks/test/hooks.test.mjs must be found — proof the non-exempt path actually runs, not only that the exemption hides it",
  );
});

// --- Fix 91. `isToolkit()` used to be `() => deriveComponent() !== null`.
// deriveComponent() derives whatever single component a stack's own
// manifest groups (components.md) and is deliberately re-targeted per
// stack when bootstrap ports it — so a correctly-bootstrapped consumer
// derives a non-null component too. Audit 22, against the real subject
// (martincjarvis/greet, a consuming repository): its own ported
// scripts/lib.mjs checks `.claude-plugin/plugin.json` first, exactly this
// repository's own logic, and falls through to `package.json` when that
// manifest is absent — the tuning the bootstrap process makes. A
// consumer's `deriveComponent()` therefore returns non-null there too, and
// the old `isToolkit()` fired only in the one repository it was designed
// never to fire in. lib.mjs's `isToolkit()` now checks
// `.claude-plugin/plugin.json` directly, never through deriveComponent(),
// so no fallback a ported copy adds can affect it.

test("isToolkit (lib.mjs): false in a repository whose component derives from package.json, not .claude-plugin/plugin.json — the real ported shape audit 22 found", () => {
  const dir = scratchRepo();
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "@martincjarvis/greet" }),
  );
  git(dir, ["add", "-A"]);
  const libUrl = pathToFileURL(join(ROOT, "scripts", "lib.mjs")).href;
  writeFileSync(
    join(dir, "probe-isToolkit.mjs"),
    `import { isToolkit } from ${JSON.stringify(libUrl)};\n` +
      "process.stdout.write(String(isToolkit()));\n",
  );
  const r = spawnSync(process.execPath, [join(dir, "probe-isToolkit.mjs")], {
    cwd: dir,
    encoding: "utf8",
    env: CLEAN_ENV,
  });
  assert.equal(
    r.stdout,
    "false",
    "a package.json-derived component must not read as the toolkit",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("isToolkit (lib.mjs): true in this toolkit's own repository, run for real, not assumed", () => {
  const libUrl = pathToFileURL(join(ROOT, "scripts", "lib.mjs")).href;
  const r = spawnSync(
    process.execPath,
    [
      "-e",
      `import(${JSON.stringify(libUrl)}).then(m => process.stdout.write(String(m.isToolkit())));`,
    ],
    { cwd: ROOT, encoding: "utf8", env: CLEAN_ENV },
  );
  assert.equal(r.stdout, "true");
});

test("regression guard: check-standards-instantiation.mjs run for real, against a scratch tree whose ported test file hard-codes a full commit SHA, refuses and names the file, line and SHA (fix 60)", () => {
  const dir = scratchRepo();
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x" }));
  mkdirSync(join(dir, "docs", "standards"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "standards", "testing-strategy.md"),
    "# Testing\n\nRun `npm test` before merging.\n",
  );
  mkdirSync(join(dir, "hooks", "test"), { recursive: true });
  writeFileSync(
    join(dir, "hooks", "test", "hooks.test.mjs"),
    'test("regression guard: the source repository\'s own history (commit daa59d0cf1d039b997b830eb1029a49d2aa7d099)", () => {});\n',
  );
  writeFileSync(
    join(dir, ".gitattributes"),
    "hooks/test/** guardrail-class=test\n",
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-standards-instantiation.mjs", dir);
  assert.equal(r.status, 2);
  assert.match(
    r.stderr,
    /hooks\/test\/hooks\.test\.mjs:1: hard-codes a full 40-character commit SHA \(daa59d0cf1d039b997b830eb1029a49d2aa7d099\)/,
  );
  rmSync(dir, { recursive: true, force: true });
});

// isToolkit() itself, against its real implementation rather than an injected
// stub. Every other test in this file passes `isToolkit: () => …`, which
// verifies what the exemption's consumers do given a boolean and never whether
// the boolean is derived correctly — so the predicate shipped untested through
// fix 91, and again after it. The middle case below is the one that was wrong:
// a repository that is itself a Claude plugin, developing something unrelated,
// carries `.claude-plugin/plugin.json` too, and the existence check exempted it
// from the two checks that exist to catch ported content.
test("isToolkit: true for this plugin, false for another plugin, false for no plugin", () => {
  const manifest = ".claude-plugin/plugin.json";
  /** @param {string} json */
  const withManifest = (json) =>
    isToolkit(
      () => json,
      (f) => f === manifest,
    );

  assert.equal(
    withManifest(JSON.stringify({ name: TOOLKIT_PLUGIN_NAME })),
    true,
    "this toolkit's own manifest",
  );
  assert.equal(
    withManifest(JSON.stringify({ name: "somebody-elses-plugin" })),
    false,
    "an unrelated plugin under development is a consumer, not the toolkit",
  );
  assert.equal(
    isToolkit(
      () => "",
      () => false,
    ),
    false,
    "no plugin manifest at all",
  );
  assert.equal(
    withManifest("{ not json"),
    false,
    "a malformed manifest fails safe by running the checks, not skipping them",
  );
});

// The consequence, end to end: the hardcoded-SHA check must still fire in a
// repository that is a plugin but is not this one.
test("checkHardcodedCommitSha: still fires in an unrelated plugin repository", () => {
  const notThisPlugin = () =>
    isToolkit(
      () => JSON.stringify({ name: "somebody-elses-plugin" }),
      () => true,
    );
  const findings = checkHardcodedCommitSha({
    files: ["hooks/test/ported.test.mjs"],
    readFile: () => "const SHA = 'daa59d0cf1d039b997b830eb1029a49d2aa7d099';",
    classify: () => "test",
    isToolkit: notThisPlugin,
  });
  assert.equal(findings.length, 1);
});
