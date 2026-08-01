// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis Uncited uncited
// Split from approval-provenance-and-pr-body.test.mjs — subject group: pr-body-artefacts.
// Loaded by hooks/test/hooks.test.mjs; not invoked directly by the test runner.
import { test } from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  adrNumbersProposedOrAccepted,
  registerRowIdentities,
  citesReservedArtefact,
  disclosedFindingLines,
  findUncitedFindings,
  readPrBody,
} from "../../scripts/check-pr-body-artefacts.mjs";
import assert from "node:assert/strict";
import { ROOT } from "./support.mjs";

// --- scripts/check-pr-body-artefacts.mjs — cross-gate-rules.md
// names five reserved classes a pull request may open with findings still
// outstanding — a register row or ADR accepting a risk, a licence, a
// suppression or an opt-out, and a named conflict between two standing
// directives — and says "a finding the implementer could have fixed is a
// reason not to open yet, not a line item to disclose and open anyway."
// The demonstrated case: a pull request opened findings under an invented sixth heading
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

test("citesReservedArtefact: an invented reason with no artefact behind it — the demonstrated case — cites nothing", () => {
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
  const finding = findings[0];
  assert.ok(finding, "expected at least one finding");
  assert.match(finding.text, /ADR-0004/);
});

test("disclosedFindingLines: a bold-only line opens a section too — the invented-heading shape found", () => {
  const body =
    "## Findings\n\n" +
    "**One tool limitation, documented rather than hidden**\n\n" +
    "- the gap-fill scan misparses this file\n";
  const findings = disclosedFindingLines(body);
  assert.equal(findings.length, 1);
  const finding = findings[0];
  assert.ok(finding, "expected one finding");
  assert.match(finding.text, /misparses/);
});

test("findUncitedFindings: reproduces the demonstrated case — an invented heading with an uncited bullet is a finding", () => {
  const body =
    "## Outstanding\n\n" +
    "**One tool limitation, documented rather than hidden**\n\n" +
    "- the gap-fill scan touches a file lizard misparses\n";
  const findings = findUncitedFindings(body, {
    adrNumbers: new Set(["0004"]),
    registerIdentities: ["no-eval"],
  });
  assert.equal(findings.length, 1);
  const finding = findings[0];
  assert.ok(finding, "expected one finding");
  assert.match(finding.problem, /no register row, Proposed\/Accepted ADR/);
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
// not only after (skills/repository-bootstrap/SKILL.md's own
// precondition): `--file` reads a draft body straight off disk, with no
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

test("readPrBody: --file with no path following it is a named skip, not a read of undefined", () => {
  const { body, skip } = readPrBody(["--file"]);
  assert.equal(body, null);
  assert.match(skip, /no path/);
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
