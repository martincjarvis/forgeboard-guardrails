// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis Uncited uncited
// Split from hooks.test.mjs (fix 79) — subject group: gate-6-licence-register-row-decisions.
// Loaded by hooks/test/hooks.test.mjs; not invoked directly by the test runner.
import { test } from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acceptedAdvisoryIds } from "../../scripts/check-dependency-advisories.mjs";
import { evaluateRegisterRow } from "../../scripts/check-licence-policy.mjs";
import assert from "node:assert/strict";

// --- fix brief 6 — a register row whose licence does not pass the decision
// rule on its own is not blocked forever: a human can accept THIS
// dependency specifically, recorded on THIS row's own Decision record and
// Approver columns (registers.md's existing columns; there is no separate
// code-level allow list left to extend — see check-licence-policy.mjs's own
// header comment for why fix 26's RUNTIME_ALLOW_EXTENSIONS mechanism this
// replaces no longer applies once "permissive" is derived data instead of a
// list membership).

test("evaluateRegisterRow: a licence that fails the decision rule blocks when the row's Decision record and Approver are blank", () => {
  const findings = evaluateRegisterRow(
    {
      dep: "gnarly-thing",
      version: "1.0.0",
      licence: "WTFPL", // has a table entry, but is not OSI-approved
      scope: "Development",
      decisionRecord: "",
      approver: "",
    },
    null,
  );
  assert.equal(findings.length, 1);
  assert.match(findings[0].problem, /gnarly-thing@1\.0\.0/);
  assert.match(findings[0].problem, /WTFPL/);
  assert.match(
    findings[0].remedy,
    /Decision record column and the person in Approver/,
  );
});

test("evaluateRegisterRow: the same row passes once a human has recorded a Decision record and named an Approver", () => {
  const findings = evaluateRegisterRow(
    {
      dep: "gnarly-thing",
      version: "1.0.0",
      licence: "WTFPL",
      scope: "Development",
      decisionRecord: "docs/ADR/0099-test-fixture.md",
      approver: "Pat",
    },
    null,
  );
  assert.deepEqual(
    findings,
    [],
    "a human accepted this specific dependency — recorded on the row, not a code-level allow-list edit",
  );
});

test("evaluateRegisterRow: a licence that passes the decision rule on its own needs neither column filled in", () => {
  const findings = evaluateRegisterRow(
    {
      dep: "ordinary-thing",
      version: "1.0.0",
      licence: "MIT",
      scope: "Runtime",
      decisionRecord: "",
      approver: "",
    },
    null,
  );
  assert.deepEqual(
    findings,
    [],
    "MIT passes the decision rule outright — no human decision to cite",
  );
});

test("evaluateRegisterRow: a licence absent from the table blocks and asks for an entry, and is not answerable by a Decision record alone", () => {
  // Distinct from the "fails the decision rule" case above: nobody can
  // accept a licence the table has never classified, because there is
  // nothing recorded to accept yet.
  const findings = evaluateRegisterRow(
    {
      dep: "mystery-thing",
      version: "1.0.0",
      licence: "Zlib",
      scope: "Development",
      decisionRecord: "docs/ADR/0099-test-fixture.md",
      approver: "Pat",
    },
    null,
  );
  assert.equal(findings.length, 1);
  assert.match(
    findings[0].problem,
    /has no entry in scripts\/licence-table\.mjs/,
  );
});

test("acceptedAdvisoryIds reads GHSA ids only from Accepted ADRs, not Proposed ones", () => {
  const dir = mkdtempSync(join(tmpdir(), "adr-"));
  writeFileSync(
    join(dir, "0001-accepted.md"),
    "---\nstatus: Accepted\n---\n\nAccepts GHSA-aaaa-bbbb-cccc.\n",
  );
  writeFileSync(
    join(dir, "0002-proposed.md"),
    "---\nstatus: Proposed\n---\n\nWould accept GHSA-dddd-eeee-ffff.\n",
  );
  const ids = acceptedAdvisoryIds(dir);
  assert.ok(
    ids.has("ghsa-aaaa-bbbb-cccc"),
    "an Accepted ADR's advisory id is read",
  );
  assert.ok(
    !ids.has("ghsa-dddd-eeee-ffff"),
    "a Proposed ADR does not yet accept anything",
  );
  rmSync(dir, { recursive: true, force: true });
});
