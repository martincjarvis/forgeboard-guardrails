// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis Uncited uncited
// Split from hooks.test.mjs (fix 79) — subject group: gate-5-push-and-scans.
// Loaded by hooks/test/hooks.test.mjs; not invoked directly by the test runner.
import { test } from "node:test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  normalizeSarifPaths,
  filterSuppressedSarif,
  classifyTestCoverageOutcome,
  extractCoverageAndTestSummary,
  classifyDiffCoverOutcome,
  diffCoverTotalLines,
  classifyOsvScannerOutcome,
  extractOsvJsonFindings,
  extractOsvSarifFindings,
} from "../../scripts/lib.mjs";
import { checkOsvScanner } from "../../scripts/check-osv-scanner.mjs";
import { run, have } from "../lib/run.mjs";
import { classifyFixtureResult } from "../../scripts/check-refusal-proofs.mjs";
import assert from "node:assert/strict";
import { ROOT, CLEAN_ENV, scratchRepo, NOSEMGREP } from "./support.mjs";

// --- scripts/lib.mjs — normalizeSarifPaths (.github/workflows/pull-
// request.yml's SARIF upload; the Windows matrix leg's semgrep emits
// backslash paths GitHub's ingestion treats as a different file from the
// Linux leg's forward-slash ones).

function sarifWith(uri) {
  return {
    runs: [
      {
        results: [
          {
            locations: [{ physicalLocation: { artifactLocation: { uri } } }],
          },
        ],
      },
    ],
  };
}

test("normalizeSarifPaths rewrites a backslash artifact URI to forward slashes", () => {
  const dir = mkdtempSync(join(tmpdir(), "sarif-"));
  const file = join(dir, "results.sarif");
  writeFileSync(file, JSON.stringify(sarifWith("hooks\\lib\\run.mjs")));
  normalizeSarifPaths(file);
  const rewritten = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(
    rewritten.runs[0].results[0].locations[0].physicalLocation.artifactLocation
      .uri,
    "hooks/lib/run.mjs",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("normalizeSarifPaths leaves an already-forward-slash URI (the Linux leg) unchanged", () => {
  const dir = mkdtempSync(join(tmpdir(), "sarif-"));
  const file = join(dir, "results.sarif");
  writeFileSync(file, JSON.stringify(sarifWith("hooks/lib/run.mjs")));
  normalizeSarifPaths(file);
  const rewritten = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(
    rewritten.runs[0].results[0].locations[0].physicalLocation.artifactLocation
      .uri,
    "hooks/lib/run.mjs",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("normalizeSarifPaths does not throw when the SARIF file is missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "sarif-"));
  assert.doesNotThrow(() =>
    normalizeSarifPaths(join(dir, "does-not-exist.sarif")),
  );
  rmSync(dir, { recursive: true, force: true });
});

// --- scripts/lib.mjs — filterSuppressedSarif (fix 25). semgrep's SARIF
// includes a finding suppressed in source rather than omitting it, marked
// `suppressions: [{ kind: "inSource" }]`; GitHub's code-scanning check
// treats every result in the uploaded file as a candidate new alert, so an
// already-registered suppression turns the pull request red on the
// platform even though gate 6's own check honours it and exits 0.

function sarifWithResults(results) {
  return { runs: [{ results }] };
}

test("filterSuppressedSarif drops a result marked suppressed inSource", () => {
  const dir = mkdtempSync(join(tmpdir(), "sarif-"));
  const file = join(dir, "results.sarif");
  writeFileSync(
    file,
    JSON.stringify(
      sarifWithResults([
        { ruleId: "no-eval", suppressions: [{ kind: "inSource" }] },
      ]),
    ),
  );
  filterSuppressedSarif(file);
  const filtered = JSON.parse(readFileSync(file, "utf8"));
  assert.deepEqual(
    filtered.runs[0].results,
    [],
    "a result suppressed inSource must not reach the uploaded SARIF",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("filterSuppressedSarif keeps an unsuppressed result alongside a suppressed one", () => {
  const dir = mkdtempSync(join(tmpdir(), "sarif-"));
  const file = join(dir, "results.sarif");
  writeFileSync(
    file,
    JSON.stringify(
      sarifWithResults([
        { ruleId: "no-eval", suppressions: [{ kind: "inSource" }] },
        { ruleId: "no-eval-2" },
      ]),
    ),
  );
  filterSuppressedSarif(file);
  const filtered = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(filtered.runs[0].results.length, 1);
  assert.equal(filtered.runs[0].results[0].ruleId, "no-eval-2");
  rmSync(dir, { recursive: true, force: true });
});

test("filterSuppressedSarif does not throw when the SARIF file is missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "sarif-"));
  assert.doesNotThrow(() =>
    filterSuppressedSarif(join(dir, "does-not-exist.sarif")),
  );
  rmSync(dir, { recursive: true, force: true });
});

// End-to-end reproduction of the actual audit-8 mechanism: a real semgrep
// run against a local rule file (no `--config auto` — no network needed,
// same reasoning refuseSemgrepFixture avoids it for a scratch repository),
// one finding carrying a same-line in-source suppression marker and one
// without. Proves the suppressed finding is present in semgrep's own SARIF
// (what GitHub's code-scanning check would otherwise alert on) and absent
// after filterSuppressedSarif runs — the exact fix, not a re-implementation
// of it. The marker itself is assembled from NOSEMGREP (declared below),
// not typed as a contiguous literal here — this file's own gate 2 suppression
// check would otherwise read this fixture string as an unregistered
// directive of its own.
test("fix 25: a finding suppressed in source is present in raw semgrep SARIF and absent after filtering", () => {
  if (!have("semgrep", ["--version"])) return; // no fixture — semgrep unavailable here
  const dir = mkdtempSync(join(tmpdir(), "semgrep-suppress-"));
  writeFileSync(
    join(dir, "rule.yaml"),
    "rules:\n" +
      "  - id: no-eval\n" +
      "    languages: [python]\n" +
      "    severity: ERROR\n" +
      "    message: eval() is dangerous\n" +
      "    pattern: eval(...)\n",
  );
  writeFileSync(
    join(dir, "bad.py"),
    `x = eval(user_input)  # ${NOSEMGREP}: no-eval\n` +
      "y = eval(other_input)\n",
  );
  const sarif = join(dir, "results.sarif");
  run(
    "semgrep",
    ["--config", "rule.yaml", "--sarif", "--output", "results.sarif", "bad.py"],
    { cwd: dir, env: { ...CLEAN_ENV, PYTHONUTF8: "1" } },
  );
  const raw = JSON.parse(readFileSync(sarif, "utf8"));
  assert.equal(
    raw.runs[0].results.length,
    2,
    "semgrep's own SARIF must still carry both findings, suppressed and not",
  );
  assert.ok(
    raw.runs[0].results.some((r) =>
      (r.suppressions ?? []).some((s) => s.kind === "inSource"),
    ),
    "the marked line must be present, marked suppressed inSource",
  );
  filterSuppressedSarif(sarif);
  const filtered = JSON.parse(readFileSync(sarif, "utf8"));
  assert.equal(
    filtered.runs[0].results.length,
    1,
    "only the unsuppressed finding survives filtering",
  );
  assert.ok(
    !(filtered.runs[0].results[0].suppressions ?? []).some(
      (s) => s.kind === "inSource",
    ),
  );
  rmSync(dir, { recursive: true, force: true });
});

// Fix 30 (cross-gate-rules.md, "A suppression is verified at repository
// scope, never at the scope of the file just edited") — the exact mechanism
// behind the defect: fix 21 verified its suppression with `semgrep --config
// auto --error hooks/lib/run.mjs`, reported "3 findings before, 0 after",
// and was silent about two live, unmarked findings of the same rule already
// sitting in hooks/test/hooks.test.mjs (fix 29) — a repository-scope run
// would have caught them there and then. This reproduces the shape
// generically, independent of what today's tree happens to contain: one
// file carries the pattern with an in-source suppression (what "the file
// just edited" looks like clean), a sibling file carries the same pattern
// with none (what a repository-scope run, and only a repository-scope run,
// still catches).
test("fix 30: a file-scoped semgrep check reads clean while a sibling file's unsuppressed occurrence of the same rule only surfaces at repository scope", () => {
  if (!have("semgrep", ["--version"])) return; // no fixture — semgrep unavailable here
  const dir = mkdtempSync(join(tmpdir(), "semgrep-scope-"));
  writeFileSync(
    join(dir, "rule.yaml"),
    "rules:\n" +
      "  - id: no-eval\n" +
      "    languages: [python]\n" +
      "    severity: ERROR\n" +
      "    message: eval() is dangerous\n" +
      "    pattern: eval(...)\n",
  );
  // The file actually touched by the fix: the pattern is present but
  // suppressed — the same in-source marker fix 25's fixture above uses.
  writeFileSync(
    join(dir, "edited.py"),
    `x = eval(user_input)  # ${NOSEMGREP}: no-eval\n`,
  );
  // A sibling nobody re-checked: the same rule, no marker — the exact shape
  // of the two spawn-shell-true sites fix 21's file-scoped check never saw.
  writeFileSync(join(dir, "sibling.py"), "y = eval(other_input)\n");

  const fileScoped = run(
    "semgrep",
    ["--config", "rule.yaml", "--quiet", "--error", "edited.py"],
    { cwd: dir, env: { ...CLEAN_ENV, PYTHONUTF8: "1" } },
  );
  assert.equal(
    fileScoped.status,
    0,
    "a check scoped to only the edited file must read clean here — this is the false confidence the rule closes",
  );

  const repoScoped = run(
    "semgrep",
    ["--config", "rule.yaml", "--quiet", "--error", "."],
    { cwd: dir, env: { ...CLEAN_ENV, PYTHONUTF8: "1" } },
  );
  assert.notEqual(
    repoScoped.status,
    0,
    "a repository-scope check must refuse on the sibling's unsuppressed occurrence — the same scope gate 7's own semgrep sweep (scripts/gate-7-on-demand.mjs) already runs",
  );

  rmSync(dir, { recursive: true, force: true });
});

// --- scripts/check-refusal-proofs.mjs — fix 9a, the refusal-proof contract
// (docs/standards/guardrails/cross-gate-rules.md, "Every blocking check
// proves it refuses"). Only the pure classification rule and a fast,
// file-content regression guard run here: the full registry
// (scripts/check-refusal-proofs.mjs's own CLI) shells out to semgrep, cspell
// and markdownlint-cli2 and takes upward of twenty seconds — appropriate for
// gate 7 and the weekly CI audit this is deliberately NOT wired into per
// commit (the standard's own rule), wrong for hooks/test/hooks.test.mjs,
// which runs on every commit that touches hooks/. That full run was verified
// by hand: `node scripts/check-refusal-proofs.mjs` reported all eight
// fixtured checks as `refuses` and exited 0.

test("classifyFixtureResult: the three-state contract itself", () => {
  assert.equal(
    classifyFixtureResult(true),
    "refuses",
    "a fixture the check blocked",
  );
  assert.equal(
    classifyFixtureResult(false),
    "does-not-refuse",
    "a fixture the check passed anyway — decorative, a finding",
  );
  assert.equal(
    classifyFixtureResult(null),
    "no-fixture",
    "the fixture could not be run at all — unverified, never a pass",
  );
});

test("regression guard: .lintstagedrc.json's cspell invocation uses a flag cspell actually recognises", () => {
  // The exact bug fix 9a's own audit found while writing this contract:
  // cspell's CLI is commander-based, and an unrecognised flag
  // (`--no-must-find-file`, missing the plural) prints "unknown option" and
  // still exits 0 — the check never scans anything and reads as a pass. This
  // is the third failure shape cross-gate-rules.md names by name ("the tool
  // silently examines nothing and reports success"), found in this
  // repository's own lint-staged config, not merely a hypothetical.
  //
  // Both keys are checked, not just Markdown (fix 15) — gate-2-commit.md
  // requires spelling on "the file's own vocabulary", with no file-type
  // restriction, and a checker that only ever read Markdown would answer
  // "is spelling enforced?" with a confident yes while never opening a
  // .ts/.mjs file.
  const config = JSON.parse(
    readFileSync(join(ROOT, ".lintstagedrc.json"), "utf8"),
  );
  for (const key of [
    "*.{md,mdx}",
    "*.{js,mjs,cjs,ts,tsx,json,jsonc,yml,yaml}",
  ]) {
    const spellCmd = config[key].find((c) => c.includes("cspell"));
    assert.ok(spellCmd, `${key} has no cspell invocation`);
    assert.match(spellCmd, /--no-must-find-files\b/);
    assert.doesNotMatch(
      spellCmd,
      /--no-must-find-file\b/,
      "the singular form is not a real cspell flag and is silently ignored, not enforced",
    );
  }
});

test("cspell actually reads code files, not only Markdown — a misspelling in a .mjs comment and in a user-facing string are both flagged", () => {
  // Fix 15. Runs the exact cspell invocation .lintstagedrc.json's code-glob
  // key now uses, against a scratch file, to prove the check reads .mjs
  // content rather than only ever being wired to Markdown. This is the
  // functional counterpart to the config-shape regression guard above. The
  // repository's own cspell binary is invoked directly, cwd set to the
  // fixture's own directory (a relative file argument, exactly what
  // lint-staged passes) — the same cross-platform `run()` the hooks
  // themselves use to reach a `.cmd` shim on Windows (hooks/lib/run.mjs).
  const dir = scratchRepo();
  writeFileSync(
    join(dir, "fixture.mjs"),
    "// a deliberatemisspelling in a comment\n" +
      'export const message = "a nother deliberatemisspelling in a user-facing string";\n',
  );
  const config = JSON.parse(
    readFileSync(join(ROOT, ".lintstagedrc.json"), "utf8"),
  );
  const spellCmd = config["*.{js,mjs,cjs,ts,tsx,json,jsonc,yml,yaml}"].find(
    (c) => c.includes("cspell"),
  );
  const [, ...cspellArgs] = spellCmd.split(" "); // drop the leading "cspell"
  const r = run(
    join(ROOT, "node_modules", ".bin", "cspell"),
    [...cspellArgs, "fixture.mjs"],
    { cwd: dir, env: CLEAN_ENV },
  );
  assert.notEqual(
    r.status,
    0,
    "a misspelling in a code file's comment and string must be refused, not silently passed",
  );
  assert.match((r.stdout || "") + (r.stderr || ""), /deliberatemisspelling/);
  rmSync(dir, { recursive: true, force: true });
});

// --- scripts/lib.mjs:classifyTestCoverageOutcome — fix 11. gate-5-push.md:
// "A broken coverage command blocks the push without claiming a shortfall."
// The combined `c8 --check-coverage ... node --test ...` command exits
// non-zero for three different reasons; these are real captured output
// shapes from each (node --test's own TAP/spec summary line, c8's own
// threshold message, and a command that never got that far), not
// hypothetical fixtures.

test("classifyTestCoverageOutcome: a failing unit test is named as a test failure, not folded into coverage", () => {
  const output =
    "✖ a failing test (1.2ms)\nℹ tests 1\nℹ suites 0\nℹ pass 0\nℹ fail 1\n" +
    "ℹ cancelled 0\nℹ skipped 0\nℹ todo 0\n" +
    "----------|---------|----------|---------|---------|-------------------\n" +
    "All files |       0 |        0 |       0 |       0 |                   \n";
  const outcome = classifyTestCoverageOutcome(output);
  assert.equal(outcome.kind, "test-failure");
  assert.match(outcome.detail, /1 unit test\(s\) failed/);
});

test("classifyTestCoverageOutcome: a genuine coverage shortfall is named as coverage, with the actual percentages", () => {
  const output =
    "✔ a passing test (0.6ms)\nℹ tests 1\nℹ suites 0\nℹ pass 1\nℹ fail 0\n" +
    "ℹ cancelled 0\nℹ skipped 0\nℹ todo 0\n" +
    "ERROR: Coverage for lines (67.33%) does not meet global threshold (99.9%)\n";
  const outcome = classifyTestCoverageOutcome(output);
  assert.equal(outcome.kind, "coverage-shortfall");
  assert.match(outcome.detail, /67\.33%.*99\.9%/s);
});

test("classifyTestCoverageOutcome: a command that never ran (neither summary present) is its own outcome, not a guessed shortfall", () => {
  // The real shape of `c8 ... node --test nonexistent.mjs`: neither node:test's
  // summary nor c8's threshold message ever prints, because node --test itself
  // errored out before producing either.
  const output =
    "Could not find 'hooks/test/nonexistent.mjs'\n" +
    "----------|---------|----------|---------|---------|-------------------\n" +
    "All files |       0 |        0 |       0 |       0 |                   \n";
  const outcome = classifyTestCoverageOutcome(output);
  assert.equal(outcome.kind, "broken-command");
  assert.doesNotMatch(
    outcome.detail,
    /shortfall|below the .* floor|%/,
    "must not claim a coverage shortfall when the command never ran to completion",
  );
});

// extractCoverageAndTestSummary — fix brief 8, item 1: "coverage legible
// without a download" needs the test counts and the coverage percentage on
// the run's own page whether the run passed or failed, so
// scripts/gate-6-pull-request.mjs reads them from the same command output
// classifyTestCoverageOutcome above already parses, rather than a second,
// divergent source.

test("extractCoverageAndTestSummary reads the test counts and lines-coverage percentage from a passing run's real output shape", () => {
  const output =
    "✔ a passing test (0.6ms)\nℹ tests 132\nℹ suites 0\nℹ pass 132\nℹ fail 0\n" +
    "ℹ cancelled 0\nℹ skipped 0\nℹ todo 0\n" +
    "----------|---------|----------|---------|---------|-------------------\n" +
    "All files |   80.44 |    73.54 |   85.81 |   80.44 |                   \n";
  const summary = extractCoverageAndTestSummary(output);
  assert.deepEqual(summary, {
    tests: 132,
    pass: 132,
    fail: 0,
    linesCoveragePercent: 80.44,
  });
});

test("extractCoverageAndTestSummary reads the same figures on a failing run — coverage legible without a download applies there too", () => {
  const output =
    "✖ a failing test (1.2ms)\nℹ tests 132\nℹ suites 0\nℹ pass 131\nℹ fail 1\n" +
    "ℹ cancelled 0\nℹ skipped 0\nℹ todo 0\n" +
    "----------|---------|----------|---------|---------|-------------------\n" +
    "All files |   79.84 |    73.54 |   85.81 |   79.84 |                   \n";
  const summary = extractCoverageAndTestSummary(output);
  assert.deepEqual(summary, {
    tests: 132,
    pass: 131,
    fail: 1,
    linesCoveragePercent: 79.84,
  });
});

test("extractCoverageAndTestSummary returns null figures, never a false zero, when the command never reached either reporter", () => {
  const output = "Could not find 'hooks/test/nonexistent.mjs'\n";
  const summary = extractCoverageAndTestSummary(output);
  assert.deepEqual(summary, {
    tests: null,
    pass: null,
    fail: null,
    linesCoveragePercent: null,
  });
});

// classifyDiffCoverOutcome — gate 6 check 8, "changed-line coverage" (fix
// 42; gate-6-pull-request.md "coverage and untrusted runs": the overall
// floor and the changed-line floor are two different numbers, computed two
// different ways, and both must be wired as blocking). Same disambiguation
// problem as classifyTestCoverageOutcome above, on diff-cover's own output
// instead of c8's: a genuine shortfall against `--fail-under` and a command
// that did not run to completion (report missing, tool crashed) both exit
// non-zero, and only the output text tells them apart.

test("classifyDiffCoverOutcome: a genuine changed-line shortfall is named as shortfall, with the actual percentages", () => {
  const output =
    "-------------\nDiff Coverage\n-------------\n" +
    "scripts/gate-6-pull-request.mjs (16.1%): Missing lines 75-83\n" +
    "-------------\nTotal:   40 lines\nMissing: 8 lines\nCoverage: 80%\n-------------\n\n" +
    "Failure: Coverage (80%) is below the threshold (95%)\n";
  const outcome = classifyDiffCoverOutcome(output);
  assert.equal(outcome.kind, "shortfall");
  assert.match(outcome.detail, /80%.*95%/s);
});

test("classifyDiffCoverOutcome: a command that never produced a coverage line is its own outcome, not a guessed shortfall", () => {
  const output = "Error: no such file 'coverage/cobertura-coverage.xml'\n";
  const outcome = classifyDiffCoverOutcome(output);
  assert.equal(outcome.kind, "broken-command");
  assert.doesNotMatch(
    outcome.detail,
    /shortfall|below the .* threshold|%/,
    "must not claim a changed-line shortfall when the command never ran to completion",
  );
});

// diffCoverTotalLines — fix 51. Audit 13: a test suite that crashed before
// executing anything left a Cobertura report with zero instrumented
// statements; diff-cover found no changed line to check against it and
// printed `Total: 0 lines` / `Coverage: 100%`, exiting 0. Nothing escaped
// that particular run (the unit-test failure blocked separately), but the
// same shape passes silently on a suite that exits 0 having exercised
// nothing — the exit-0 class the changed-line coverage check exists to
// close, reproduced inside the check itself.

test("diffCoverTotalLines: the audit's own zero-statement report is read as zero, not ignored", () => {
  const output = "Total:   0 lines\nMissing: 0 lines\nCoverage: 100%\n";
  assert.equal(diffCoverTotalLines(output), 0);
});

test("diffCoverTotalLines: a genuine report with measured lines is read as its real total", () => {
  const output =
    "-------------\nDiff Coverage\n-------------\n" +
    "scripts/gate-6-pull-request.mjs (16.1%): Missing lines 75-83\n" +
    "-------------\nTotal:   40 lines\nMissing: 8 lines\nCoverage: 80%\n-------------\n";
  assert.equal(diffCoverTotalLines(output), 40);
});

test("diffCoverTotalLines: output with no Total: line at all (the command never got that far) is null, distinct from a genuine zero", () => {
  assert.equal(
    diffCoverTotalLines(
      "Error: no such file 'coverage/cobertura-coverage.xml'\n",
    ),
    null,
  );
});

// --- scripts/check-osv-scanner.mjs — fix 9b. osv-scanner is external,
// PATH-resolved and never bundled (ADR-0002), exactly like semgrep and
// lizard.
//
// Fix 31 — this used to call checkOsvScanner() with no injected collaborator
// and rely on osv-scanner genuinely being absent from the host running the
// test. Audit 9 traced a bootstrapped repo's CI failure (`1 unit test(s)
// failed` in CI, green locally) to exactly that coupling:
// .github/workflows/pull-request.yml installs osv-scanner (`go install
// .../osv-scanner@latest`) before running this suite, so the tool this test
// required to be absent was already on PATH by the time it ran — the
// workflow installed the precondition its own test depended on not holding.
// The sibling checkBranchProtection tests inject `have`/`run` for exactly
// this reason (check-branch-protection.mjs); checkOsvScanner now takes the
// same injectable shape, and this asserts the skip path through an injected
// absence — deterministic regardless of what happens to be on the PATH of
// whatever host or CI runner executes it.
test("osv-scanner check is a visible skip, naming the tool, when it is not on PATH", () => {
  const { findings, skips } = checkOsvScanner({ have: () => false });
  assert.deepEqual(
    findings,
    [],
    "an unavailable tool must never read as a passing scan",
  );
  assert.equal(skips.length, 1);
  assert.match(skips[0], /osv-scanner/);
  assert.match(skips[0], /not on PATH/);
});

// --- lib.mjs:classifyOsvScannerOutcome / extractOsvJsonFindings /
// extractOsvSarifFindings — fix 44. Audit 12, on a live CI run: gate 6 failed
// "cross-stack dependency scan (osv-scanner)" with the tool's own startup
// banner ("Scanning dir .\nScanning ... at commit d43f2a3\nScanned
// .../package-lock.json file and found 476 packages") as the problem text —
// no vulnerability id anywhere in it — while the standalone osv-scanner check
// on the same commit passed with zero findings. check-osv-scanner.mjs and
// gate-6-pull-request.mjs both used to treat any non-zero exit as a finding
// and dump raw stdout+stderr; this proves the refusal-proof rule
// (cross-gate-rules.md: "a refusal names the specific thing being refused; a
// refusal whose problem text contains no identifier is itself a finding")
// both directions: a real advisory names a finding, a scanner failure names
// an unavailable result instead.
test("extractOsvJsonFindings: a real advisory in osv-scanner's own --format json shape is named", () => {
  const stdout = JSON.stringify({
    results: [
      {
        source: { path: "package-lock.json", type: "lockfile" },
        packages: [
          {
            package: { name: "left-pad", version: "1.0.0", ecosystem: "npm" },
            vulnerabilities: [{ id: "GHSA-aaaa-bbbb-cccc" }],
          },
        ],
      },
    ],
  });
  assert.deepEqual(extractOsvJsonFindings(stdout), ["GHSA-aaaa-bbbb-cccc"]);
});

test("extractOsvJsonFindings: osv-scanner's own startup banner — the audit-12 problem text — names no vulnerability", () => {
  const banner =
    "Scanning dir .\n" +
    "Scanning ... at commit d43f2a3\n" +
    "Scanned .../package-lock.json file and found 476 packages\n";
  assert.deepEqual(extractOsvJsonFindings(banner), []);
});

test("extractOsvSarifFindings: a real advisory in the SARIF gate 6 uploads is named by its ruleId", () => {
  const tmp = mkdtempSync(join(tmpdir(), "osv-sarif-"));
  const sarif = join(tmp, "osv-results.sarif");
  writeFileSync(
    sarif,
    JSON.stringify({
      runs: [{ results: [{ ruleId: "GHSA-aaaa-bbbb-cccc" }] }],
    }),
  );
  try {
    assert.deepEqual(extractOsvSarifFindings(sarif), ["GHSA-aaaa-bbbb-cccc"]);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("extractOsvSarifFindings: a SARIF file with no results — every finding suppressed, or none found — names nothing", () => {
  const tmp = mkdtempSync(join(tmpdir(), "osv-sarif-"));
  const sarif = join(tmp, "osv-results.sarif");
  writeFileSync(sarif, JSON.stringify({ runs: [{ results: [] }] }));
  try {
    assert.deepEqual(extractOsvSarifFindings(sarif), []);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("extractOsvSarifFindings: an unreadable file names nothing rather than throwing", () => {
  assert.deepEqual(
    extractOsvSarifFindings(join(tmpdir(), "does-not-exist.sarif")),
    [],
  );
});

test("classifyOsvScannerOutcome: exit 0 is clean, whatever findings were somehow extracted", () => {
  const outcome = classifyOsvScannerOutcome(0, ["GHSA-aaaa-bbbb-cccc"]);
  assert.equal(outcome.kind, "clean");
});

test("classifyOsvScannerOutcome: a non-zero exit with a named vulnerability is the finding, by id", () => {
  const outcome = classifyOsvScannerOutcome(1, ["GHSA-aaaa-bbbb-cccc"]);
  assert.equal(outcome.kind, "vulnerabilities");
  assert.deepEqual(outcome.findings, ["GHSA-aaaa-bbbb-cccc"]);
});

test("classifyOsvScannerOutcome: a non-zero exit with no named vulnerability is unavailable, not a finding — the audit-12 case", () => {
  const outcome = classifyOsvScannerOutcome(127, []);
  assert.equal(outcome.kind, "unavailable");
  assert.ok(outcome.detail, "an unavailable outcome carries its own detail");
  assert.doesNotMatch(
    outcome.detail,
    /GHSA|CVE|OSV-/,
    "must not assert a vulnerability the evidence does not name",
  );
  assert.match(outcome.detail, /127/, "names the exit status it saw");
});

// checkOsvScanner end to end, through its injected run() — proves the fix
// where it actually ships (gate 5's local check), not only in the pure
// classifier: the audit-12 banner must be a skip, and a real advisory must
// still be a finding.
test("checkOsvScanner: a scanner failure with no parseable finding (the audit-12 banner) is an unavailable skip, never a finding", () => {
  const banner =
    "Scanning dir .\n" +
    "Scanning ... at commit d43f2a3\n" +
    "Scanned .../package-lock.json file and found 476 packages\n";
  const { findings, skips } = checkOsvScanner({
    have: () => true,
    run: () => ({ status: 127, stdout: "", stderr: banner }),
  });
  assert.deepEqual(
    findings,
    [],
    "a refusal with no named vulnerability must never block as a finding",
  );
  assert.equal(skips.length, 1);
  assert.match(skips[0], /osv-scanner/);
  assert.doesNotMatch(skips[0], /GHSA|CVE|OSV-/);
});

test("checkOsvScanner: a real advisory in osv-scanner's JSON output is a finding, named by id", () => {
  const stdout = JSON.stringify({
    results: [
      {
        source: { path: "package-lock.json", type: "lockfile" },
        packages: [
          {
            package: { name: "left-pad", version: "1.0.0", ecosystem: "npm" },
            vulnerabilities: [{ id: "GHSA-aaaa-bbbb-cccc" }],
          },
        ],
      },
    ],
  });
  const { findings, skips } = checkOsvScanner({
    have: () => true,
    run: () => ({ status: 1, stdout, stderr: "" }),
  });
  assert.equal(skips.length, 0);
  assert.equal(findings.length, 1);
  assert.match(findings[0].problem, /GHSA-aaaa-bbbb-cccc/);
});
