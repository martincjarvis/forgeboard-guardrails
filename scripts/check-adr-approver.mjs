// cspell:ignore GHSA licen
// Fix 22 — an ADR that accepts a risk, a licence, a suppression, or an
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
// literal — this repository's own suppression-register check (fix 15's
// self-flagging problem, check-suppressions.mjs's own SELF_URL guard) scans
// every tracked file's raw text for exactly these strings, and a plain
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
 *  Fix 54: this is a vocabulary fallback, not the primary signal — kept for
 *  an ADR no register row cites yet. The next ADR will use different words,
 *  and a detector that must anticipate an author's vocabulary is one that
 *  fails silently; see `citedAdrNumbers` below for the structural signal
 *  `checkAdrApprover` checks first. */
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

function cellsOf(line) {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

// Fix 54 — a register row citing an ADR in its Decision record column IS
// that ADR being used to accept a risk, licence, suppression or opt-out
// (registers.md: "names the ADR carrying the reasoning"). Following that
// pointer needs no vocabulary and cannot be evaded by rewording; extending
// the keyword list above instead would only ever cover the words already
// seen.

/** ADR numbers ("0004") cited in one register table's Decision record
 *  column — located by header name, not a fixed index, since only the
 *  dependency licence register carries this column today (registers.md)
 *  and another register's column order is not this function's business. A
 *  register with no such column contributes nothing. */
export function citedAdrNumbers(registerText) {
  const numbers = new Set();
  if (!registerText) return numbers;
  let decisionCol = -1;
  for (const line of registerText.split(/\r?\n/)) {
    if (!line.startsWith("|")) continue;
    const cells = cellsOf(line);
    if (decisionCol === -1) {
      const idx = cells.findIndex((c) => /^decision record$/i.test(c));
      if (idx !== -1) decisionCol = idx;
      continue; // the header row itself never carries a citation
    }
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue; // separator row
    for (const m of (cells[decisionCol] ?? "").matchAll(/ADR-0*(\d+)/gi)) {
      numbers.add(m[1].padStart(4, "0"));
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
function parseFrontmatter(text) {
  const fields = {};
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const block = fm?.[1] ?? "";
  for (const line of block.split(/\r?\n/)) {
    const m = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    const key = m?.[1];
    const val = m?.[2];
    if (key !== undefined && val !== undefined)
      fields[key.toLowerCase()] = val.trim();
  }
  return fields;
}

// Exported so check-approval-provenance.mjs (fix 49) can read the same two
// fields off a file's "before" and "after" content without re-implementing
// frontmatter parsing a second time.
export function frontmatterField(text, field) {
  return parseFrontmatter(text)[field.toLowerCase()] ?? "";
}

/** A team label, not a person — the exact shape audit 8 found
 *  (`owner: greet maintainers`): a role or group noun with no individual
 *  name attached. Heuristic, not exhaustive — a human name is whatever is
 *  left once these read as plainly not one. */
export function looksLikeTeamLabel(name) {
  if (!name) return true;
  return /\b(team|maintainers?|group|committee|everyone|anyone|bot|automation|agent)\b/i.test(
    name,
  );
}

/** Every finding: an Accepted ADR that accepts a risk, licence, suppression
 *  or opt-out, with no non-empty, non-team-label `approver` in its own
 *  frontmatter. `adrDir` and `registersDir` are injectable for testing, the
 *  same shape acceptedAdvisoryIds already takes.
 *
 *  Reserved-class is derived two ways, citation first: an ADR any register
 *  row cites in its Decision record column is reserved-class regardless of
 *  its wording (fix 54); an ADR no row cites yet falls back to the
 *  vocabulary check, for the case a risk is accepted in an ADR before any
 *  row exists to point at it. */
export function checkAdrApprover(
  adrDir = "docs/ADR",
  registersDir = REGISTERS_DIR,
) {
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
    const status = frontmatterField(text, "status");
    if (!/^Accepted$/i.test(status)) continue; // Proposed stays freely editable — ADR/README.md
    const number = /^(\d+)-/.exec(f)?.[1]?.padStart(4, "0");
    const citedByRegister = Boolean(number) && citedNumbers.has(number);
    if (!citedByRegister && !acceptsRiskLicenceSuppressionOrOptOut(text))
      continue;

    const approver = frontmatterField(text, "approver");
    if (!approver || looksLikeTeamLabel(approver)) {
      findings.push({
        check: "ADR approver",
        path,
        problem: approver
          ? `${path} is Accepted and reads as accepting a risk, licence, suppression or opt-out, but its approver ('${approver}') reads as a team label, not a person`
          : `${path} is Accepted and reads as accepting a risk, licence, suppression or opt-out, but has no approver field`,
        remedy:
          "add `approver: <a human's name>` to the frontmatter, naming the person who accepted this on the record — the same requirement a register row's Approver column already carries; an agent may not fill this in itself",
      });
    }
  }
  return findings;
}

const argv1 = process.argv[1];
const isMain = argv1 && import.meta.url === pathToFileURL(argv1).href;
if (isMain) {
  report("gate 2", checkAdrApprover(), []);
}
