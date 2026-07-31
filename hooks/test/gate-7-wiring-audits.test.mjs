// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis Uncited uncited
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
