// cspell:ignore unattributed
// Subject group: third-party-attribution register (gate 2, cross-gate-rules.md).
// Loaded by hooks/test/hooks.test.mjs; not invoked directly by the test runner.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateAttributionRows,
  attributionRegisterRows,
  checkAttribution,
  pendingAttributionApprovals,
} from "../../scripts/check-third-party-attribution.mjs";

// A complete row, in the register's own markdown-table shape — the fixture is
// the shape the parser reads, not a hand-built object that agrees with itself.
const HEADER =
  "| Tool | Version | Symptom | Upstream ticket | Ticket state | Minimal reproduction | Date verified | Removable when | Approved by |\n" +
  "| ---- | ------- | ------- | --------------- | ------------ | -------------------- | ------------- | -------------- | ----------- |\n";
/** @param {string[]} cells */
const row = (cells) => `| ${cells.join(" | ")} |`;

// Join a finding list's problem text for matching, avoiding indexed access
// (tsc's strict indexing flags `arr[0]` as possibly undefined). Each refusal
// test below asserts exactly one finding, so scanning the joined text is exact.
const problems = (/** @type {{ problem?: string }[]} */ fs) =>
  fs.map((f) => f.problem || "").join("\n");

// The acceptance test first. A row that names a third-party tool but cites no
// upstream ticket URL is the exact claim the rule refuses: "it is a tool bug",
// with no link and no state. This is the negative fixture — the test fails the
// moment the check stops refusing such a row.
test("a row claiming a third-party defect with no upstream ticket URL is refused", () => {
  const text =
    HEADER +
    row([
      "lizard",
      "1.17",
      "function span reported past its real end",
      "",
      "",
      "lizard scripts/check-suppressions.mjs -l javascript",
      "2026-08-02",
      "the regex literal is hoisted out of the function body",
      "",
    ]);
  const { blocking } = evaluateAttributionRows(attributionRegisterRows(text));
  assert.equal(blocking.length, 1, "an empty Upstream ticket cell is refused");
  assert.match(problems(blocking), /Upstream ticket/);
});

test("a complete row with an open upstream ticket URL and its state passes", () => {
  const text =
    HEADER +
    row([
      "some-tool",
      "2.3.4",
      "the widget folds the wrong way under load",
      "https://example.com/upstream/issues/42",
      "open",
      "some-tool -i fixture.json, observed at 100 rps",
      "2026-08-02",
      "upstream releases 2.4 and the row is re-checked against it",
      "",
    ]);
  const { blocking, pendingApproval } = evaluateAttributionRows(
    attributionRegisterRows(text),
  );
  assert.equal(
    blocking.length,
    0,
    "a complete open-ticket row blocks on nothing",
  );
  assert.equal(
    pendingApproval.length,
    1,
    "the only outstanding column is the approver",
  );
});

test("a closed upstream ticket is a valid state — a prompt to revisit, not a refusal", () => {
  const text =
    HEADER +
    row([
      "some-tool",
      "2.3.4",
      "the widget folded the wrong way under load",
      "https://example.com/upstream/issues/7",
      "closed",
      "some-tool -i fixture.json",
      "2026-08-02",
      "the fix is released and the dependency upgraded past it",
      "A Person",
    ]);
  const { blocking } = evaluateAttributionRows(attributionRegisterRows(text));
  assert.equal(blocking.length, 0, "a closed ticket is recorded, not refused");
});

test("an upstream ticket URL with no recorded state is refused — state is mandatory", () => {
  const text =
    HEADER +
    row([
      "some-tool",
      "2.3.4",
      "symptom text",
      "https://example.com/upstream/issues/9",
      "",
      "repro",
      "2026-08-02",
      "condition",
      "",
    ]);
  const { blocking } = evaluateAttributionRows(attributionRegisterRows(text));
  assert.equal(blocking.length, 1);
  assert.match(problems(blocking), /Ticket state/);
});

test("a malformed ticket cell — neither a URL nor the unattributed sentinel — is refused", () => {
  const text =
    HEADER +
    row([
      "some-tool",
      "2.3.4",
      "symptom text",
      "see internal notes",
      "open",
      "repro",
      "2026-08-02",
      "condition",
      "",
    ]);
  const { blocking } = evaluateAttributionRows(attributionRegisterRows(text));
  assert.equal(blocking.length, 1);
  assert.match(problems(blocking), /neither an http\(s\) URL nor the/);
});

test("the 'unattributed' sentinel records a defect treated as ours, with no ticket required", () => {
  const text =
    HEADER +
    row([
      "lizard",
      "1.17",
      "function span reported past its real end; cause not established upstream",
      "unattributed",
      "",
      "lizard scripts/check-suppressions.mjs -l javascript",
      "2026-08-02",
      "the source is written so the tool parses it, or an upstream ticket is filed",
      "",
    ]);
  const { blocking, pendingApproval } = evaluateAttributionRows(
    attributionRegisterRows(text),
  );
  assert.equal(
    blocking.length,
    0,
    "an explicitly unattributed row is ours, not a refused claim",
  );
  assert.equal(pendingApproval.length, 1);
});

test("a row missing a required column other than the ticket is refused", () => {
  const text =
    HEADER +
    row([
      "some-tool",
      "",
      "symptom text",
      "https://example.com/upstream/issues/1",
      "open",
      "repro",
      "2026-08-02",
      "condition",
      "",
    ]);
  const { blocking } = evaluateAttributionRows(attributionRegisterRows(text));
  assert.equal(blocking.length, 1);
  assert.match(problems(blocking), /Version/);
});

test("an approver that reads as a team label is refused, not pending", () => {
  const text =
    HEADER +
    row([
      "some-tool",
      "2.3.4",
      "symptom",
      "https://example.com/upstream/issues/2",
      "open",
      "repro",
      "2026-08-02",
      "condition",
      "the maintainers",
    ]);
  const { blocking } = evaluateAttributionRows(attributionRegisterRows(text));
  assert.equal(blocking.length, 1);
  assert.match(problems(blocking), /team label/);
});

test("a row complete except for its approver is a pending approval, not a block", () => {
  const rows = attributionRegisterRows(
    HEADER +
      row([
        "some-tool",
        "2.3.4",
        "symptom",
        "https://example.com/upstream/issues/3",
        "open",
        "repro",
        "2026-08-02",
        "condition",
        "",
      ]),
  );
  assert.equal(checkAttribution(rows).length, 0);
  assert.equal(pendingAttributionApprovals(rows).length, 1);
});

test("header, separator and placeholder rows are not data rows", () => {
  const text = HEADER + "| _No rows — nothing attributed yet_ |||||||||\n";
  assert.equal(attributionRegisterRows(text).length, 0);
});
