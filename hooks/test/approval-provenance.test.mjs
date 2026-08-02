// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis Uncited uncited
// Split from approval-provenance-and-pr-body.test.mjs — subject group: approval-provenance.
// Loaded by hooks/test/hooks.test.mjs; not invoked directly by the test runner.
import { test } from "node:test";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  isAdrPath,
  isRegisterPath,
  parseRegisterRows,
  newlyApprovedAdrFinding,
  newlyApprovedRegisterRowFindings,
  checkApprovalProvenanceStaged,
  checkApprovalProvenanceRange,
} from "../../scripts/check-approval-provenance.mjs";
import { run } from "../lib/run.mjs";
import assert from "node:assert/strict";
import {
  ROOT,
  CLEAN_ENV,
  git,
  scratchRepo,
  runScript,
  REGISTER_HEADER,
} from "./support.mjs";

// --- scripts/check-approval-provenance.mjs — a bootstrapped
// repository landed an ADR and five register rows already approved, in the
// single commit that introduced them, naming a person who approved nothing
// in that repository — check-adr-approver.mjs, check-suppressions.mjs and
// check-licence-policy.mjs all exited 0 because none of them reads git
// history. This module's rule: an approval recorded in the same commit that
// introduces what it approves has not been reviewed by anyone, whoever is
// named.

test("isAdrPath / isRegisterPath: an ADR and a register are told apart, and each directory's own README is excluded", () => {
  assert.ok(isAdrPath("docs/ADR/0007-thing.md"));
  assert.ok(!isAdrPath("docs/ADR/README.md"));
  assert.ok(!isAdrPath("docs/registers/suppression-register.md"));
  assert.ok(isRegisterPath("docs/registers/suppression-register.md"));
  assert.ok(!isRegisterPath("docs/registers/README.md"));
  assert.ok(!isRegisterPath("docs/ADR/0007-thing.md"));
});

test("parseRegisterRows: identity is the first two cells, approver is the last — robust to columns of any width", () => {
  const rows = parseRegisterRows(
    REGISTER_HEADER +
      "| my-rule | src/x.mjs | because | never true | Jane Rivera |\n" +
      "| _ | | | | |\n",
  );
  assert.equal(rows.length, 1, "the sentinel row is excluded");
  const row = rows[0];
  assert.ok(row, "expected a row");
  assert.equal(row.identity, "my-rule|src/x.mjs");
  assert.equal(row.approver, "Jane Rivera");
});

test("newlyApprovedAdrFinding: an Accepted, risk-accepting ADR introduced by this commit (no 'before' text) is refused", () => {
  const after =
    "---\nstatus: Accepted\napprover: Jane Rivera\n---\n\nAccepts GHSA-aaaa-bbbb-cccc.\n";
  const finding = newlyApprovedAdrFinding("docs/ADR/0007-x.md", null, after);
  assert.ok(finding);
  assert.match(finding.problem, /did not exist before this commit/);
});

test("newlyApprovedAdrFinding: the same content is not refused once the file already existed before this commit — the approval is a distinct event", () => {
  const before =
    "---\nstatus: Proposed\n---\n\nWould accept GHSA-aaaa-bbbb-cccc.\n";
  const after =
    "---\nstatus: Accepted\napprover: Jane Rivera\n---\n\nAccepts GHSA-aaaa-bbbb-cccc.\n";
  assert.equal(
    newlyApprovedAdrFinding("docs/ADR/0007-x.md", before, after),
    null,
  );
});

test("newlyApprovedAdrFinding: an ordinary Proposed ADR, or one with no approver, is left to check-adr-approver.mjs — not this check's concern", () => {
  assert.equal(
    newlyApprovedAdrFinding(
      "docs/ADR/0007-x.md",
      null,
      "---\nstatus: Proposed\n---\n\nAccepts GHSA-aaaa-bbbb-cccc.\n",
    ),
    null,
  );
  assert.equal(
    newlyApprovedAdrFinding(
      "docs/ADR/0007-x.md",
      null,
      "---\nstatus: Accepted\n---\n\nAccepts GHSA-aaaa-bbbb-cccc.\n",
    ),
    null,
  );
});

test("newlyApprovedRegisterRowFindings: a row with no matching identity in the 'before' text, already carrying an approver, is refused", () => {
  const before = REGISTER_HEADER;
  const after =
    REGISTER_HEADER +
    "| my-rule | src/x.mjs | because | never true | Jane Rivera |\n";
  const findings = newlyApprovedRegisterRowFindings(
    "docs/registers/suppression-register.md",
    before,
    after,
  );
  assert.equal(findings.length, 1);
  const finding = findings[0];
  assert.ok(finding, "expected one finding");
  assert.match(finding.problem, /my-rule\|src\/x\.mjs/);
  assert.match(finding.problem, /no row with that identity existed/);
});

test("newlyApprovedRegisterRowFindings: the same row is not refused when it already existed with a blank approver — filling only the approver cell is the intended two-step", () => {
  // This is this repository's own actual history (commit daa59d0c): a
  // suppression row filed with justification and removal condition complete
  // and Approved by blank, then a later commit fills only that cell.
  const before =
    REGISTER_HEADER + "| my-rule | src/x.mjs | because | never true |  |\n";
  const after =
    REGISTER_HEADER +
    "| my-rule | src/x.mjs | because | never true | Jane Rivera |\n";
  assert.deepEqual(
    newlyApprovedRegisterRowFindings(
      "docs/registers/suppression-register.md",
      before,
      after,
    ),
    [],
  );
});

test("regression: a change-size override row approved at one counted size is not refused when the size is re-measured — identity is Branch + Filed, not Branch + Counted lines", () => {
  // The live incident this repository hit: a `rebuild` row was approved at 2124
  // counted lines, then a later commit re-measured it at 2464. While identity was
  // Branch + Counted lines (the first two cells parseRegisterRows reads), the
  // re-measured row landed as a brand-new identity already carrying an approver,
  // so the approval was refused as though never given. Filed — an ISO date, never
  // edited — is now the second column, so re-measuring Counted lines (which
  // follows the identity) leaves the row's identity untouched. See
  // docs/registers/change-size-override-register.md.
  const header =
    "| Branch | Filed | Counted lines | Composition | Justification | Removable when | Approved by |\n" +
    "| --- | --- | --- | --- | --- | --- | --- |\n";
  const before =
    header +
    "| `rebuild` | 2026-08-01 | 2124 | 1990 production, 134 configuration | repository-wide setting, cannot split per file | rebuild merges | Martin Jarvis |\n";
  const after =
    header +
    "| `rebuild` | 2026-08-01 | 2464 | 2325 production, 139 configuration | repository-wide setting, cannot split per file | rebuild merges | Martin Jarvis |\n";
  assert.deepEqual(
    newlyApprovedRegisterRowFindings(
      "docs/registers/change-size-override-register.md",
      before,
      after,
    ),
    [],
  );
});

test("contrast: the same re-measurement is refused while Counted lines is the second column — the defect Filed as identity removes", () => {
  // Proves the fix by inverting it: under the old column order, the identity was
  // Branch + Counted lines, so every re-measurement produced a new identity, and
  // an approval recorded against the previous figure arrived pre-approved against
  // a figure the 'before' text never held — exactly the shape Filed replaces.
  const oldHeader =
    "| Branch | Counted lines | Composition | Justification | Removable when | Approved by |\n" +
    "| --- | --- | --- | --- | --- | --- |\n";
  const before =
    oldHeader +
    "| `rebuild` | 2124 | 1990 production, 134 configuration | repository-wide setting, cannot split per file | rebuild merges | Martin Jarvis |\n";
  const after =
    oldHeader +
    "| `rebuild` | 2464 | 2325 production, 139 configuration | repository-wide setting, cannot split per file | rebuild merges | Martin Jarvis |\n";
  const findings = newlyApprovedRegisterRowFindings(
    "docs/registers/change-size-override-register.md",
    before,
    after,
  );
  assert.equal(findings.length, 1);
  const finding = findings[0];
  assert.ok(finding, "expected one finding");
  assert.match(finding.problem, /no row with that identity existed/);
  assert.match(finding.problem, /2464/);
});

test("checkApprovalProvenanceStaged: dispatches an ADR path and a register path to the right rule, ignoring everything else", () => {
  const stagedFiles = [
    "docs/ADR/0007-x.md",
    "docs/registers/suppression-register.md",
    "scripts/lib.mjs",
  ];
  /** @type {Record<string, string>} */
  const texts = {
    "docs/ADR/0007-x.md":
      "---\nstatus: Accepted\napprover: Jane Rivera\n---\n\nAccepts GHSA-aaaa-bbbb-cccc.\n",
    "docs/registers/suppression-register.md":
      REGISTER_HEADER +
      "| my-rule | src/x.mjs | because | never true | Jane Rivera |\n",
  };
  /** @param {string} p */
  const readAfter = (p) => texts[p] ?? null;
  const findings = checkApprovalProvenanceStaged({
    stagedFiles,
    readBefore: () => null,
    readAfter,
  });
  assert.equal(findings.length, 2, "both the new ADR and the new row refuse");
});

test("regression guard: check-approval-provenance.mjs run for real against a scratch commit that introduces an Accepted, approved ADR from nothing, refuses and names it", () => {
  const dir = scratchRepo();
  mkdirSync(join(dir, "docs", "ADR"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "ADR", "0007-accept-advisory.md"),
    "---\nstatus: Accepted\napprover: Jane Rivera\n---\n\nAccepts GHSA-aaaa-bbbb-cccc.\n",
  );
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "docs: accept an advisory (ADR-0007)"]);
  const r = runScript("scripts/check-approval-provenance.mjs", dir, [
    "--commit",
    "HEAD",
  ]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /0007-accept-advisory\.md/);
  assert.match(r.stderr, /did not exist before this commit/);
  rmSync(dir, { recursive: true, force: true });
});

test("regression guard: check-approval-provenance.mjs run for real, the same ADR proposed in one commit and accepted in a later, separate one, passes clean", () => {
  const dir = scratchRepo();
  mkdirSync(join(dir, "docs", "ADR"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "ADR", "0007-accept-advisory.md"),
    "---\nstatus: Proposed\n---\n\nWould accept GHSA-aaaa-bbbb-cccc.\n",
  );
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "docs: propose accepting an advisory (ADR-0007)"]);
  writeFileSync(
    join(dir, "docs", "ADR", "0007-accept-advisory.md"),
    "---\nstatus: Accepted\napprover: Jane Rivera\n---\n\nAccepts GHSA-aaaa-bbbb-cccc.\n",
  );
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "docs: accept advisory (ADR-0007)"]);
  const r = runScript("scripts/check-approval-provenance.mjs", dir, [
    "--commit",
    "HEAD",
  ]);
  assert.equal(r.status, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("regression guard: check-approval-provenance.mjs run for real against a scratch commit that introduces a register file with a row already approved, refuses and names the row", () => {
  const dir = scratchRepo();
  mkdirSync(join(dir, "docs", "registers"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "registers", "suppression-register.md"),
    REGISTER_HEADER +
      "| my-rule | src/x.mjs | because | never true | Jane Rivera |\n",
  );
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "docs: register a suppression"]);
  const r = runScript("scripts/check-approval-provenance.mjs", dir, [
    "--commit",
    "HEAD",
  ]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /my-rule\|src\/x\.mjs/);
  rmSync(dir, { recursive: true, force: true });
});

test("regression guard: check-approval-provenance.mjs run for real, the same row filed with a blank approver and approved in a later, separate commit, passes clean", () => {
  const dir = scratchRepo();
  mkdirSync(join(dir, "docs", "registers"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "registers", "suppression-register.md"),
    REGISTER_HEADER + "| my-rule | src/x.mjs | because | never true |  |\n",
  );
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "docs: register a suppression, pending approval"]);
  writeFileSync(
    join(dir, "docs", "registers", "suppression-register.md"),
    REGISTER_HEADER +
      "| my-rule | src/x.mjs | because | never true | Jane Rivera |\n",
  );
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-qm", "docs: approve the suppression"]);
  const r = runScript("scripts/check-approval-provenance.mjs", dir, [
    "--commit",
    "HEAD",
  ]);
  assert.equal(r.status, 0);
  rmSync(dir, { recursive: true, force: true });
});

test("gate 2 (pre-commit.mjs) refuses a commit that stages a fresh, already-Accepted, already-approved ADR", () => {
  const dir = scratchRepo();
  git(dir, ["checkout", "-qb", "feature"]);
  writeFileSync(
    join(dir, ".secretlintrc.json"),
    JSON.stringify({ rules: [] }) + "\n",
  );
  mkdirSync(join(dir, "docs", "ADR"), { recursive: true });
  writeFileSync(
    join(dir, "docs", "ADR", "0007-accept-advisory.md"),
    "---\nstatus: Accepted\napprover: Jane Rivera\n---\n\nAccepts GHSA-aaaa-bbbb-cccc.\n",
  );
  git(dir, ["add", "-A"]);
  const r = runScript("scripts/pre-commit.mjs", dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /approval provenance/);
  rmSync(dir, { recursive: true, force: true });
});

test("hazard 3: this repository's own real history — the suppression and licence rows daa59d0c approves pass, because each already existed with a blank approver", () => {
  // Verifies against the actual commit (daa59d0c), not a synthetic fixture:
  // it fills the Approved by cell on two already-registered suppression rows
  // (the two run.mjs rows) and on four already-registered licence rows —
  // exactly the healthy two-step this corpus documents (registers.md: a row
  // filed with a blank approver, approved later by a separate commit).
  // `~1`, not `^`: lib.mjs's `run` shells out through cmd.exe on Windows,
  // where an unquoted `^` is swallowed before git sees it (see the comment
  // in check-approval-provenance.mjs). Read-only against the real
  // repository (ROOT), not a scratch tree — nothing here writes or commits.
  const sha = "daa59d0cf1d039b997b830eb1029a49d2aa7d099";
  const findings = checkApprovalProvenanceRange(`${sha}~1..${sha}`, {
    // hooks/lib/run.mjs's own run() wraps the same spawnSync call, already
    // registered for this rule there (docs/registers/suppression-register.md)
    // — routed through it here rather than a second direct spawnSync call
    // needing a second row for the identical reasoning.
    runGit: (cmd, args) => run(cmd, args, { cwd: ROOT, env: CLEAN_ENV }),
  });
  const registerFindings = findings.filter((f) => f.path.includes("register"));
  assert.equal(
    registerFindings.length,
    0,
    "the suppression and licence rows this commit approves already existed with a blank approver — they must pass",
  );
});

test("hazard 3 (continued): the same commit's ADR-0004 — introduced and Accepted in one sitting — is NOT flagged, but only because check-adr-approver.mjs's own risk/licence detection does not recognise its prose, a pre-existing, unrelated gap this fix does not touch", () => {
  // ADR-0004 is exactly the shape the mechanical rule targets: `status:
  // Accepted`, `approver: Martin Jarvis`, introduced from nothing in
  // daa59d0c — a human authoring and accepting their own decision in one
  // sitting, which a git-history-only signal cannot tell apart from a
  // copied approval. Directly exercising newlyApprovedAdrFinding against
  // its real committed text (rather than the range driver) proves this: it
  // returns null not because the file already existed (it did not — the
  // second assertion below confirms) but because
  // acceptsRiskLicenceSuppressionOrOptOut(afterText) is false for this
  // ADR's actual prose — it discusses accepting four licences at length
  // without ever using the literal phrase "allow list" that check-adr-
  // approver.mjs's own ALLOW_LIST_RE requires alongside LICENCE_RE. That is
  // check-adr-approver.mjs's own detection gap, not introduced or
  // fixed by this check — checkAdrApprover() itself would equally fail to
  // require an approver on this same ADR had one been missing. Recorded
  // here rather than silently assumed clean, per hazard 3's instruction to
  // verify rather than assume.
  const afterText = readFileSync(
    join(ROOT, "docs", "ADR", "0004-development-scope-licence-acceptances.md"),
    "utf8",
  );
  assert.equal(
    newlyApprovedAdrFinding(
      "docs/ADR/0004-development-scope-licence-acceptances.md",
      null,
      afterText,
    ),
    null,
    "not flagged — but see this test's own name for why that is not evidence of correct two-commit provenance",
  );
  assert.ok(
    /status:\s*Accepted/.test(afterText) && /approver:\s*\S/.test(afterText),
    "sanity check: the file really is Accepted with an approver filled",
  );
  assert.ok(
    !/allow[- ]list/i.test(afterText),
    "sanity check: the gap is real — this ADR's prose never uses the phrase acceptsRiskLicenceSuppressionOrOptOut requires alongside 'licence'",
  );
});
