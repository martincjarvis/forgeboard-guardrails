// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis Uncited uncited
// Split from hooks.test.mjs (fix 79) — subject group: adr-approver-and-citations.
// Loaded by hooks/test/hooks.test.mjs; not invoked directly by the test runner.
import { test } from "node:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkAdrApprover,
  acceptsRiskLicenceSuppressionOrOptOut,
  looksLikeTeamLabel,
  citedAdrNumbers,
  adrNumbersCitedByRegisters,
} from "../../scripts/check-adr-approver.mjs";
import assert from "node:assert/strict";
import { ROOT, scratchRepo, runScript } from "./support.mjs";

// --- scripts/check-adr-approver.mjs — fix 22. Audit 8's exact mechanism:
// an agent accepts a licence outside the allow list through an ADR rather
// than a register row, because the ADR schema (docs/ADR/README.md) has no
// approver column at all — `status: Accepted`, `owner: greet maintainers`
// (a team label, not a person), ten previously-blocking licence findings
// cleared, and no gate in the corpus refused it.

test("checkAdrApprover refuses an Accepted ADR that reads as a licence exception with no approver field", () => {
  const dir = mkdtempSync(join(tmpdir(), "adr-approver-"));
  writeFileSync(
    join(dir, "0007-development-licence-allowances.md"),
    "---\nstatus: Accepted\ndecided: 2026-07-29\nowner: greet maintainers\n---\n\n" +
      "Extends the development licence allow list to accept BSD-4-Clause.\n",
  );
  const findings = checkAdrApprover(dir);
  assert.equal(findings.length, 1);
  const finding = findings[0];
  assert.ok(finding, "expected one finding");
  assert.match(finding.problem, /no approver field/);
  rmSync(dir, { recursive: true, force: true });
});

test("checkAdrApprover refuses an Accepted ADR whose approver is a team label, not a person", () => {
  const dir = mkdtempSync(join(tmpdir(), "adr-approver-"));
  writeFileSync(
    join(dir, "0007-development-licence-allowances.md"),
    "---\nstatus: Accepted\napprover: greet maintainers\n---\n\n" +
      "Extends the runtime licence allow list.\n",
  );
  const findings = checkAdrApprover(dir);
  assert.equal(findings.length, 1);
  const finding = findings[0];
  assert.ok(finding, "expected one finding");
  assert.match(finding.problem, /team label, not a person/);
  rmSync(dir, { recursive: true, force: true });
});

test("checkAdrApprover passes an Accepted licence-exception ADR once a human approver is named", () => {
  const dir = mkdtempSync(join(tmpdir(), "adr-approver-"));
  writeFileSync(
    join(dir, "0007-development-licence-allowances.md"),
    "---\nstatus: Accepted\napprover: Jane Rivera\n---\n\n" +
      "Extends the runtime licence allow list.\n",
  );
  assert.deepEqual(checkAdrApprover(dir), []);
  rmSync(dir, { recursive: true, force: true });
});

test("checkAdrApprover leaves an ordinary design ADR alone — no risk, licence, suppression or opt-out language, no approver required", () => {
  const dir = mkdtempSync(join(tmpdir(), "adr-approver-"));
  writeFileSync(
    join(dir, "0001-design-choice.md"),
    "---\nstatus: Accepted\nowner: Toolkit maintainers\n---\n\n" +
      "Versions are derived per component from Conventional Commits.\n",
  );
  assert.deepEqual(checkAdrApprover(dir), []);
  rmSync(dir, { recursive: true, force: true });
});

test("checkAdrApprover leaves a Proposed ADR alone — status: Proposed is the honest, freely editable route", () => {
  const dir = mkdtempSync(join(tmpdir(), "adr-approver-"));
  writeFileSync(
    join(dir, "0007-development-licence-allowances.md"),
    "---\nstatus: Proposed\n---\n\nWould extend the runtime licence allow list.\n",
  );
  assert.deepEqual(checkAdrApprover(dir), []);
  rmSync(dir, { recursive: true, force: true });
});

test("checkAdrApprover: an advisory acceptance (GHSA id) and a suppression opt-out are both detected as needing a human approver", () => {
  const dir = mkdtempSync(join(tmpdir(), "adr-approver-"));
  writeFileSync(
    join(dir, "0008-accept-advisory.md"),
    "---\nstatus: Accepted\n---\n\nAccepts GHSA-aaaa-bbbb-cccc for now.\n",
  );
  writeFileSync(
    join(dir, "0009-opt-out.md"),
    "---\nstatus: Accepted\n---\n\nThis repository opts out of the check entirely.\n",
  );
  const findings = checkAdrApprover(dir);
  assert.equal(findings.length, 2);
  rmSync(dir, { recursive: true, force: true });
});

test("acceptsRiskLicenceSuppressionOrOptOut: an ordinary design decision is not mistaken for one of the four reserved classes", () => {
  assert.ok(
    !acceptsRiskLicenceSuppressionOrOptOut(
      "This toolkit bundles no analysis tools; a consuming repository installs them.",
    ),
  );
});

test("looksLikeTeamLabel: a plausible individual name is not flagged as a team label", () => {
  assert.ok(!looksLikeTeamLabel("Jane Rivera"));
  assert.ok(looksLikeTeamLabel(""));
  assert.ok(looksLikeTeamLabel("Platform team"));
});

// --- fix 54 — the reserved-class detector keys on vocabulary instead of
// structure. Audit 14 tested acceptsRiskLicenceSuppressionOrOptOut against
// the real ADR-0004, which accepts four licences and never uses the literal
// phrase "allow list" its ALLOW_LIST_RE requires alongside LICENCE_RE:
// dormant only because the ADR was Proposed, and refusing nothing the
// moment someone accepted it without an approver. Derived instead of typed:
// a register row citing an ADR in its Decision record column IS that ADR
// being used to accept something (registers.md), located by the column's
// header name rather than a fixed index or an assumed word list.

test("citedAdrNumbers: an ADR named in the Decision record column is found, however many digits or however it is padded", () => {
  const text =
    "| Dependency | Version | Licence | Decision record | Approver |\n" +
    "| --- | --- | --- | --- | --- |\n" +
    "| some-pkg | 1.0.0 | WTFPL | ADR-0004 | Jane Rivera |\n" +
    "| other-pkg | 2.0.0 | MIT | | |\n";
  const numbers = citedAdrNumbers(text);
  assert.ok(numbers.has("0004"));
  assert.equal(numbers.size, 1, "a row with no citation contributes nothing");
});

test("citedAdrNumbers: a register with no Decision record column contributes nothing — the suppression register's own shape", () => {
  const text =
    "| Code | Scope | Justification | Removable when | Approved by |\n" +
    "| --- | --- | --- | --- | --- |\n" +
    "| my-rule | src/x.mjs | because | never true | Jane Rivera |\n";
  assert.equal(citedAdrNumbers(text).size, 0);
});

test("adrNumbersCitedByRegisters: reads across every register file in the directory, skipping README", () => {
  const dir = mkdtempSync(join(tmpdir(), "adr-citations-"));
  writeFileSync(
    join(dir, "dependency-licence-register.md"),
    "| Dependency | Version | Licence | Decision record | Approver |\n" +
      "| --- | --- | --- | --- | --- |\n" +
      "| some-pkg | 1.0.0 | WTFPL | ADR-0011 | |\n",
  );
  writeFileSync(join(dir, "README.md"), "Decision record\nADR-9999\n");
  const numbers = adrNumbersCitedByRegisters(dir);
  assert.ok(numbers.has("0011"));
  assert.ok(!numbers.has("9999"), "README is not a register");
  rmSync(dir, { recursive: true, force: true });
});

test("adrNumbersCitedByRegisters: a missing registers directory contributes nothing rather than throwing", () => {
  assert.equal(
    adrNumbersCitedByRegisters(join(tmpdir(), "does-not-exist-xyz")).size,
    0,
  );
});

test("checkAdrApprover: an ADR cited by a register row's Decision record column is reserved-class even though its own prose uses none of the vocabulary the fallback requires (fix 54)", () => {
  const adrDir = mkdtempSync(join(tmpdir(), "adr-approver-adr-"));
  const registersDir = mkdtempSync(join(tmpdir(), "adr-approver-reg-"));
  const text =
    "---\nstatus: Accepted\n---\n\n" +
    "Four licences are accepted for development scope, each on its own grounds.\n";
  assert.ok(
    !acceptsRiskLicenceSuppressionOrOptOut(text),
    "sanity check: the vocabulary fallback alone would not catch this text",
  );
  writeFileSync(join(adrDir, "0011-accept-a-licence.md"), text);
  writeFileSync(
    join(registersDir, "dependency-licence-register.md"),
    "| Dependency | Version | Licence | Decision record | Approver |\n" +
      "| --- | --- | --- | --- | --- |\n" +
      "| some-pkg | 1.0.0 | WTFPL | ADR-0011 | |\n",
  );
  const findings = checkAdrApprover(adrDir, registersDir);
  assert.equal(findings.length, 1);
  const finding = findings[0];
  assert.ok(finding, "expected one finding");
  assert.match(finding.problem, /no approver field/);
  rmSync(adrDir, { recursive: true, force: true });
  rmSync(registersDir, { recursive: true, force: true });
});

test("checkAdrApprover: an ADR no register row cites yet falls back to the vocabulary check, and stays silent when neither signal fires (fix 54)", () => {
  const adrDir = mkdtempSync(join(tmpdir(), "adr-approver-adr-"));
  const registersDir = mkdtempSync(join(tmpdir(), "adr-approver-reg-"));
  writeFileSync(
    join(adrDir, "0012-design-choice.md"),
    "---\nstatus: Accepted\n---\n\nVersions are derived per component.\n",
  );
  writeFileSync(
    join(registersDir, "dependency-licence-register.md"),
    "| Dependency | Version | Licence | Decision record | Approver |\n" +
      "| --- | --- | --- | --- | --- |\n" +
      "| some-pkg | 1.0.0 | MIT | | |\n",
  );
  assert.deepEqual(checkAdrApprover(adrDir, registersDir), []);
  rmSync(adrDir, { recursive: true, force: true });
  rmSync(registersDir, { recursive: true, force: true });
});

test("regression guard: check-adr-approver.mjs run for real, against the real ADR-0004 text with its approver removed and cited by a register row exactly as the real register cites it, refuses and names it (fix 54)", () => {
  // The exact case audit 14 named: ADR-0004 accepts four licences and never
  // uses the phrase "allow list" ALLOW_LIST_RE requires alongside LICENCE_RE.
  // Before fix 54 this case passed clean whenever the ADR was Accepted with
  // no approver — the regression this test guards.
  const realText = readFileSync(
    join(ROOT, "docs", "ADR", "0004-development-scope-licence-acceptances.md"),
    "utf8",
  );
  assert.ok(
    /status:\s*Accepted/.test(realText),
    "sanity check: the real ADR is Accepted",
  );
  assert.ok(
    !/allow[- ]list/i.test(realText),
    "sanity check: the vocabulary gap is real — the real text never uses the phrase",
  );
  const noApprover = realText.replace(/^approver:.*\r?\n/m, "");
  assert.ok(
    !/^approver:/m.test(noApprover),
    "sanity check: the approver line was actually removed",
  );

  const dir = scratchRepo();
  mkdirSync(join(dir, "docs", "ADR"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "ADR", "0004-development-scope-licence-acceptances.md"),
    noApprover,
  );
  mkdirSync(join(dir, "docs", "registers"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "registers", "dependency-licence-register.md"),
    "| Dependency | Version | Licence | Direct or transitive | Scope | Used by | Why | Decision record | Obligations | Expires | Approver |\n" +
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n" +
      "| @azu/style-format | 1.0.1 | WTFPL | Transitive | Development | tooling | example | ADR-0004 | none | none | |\n",
  );
  const r = runScript("scripts/check-adr-approver.mjs", dir);
  assert.equal(r.status, 2);
  assert.match(
    r.stderr,
    /0004-development-scope-licence-acceptances\.md/,
    "the finding names the ADR",
  );
  assert.match(r.stderr, /no approver field/);
  rmSync(dir, { recursive: true, force: true });
});
