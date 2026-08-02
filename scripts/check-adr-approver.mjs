// cspell:ignore GHSA licen
// An ADR that accepts a risk, a licence, a suppression, or an
// opt-out needs a human named in its own frontmatter, exactly the
// requirement registers.md and bypass-and-exceptions.md already state for a
// register row (registers.md: "every row names a human approver, and no
// automated worker appears in that column"; bypass-and-exceptions.md: "no
// worker approves its own exception. The approver column is a human's.").
// docs/ADR/README.md's own frontmatter schema — status | decided | owner |
// supersedes | superseded_by — has no approver field at all, and `owner`
// ("who owns the consequences") is deliberately allowed to be a team label.
// An agent that accepts exactly this class of decision through an ADR
// instead of a register row previously cleared every gate with nothing that
// named a person: `owner: greet maintainers`, `status: Accepted`, same
// commit, ten previously-blocking licence findings cleared.
//
// Detection is content-based, not a self-declared field: the implementer
// who most needs this caught is the one who would not tick a box saying
// "this needs a human." acceptedAdvisoryIds (check-dependency-advisories.mjs)
// already applies exactly this reasoning to one of the four classes — any
// GHSA id anywhere in an Accepted ADR — extended here to the other three,
// each recognised by the vocabulary the standards themselves use for it.
import { readdirSync, readFileSync } from "node:fs";
import { report } from "./lib.mjs";
import { pathToFileURL } from "node:url";

const GHSA_RE = /GHSA-[a-zA-Z0-9]+-[a-zA-Z0-9]+-[a-zA-Z0-9]+/;
const LICENCE_RE = /licen[cs]e/i;
const ALLOW_LIST_RE = /allow[- ]list/i;
const OPT_OUT_RE = /\bopt(?:s|ed|ing)?[- ]?out\b/i;
const SUPPRESSION_WORD_RE = /\bsuppress(?:ion|ed|es)?\b/i;
// The four inline-suppression marker names themselves (bypass-and-exceptions.md's
// own list), each built by concatenation rather than typed as a contiguous
// literal — this repository's own suppression-register check
// (check-suppressions.mjs, which guards its own text with a SELF_URL marker)
// scans every tracked file's raw text for exactly these strings, and a plain
// literal here would read as an unregistered directive of this module's own.
const SUPPRESSION_MARKER_STRINGS = [
  "eslint" + "-disable",
  "no" + "semgrep",
  "secretlint" + "-disable",
  "markdownlint" + "-disable",
  "ts-expect-error", // no leading @: bare text is enough to read as prose about it
  "pragma warning disable",
];

/** True when an ADR's own text reads as accepting a risk (an advisory), a
 *  licence outside (or extending) the allow list, a suppression, or an
 *  opt-out from a check — the four classes registers.md and
 *  bypass-and-exceptions.md already reserve for a human, regardless of
 *  which artefact records the decision. An ordinary design ADR — this
 *  toolkit's own 0001-0003 among them — mentions none of this vocabulary
 *  and is correctly left alone.
 *
 *  This is a vocabulary fallback, not the primary signal — kept for
 *  an ADR no register row cites yet. The next ADR will use different words,
 *  and a detector that must anticipate an author's vocabulary is one that
 *  fails silently; see `citedAdrNumbers` below for the structural signal
 *  `checkAdrApprover` checks first.
 *  @param {string} text @returns {boolean} */
export function acceptsRiskLicenceSuppressionOrOptOut(text) {
  return (
    GHSA_RE.test(text) ||
    (LICENCE_RE.test(text) && ALLOW_LIST_RE.test(text)) ||
    SUPPRESSION_WORD_RE.test(text) ||
    SUPPRESSION_MARKER_STRINGS.some((marker) => text.includes(marker)) ||
    OPT_OUT_RE.test(text)
  );
}

const REGISTERS_DIR = "docs/registers";

/** @param {string} line @returns {string[]} */
function cellsOf(line) {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

// A register row citing an ADR in its Decision record column IS
// that ADR being used to accept a risk, licence, suppression or opt-out
// (registers.md: "names the ADR carrying the reasoning"). Following that
// pointer needs no vocabulary and cannot be evaded by rewording; extending
// the keyword list above instead would only ever cover the words already
// seen.

/** ADR numbers ("0004") cited in one register table's Decision record
 *  column — located by header name, not a fixed index, since only the
 *  dependency licence register carries this column today (registers.md)
 *  and another register's column order is not this function's business. A
 *  register with no such column contributes nothing.
 *  @param {string} registerText */
export function citedAdrNumbers(registerText) {
  const numbers = new Set();
  if (!registerText) return numbers;
  let decisionCol = -1;
  for (const line of registerText.split(LINE_BREAK)) {
    if (!line.startsWith("|")) continue;
    const cells = cellsOf(line);
    if (decisionCol === -1) {
      const idx = cells.findIndex((c) => DECISION_RECORD_HEADING.test(c));
      if (idx !== -1) decisionCol = idx;
      continue; // the header row itself never carries a citation
    }
    if (cells.every((c) => SEPARATOR_CELL.test(c))) continue; // separator row
    for (const m of (cells[decisionCol] ?? "").matchAll(ADR_CITATION)) {
      const num = m[1];
      if (num) numbers.add(num.padStart(4, "0"));
    }
  }
  return numbers;
}

/** Every ADR number cited by any register row's Decision record column,
 *  across every register file in `registersDir` (excluding its README, the
 *  same exclusion `checkAdrApprover` already applies to `adrDir`). Missing
 *  or unreadable registers contribute nothing rather than failing the scan
 *  — the same fail-open shape `checkAdrApprover` already uses for a missing
 *  ADR directory. */
export function adrNumbersCitedByRegisters(registersDir = REGISTERS_DIR) {
  const numbers = new Set();
  let files;
  try {
    files = readdirSync(registersDir).filter(
      (f) => f.endsWith(".md") && f !== "README.md",
    );
  } catch {
    return numbers;
  }
  for (const f of files) {
    let text;
    try {
      text = readFileSync(`${registersDir}/${f}`, "utf8");
    } catch {
      continue;
    }
    for (const n of citedAdrNumbers(text)) numbers.add(n);
  }
  return numbers;
}

// A hardcoded pattern applied per line, not a per-field RegExp built from
// interpolated input — semgrep's detect-non-literal-regexp rule flags the
// latter as a ReDoS surface even though `field` here is always one of this
// module's own two hardcoded lookups ("status", "approver"), never
// untrusted input. Parsing once into a flat map, scoped to the actual
// `---` frontmatter block, is both the fix and a correctness improvement:
// the field lookup this replaced searched the whole file, so a document
// whose body happened to contain a line starting "status:" outside the
// frontmatter would have matched that instead.
// Hoisted for the same reason as check-suppressions.mjs's DELIMITER_RUN: a
// regex literal inline in a function body defeats lizard's JS span detection,
// which then reports the enclosing function running to the end of the file.
const FRONTMATTER_BLOCK = /^---\r?\n([\s\S]*?)\r?\n---/;
const LINE_BREAK = /\r?\n/;
const FIELD_LINE = /^([A-Za-z][\w-]*):\s*(.*)$/;
const DECISION_RECORD_HEADING = /^decision record$/i;
const SEPARATOR_CELL = /^:?-+:?$/;
const ADR_CITATION = /ADR-0*(\d+)/gi;

/** @param {string} text @returns {Record<string, string>} */
function parseFrontmatter(text) {
  /** @type {Record<string, string>} */
  const fields = {};
  const fm = FRONTMATTER_BLOCK.exec(text);
  const block = fm?.[1] ?? "";
  for (const line of block.split(LINE_BREAK)) {
    const m = FIELD_LINE.exec(line);
    const key = m?.[1];
    const val = m?.[2];
    if (key !== undefined && val !== undefined)
      fields[key.toLowerCase()] = val.trim();
  }
  return fields;
}

// Exported so check-approval-provenance.mjs can read the same two
// fields off a file's "before" and "after" content without re-implementing
// frontmatter parsing a second time.
/** @param {string} text @param {string} field @returns {string} */
export function frontmatterField(text, field) {
  return parseFrontmatter(text)[field.toLowerCase()] ?? "";
}

/** A team label, not a person — the demonstrated shape
 *  (`owner: greet maintainers`): a role or group noun with no individual
 *  name attached. Heuristic, not exhaustive — a human name is whatever is
 *  left once these read as plainly not one.
 *  @param {string} name @returns {boolean} */
export function looksLikeTeamLabel(name) {
  if (!name) return true;
  return /\b(team|maintainers?|group|committee|everyone|anyone|bot|automation|agent)\b/i.test(
    name,
  );
}

/** One ADR's finding, or `null` when it is not reserved-class or already
 *  carries a human approver. The per-file half of `checkAdrApprover`, split
 *  out so the loop reads as iteration and the verdict reads as judgement.
 *  Reserved-class is derived two ways, citation first: an ADR any register
 *  row cites in its Decision record column is reserved-class regardless of
 *  its wording; an ADR no row cites yet falls back to the vocabulary check,
 *  for the case a risk is accepted in an ADR before any row exists to point
 *  at it.
 *  @param {string} path @param {string} text @param {string} filename @param {Set<string>} citedNumbers
 *  @returns {{ check: string, path: string, problem: string, remedy: string } | null} */
function adrApproverFinding(path, text, filename, citedNumbers) {
  const status = frontmatterField(text, "status");
  if (!/^Accepted$/i.test(status)) return null; // Proposed stays freely editable — ADR/README.md
  const number = /^(\d+)-/.exec(filename)?.[1]?.padStart(4, "0");
  const citedByRegister = number !== undefined && citedNumbers.has(number);
  if (!citedByRegister && !acceptsRiskLicenceSuppressionOrOptOut(text))
    return null;
  const approver = frontmatterField(text, "approver");
  if (!approver || looksLikeTeamLabel(approver)) {
    return {
      check: "ADR approver",
      path,
      problem: approver
        ? `${path} is Accepted and reads as accepting a risk, licence, suppression or opt-out, but its approver ('${approver}') reads as a team label, not a person`
        : `${path} is Accepted and reads as accepting a risk, licence, suppression or opt-out, but has no approver field`,
      remedy:
        "add `approver: <a human's name>` to the frontmatter, naming the person who accepted this on the record — the same requirement a register row's Approver column already carries; an agent may not fill this in itself",
    };
  }
  return null;
}

/** Every finding: an Accepted ADR that accepts a risk, licence, suppression
 *  or opt-out, with no non-empty, non-team-label `approver` in its own
 *  frontmatter. `adrDir` and `registersDir` are injectable for testing, the
 *  same shape acceptedAdvisoryIds already takes. */
export function checkAdrApprover(
  adrDir = "docs/ADR",
  registersDir = REGISTERS_DIR,
) {
  /** @type {{ check: string, path: string, problem: string, remedy: string }[]} */
  const findings = [];
  let files;
  try {
    files = readdirSync(adrDir).filter(
      (f) => f.endsWith(".md") && f !== "README.md",
    );
  } catch {
    return findings;
  }
  const citedNumbers = adrNumbersCitedByRegisters(registersDir);
  for (const f of files) {
    const path = `${adrDir}/${f}`;
    let text;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    const finding = adrApproverFinding(path, text, f, citedNumbers);
    if (finding) findings.push(finding);
  }
  return findings;
}

const argv1 = process.argv[1];
const isMain = argv1 && import.meta.url === pathToFileURL(argv1).href;
if (isMain) {
  report("gate 2", checkAdrApprover(), []);
}
