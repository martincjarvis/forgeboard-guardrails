// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis Uncited uncited bypassable
// Split from hooks.test.mjs — subject group: semgrep-sarif-filtering.
// SARIF path normalisation and in-source suppression filtering for semgrep's
// uploaded SARIF, plus the semgrep end-to-end and repository-scope guards.
// Loaded by hooks/test/hooks.test.mjs; not invoked directly by the test runner.
import { test } from "node:test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  normalizeSarifPaths,
  filterSuppressedSarif,
} from "../../scripts/lib.mjs";
import { run, have } from "../lib/run.mjs";
import assert from "node:assert/strict";
import { CLEAN_ENV, NOSEMGREP } from "./support.mjs";

// --- scripts/lib.mjs — normalizeSarifPaths (.github/workflows/pull-
// request.yml's SARIF upload; the Windows matrix leg's semgrep emits
// backslash paths GitHub's ingestion treats as a different file from the
// Linux leg's forward-slash ones).

/** @param {string} uri */
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

// --- scripts/lib.mjs — filterSuppressedSarif. semgrep's SARIF
// includes a finding suppressed in source rather than omitting it, marked
// `suppressions: [{ kind: "inSource" }]`; GitHub's code-scanning check
// treats every result in the uploaded file as a candidate new alert, so an
// already-registered suppression turns the pull request red on the
// platform even though gate 6's own check honours it and exits 0.

/** @param {{ ruleId: string, suppressions?: { kind: string }[] }[]} results */
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

// End-to-end reproduction of the real mechanism: a real semgrep
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
test("a finding suppressed in source is present in raw semgrep SARIF and absent after filtering", () => {
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
  /** @type {{ runs: { results: { suppressions?: { kind: string }[] }[] }[] }} */
  const raw = JSON.parse(readFileSync(sarif, "utf8"));
  const rawRun = raw.runs[0];
  assert.ok(rawRun, "expected a run");
  assert.equal(
    rawRun.results.length,
    2,
    "semgrep's own SARIF must still carry both findings, suppressed and not",
  );
  assert.ok(
    rawRun.results.some((r) =>
      (r.suppressions ?? []).some((s) => s.kind === "inSource"),
    ),
    "the marked line must be present, marked suppressed inSource",
  );
  filterSuppressedSarif(sarif);
  /** @type {{ runs: { results: { suppressions?: { kind: string }[] }[] }[] }} */
  const filtered = JSON.parse(readFileSync(sarif, "utf8"));
  const filteredRun = filtered.runs[0];
  assert.ok(filteredRun, "expected a run");
  assert.equal(
    filteredRun.results.length,
    1,
    "only the unsuppressed finding survives filtering",
  );
  const filteredResult = filteredRun.results[0];
  assert.ok(filteredResult, "expected a result");
  assert.ok(
    !(filteredResult.suppressions ?? []).some((s) => s.kind === "inSource"),
  );
  rmSync(dir, { recursive: true, force: true });
});

// cross-gate-rules.md ("A suppression is verified at repository
// scope, never at the scope of the file just edited") — the exact mechanism
// behind the defect: run.mjs's own suppression was verified with `semgrep --config
// auto --error hooks/lib/run.mjs`, reported "3 findings before, 0 after",
// and was silent about two live, unmarked findings of the same rule already
// sitting in hooks/test/hooks.test.mjs — a repository-scope run
// would have caught them there and then. This reproduces the shape
// generically, independent of what today's tree happens to contain: one
// file carries the pattern with an in-source suppression (what "the file
// just edited" looks like clean), a sibling file carries the same pattern
// with none (what a repository-scope run, and only a repository-scope run,
// still catches).
test("a file-scoped semgrep check reads clean while a sibling file's unsuppressed occurrence of the same rule only surfaces at repository scope", () => {
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
  // suppressed — the same in-source marker the fixture above uses.
  writeFileSync(
    join(dir, "edited.py"),
    `x = eval(user_input)  # ${NOSEMGREP}: no-eval\n`,
  );
  // A sibling nobody re-checked: the same rule, no marker — the exact shape
  // of the two spawn-shell-true sites the file-scoped check never saw.
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
