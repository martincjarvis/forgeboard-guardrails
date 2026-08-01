// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis Uncited uncited
// Split from hooks.test.mjs (fix 79) — subject group: approval-provenance-and-pr-body.
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
  isAdrPath,
  isRegisterPath,
  parseRegisterRows,
  newlyApprovedAdrFinding,
  newlyApprovedRegisterRowFindings,
  checkApprovalProvenanceStaged,
  checkApprovalProvenanceRange,
} from "../../scripts/check-approval-provenance.mjs";
import {
  adrNumbersProposedOrAccepted,
  registerRowIdentities,
  citesReservedArtefact,
  disclosedFindingLines,
  findUncitedFindings,
  readPrBody,
} from "../../scripts/check-pr-body-artefacts.mjs";
import {
  extractGateFailLabels,
  findUnreconciledCiFindings,
  checkReportCiReconciliation,
} from "../../scripts/check-report-ci-reconciliation.mjs";
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

// --- scripts/check-approval-provenance.mjs — fix 49. Audit 13: a bootstrapped
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
  assert.equal(rows[0].identity, "my-rule|src/x.mjs");
  assert.equal(rows[0].approver, "Jane Rivera");
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
  assert.match(findings[0].problem, /my-rule\|src\/x\.mjs/);
  assert.match(findings[0].problem, /no row with that identity existed/);
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

test("checkApprovalProvenanceStaged: dispatches an ADR path and a register path to the right rule, ignoring everything else", () => {
  const stagedFiles = [
    "docs/ADR/0007-x.md",
    "docs/registers/suppression-register.md",
    "scripts/lib.mjs",
  ];
  const texts = {
    "docs/ADR/0007-x.md":
      "---\nstatus: Accepted\napprover: Jane Rivera\n---\n\nAccepts GHSA-aaaa-bbbb-cccc.\n",
    "docs/registers/suppression-register.md":
      REGISTER_HEADER +
      "| my-rule | src/x.mjs | because | never true | Jane Rivera |\n",
  };
  const findings = checkApprovalProvenanceStaged({
    stagedFiles,
    readBefore: () => null,
    readAfter: (p) => texts[p] ?? null,
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

test("fix 49: gate 2 (pre-commit.mjs) refuses a commit that stages a fresh, already-Accepted, already-approved ADR", () => {
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

test("fix 49, hazard 3: this repository's own real history — the suppression and licence rows daa59d0c approves pass, because each already existed with a blank approver", () => {
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

test("fix 49, hazard 3 (continued): the same commit's ADR-0004 — introduced and Accepted in one sitting — is NOT flagged, but only because check-adr-approver.mjs's own risk/licence detection does not recognise its prose, a pre-existing, unrelated gap this fix does not touch", () => {
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
  // check-adr-approver.mjs's own detection gap (fix 22), not introduced or
  // fixed by fix 49 — checkAdrApprover() itself would equally fail to
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

// --- scripts/check-pr-body-artefacts.mjs — fix 68. cross-gate-rules.md
// names five reserved classes a pull request may open with findings still
// outstanding — a register row or ADR accepting a risk, a licence, a
// suppression or an opt-out, and a named conflict between two standing
// directives — and says "a finding the implementer could have fixed is a
// reason not to open yet, not a line item to disclose and open anyway."
// Audit 17: a pull request opened findings under an invented sixth heading
// ("One tool limitation, documented rather than hidden") with no register
// row or ADR behind it, and six dependency advisories cited none either.

test("adrNumbersProposedOrAccepted: reads Proposed and Accepted ADRs, not Superseded or Rejected ones", () => {
  const dir = mkdtempSync(join(tmpdir(), "pr-artefacts-adr-"));
  writeFileSync(join(dir, "0001-proposed.md"), "---\nstatus: Proposed\n---\n");
  writeFileSync(join(dir, "0002-accepted.md"), "---\nstatus: Accepted\n---\n");
  writeFileSync(
    join(dir, "0003-superseded.md"),
    "---\nstatus: Superseded\n---\n",
  );
  const numbers = adrNumbersProposedOrAccepted(dir);
  assert.ok(numbers.has("0001") && numbers.has("0002"));
  assert.ok(
    !numbers.has("0003"),
    "a Superseded ADR no longer reserves anything a pull request can cite",
  );
  rmSync(dir, { recursive: true, force: true });
});

test("adrNumbersProposedOrAccepted: a missing ADR directory contributes nothing rather than throwing", () => {
  assert.equal(
    adrNumbersProposedOrAccepted(join(tmpdir(), "does-not-exist-xyz")).size,
    0,
  );
});

test("registerRowIdentities: reads a row's own identity across every register file, skipping README", () => {
  const dir = mkdtempSync(join(tmpdir(), "pr-artefacts-reg-"));
  writeFileSync(
    join(dir, "suppression-register.md"),
    "| Code | Scope | Justification | Removable when | Approved by |\n" +
      "| --- | --- | --- | --- | --- |\n" +
      "| no-eval | src/x.mjs | legacy | never | |\n",
  );
  writeFileSync(join(dir, "README.md"), "| Code |\n| --- |\n| not-a-row |\n");
  const identities = registerRowIdentities(dir);
  assert.ok(identities.some((i) => i.includes("no-eval")));
  assert.ok(!identities.some((i) => i.includes("not-a-row")));
  rmSync(dir, { recursive: true, force: true });
});

test("citesReservedArtefact: an ADR number that exists as Proposed or Accepted is a citation", () => {
  assert.ok(
    citesReservedArtefact("see ADR-0004 for the accepted licence exception", {
      adrNumbers: new Set(["0004"]),
    }),
  );
});

test("citesReservedArtefact: an ADR number that does not exist in the Proposed/Accepted set is not a citation — a number alone is not a fact", () => {
  assert.ok(
    !citesReservedArtefact("this is basically what ADR-0099 would say", {
      adrNumbers: new Set(["0004"]),
    }),
  );
});

test("citesReservedArtefact: a register row's own identity is a citation", () => {
  assert.ok(
    citesReservedArtefact("filed as the no-eval / src/x.mjs suppression row", {
      registerIdentities: ["no-eval"],
    }),
  );
});

test("citesReservedArtefact: the root instruction file's named conflict clause is a citation", () => {
  assert.ok(
    citesReservedArtefact(
      "this is a conflict between two standing directives, reserved per AGENTS.md",
    ),
  );
  assert.ok(
    !citesReservedArtefact("see AGENTS.md for the general operating rules"),
    "naming the root file alone, with no conflict language, is not a citation",
  );
});

test("citesReservedArtefact: an invented reason with no artefact behind it — audit 17's own case — cites nothing", () => {
  assert.ok(
    !citesReservedArtefact(
      "one tool limitation, documented rather than hidden: lizard's parser is unreliable here",
      { adrNumbers: new Set(["0004"]), registerIdentities: ["no-eval"] },
    ),
  );
});

test("disclosedFindingLines: bullets under a heading naming outstanding work are extracted; a bullet outside any such section is not", () => {
  const body =
    "# Pull request\n\nSome narrative.\n\n" +
    "## Outstanding\n\n" +
    "- a licence exception, see ADR-0004\n" +
    "- a suppression row, no-eval\n\n" +
    "## Test plan\n\n" +
    "- ran the suite locally\n";
  const findings = disclosedFindingLines(body);
  assert.equal(findings.length, 2, "only the two bullets under Outstanding");
  assert.match(findings[0].text, /ADR-0004/);
});

test("disclosedFindingLines: a bold-only line opens a section too — the invented-heading shape audit 17 found", () => {
  const body =
    "## Findings\n\n" +
    "**One tool limitation, documented rather than hidden**\n\n" +
    "- the gap-fill scan misparses this file\n";
  const findings = disclosedFindingLines(body);
  assert.equal(findings.length, 1);
  assert.match(findings[0].text, /misparses/);
});

test("findUncitedFindings: reproduces audit 17's own case — an invented heading with an uncited bullet is a finding", () => {
  const body =
    "## Outstanding\n\n" +
    "**One tool limitation, documented rather than hidden**\n\n" +
    "- the gap-fill scan touches a file lizard misparses\n";
  const findings = findUncitedFindings(body, {
    adrNumbers: new Set(["0004"]),
    registerIdentities: ["no-eval"],
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0].problem, /no register row, Proposed\/Accepted ADR/);
});

test("findUncitedFindings: a bullet citing a real, reserved artefact is not a finding", () => {
  const body =
    "## Outstanding\n\n" +
    "- a licence exception accepted in ADR-0004\n" +
    "- the no-eval suppression, filed with a blank approver\n";
  const findings = findUncitedFindings(body, {
    adrNumbers: new Set(["0004"]),
    registerIdentities: ["no-eval"],
  });
  assert.deepEqual(findings, []);
});

test("regression guard: adrNumbersProposedOrAccepted and registerRowIdentities run for real against this toolkit's own docs/ADR and docs/registers", () => {
  const numbers = adrNumbersProposedOrAccepted(join(ROOT, "docs", "ADR"));
  assert.ok(
    numbers.has("0004"),
    "this repository's own ADR-0004 is Accepted and must be citable",
  );
  const identities = registerRowIdentities(join(ROOT, "docs", "registers"));
  assert.ok(
    Array.isArray(identities),
    "an empty or populated register both return an array, never throw",
  );
});

// --- readPrBody — the check must be runnable before a pull request exists,
// not only after (skills/repository-bootstrap/SKILL.md's own precondition,
// beside fix 65): `--file` reads a draft body straight off disk, with no
// `gh` call and no open pull request anywhere in the picture.

test("readPrBody: --file reads a draft body from disk, with no gh call and no pull request in existence", () => {
  const dir = mkdtempSync(join(tmpdir(), "pr-body-draft-"));
  const draft = join(dir, "draft-body.md");
  writeFileSync(
    draft,
    "## Outstanding\n\n- a licence exception, see ADR-0004\n",
  );
  let ghWasCalled = false;
  const { body, skip } = readPrBody(["--file", draft], {
    have: () => {
      ghWasCalled = true;
      return true;
    },
    run: () => {
      ghWasCalled = true;
      return { status: 0, stdout: "" };
    },
  });
  assert.equal(skip, null);
  assert.match(body, /ADR-0004/);
  assert.ok(!ghWasCalled, "--file must never touch gh, live or not");
  rmSync(dir, { recursive: true, force: true });
});

test("readPrBody: a missing --file path is a named skip, never a silent empty body", () => {
  const { body, skip } = readPrBody([
    "--file",
    join(tmpdir(), "does-not-exist-xyz.md"),
  ]);
  assert.equal(body, null);
  assert.match(skip, /could not read/);
});

test("readPrBody: with no --file, falls back to gh pr view for an already-open pull request", () => {
  let calledArgs = null;
  const { body, skip } = readPrBody(["42"], {
    have: () => true,
    run: (cmd, args) => {
      calledArgs = args;
      return { status: 0, stdout: "## Outstanding\n\n- cites nothing\n" };
    },
  });
  assert.equal(skip, null);
  assert.deepEqual(calledArgs, [
    "pr",
    "view",
    "42",
    "--json",
    "body",
    "-q",
    ".body",
  ]);
  assert.match(body, /cites nothing/);
});

test("readPrBody: gh unavailable is a named skip, not a crash — the pre-PR path (--file) is unaffected by this", () => {
  const { body, skip } = readPrBody([], { have: () => false });
  assert.equal(body, null);
  assert.match(skip, /gh not on PATH/);
});

// --- Fix 76. "Verbatim" was the local run's output, and CI disagreed. Audit
// 18's own reproduction: the report quoted 12 lines of the local gate-6 run,
// osv-scanner correctly skipped there, and the report's own header claimed
// this was gate 6's output "copied ... verbatim". CI's job log, on the same
// commit, actually failed the check with six CVEs the report never
// mentioned. extractGateFailLabels reads a gate's own FAIL lines straight
// from a job log (fix 64's own instrument, never the capped annotations
// API); findUnreconciledCiFindings is the reconciliation itself.

test("extractGateFailLabels reads a gate's own FAIL lines, scoped to the named gate", () => {
  const log = [
    "gate 6: base origin/main, range origin/main...HEAD",
    "gate 6: FAIL cross-stack dependency scan (osv-scanner)",
    "        CVE-2026-2327, CVE-2026-59869",
    "gate 6: FAIL lint (eslint)",
    "gate 7: FAIL something unrelated",
  ].join("\n");
  assert.deepEqual(extractGateFailLabels(log, "gate 6"), [
    "cross-stack dependency scan (osv-scanner)",
    "lint (eslint)",
  ]);
  assert.deepEqual(extractGateFailLabels(log, "gate 7"), [
    "something unrelated",
  ]);
});

test("extractGateFailLabels finds nothing in a clean log", () => {
  assert.deepEqual(
    extractGateFailLabels("gate 6: base origin/main, range x\n", "gate 6"),
    [],
  );
});

// --- Fix 90. Audit 22: GATE_FAIL_RE never saw a real job log. Every real
// GitHub Actions log line is timestamp-prefixed, and the timestamp's own
// colons sat inside the character class the old regex required up to
// ": FAIL" — 0 labels extracted from 9 real `gate 6: FAIL` lines, on both
// the REST API job-log format (bare ISO-8601 prefix) and `gh run view
// --log` (job name, then step name, tab-separated, ahead of that same
// timestamp). REAL_JOB_LOG below is captured, unmodified output — not a
// hand-written string — from
// martincjarvis/guardrails-bootstrap-eval run 30691149682, job
// "gate 6 (ubuntu-latest)", fetched via
// `gh api repos/.../actions/jobs/<id>/logs`.

const REAL_JOB_LOG = [
  "2026-08-01T08:10:39.3338772Z gate 6: SKIP integration tests — none configured for any component yet; gate 5 has nothing to run",
  "2026-08-01T08:10:39.3340390Z gate 6: SKIP gate 4 — agent-context length: skills/guardrail-audit/SKILL.md is 240 lines (> 200 warn band)",
  "2026-08-01T08:10:39.3342096Z gate 6: SKIP gate 4 — agent-context length: skills/repository-bootstrap/SKILL.md is 467 lines (> 200 warn band)",
  "2026-08-01T08:10:39.3344402Z gate 6: FAIL dependency licence policy (docs/registers/dependency-licence-register.md)",
  "2026-08-01T08:10:39.3347271Z         @azu/style-format@1.0.1 carries licence 'WTFPL' (scope Development) — 'WTFPL' is not both OSI-approved and compatible with this repository's own licence, so accepting it is a human decision",
  "2026-08-01T08:10:39.3350113Z         record a human decision accepting it — name the record in this row's Decision record column and the person in Approver — or replace the dependency",
  "2026-08-01T08:10:39.3351719Z gate 6: FAIL dependency licence policy (docs/registers/dependency-licence-register.md)",
  "2026-08-01T08:10:39.3354937Z         @cspell/dict-en-common-misspellings@2.1.13 carries licence 'CC-BY-SA-4.0' (scope Development) — 'CC-BY-SA-4.0' is not both OSI-approved and compatible with this repository's own licence, so accepting it is a human decision",
  "2026-08-01T08:10:39.3358115Z         record a human decision accepting it — name the record in this row's Decision record column and the person in Approver — or replace the dependency",
  "2026-08-01T08:10:39.3359641Z gate 6: FAIL dependency licence policy (docs/registers/dependency-licence-register.md)",
  "2026-08-01T08:10:39.3362376Z         spdx-license-ids@3.0.23 carries licence 'CC0-1.0' (scope Development) — 'CC0-1.0' is not both OSI-approved and compatible with this repository's own licence, so accepting it is a human decision",
  "2026-08-01T08:10:39.3365539Z         record a human decision accepting it — name the record in this row's Decision record column and the person in Approver — or replace the dependency",
  "2026-08-01T08:10:39.3366301Z gate 6: FAIL dependency advisory scan (js-yaml)",
  "2026-08-01T08:10:39.3366914Z         js-yaml carries a high advisory (dev dependency): ghsa-pm4m-ph32-ghv5",
  "2026-08-01T08:10:39.3367765Z         upgrade the dependency, or accept it in an Accepted ADR naming the advisory id",
  "2026-08-01T08:10:39.3368810Z gate 6: FAIL dependency advisory scan (markdownlint-cli2)",
  "2026-08-01T08:10:39.3369833Z         markdownlint-cli2 carries a high advisory (dev dependency)",
  "2026-08-01T08:10:39.3370534Z         upgrade the dependency, or accept it in an Accepted ADR naming the advisory id",
  "2026-08-01T08:10:39.3371103Z gate 6: FAIL cross-stack dependency scan (osv-scanner)",
  "2026-08-01T08:10:39.3371491Z         GHSA-pm4m-ph32-ghv5",
  "2026-08-01T08:10:39.3372063Z         upgrade the flagged dependency, or record why the advisory does not apply",
  "2026-08-01T08:10:39.3372837Z gate 6: FAIL suppression register — approver (docs/registers/suppression-register.md)",
  "2026-08-01T08:10:39.3374763Z         'javascript.lang.security.audit.spawn-shell-true.spawn-shell-true' (hooks/lib/run.mjs) has no approver — every other column is complete, but a human must accept a suppression before it merges",
  "2026-08-01T08:10:39.3376094Z         name a human in the register row's Approved by column, or remove the suppression and fix the finding instead",
  "2026-08-01T08:10:39.3376915Z gate 6: FAIL suppression register — approver (docs/registers/suppression-register.md)",
  "2026-08-01T08:10:39.3378712Z         'javascript.lang.security.detect-child-process.detect-child-process' (hooks/lib/run.mjs) has no approver — every other column is complete, but a human must accept a suppression before it merges",
  "2026-08-01T08:10:39.3380264Z         name a human in the register row's Approved by column, or remove the suppression and fix the finding instead",
  "2026-08-01T08:10:39.3380918Z gate 6: FAIL gate 4 — change size / file length",
  "2026-08-01T08:10:39.3381830Z         gate 4: thresholds change-warn=400 change-error=800 file-length-error=400 (standard defaults; file class via git check-attr)",
].join("\n");

const REAL_JOB_LOG_FAIL_LABELS = [
  "dependency licence policy (docs/registers/dependency-licence-register.md)",
  "dependency licence policy (docs/registers/dependency-licence-register.md)",
  "dependency licence policy (docs/registers/dependency-licence-register.md)",
  "dependency advisory scan (js-yaml)",
  "dependency advisory scan (markdownlint-cli2)",
  "cross-stack dependency scan (osv-scanner)",
  "suppression register — approver (docs/registers/suppression-register.md)",
  "suppression register — approver (docs/registers/suppression-register.md)",
  "gate 4 — change size / file length",
];

test("extractGateFailLabels reads all 9 gate 6: FAIL labels from a real, unmodified job log — audit 22's own reproduction, where the pre-fix regex read 0", () => {
  assert.deepEqual(
    extractGateFailLabels(REAL_JOB_LOG, "gate 6"),
    REAL_JOB_LOG_FAIL_LABELS,
  );
});

test("extractGateFailLabels reads the same labels through `gh run view --log`'s extra job/step tab columns ahead of the timestamp", () => {
  const ghLogFormat = REAL_JOB_LOG.split("\n")
    .map(
      (line) =>
        `gate 6 (ubuntu-latest)\tGate 6 — re-run the gates 2-5 surface over the pull request range\t${line}`,
    )
    .join("\n");
  assert.deepEqual(
    extractGateFailLabels(ghLogFormat, "gate 6"),
    REAL_JOB_LOG_FAIL_LABELS,
  );
});

test("findUnreconciledCiFindings: the adversarial case — a report that says nothing at all, against a real job log with 9 real findings, is 9 findings, not 0", () => {
  const findings = findUnreconciledCiFindings(
    "This report says absolutely nothing about any gate finding.",
    REAL_JOB_LOG,
  );
  assert.equal(
    findings.length,
    REAL_JOB_LOG_FAIL_LABELS.length,
    "a check that reads 0 findings against a real log with 9 real FAIL lines cannot fail, and is not a check",
  );
});

test("findUnreconciledCiFindings reproduces audit 18's own case: a report with zero osv-scanner mentions, CI reporting a FAIL for it", () => {
  const reportText = [
    "## What remains open (copied from gate 6's own output)",
    "",
    "```",
    "gate 6: base origin/main, range origin/main...HEAD",
    "gate 6: FAIL lint (eslint)",
    "```",
  ].join("\n");
  const ciLog = [
    "gate 6: FAIL cross-stack dependency scan (osv-scanner)",
    "        CVE-2026-2327, CVE-2026-59869, CVE-2026-48988, CVE-2026-53550, CVE-2025-64718, CVE-2026-14257",
  ].join("\n");
  const findings = findUnreconciledCiFindings(reportText, ciLog);
  assert.equal(findings.length, 1);
  assert.match(
    findings[0].problem,
    /cross-stack dependency scan \(osv-scanner\)/,
  );
});

test("findUnreconciledCiFindings raises nothing once the report names the CI finding, wherever in the report it appears", () => {
  const reportText = [
    "## CI-only findings (fix 66)",
    "",
    "- cross-stack dependency scan (osv-scanner) — category 3: could not run locally, osv-scanner not installed; six CVEs found in CI, addressed in a follow-up commit.",
  ].join("\n");
  const ciLog = "gate 6: FAIL cross-stack dependency scan (osv-scanner)\n";
  assert.deepEqual(findUnreconciledCiFindings(reportText, ciLog), []);
});

test("findUnreconciledCiFindings raises nothing for a clean CI log, whatever the report says", () => {
  assert.deepEqual(
    findUnreconciledCiFindings("anything at all", "gate 6: base x\n"),
    [],
  );
});

test("checkReportCiReconciliation reads both files by path, injected for testing", () => {
  const files = {
    "report.md": "no mention of anything here",
    "ci.log": "gate 6: FAIL lint (eslint)\n",
  };
  const findings = checkReportCiReconciliation("report.md", "ci.log", {
    readFile: (p) => files[p],
  });
  assert.equal(findings.length, 1);
  assert.match(findings[0].problem, /lint \(eslint\)/);
});
