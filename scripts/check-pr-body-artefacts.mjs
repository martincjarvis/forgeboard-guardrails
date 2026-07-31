// cspell:ignore GHSA Uncited
// Fix 68 — cross-gate-rules.md names five reserved classes a pull request
// may still open with findings outstanding — a decision record or register
// row accepting a risk, a licence, a suppression or an opt-out, and a
// conflict between two standing directives — and says plainly: "A finding
// the implementer could have fixed is a reason not to open yet, not a line
// item to disclose and open anyway." That sentence had no check behind it.
//
// Audit 17's case: a pull request opened findings under an invented sixth
// heading ("One tool limitation, documented rather than hidden") whose own
// text named the fix it declined to apply, and six dependency advisories
// beside it were called "a dependency-upgrade decision" with no ADR naming
// a GHSA id and no advisory register row anywhere — while the licence and
// suppression items in the same body did carry real, blank-approver
// register rows. A definition with no check is a suggestion; this is the
// check: every finding disclosed in a pull request body cites an artefact
// that already reserves it, or it should not have been disclosed at all.
//
// Deliberately a citation check, not a prose-honesty check
// (cross-gate-rules.md's own restraint, "never claim more than was
// checked" applied here rather than invented for it): this module does not
// judge whether disclosing a finding was the right call, or whether the
// reasoning given for it is sound — only whether the line names something
// that exists. A finding whose only defence is an invented sixth heading
// cannot cite a register row, a Proposed/Accepted ADR or a named directive
// conflict, because none of those exist for it yet; that is what "the five
// reserved classes are the complete list" means mechanically — anything
// outside them has nothing to point at.
//
// Two ways to reach the body it checks, so the check is not stuck reading
// a mistake after it has already shipped: `--file <path>` reads a draft
// body straight off disk, for the implementer's own pre-`gh pr create`
// check (skills/repository-bootstrap/SKILL.md, beside fix 65's own
// precondition); no `--file` falls back to `gh pr view` against an
// already-open pull request, for a reviewer checking one that exists
// (docs/standards/guardrails/gate-6-pull-request.md, "Running it by
// hand"). Same function either way — `findUncitedFindings` does not know
// or care which source supplied its text.
import { readdirSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { have, run, report } from "./lib.mjs";
import { frontmatterField } from "./check-adr-approver.mjs";
import { parseRegisterRows } from "./check-approval-provenance.mjs";

const ADR_DIR = "docs/ADR";
const REGISTERS_DIR = "docs/registers";

/** Every ADR number ("0004") whose own frontmatter status is Proposed or
 *  Accepted — the two states this corpus's own reserved-class exception
 *  (cross-gate-rules.md) names as an artefact a pull request may point at.
 *  A Superseded or Rejected ADR reserves nothing any more. `adrDir` is
 *  injectable, the same shape check-adr-approver.mjs's own reader takes. */
export function adrNumbersProposedOrAccepted(adrDir = ADR_DIR) {
  const numbers = new Set();
  let files;
  try {
    files = readdirSync(adrDir).filter(
      (f) => f.endsWith(".md") && f !== "README.md",
    );
  } catch {
    return numbers;
  }
  for (const f of files) {
    let text;
    try {
      text = readFileSync(`${adrDir}/${f}`, "utf8");
    } catch {
      continue;
    }
    const status = frontmatterField(text, "status");
    if (/^(Proposed|Accepted)$/i.test(status)) {
      const number = /^(\d+)-/.exec(f)?.[1]?.padStart(4, "0");
      if (number) numbers.add(number);
    }
  }
  return numbers;
}

/** Every register row's own identity (its first cell — the Code or
 *  Dependency name each register's convention already treats as the row's
 *  identity, registers.md) across every register file in `registersDir`.
 *  Reuses check-approval-provenance.mjs's parseRegisterRows rather than
 *  re-parsing the table, the same column convention that module already
 *  established. */
export function registerRowIdentities(registersDir = REGISTERS_DIR) {
  const identities = [];
  let files;
  try {
    files = readdirSync(registersDir).filter(
      (f) => f.endsWith(".md") && f !== "README.md",
    );
  } catch {
    return identities;
  }
  for (const f of files) {
    let text;
    try {
      text = readFileSync(`${registersDir}/${f}`, "utf8");
    } catch {
      continue;
    }
    for (const row of parseRegisterRows(text)) {
      const firstCell = row.identity.split("|")[0]?.trim();
      if (firstCell) identities.push(firstCell);
    }
  }
  return identities;
}

/** Does `lineText` cite one of the three reserved-class artefact shapes?
 *  Structural matches only — an ADR number that actually exists as
 *  Proposed or Accepted, a register row's own identity token, or the root
 *  instruction file's named conflict-reservation clause (AGENTS.md or
 *  CLAUDE.md, alongside the word "conflict") — never a judgement about
 *  whether the citation is a *good* one. `adrNumbers` and
 *  `registerIdentities` are injectable for testing, the same shape every
 *  other check in this module carries. */
export function citesReservedArtefact(
  lineText,
  { adrNumbers = new Set(), registerIdentities = [] } = {},
) {
  const adrMatch = /ADR-0*(\d+)/i.exec(lineText);
  if (adrMatch && adrNumbers.has(adrMatch[1].padStart(4, "0"))) return true;

  const lower = lineText.toLowerCase();
  if (
    registerIdentities.some(
      (identity) => identity && lower.includes(identity.toLowerCase()),
    )
  )
    return true;

  if (
    /\b(AGENTS\.md|CLAUDE\.md)\b/i.test(lineText) &&
    /\bconflict\b/i.test(lineText)
  )
    return true;

  return false;
}

// A pull request body's disclosed-findings section, in the shape fix
// 56/61/65 already require of it: a heading naming outstanding, reserved
// or remaining work — or the bold-only pseudo-heading shape audit 17's own
// invented class took ("**One tool limitation, documented rather than
// hidden**") — followed by one bullet per finding. Scoped to that shape
// deliberately: a body that abandons the required bulleted-list format for
// free narrative prose is already the defect fix 56/61 exist to catch, and
// this module does not additionally try to parse prose for it.
const SECTION_HEADING_RE =
  /^#{1,6}\s.*\b(outstanding|reserved|remain(?:ing|s)?|finding)/i;
const ANY_HEADING_RE = /^#{1,6}\s/;
const BOLD_LABEL_RE = /^\*\*[^*]+\*\*\s*$/;

/** Bullet lines inside a disclosed-findings section of `body`. Returns
 *  [{ line, text }], 1-indexed. */
export function disclosedFindingLines(body) {
  const lines = body.split(/\r?\n/);
  const findings = [];
  let inSection = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (SECTION_HEADING_RE.test(line) || BOLD_LABEL_RE.test(line)) {
      inSection = true;
      continue;
    }
    if (ANY_HEADING_RE.test(line)) {
      inSection = false;
      continue;
    }
    if (!inSection) continue;
    const m = /^[-*]\s+(.*)$/.exec(line);
    if (m) findings.push({ line: i + 1, text: m[1] });
  }
  return findings;
}

/** Every disclosed finding in `body` with no reserved-class artefact
 *  cited. `artefacts` is `{ adrNumbers, registerIdentities }`, both
 *  injectable for testing. */
export function findUncitedFindings(body, artefacts = {}) {
  return disclosedFindingLines(body)
    .filter((f) => !citesReservedArtefact(f.text, artefacts))
    .map((f) => ({
      check: "pull request finding citation",
      path: "",
      problem:
        `line ${f.line} of the pull request body discloses a finding ` +
        `("${f.text.slice(0, 120)}${f.text.length > 120 ? "…" : ""}") with ` +
        "no register row, Proposed/Accepted ADR or root-instruction-file " +
        "conflict record cited — a finding with no artefact behind it is " +
        "outstanding, not reserved",
      remedy:
        "fix the finding before opening the pull request, or cite the register row, ADR or directive-conflict record that reserves it",
    }));
}

/** The pull request body text to check: `--file <path>` reads a draft body
 *  straight off disk — no `gh`, no pull request required, so the
 *  implementer's own draft can be checked before `gh pr create` ever sees
 *  it (a check that can only run after the mistake has been made cannot
 *  prevent it). With no `--file`, falls back to `gh pr view` against an
 *  already-open pull request (`argv[1]`, if given, is the PR number) — the
 *  reviewer-facing path, for a body that already exists live. Returns
 *  `null` on a real failure to read either source; the caller reports that
 *  as a skip, never as zero findings.
 *  @param {readonly string[]} args
 *  @param {{
 *    have?: (command: string, args?: readonly string[]) => boolean,
 *    run?: (command: string, args: readonly string[], options?: object) => {status: number|null, stdout?: string, stderr?: string},
 *  }} [deps]
 */
export function readPrBody(
  args,
  { have: haveFn = have, run: runFn = run } = {},
) {
  const fileIdx = args.indexOf("--file");
  if (fileIdx !== -1) {
    const path = args[fileIdx + 1];
    try {
      return { body: readFileSync(path, "utf8"), skip: null };
    } catch (err) {
      return { body: null, skip: `could not read ${path}: ${err.message}` };
    }
  }
  if (!haveFn("gh", ["--version"])) {
    return { body: null, skip: "gh not on PATH" };
  }
  const ghArgs = args[0] ? ["pr", "view", args[0]] : ["pr", "view"];
  const view = runFn("gh", [...ghArgs, "--json", "body", "-q", ".body"]);
  if (view.status !== 0) {
    return {
      body: null,
      skip: `gh pr view failed: ${(view.stderr || "").trim().split("\n")[0]}`,
    };
  }
  return { body: view.stdout || "", skip: null };
}

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const { body, skip } = readPrBody(process.argv.slice(2));
  if (skip) {
    process.stderr.write(
      `gate 6: SKIP pull request finding citation — ${skip}\n`,
    );
    process.exit(0);
  }
  const findings = findUncitedFindings(body, {
    adrNumbers: adrNumbersProposedOrAccepted(),
    registerIdentities: registerRowIdentities(),
  });
  report("gate 6", findings, []);
}
