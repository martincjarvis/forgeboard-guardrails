// cspell:ignore packument
// Subject group: gate-6-minimum-release-age. Loaded by hooks/test/hooks.test.mjs;
// not invoked directly by the test runner.
//
// `npm view <name> time` is network-bound and its result is not repeatable, so
// the policy check's pure classifier is tested against fixed fixtures — the
// same reason check-dependency-advisories.mjs splits classifyAdvisories out
// from the impure orchestration around it. The staleness check reads only a
// register file, so it is exercised end to end against a scratch register.
import { test } from "node:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import {
  classifyReleaseAge,
  classifyStaleRows,
  parseRegisterRows,
  admittedKeys,
  minReleaseAgeDays,
  checkMinimumReleaseAge,
} from "../../scripts/check-minimum-release-age.mjs";
import { git, scratchRepo, runScript } from "./support.mjs";

const DAY = 86_400_000;
const now = new Date("2026-08-01T12:00:00Z");
const iso = (daysAgo) => new Date(now.getTime() - daysAgo * DAY).toISOString();

// --- classifyReleaseAge — the policy check's pure classifier (gate 6 check 11).

test("minimum release age: a dependency inside the window is refused", () => {
  // Two days old against a 7-day window, with no exception row — the exact
  // case the policy exists to block.
  const resolved = new Map([["brand-new-pkg", "1.0.0"]]);
  const publishDates = new Map([["brand-new-pkg@1.0.0", iso(2)]]);
  const { findings, undetermined } = classifyReleaseAge(
    resolved,
    publishDates,
    { windowDays: 7, today: now },
  );
  assert.equal(undetermined.length, 0);
  assert.equal(findings.length, 1);
  assert.match(findings[0].problem, /brand-new-pkg@1\.0\.0/);
  assert.match(findings[0].problem, /inside the 7-day/);
  assert.match(findings[0].remedy, /exception row/);
});

test("minimum release age: a dependency past the window is not refused", () => {
  const resolved = new Map([["old-pkg", "1.0.0"]]);
  const publishDates = new Map([["old-pkg@1.0.0", iso(30)]]);
  const { findings } = classifyReleaseAge(resolved, publishDates, {
    windowDays: 7,
    today: now,
  });
  assert.equal(findings.length, 0);
});

test("minimum release age: an approved register row admits a dependency inside the window", () => {
  // The same young dependency as the refusal case, but a human-approved row
  // names it — the exception route the gate admits.
  const resolved = new Map([["brand-new-pkg", "1.0.0"]]);
  const publishDates = new Map([["brand-new-pkg@1.0.0", iso(2)]]);
  const { findings } = classifyReleaseAge(resolved, publishDates, {
    windowDays: 7,
    today: now,
    admitted: new Set(["brand-new-pkg@1.0.0"]),
  });
  assert.equal(findings.length, 0, "an approved row admits the young version");
});

test("minimum release age: a dependency whose publish date is unknown is returned undetermined, never silently passed", () => {
  // cross-gate-rules.md, "never claim more than was checked": a registry lookup
  // that returned no date has not checked the age. The classifier surfaces it
  // as undetermined rather than passing it.
  const resolved = new Map([["mystery-pkg", "1.0.0"]]);
  const { findings, undetermined } = classifyReleaseAge(resolved, new Map(), {
    windowDays: 7,
    today: now,
  });
  assert.equal(findings.length, 0);
  assert.deepEqual(undetermined, ["mystery-pkg@1.0.0"]);
});

// --- parseRegisterRows / admittedKeys — the approver-required admission.

test("admittedKeys: only a row whose Approver a human filled admits its dependency", () => {
  const rows = parseRegisterRows(
    "| Dependency | Version | Published | Justification | Removable when | Approved by |\n" +
      "| --- | --- | --- | --- | --- | --- |\n" +
      "| approved-pkg | 1.0.0 | 2026-07-31 | urgent security patch | ages past the window | Dana User |\n" +
      "| pending-pkg | 2.0.0 | 2026-07-31 | urgent security patch | ages past the window | |\n",
  );
  assert.deepEqual(
    [...admittedKeys(rows)],
    ["approved-pkg@1.0.0"],
    "a row missing only its approver does not admit at gate 6",
  );
});

test("parseRegisterRows: the placeholder '_none yet_' row is not parsed as an exception", () => {
  const rows = parseRegisterRows(
    "| Dependency | Version | Published | Justification | Removable when | Approved by |\n" +
      "| --- | --- | --- | --- | --- | --- |\n" +
      "| _none yet_ | | | | | |\n",
  );
  assert.equal(rows.length, 0);
});

// --- classifyStaleRows — the staleness check's pure classifier. The negative
// fixture (a row aged past the window) is what proves the staleness check can
// fail rather than only report green on a clean register.

test("minimum release age staleness: a row whose version has aged past the window is reported stale", () => {
  // The version was excepted 30 days ago against a 7-day window — it now passes
  // on its own, so the row is stale and must be removed.
  const findings = classifyStaleRows(
    [
      {
        dep: "was-young-pkg",
        version: "1.0.0",
        published: iso(30),
      },
    ],
    { windowDays: 7, today: now },
  );
  assert.equal(findings.length, 1);
  assert.match(findings[0].problem, /was-young-pkg@1\.0\.0/);
  assert.match(findings[0].problem, /stale and must be removed/);
  assert.match(findings[0].remedy, /delete the stale row/);
});

test("minimum release age staleness: a row still inside the window is not stale", () => {
  const findings = classifyStaleRows(
    [{ dep: "still-young-pkg", version: "1.0.0", published: iso(2) }],
    { windowDays: 7, today: now },
  );
  assert.equal(findings.length, 0);
});

test("minimum release age staleness: a row whose Published date cannot be parsed is a finding, not a silent pass", () => {
  // A row whose staleness cannot be verified reads as permanent, which is the
  // exact accumulation the staleness check exists to prevent.
  const findings = classifyStaleRows(
    [{ dep: "broken-pkg", version: "1.0.0", published: "last tuesday" }],
    { windowDays: 7, today: now },
  );
  assert.equal(findings.length, 1);
  assert.match(findings[0].problem, /not a valid date/);
});

// --- minReleaseAgeDays — the window is derived from npm's own config, not
// typed a second time (ADR-0003).

test("minReleaseAgeDays: derived from npm config, null when absent or unparseable", () => {
  assert.equal(
    minReleaseAgeDays(() => "7\n"),
    7,
  );
  assert.equal(
    minReleaseAgeDays(() => "null\n"),
    null,
  );
  assert.equal(
    minReleaseAgeDays(() => "\n"),
    null,
  );
  assert.equal(
    minReleaseAgeDays(() => "soon\n"),
    null,
  );
});

// --- end-to-end orchestration.

test("minimum release age: not triggered is a visible skip, naming the reason", () => {
  const { findings, skips } = checkMinimumReleaseAge(false);
  assert.deepEqual(findings, []);
  assert.equal(skips.length, 1);
  assert.match(skips[0], /no dependency change and not a scheduled run/);
});

test("minimum release age staleness (end to end): a stale row in the register fails the check", () => {
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  writeFileSync(join(dir, ".npmrc"), "min-release-age=7\n");
  mkdirSync(join(dir, "docs", "registers"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "registers", "minimum-release-age-register.md"),
    "| Dependency | Version | Published | Justification | Removable when | Approved by |\n" +
      "| --- | --- | --- | --- | --- | --- |\n" +
      `| was-young-pkg | 1.0.0 | ${iso(30).slice(0, 10)} | urgent security patch | ages past the window | Dana User |\n`,
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-minimum-release-age.mjs", dir);
  assert.equal(r.status, 2, "a stale row refuses the merge at gate 6");
  assert.match(r.stderr, /was-young-pkg@1\.0\.0/);
  assert.match(r.stderr, /stale and must be removed/);
  rmSync(dir, { recursive: true, force: true });
});

test("minimum release age staleness (end to end): a row still inside the window does not fail", () => {
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  writeFileSync(join(dir, ".npmrc"), "min-release-age=7\n");
  mkdirSync(join(dir, "docs", "registers"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "registers", "minimum-release-age-register.md"),
    "| Dependency | Version | Published | Justification | Removable when | Approved by |\n" +
      "| --- | --- | --- | --- | --- | --- |\n" +
      `| still-young-pkg | 1.0.0 | ${iso(2).slice(0, 10)} | urgent security patch | ages past the window | Dana User |\n`,
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-minimum-release-age.mjs", dir);
  assert.equal(r.status, 0, "an in-window exception row is not stale");
  rmSync(dir, { recursive: true, force: true });
});

test("minimum release age staleness (end to end): with no min-release-age declared the check is a visible skip", () => {
  // A repository that has not opted into the policy via .npmrc does not get a
  // value invented for it — the check skips, naming that the policy is not in
  // force, rather than passing on an assumed window.
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  mkdirSync(join(dir, "docs", "registers"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "registers", "minimum-release-age-register.md"),
    "| Dependency | Version | Published | Justification | Removable when | Approved by |\n" +
      "| --- | --- | --- | --- | --- | --- |\n" +
      `| was-young-pkg | 1.0.0 | ${iso(30).slice(0, 10)} | x | ages past the window | Dana User |\n`,
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-minimum-release-age.mjs", dir);
  assert.equal(r.status, 0);
  assert.match(r.stderr, /no `min-release-age` declared/);
  rmSync(dir, { recursive: true, force: true });
});
