// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis Uncited uncited AKIA NLOC
// Split from hooks.test.mjs (fix 79) — subject group: gate-7-wiring-audits.
// Loaded by hooks/test/hooks.test.mjs; not invoked directly by the test runner.
import { test } from "node:test";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import {
  checkScriptFileWiring,
  checkIndexGateClaims,
} from "../../scripts/check-script-wiring.mjs";
import { checkLicenceTableReferences } from "../../scripts/check-licence-table.mjs";
import { formatFindingBody } from "../../scripts/lib.mjs";
import assert from "node:assert/strict";
import { ROOT, scratchRepo, runScript } from "./support.mjs";

// --- checkScriptFileWiring — fix 40's "close the class, not just the
// instance": a check script sitting in scripts/ that package.json never
// names at all (so checkScriptWiring above never sees it) is the exact
// shape check-standards-instantiation.mjs was found in — ported, unit
// tested, never imported by anything that runs. This is the generic form:
// scan scripts/ itself, not only what the manifest happens to list.

test("checkScriptFileWiring: a check-*.mjs file no other script imports and no declaration covers is unwired, naming it", () => {
  const files = ["check-orphan.mjs", "gate-9-fictional.mjs"];
  const readFile = (f) =>
    ({
      "check-orphan.mjs": "export function checkOrphan() {}\n",
      "gate-9-fictional.mjs": "// nothing imports check-orphan.mjs here\n",
    })[f];
  const { wired, onDemand, unwired } = checkScriptFileWiring(files, readFile);
  assert.deepEqual(wired, []);
  assert.deepEqual(onDemand, []);
  assert.equal(unwired.length, 1);
  assert.match(unwired[0], /check-orphan\.mjs/);
});

test("checkScriptFileWiring: a check-*.mjs file another tracked script imports is wired", () => {
  const files = ["check-orphan.mjs", "gate-9-fictional.mjs"];
  const readFile = (f) =>
    ({
      "check-orphan.mjs": "export function checkOrphan() {}\n",
      "gate-9-fictional.mjs":
        'import { checkOrphan } from "./check-orphan.mjs";\n',
    })[f];
  const { wired, unwired } = checkScriptFileWiring(files, readFile);
  assert.deepEqual(wired, ["check-orphan.mjs"]);
  assert.deepEqual(unwired, []);
});

test("checkScriptFileWiring: this toolkit's own check-standards-instantiation.mjs is declared on-demand, not unwired — the toolkit deliberately does not run it against its own canonical corpus", () => {
  const files = readdirSync(join(ROOT, "scripts")).filter((f) =>
    f.endsWith(".mjs"),
  );
  const readFile = (f) => readFileSync(join(ROOT, "scripts", f), "utf8");
  const { onDemand, unwired } = checkScriptFileWiring(files, readFile);
  assert.deepEqual(unwired, []);
  assert.ok(onDemand.includes("check-standards-instantiation.mjs"));
});

// --- checkIndexGateClaims — fix 43: the same defect class one level up, in
// the prose that describes the wiring rather than the manifest. A tooling
// index naming where a script runs is a checkable claim, not a comment
// nobody re-verifies.

test("checkIndexGateClaims: an index entry naming a gate that does not actually invoke the script is a finding", () => {
  const indexText = "| `check-orphan.mjs` | gate 7 |\n";
  const gateSources = {
    "gate-7-on-demand.mjs": "// does not import check-orphan.mjs\n",
  };
  const findings = checkIndexGateClaims(indexText, gateSources);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /check-orphan\.mjs/);
  assert.match(findings[0], /gate 7/);
});

test("checkIndexGateClaims: an index entry naming a gate that does invoke the script raises nothing", () => {
  const indexText = "| `check-orphan.mjs` | gate 7 |\n";
  const gateSources = {
    "gate-7-on-demand.mjs":
      'import { checkOrphan } from "./check-orphan.mjs";\n',
  };
  assert.deepEqual(checkIndexGateClaims(indexText, gateSources), []);
});

test("regression guard: check-script-wiring.mjs run for real reports package-script, script-file and script-index wiring, and refuses on any unwired one", () => {
  // Exercises the actual isMain block end to end — the CLI reporting the
  // pure functions above are unit tested against, but never spawned as a
  // real process elsewhere. A scratch tree with one of each shape: a
  // package.json script no gate invokes, a scripts/ file wired by import, a
  // scripts/ file wired by nothing, and no scripts/README.md (the skip
  // path fix 43 added).
  const dir = scratchRepo();
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ scripts: { "mystery-task": "echo hi" } }),
  );
  mkdirSync(join(dir, "scripts"));
  writeFileSync(
    join(dir, "scripts", "check-wired.mjs"),
    "export function checkWired() {}\n",
  );
  writeFileSync(
    join(dir, "scripts", "gate-x.mjs"),
    'import { checkWired } from "./check-wired.mjs";\n',
  );
  writeFileSync(
    join(dir, "scripts", "check-orphan.mjs"),
    "export function checkOrphan() {}\n",
  );
  writeFileSync(
    join(dir, "scripts", "check-standards-instantiation.mjs"),
    "export function checkStandardsInstantiation() {}\n",
  );
  const r = runScript("scripts/check-script-wiring.mjs", dir);
  assert.equal(
    r.status,
    2,
    "an unwired package script and an unwired scripts/ file must both refuse",
  );
  assert.match(r.stderr, /script wiring: UNWIRED mystery-task/);
  assert.match(r.stderr, /script-file wiring: WIRED check-wired\.mjs/);
  assert.match(r.stderr, /script-file wiring: UNWIRED check-orphan\.mjs/);
  assert.match(
    r.stderr,
    /script-file wiring: ON-DEMAND check-standards-instantiation\.mjs/,
  );
  assert.match(
    r.stderr,
    /script-index wiring: SKIP — no scripts\/README\.md in this repository/,
  );
  rmSync(dir, { recursive: true, force: true });
});

test("regression guard: check-script-wiring.mjs reports a script-index mismatch when scripts/README.md claims a gate the gate's own source does not invoke it from", () => {
  // Fix 43's own CLI path — a tooling index carried alongside the scripts it
  // describes, checked against the gate files' real imports rather than
  // trusted. The scratch tree's gate-7-on-demand.mjs never imports
  // check-orphan.mjs, so the index's claim is a mismatch.
  const dir = scratchRepo();
  writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: {} }));
  mkdirSync(join(dir, "scripts"));
  writeFileSync(
    join(dir, "scripts", "check-orphan.mjs"),
    "export function checkOrphan() {}\n",
  );
  writeFileSync(
    join(dir, "scripts", "gate-7-on-demand.mjs"),
    "// does not import check-orphan.mjs\n",
  );
  writeFileSync(
    join(dir, "scripts", "README.md"),
    "| Script | Gate |\n| --- | --- |\n| `check-orphan.mjs` | gate 7 |\n",
  );
  const r = runScript("scripts/check-script-wiring.mjs", dir);
  assert.equal(r.status, 2);
  assert.match(
    r.stderr,
    /script-index wiring: MISMATCH check-orphan\.mjs — the index claims it runs at gate 7, but gate-7-on-demand\.mjs does not invoke it/,
  );
  rmSync(dir, { recursive: true, force: true });
});

// --- scripts/check-licence-table.mjs — gate 7's on-demand licence table
// re-validation (fix brief 6: "re-validating the table against OSI is an
// invoked task at gate 7," never a scheduled one). `fetchFn` is injected —
// these tests make no real network call, the same reason
// classifyAdvisories (check-dependency-advisories.mjs) is tested against a
// fixed report rather than a live `npm audit`.

test("checkLicenceTableReferences: every reference resolving raises nothing", async () => {
  const table = { MIT: { reference: "https://opensource.org/license/mit" } };
  const findings = await checkLicenceTableReferences(table, async () => ({
    ok: true,
    status: 200,
  }));
  assert.deepEqual(findings, []);
});

test("checkLicenceTableReferences: a reference answering with a non-2xx status is named, by the licence id and the status", async () => {
  const table = {
    Moved: { reference: "https://example.invalid/moved-license" },
  };
  const findings = await checkLicenceTableReferences(table, async () => ({
    ok: false,
    status: 404,
  }));
  assert.equal(findings.length, 1);
  assert.match(findings[0].problem, /Moved/);
  assert.match(findings[0].problem, /404/);
});

test("checkLicenceTableReferences: a reference the network cannot reach at all is its own finding, distinct from a bad status", async () => {
  const table = {
    Unreachable: { reference: "https://example.invalid/unreachable" },
  };
  const findings = await checkLicenceTableReferences(table, async () => {
    throw new Error("getaddrinfo ENOTFOUND example.invalid");
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0].problem, /Unreachable/);
  assert.match(findings[0].problem, /could not be reached/);
});

// --- Fix 92. gate-7-on-demand.mjs's own print loop used to print only
// `String(f.problem).split("\n")[0].slice(0, 200)` — a tool's first output
// line, on the assumption it summarises the finding. Two real tools that
// tripped it prove otherwise. Both fixtures below are real, unmodified
// `stdout` (secretlint's own absolute path replaced with `<repo>`, and its
// matched credential replaced with a shape that will not itself re-trip
// this repository's own secret scan on commit — the only two edits,
// host-specific/pattern-shaped rather than content), captured by running
// each tool for real against a throwaway fixture in this repository:
//
//   secretlint tmp-fixture-dir/secret-fixture.js   (a fake AWS access key)
//   lizard -C 15 -L 100 -a 7 complex-fixture.mjs   (a 21-CCN function)

const REAL_SECRETLINT_STDOUT =
  "\n<repo>/secret-fixture.js\n" +
  "  1:13  error  [AWSAccessKeyID] found AWS Access Key ID: AKIA-NOT-A-REAL-KEY-SHAPE  @secretlint/secretlint-rule-preset-recommend > @secretlint/secretlint-rule-aws\n" +
  "\n" +
  "✖ 1 problem (1 error, 0 warnings)\n" +
  "\n";

const REAL_LIZARD_STDOUT =
  "================================================\n" +
  "  NLOC    CCN   token  PARAM  length  location  \n" +
  "------------------------------------------------\n" +
  "      23     21    248      1      23 complexFn@1-23@complex-fixture.mjs\n" +
  "1 file analyzed.\n" +
  "==============================================================\n" +
  "NLOC    Avg.NLOC  AvgCCN  Avg.token  function_cnt    file\n" +
  "--------------------------------------------------------------\n" +
  "     23      23.0    21.0      248.0         1     complex-fixture.mjs\n";

test("formatFindingBody: the pre-fix truncation on real secretlint stdout prints nothing — stdout opens with a blank line", () => {
  const oldPrint = REAL_SECRETLINT_STDOUT.split("\n")[0].slice(0, 200);
  assert.equal(
    oldPrint,
    "",
    "reproduces the defect: a finding with no printed body is unactionable",
  );
});

test("formatFindingBody: real secretlint stdout — a leading blank line — still yields the actual finding line", () => {
  const body = formatFindingBody(REAL_SECRETLINT_STDOUT);
  assert.ok(body.length > 0, "must print something for a real finding");
  assert.ok(
    body.some((l) => l.includes("AWSAccessKeyID")),
    "the actual secretlint finding line must be in the printed body",
  );
});

test("formatFindingBody: the pre-fix truncation on real lizard stdout prints only the decorative banner — the per-function row never appears", () => {
  const oldPrint = REAL_LIZARD_STDOUT.split("\n")[0].slice(0, 200);
  assert.equal(
    oldPrint,
    "================================================",
    "reproduces the defect: the printed body is a divider, not a finding",
  );
});

test("formatFindingBody: real lizard stdout — a decorative banner ahead of the real content — still yields the per-function violation row", () => {
  const body = formatFindingBody(REAL_LIZARD_STDOUT);
  assert.ok(
    body.every((l) => !/^[=-]{5,}$/.test(l.trim())),
    "no purely decorative divider line should be printed",
  );
  assert.ok(
    body.some((l) => l.includes("complexFn@1-23@complex-fixture.mjs")),
    "the actual per-function violation row must be in the printed body",
  );
});

test("formatFindingBody: caps both the number of lines and each line's length", () => {
  const problem = Array.from({ length: 10 }, (_, i) =>
    `line ${i}: `.padEnd(250, "x"),
  ).join("\n");
  const body = formatFindingBody(problem, { maxLines: 3, maxLineLength: 20 });
  assert.equal(body.length, 3);
  for (const line of body) assert.ok(line.length <= 20);
});

test("formatFindingBody: an empty or absent problem yields nothing to print, not a crash", () => {
  assert.deepEqual(formatFindingBody(""), []);
  assert.deepEqual(formatFindingBody(undefined), []);
  assert.deepEqual(formatFindingBody(null), []);
});

// Every gate and check script guards its CLI block on isMain. process.argv[1]
// is undefined under `node -e`, and pathToFileURL(undefined) throws — so a
// script whose guard does not test for it cannot be imported at all from such
// a context, which is how a test reaches its pure functions.
test("every script's isMain guard survives process.argv[1] being undefined", () => {
  const roots = ["scripts", "hooks"];
  const unguarded = [];
  for (const root of roots) {
    for (const f of readdirSync(root)) {
      if (!f.endsWith(".mjs")) continue;
      const src = readFileSync(join(root, f), "utf8");
      if (!src.includes("pathToFileURL(process.argv[1])")) continue;
      // The guard must test argv[1] before dereferencing it.
      if (!/Boolean\(process\.argv\[1\]\)|process\.argv\[1\]\s*&&/.test(src)) {
        unguarded.push(`${root}/${f}`);
      }
    }
  }
  assert.deepEqual(
    unguarded,
    [],
    `these dereference process.argv[1] unguarded: ${unguarded.join(", ")}`,
  );
});
