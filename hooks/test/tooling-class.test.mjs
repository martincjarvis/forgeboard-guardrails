// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis Uncited uncited
// Split from hooks.test.mjs (fix 79) — subject group: tooling-class.
// Loaded by hooks/test/hooks.test.mjs; not invoked directly by the test runner.
import { test } from "node:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  findGateScripts,
  checkToolingClassDeclared,
  complexityScanFiles,
  coveredFilesFromCobertura,
  toolingLeakage,
  checkToolingCoverageLeakage,
  checkToolingTestSuiteExists,
} from "../../scripts/check-tooling-class.mjs";
import assert from "node:assert/strict";
import { git, scratchRepo, runScript } from "./support.mjs";

// --- scripts/check-tooling-class.mjs — fix 45. file-classes.md's own rule
// ("gate scripts and other development automation are `tooling`" in a
// repository that consumes this standard) was stated and never checked.
// Audit 12: `@martincjarvis/greet`, a consuming repository, classed its gate
// scripts `production` and had zero files classed `tooling` anywhere — with
// no live effect only because lizard's extension filter and c8's import-only
// measurement were accidentally doing the class attribute's job. The proof
// that matters is the one that has never been exercised: a `tooling`-classed
// file written in the identical language/extension as a `production` file,
// which an extension filter cannot tell apart and only the class can.
test("findGateScripts: a ported gate/check script is named by its own filename, wherever it lives", () => {
  const files = [
    "tools/gate-6-pull-request.mjs",
    "tools/check-osv-scanner.mjs",
    "tools/pre-commit.mjs",
    "src/app.mjs",
    "docs/README.md",
  ];
  assert.deepEqual(findGateScripts(files), [
    "tools/gate-6-pull-request.mjs",
    "tools/check-osv-scanner.mjs",
    "tools/pre-commit.mjs",
  ]);
});

test("checkToolingClassDeclared: this toolkit's own repository is exempt outright, whatever its scripts are classed", () => {
  const findings = checkToolingClassDeclared({
    files: ["scripts/gate-6-pull-request.mjs"],
    classify: () => "production",
    isToolkit: () => true,
  });
  assert.deepEqual(findings, []);
});

test("checkToolingClassDeclared: a consuming repository with no gate scripts at all raises nothing", () => {
  const findings = checkToolingClassDeclared({
    files: ["src/app.mjs"],
    classify: () => "production",
    isToolkit: () => false,
  });
  assert.deepEqual(findings, []);
});

test("checkToolingClassDeclared: a consuming repository with ported gate scripts and zero tooling-classed files anywhere is the audit-12 defect, named", () => {
  const findings = checkToolingClassDeclared({
    files: ["scripts/gate-6-pull-request.mjs", "src/app.mjs"],
    classify: () => "production",
    isToolkit: () => false,
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0].problem, /gate-6-pull-request\.mjs/);
  assert.match(findings[0].problem, /no file anywhere.*classed `tooling`/);
});

test("checkToolingClassDeclared: a consuming repository that did class at least one file tooling raises nothing", () => {
  const findings = checkToolingClassDeclared({
    files: ["scripts/gate-6-pull-request.mjs", "src/app.mjs"],
    classify: (f) =>
      f === "scripts/gate-6-pull-request.mjs" ? "tooling" : "production",
    isToolkit: () => false,
  });
  assert.deepEqual(findings, []);
});

// --- checkToolingTestSuiteExists — fix 52. Audit 13: a repository with 26
// `tooling`-classed scripts, no test file, no job, and nothing positioned to
// notice — check-script-wiring.mjs and check-tooling-class.mjs's own
// checkToolingClassDeclared both passed clean, because neither asks whether
// the ported scripts are tested, only whether they are invoked or classed.

test("checkToolingTestSuiteExists: this toolkit's own repository is exempt outright, whatever its scripts are classed", () => {
  const findings = checkToolingTestSuiteExists({
    files: ["scripts/check-x.mjs"],
    classify: () => "tooling",
    isToolkit: () => true,
    readFile: () => "",
  });
  assert.deepEqual(findings, []);
});

test("checkToolingTestSuiteExists: a consuming repository with no tooling-classed files at all raises nothing", () => {
  const findings = checkToolingTestSuiteExists({
    files: ["src/app.mjs"],
    classify: () => "production",
    isToolkit: () => false,
    readFile: () => "",
  });
  assert.deepEqual(findings, []);
});

test("checkToolingTestSuiteExists: tooling-classed scripts with no test file naming any of them is the audit-13 defect, named", () => {
  const files = ["tools/check-foo.mjs", "tools/check-bar.mjs", "src/app.mjs"];
  const findings = checkToolingTestSuiteExists({
    files,
    classify: (f) => (f.startsWith("tools/") ? "tooling" : "production"),
    isToolkit: () => false,
    readFile: () => "",
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0].problem, /check-foo\.mjs/);
  assert.match(findings[0].problem, /no tooling tests suite exists/);
});

test("checkToolingTestSuiteExists: a test file naming one tooling script by its basename is enough — the whole class need not be enumerated", () => {
  const files = [
    "tools/check-foo.mjs",
    "tools/check-bar.mjs",
    "tools/test/tooling.test.mjs",
  ];
  const findings = checkToolingTestSuiteExists({
    files,
    classify: (f) => {
      if (f === "tools/test/tooling.test.mjs") return "test";
      return "tooling";
    },
    isToolkit: () => false,
    readFile: (f) =>
      f === "tools/test/tooling.test.mjs"
        ? 'import { checkFoo } from "../check-foo.mjs";\n'
        : "",
  });
  assert.deepEqual(findings, []);
});

test("complexityScanFiles: production and test files pass, every other class is excluded", () => {
  const files = [
    "src/app.mjs",
    "src/app.test.mjs",
    "package.json",
    "docs/readme.md",
    "skills/foo/SKILL.md",
    "tools/check-foo.mjs",
  ];
  const classify = (f) => {
    if (f === "src/app.mjs") return "production";
    if (f === "src/app.test.mjs") return "test";
    if (f === "package.json") return "configuration";
    if (f === "docs/readme.md") return "documentation";
    if (f === "skills/foo/SKILL.md") return "agent-context";
    return "tooling";
  };
  assert.deepEqual(complexityScanFiles({ files, classify }), [
    "src/app.mjs",
    "src/app.test.mjs",
  ]);
});

test("complexityScanFiles: a tooling-classed file is excluded even in the identical language as the production file beside it — the case extension filtering can never prove", () => {
  const files = ["src/app.mjs", "tools/check-foo.mjs"];
  const classify = (f) =>
    f === "tools/check-foo.mjs" ? "tooling" : "production";
  assert.deepEqual(complexityScanFiles({ files, classify }), ["src/app.mjs"]);
});

test("coveredFilesFromCobertura: every <class filename> in the report is named, backslashes normalised to forward slashes", () => {
  const xml =
    "<coverage><packages><package><classes>" +
    '<class name="app" filename="src/app.mjs"/>' +
    '<class name="foo" filename="tools\\check-foo.mjs"/>' +
    "</classes></package></packages></coverage>";
  assert.deepEqual(coveredFilesFromCobertura(xml), [
    "src/app.mjs",
    "tools/check-foo.mjs",
  ]);
});

test("toolingLeakage: a tooling-classed file in the coverage report is named even with a same-extension production file measured cleanly beside it", () => {
  const classify = (f) =>
    f === "tools/check-foo.mjs" ? "tooling" : "production";
  const covered = ["src/app.mjs", "tools/check-foo.mjs"];
  assert.deepEqual(toolingLeakage(covered, { classify }), [
    "tools/check-foo.mjs",
  ]);
});

test("checkToolingCoverageLeakage: no report yet this run is a visible skip, not a finding", () => {
  const { findings, skips } = checkToolingCoverageLeakage({
    readReport: () => {
      throw new Error("ENOENT");
    },
  });
  assert.deepEqual(findings, []);
  assert.equal(skips.length, 1);
  assert.match(skips[0], /no coverage\/cobertura-coverage\.xml/);
});

test("checkToolingCoverageLeakage: a tooling-classed file present in the report is a finding, named", () => {
  const xml =
    "<coverage><packages><package><classes>" +
    '<class name="foo" filename="tools/check-foo.mjs"/>' +
    "</classes></package></packages></coverage>";
  const { findings, skips } = checkToolingCoverageLeakage({
    readReport: () => xml,
    classify: () => "tooling",
  });
  assert.equal(skips.length, 0);
  assert.equal(findings.length, 1);
  assert.match(findings[0].problem, /tools\/check-foo\.mjs/);
});

test("checkToolingCoverageLeakage: a clean report with no tooling-classed file in it raises nothing", () => {
  const xml =
    "<coverage><packages><package><classes>" +
    '<class name="app" filename="src/app.mjs"/>' +
    "</classes></package></packages></coverage>";
  const { findings, skips } = checkToolingCoverageLeakage({
    readReport: () => xml,
    classify: () => "production",
  });
  assert.deepEqual(findings, []);
  assert.deepEqual(skips, []);
});

test("regression guard: check-tooling-class.mjs run for real, against a scratch tree with ported gate scripts and no tooling-classed file anywhere, refuses and names it", () => {
  const dir = scratchRepo();
  mkdirSync(join(dir, "scripts"), { recursive: true });
  writeFileSync(
    join(dir, "scripts", "gate-6-pull-request.mjs"),
    "// a ported gate script\n",
  );
  writeFileSync(join(dir, "src.mjs"), "export const x = 1;\n");
  writeFileSync(
    join(dir, ".gitattributes"),
    "*.mjs guardrail-class=production\n",
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-tooling-class.mjs", dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /gate-6-pull-request\.mjs/);
  assert.match(r.stderr, /no file anywhere.*classed `tooling`/);
  rmSync(dir, { recursive: true, force: true });
});

test("regression guard: check-tooling-class.mjs run for real, against a scratch tree that does class its gate script tooling and has a test file naming it, passes clean", () => {
  const dir = scratchRepo();
  mkdirSync(join(dir, "scripts"), { recursive: true });
  mkdirSync(join(dir, "scripts", "test"), { recursive: true });
  writeFileSync(
    join(dir, "scripts", "gate-6-pull-request.mjs"),
    "// a ported gate script\n",
  );
  writeFileSync(
    join(dir, "scripts", "test", "gate-6-pull-request.test.mjs"),
    "// exercises gate-6-pull-request.mjs\n",
  );
  writeFileSync(join(dir, "src.mjs"), "export const x = 1;\n");
  writeFileSync(
    join(dir, ".gitattributes"),
    "*.mjs guardrail-class=production\n" +
      "scripts/** guardrail-class=tooling\n" +
      "scripts/test/** guardrail-class=test\n",
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-tooling-class.mjs", dir);
  assert.equal(r.status, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("regression guard: check-tooling-class.mjs run for real, against a scratch tree with tooling-classed scripts and no test file naming any of them, refuses (fix 52, the audit-13 defect)", () => {
  const dir = scratchRepo();
  mkdirSync(join(dir, "scripts"), { recursive: true });
  writeFileSync(
    join(dir, "scripts", "gate-6-pull-request.mjs"),
    "// a ported gate script\n",
  );
  writeFileSync(join(dir, "src.mjs"), "export const x = 1;\n");
  writeFileSync(
    join(dir, ".gitattributes"),
    "*.mjs guardrail-class=production\nscripts/** guardrail-class=tooling\n",
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-tooling-class.mjs", dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no tooling tests suite exists/);
  rmSync(dir, { recursive: true, force: true });
});
