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
 *  and is correctly left alone. */
export function acceptsRiskLicenceSuppressionOrOptOut(text) {
  return (
    GHSA_RE.test(text) ||
    (LICENCE_RE.test(text) && ALLOW_LIST_RE.test(text)) ||
    SUPPRESSION_WORD_RE.test(text) ||
    SUPPRESSION_MARKER_STRINGS.some((marker) => text.includes(marker)) ||
    OPT_OUT_RE.test(text)
  );
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
  const block = fm ? fm[1] : "";
  for (const line of block.split(/\r?\n/)) {
    const m = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (m) fields[m[1].toLowerCase()] = m[2].trim();
  }
  return fields;
}

function frontmatterField(text, field) {
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
 *  frontmatter. `adrDir` is injectable for testing, the same shape
 *  acceptedAdvisoryIds already takes. */
export function checkAdrApprover(adrDir = "docs/ADR") {
  const findings = [];
  let files;
  try {
    files = readdirSync(adrDir).filter(
      (f) => f.endsWith(".md") && f !== "README.md",
    );
  } catch {
    return findings;
  }
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
    if (!acceptsRiskLicenceSuppressionOrOptOut(text)) continue;

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

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  report("gate 2", checkAdrApprover(), []);
}
