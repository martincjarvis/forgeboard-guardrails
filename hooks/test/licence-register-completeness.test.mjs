// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis Uncited uncited
// Split from gate-6-dependency-advisories-and-licence-policy.test.mjs — subject group: licence-register-completeness.
// Loaded by hooks/test/hooks.test.mjs; not invoked directly by the test runner.
import { test } from "node:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { checkLicencePolicy } from "../../scripts/check-licence-policy.mjs";
import { missingLicenceTableEntries } from "../../scripts/check-licence.mjs";
import assert from "node:assert/strict";
import { git, scratchRepo, runScript } from "./support.mjs";

// --- scripts/check-licence.mjs — gate 2 check 16 (completeness), extended
// by fix brief 6 to also flag a licence with no scripts/licence-table.mjs
// entry: "a licence in the resolved set with no table entry is a finding at
// gates 2 and 6" (gate-6-pull-request.md), so a coverage gap is caught the
// moment the dependency arrives, not only when gate 6 later judges it.

test("missingLicenceTableEntries: a row citing a tabled licence raises nothing; one citing a licence with no table entry names it once, even if several rows share it", () => {
  const rows = [
    { dep: "a", version: "1.0.0", licence: "MIT" },
    { dep: "b", version: "1.0.0", licence: "GPL-3.0-only" },
    { dep: "c", version: "2.0.0", licence: "GPL-3.0-only" },
  ];
  const findings = missingLicenceTableEntries(rows);
  assert.equal(
    findings.length,
    1,
    "the same untabled licence is named once, not once per row",
  );
  const finding = findings[0];
  assert.ok(finding, "expected one finding");
  assert.match(finding.problem, /'GPL-3\.0-only'/);
});

test("missingLicenceTableEntries: a compound expression's leaf with no table entry is named; the tabled leaf is not", () => {
  const findings = missingLicenceTableEntries([
    { dep: "a", version: "1.0.0", licence: "MIT OR GPL-3.0-only" },
  ]);
  assert.equal(findings.length, 1);
  const finding = findings[0];
  assert.ok(finding, "expected one finding");
  assert.match(finding.problem, /GPL-3\.0-only/);
  assert.doesNotMatch(finding.problem, /'MIT'/);
});

test("missingLicenceTableEntries: a blank or unknown licence is left to the policy check's own finding, not duplicated here", () => {
  assert.deepEqual(
    missingLicenceTableEntries([
      { dep: "a", version: "1.0.0", licence: "" },
      { dep: "b", version: "1.0.0", licence: "unknown" },
    ]),
    [],
  );
});

test("checkLicenceCompleteness (end to end): a resolved dependency with no register row AND a register row whose licence has no table entry are both reported when the lock file is in scope", () => {
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "scratch", private: true, type: "module" }) + "\n",
  );
  writeFileSync(
    join(dir, "package-lock.json"),
    JSON.stringify({ name: "scratch", lockfileVersion: 3 }) + "\n",
  );
  mkdirSync(join(dir, "docs", "registers"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "registers", "dependency-licence-register.md"),
    "| Dependency | Version | Licence | Direct or transitive | Scope | Used by | Why | Decision record | Obligations | Expires | Approver |\n" +
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n" +
      "| copyleft-thing | 1.0.0 | GPL-3.0-only | Direct | Development | tooling | example | | | | |\n",
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-licence.mjs", dir, ["package-lock.json"]);
  assert.equal(r.status, 2);
  assert.match(
    r.stderr,
    /'GPL-3\.0-only'.*has no entry in scripts\/licence-table\.mjs/,
    "the table-entry gap is caught at gate 2, not only when gate 6 later judges the same row",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("licence policy is a visible skip, naming the reason, when not triggered", () => {
  const { findings, skips } = checkLicencePolicy(false);
  assert.deepEqual(findings, []);
  assert.equal(skips.length, 1);
  const skip = skips[0];
  assert.ok(skip, "expected a skip");
  assert.match(skip, /dependency licence policy/);
});

test("licence policy refuses a missing register, and refuses a resolved dependency whose licence has no table entry", () => {
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);

  // No register at all yet: refused, naming that it is missing — never
  // passed silently for lack of anything to compare against
  // (gate-6-pull-request.md: "no licence file at all is refused").
  const missing = runScript("scripts/check-licence-policy.mjs", dir);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /does not exist/);

  // A register row naming a licence with no table entry (strong copyleft,
  // never added to scripts/licence-table.mjs) is refused even though the
  // row itself is complete.
  mkdirSync(join(dir, "docs", "registers"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "registers", "dependency-licence-register.md"),
    "| Dependency | Version | Licence | Direct or transitive | Scope | Used by | Why | Decision record | Obligations | Expires | Approver |\n" +
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n" +
      "| copyleft-thing | 1.0.0 | GPL-3.0-only | Direct | Development | tooling | example | | | | |\n",
  );
  git(dir, ["add", "-A"]);
  const refused = runScript("scripts/check-licence-policy.mjs", dir);
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /copyleft-thing@1\.0\.0/);
  assert.match(refused.stderr, /GPL-3\.0-only/);
  assert.match(refused.stderr, /has no entry in scripts\/licence-table\.mjs/);

  rmSync(dir, { recursive: true, force: true });
});

test("licence policy: an unresolved version is its own finding, and the literal 'undefined' never reaches a diagnostic", () => {
  // From a real CI run: `monocart-coverage-reports@undefined carries
  // licence 'unknown'` — a failed metadata read (the version) rendered as
  // data and folded into the same sentence as a second, distinct failure
  // (the licence).
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  mkdirSync(join(dir, "docs", "registers"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "registers", "dependency-licence-register.md"),
    "| Dependency | Version | Licence | Direct or transitive | Scope | Used by | Why | Decision record | Obligations | Expires | Approver |\n" +
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n" +
      "| monocart-coverage-reports | undefined | unknown | Direct | Development | tooling | example | | | | |\n",
  );
  git(dir, ["add", "-A"]);
  const result = runScript("scripts/check-licence-policy.mjs", dir);
  assert.equal(result.status, 2);
  // The version failure is reported as its own finding, naming the field.
  assert.match(
    result.stderr,
    /monocart-coverage-reports's version could not be resolved/,
  );
  // The literal 'undefined' from the failed read never reaches another
  // diagnostic — no finding calls the dependency "...@undefined".
  assert.doesNotMatch(result.stderr, /@undefined/);
  rmSync(dir, { recursive: true, force: true });
});

test("licence policy (full pipeline): a compound SPDX expression passes when at least one disjunct is OSI-approved and compatible — the JSONStream / type-fest regression", () => {
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  mkdirSync(join(dir, "docs", "registers"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "registers", "dependency-licence-register.md"),
    "| Dependency | Version | Licence | Direct or transitive | Scope | Used by | Why | Decision record | Obligations | Expires | Approver |\n" +
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n" +
      "| JSONStream | 1.3.5 | MIT OR Apache-2.0 | Transitive | Runtime | tooling | example | | | | |\n" +
      "| type-fest | 4.41.0 | (MIT OR CC0-1.0) | Transitive | Runtime | tooling | example | | | | |\n",
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/check-licence-policy.mjs", dir);
  assert.equal(
    r.status,
    0,
    "MIT passes on its own; CC0-1.0 does not need to (it is not OSI-approved), because the OR only needs one",
  );
  rmSync(dir, { recursive: true, force: true });
});
