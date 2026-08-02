// A third-party attribution is a claim, and it needs an open ticket.
//
// "It is a tool bug" is the cheapest available excuse for not fixing your own
// code: a suspected defect in a third-party tool may be recorded as *verified*
// only when a register row carries a link to an open upstream ticket. Where no
// open ticket exists, the defect is assumed to be ours, and we resolve it
// (cross-gate-rules.md). This check is the mechanical form of the row-shape
// half of that rule: every row in the attribution register carries an upstream
// ticket URL and records its state, or is explicitly marked as unattributed.
//
// Offline by design. A gate that fetches the URL to confirm it resolves is a
// gate people route around, and this corpus already refuses a check that needs
// the network (cross-gate-rules.md). The check verifies presence and shape;
// whether the ticket is still open, and whether the link still resolves, is
// freshness a human checks at review, not a property a gate fetches at commit.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { report } from "./lib.mjs";
import { looksLikeTeamLabel } from "./check-adr-approver.mjs";

export const REGISTER = "docs/registers/third-party-attribution-register.md";

// A row may record a measured defect we treat as OURS rather than a verified
// third-party attribution — the rule's default state, carried explicitly so an
// empty Upstream ticket cell reads as "someone forgot the URL" (refused) rather
// than as "no attribution claimed" (allowed). The sentinel is the difference.
const UNATTRIBUTED = "unattributed";

// Ticket state is recorded, not fetched: a closed ticket does not verify a live
// defect (the fix may already be released), so the rule treats closed as a
// prompt to revisit, never as a second form of "verified". Both states are
// valid rows; the difference is what a reader does next.
const TICKET_STATES = new Set(["open", "closed"]);

const URL_RE = /^https?:\/\/\S+$/i;

/** One register row as a fully-parsed object, or null when the line is not a
 *  data row (blank, separator, header, or placeholder). Columns: Tool |
 *  Version | Symptom | Upstream ticket | Ticket state | Minimal reproduction |
 *  Date verified | Removable when | Approved by (registers.md).
 *  @param {string} line
 *  @returns {{
 *   tool: string, version: string, symptom: string, upstreamTicket: string,
 *   ticketState: string, minimalReproduction: string, dateVerified: string,
 *   removableWhen: string, approver: string,
 * } | null} */
function parseAttributionRow(line) {
  if (!line.startsWith("|")) return null;
  const cells = cellsOf(line);
  if (cells.length < 2) return null;
  if (isSeparator(cells)) return null;
  const tool = (cells[0] ?? "").trim();
  if (!tool || tool.startsWith("_") || /^No rows/i.test(tool)) return null;
  const get = (/** @type {number} */ i) => (cells[i] ?? "").trim();
  return {
    tool,
    version: get(1),
    symptom: get(2),
    upstreamTicket: get(3),
    ticketState: get(4),
    minimalReproduction: get(5),
    dateVerified: get(6),
    removableWhen: get(7),
    approver: get(8),
  };
}

/** Every register row, fully parsed. `text` is injectable so the pure
 *  evaluation below is testable without a git repository; the production path
 *  (no argument) reads the real register. The header row is skipped the same
 *  way `parseRegisterRows` (check-approval-provenance.mjs) skips it — by
 *  looking one line ahead for the `| --- |` separator that always follows it —
 *  so the parser does not depend on the columns being named what they are today.
 *  @param {string} [text] */
export function attributionRegisterRows(text) {
  if (text === undefined) {
    try {
      text = readFileSync(REGISTER, "utf8");
    } catch {
      return [];
    }
  }
  const lines = text.split("\n");
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const next = lines[i + 1] ?? "";
    if (next.startsWith("|") && isSeparator(cellsOf(next))) continue; // header row
    const row = parseAttributionRow(line);
    if (row) rows.push(row);
  }
  return rows;
}

/** @param {string[]} cells */
function isSeparator(cells) {
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

/** Every column of a register row, the same completeness discipline
 *  check-suppressions.mjs applies to its register. Returns `{ blocking,
 *  pendingApproval }`. `blocking` rows are refused outright — a missing
 *  required column, an upstream ticket cell that is empty, malformed, or a URL
 *  with no recorded state, or an approver that reads as a team label or a
 *  machine. `pendingApproval` rows are otherwise complete with only the
 *  approver blank: a push back at gate 2, a block at gate 6, the same split
 *  every other register holds.
 *  @param {{
 *   tool: string, version: string, symptom: string, upstreamTicket: string,
 *   ticketState: string, minimalReproduction: string, dateVerified: string,
 *   removableWhen: string, approver: string,
 * }[]} rows */
export function evaluateAttributionRows(rows) {
  const blocking = [];
  const pendingApproval = [];
  // The plain-required columns: present-and-non-empty, no shape to check. Looped
  // rather than one if per column — the six identical branches were what pushed
  // this function past the eslint complexity limit, and the loop is the same
  // check with one decision point.
  const required = (
    /** @type {{ tool: string, version: string, symptom: string, minimalReproduction: string, dateVerified: string, removableWhen: string }} */ row,
  ) => [
    ["Tool", row.tool],
    ["Version", row.version],
    ["Symptom", row.symptom],
    ["Minimal reproduction", row.minimalReproduction],
    ["Date verified", row.dateVerified],
    ["Removable when", row.removableWhen],
  ];
  for (const row of rows) {
    const missing = [];
    for (const [label, value] of required(row)) {
      if (!value) missing.push(label);
    }
    // The headline refusal: an empty Upstream ticket cell reads as "claims a
    // third-party defect but cites no ticket", which the rule refuses. A URL
    // must be accompanied by a recorded state; the `unattributed` sentinel is
    // the one non-URL value accepted, because it is explicitly NOT a claim of
    // a third-party defect.
    if (!row.upstreamTicket) {
      missing.push(
        "Upstream ticket (empty — a row naming a tool must cite an open upstream ticket URL, or carry '" +
          UNATTRIBUTED +
          "' to record the defect as ours with no attribution)",
      );
    } else if (row.upstreamTicket !== UNATTRIBUTED) {
      if (!URL_RE.test(row.upstreamTicket)) {
        missing.push(
          `Upstream ticket ('${row.upstreamTicket}' is neither an http(s) URL nor the '${UNATTRIBUTED}' sentinel)`,
        );
      } else if (!TICKET_STATES.has(row.ticketState)) {
        missing.push(
          `Ticket state ('${row.ticketState || "(empty)"}' — must be one of: ${[...TICKET_STATES].join(", ")})`,
        );
      }
    }
    if (missing.length) {
      blocking.push({
        check: "third-party attribution register",
        path: REGISTER,
        problem: `row for '${row.tool}' is missing ${missing.join("; ")}`,
        remedy:
          "complete the row before the attribution it records can be relied on — an open upstream ticket URL with its state, or '" +
          UNATTRIBUTED +
          "' for a defect treated as ours",
      });
      continue;
    }
    if (!row.approver) {
      pendingApproval.push(row);
      continue;
    }
    if (looksLikeTeamLabel(row.approver)) {
      blocking.push({
        check: "third-party attribution register",
        path: REGISTER,
        problem: `row for '${row.tool}' names '${row.approver}' as approver, which reads as a team label, not a person`,
        remedy: "name the individual human who accepted this attribution",
      });
    }
  }
  return { blocking, pendingApproval };
}

/** Rows complete except for approval, as data. Gate 2 prints these as a push
 *  back — allowed to commit, visible, unresolved; gate 6 reads the same list
 *  and blocks instead.
 *  @param {{ tool: string, version: string, symptom: string, upstreamTicket: string, ticketState: string, minimalReproduction: string, dateVerified: string, removableWhen: string, approver: string }[]} [rows] */
export function pendingAttributionApprovals(rows) {
  return evaluateAttributionRows(rows ?? attributionRegisterRows())
    .pendingApproval;
}

/** The check itself, pure and injectable. `rows` defaults to the real register.
 *  @param {{ tool: string, version: string, symptom: string, upstreamTicket: string, ticketState: string, minimalReproduction: string, dateVerified: string, removableWhen: string, approver: string }[]} [rows] */
export function checkAttribution(rows) {
  return evaluateAttributionRows(rows ?? attributionRegisterRows()).blocking;
}

/** @param {string} row */
function cellsOf(row) {
  return row
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

// `looksLikeTeamLabel` is check-adr-approver.mjs's own "person, not a team
// label" judgement, shared rather than re-implemented — the same reuse
// check-suppressions.mjs already makes for the suppression register.

const argv1 = process.argv[1];
const isMain = argv1 && import.meta.url === pathToFileURL(argv1).href;
if (isMain) {
  const findings = checkAttribution();
  for (const row of pendingAttributionApprovals()) {
    process.stderr.write(
      `attribution: PUSH BACK '${row.tool}' has no approver; every other column is complete\n`,
    );
  }
  report("gate 2", findings);
}
