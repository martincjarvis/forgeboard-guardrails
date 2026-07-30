// Fix 49 — approval is an event, not a field.
//
// Audit 13, on a bootstrapped repository: an ADR arrived `status: Accepted`,
// `approver: <a person's name>`, byte-identical to this toolkit's own record;
// three dependency-licence rows and two suppression rows named the same
// person; all six landed already approved, inside the single bootstrap
// commit, hours after that person approved the identical text in a
// *different* repository. check-adr-approver.mjs, check-suppressions.mjs and
// check-licence-policy.mjs all exited 0, because none of them reads git
// history — each reads only the current text, which cannot tell a name a
// human typed from a name an agent copied.
//
// Stamping a repository name into the artefact would be copied along with
// everything else; the defect is that the corpus treats approval as a field
// that can be filled, when it is an event that has to happen. This module
// checks the event instead of the field: **an approval is recorded in a
// commit distinct from the one that introduces what it approves.** A row or
// a decision record that arrives already approved, in the same commit that
// created it, has not been reviewed by anyone — whoever is named. This is
// mechanically checkable from git history alone: the copy lands in one
// commit, so the approval must follow in another.
//
// Two artefact shapes, one rule, applied by comparing a file's content
// immediately before a commit to its content after:
//   - An ADR: the whole file either existed before (an approval added later
//     is a distinct event) or it did not (the approval landed with the
//     ADR itself).
//   - A register row: identified by its first two cells — Code+Scope for a
//     suppression row, Dependency+Version for a licence row — the same pair
//     each register's own convention already treats as the row's identity
//     (registers.md: "A row is specific. One rule, one dependency, one
//     test, at one path"). A row's later cells (justification, decision
//     record, approver) may all change between commits without it becoming
//     a different row — exactly the shape a real approval takes: the row is
//     filed first with its approver cell blank, and a later, separate
//     commit fills only that cell (verified against this repository's own
//     history below).
//
// Wired blocking at gate 2 (checkApprovalProvenanceStaged, staged vs HEAD)
// and gate 6 (checkApprovalProvenanceRange, per commit in the pull request's
// range) — both only ever examine commits going forward, so adding this
// check cannot retroactively refuse anything already merged. The CLI's
// `--commit <sha>` mode is the blunt instrument checkpoint 4 asks for: run
// by hand against one named commit (the bootstrap commit, say) as a manual
// audit step, without needing a full-history sweep that would otherwise flag
// a repository's own earlier, legitimately single-commit decisions forever.
import { run, splitLines, report } from "./lib.mjs";
import {
  acceptsRiskLicenceSuppressionOrOptOut,
  looksLikeTeamLabel,
  frontmatterField,
} from "./check-adr-approver.mjs";
import { pathToFileURL } from "node:url";

const REGISTERS_DIR = "docs/registers";

/** Is `path` an ADR under `adrDir`, excluding the index? */
export function isAdrPath(path, adrDir = "docs/ADR") {
  return (
    path.startsWith(`${adrDir}/`) &&
    path.endsWith(".md") &&
    !path.endsWith("/README.md")
  );
}

/** Is `path` a register file, excluding an index the directory might carry? */
export function isRegisterPath(path, registersDir = REGISTERS_DIR) {
  return (
    path.startsWith(`${registersDir}/`) &&
    path.endsWith(".md") &&
    !path.endsWith("/README.md")
  );
}

function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

function cellsOf(line) {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/** Every row in a register's markdown table, as `{ identity, approver }` —
 *  `identity` is the first two cells, lower-cased (Code+Scope, or
 *  Dependency+Version; generic across every register shape, since Approver
 *  is always the last column per registers.md's shared column set), and
 *  `approver` is the last cell. The header row is skipped by looking one
 *  line ahead for the `| --- |` separator that always follows it, rather
 *  than matching specific column names — a form that works unmodified for
 *  any register this repository or a consumer adds, not only the two named
 *  in the audit. */
export function parseRegisterRows(text) {
  if (!text) return [];
  const lines = text.split("\n");
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("|")) continue;
    const cells = cellsOf(line);
    if (isSeparatorRow(cells)) continue;
    const next = lines[i + 1] ?? "";
    if (next.startsWith("|") && isSeparatorRow(cellsOf(next))) continue; // header row
    if (cells.length < 3) continue;
    const first = cells[0];
    if (!first || first.startsWith("_") || /^No rows/i.test(first)) continue;
    rows.push({
      identity: `${cells[0]}|${cells[1] ?? ""}`.trim().toLowerCase(),
      approver: (cells[cells.length - 1] ?? "").trim(),
    });
  }
  return rows;
}

/** The ADR half of the rule: `afterText` is the file's content in the commit
 *  under test, `beforeText` is its content immediately before (`null` when
 *  the file did not exist yet — the file was introduced by this commit).
 *  Returns one finding or `null`. Deliberately silent on an ADR missing its
 *  approver entirely — check-adr-approver.mjs already owns that finding;
 *  this only fires once an approver is actually present, asking whether the
 *  commit that supplied it is the same one that supplied the file. */
export function newlyApprovedAdrFinding(path, beforeText, afterText) {
  if (afterText === null || afterText === undefined) return null;
  if (beforeText !== null && beforeText !== undefined) return null; // the file already existed — an approval here is a distinct event
  const status = frontmatterField(afterText, "status");
  if (!/^Accepted$/i.test(status)) return null;
  if (!acceptsRiskLicenceSuppressionOrOptOut(afterText)) return null;
  const approver = frontmatterField(afterText, "approver");
  if (!approver || looksLikeTeamLabel(approver)) return null;
  return {
    check: "approval provenance",
    path,
    problem:
      `${path} is Accepted, names '${approver}' as approver, and reads as ` +
      "accepting a risk, licence, suppression or opt-out — but the file did " +
      "not exist before this commit, so the approval arrived in the same " +
      "commit as the record it approves",
    remedy:
      "commit the record first as `status: Proposed` with no approver, then accept it in a later, separate commit — the same two-step a register row's approver already requires",
  };
}

/** The register half of the rule: every row present in `afterText` with a
 *  non-empty, non-team-label approver whose identity does not appear at all
 *  in `beforeText` — a row that is brand new in this commit and already
 *  carries an approver could not have been reviewed by the name it names. */
export function newlyApprovedRegisterRowFindings(path, beforeText, afterText) {
  const beforeIdentities = new Set(
    parseRegisterRows(beforeText).map((r) => r.identity),
  );
  const findings = [];
  for (const row of parseRegisterRows(afterText)) {
    if (!row.approver || looksLikeTeamLabel(row.approver)) continue;
    if (beforeIdentities.has(row.identity)) continue;
    findings.push({
      check: "approval provenance",
      path,
      problem:
        `a row identified by '${row.identity}' in ${path} names '${row.approver}' ` +
        "as approver, but no row with that identity existed before this commit — " +
        "it arrived already approved in the same commit that introduced it",
      remedy:
        "commit the row with its Approver cell blank first, then approve it in a later, separate commit — gate 2's push back and gate 6's block already expect this two-step for an incomplete row",
    });
  }
  return findings;
}

/** One path's findings, dispatched by shape. `readBefore`/`readAfter` each
 *  return the file's text, or `null` when it does not exist at that point. */
function findingsForPath(path, readBefore, readAfter, adrDir) {
  if (isAdrPath(path, adrDir)) {
    const f = newlyApprovedAdrFinding(path, readBefore(path), readAfter(path));
    return f ? [f] : [];
  }
  if (isRegisterPath(path)) {
    return newlyApprovedRegisterRowFindings(
      path,
      readBefore(path) ?? "",
      readAfter(path) ?? "",
    );
  }
  return [];
}

/** Gate 2 usage: every staged path, compared against HEAD. `readBefore` and
 *  `readAfter` are injectable so the pure dispatch above is testable without
 *  a real repository; the production defaults (isMain, below) read `git show
 *  HEAD:<path>` and `git show :<path>` (the staged blob), the same two forms
 *  every other staged-content check in this repository already reads from. */
export function checkApprovalProvenanceStaged({
  stagedFiles,
  readBefore,
  readAfter,
  adrDir = "docs/ADR",
}) {
  const findings = [];
  for (const path of stagedFiles) {
    findings.push(...findingsForPath(path, readBefore, readAfter, adrDir));
  }
  return findings;
}

/** Gate 6 usage: every non-merge commit in `logRange` (the same `base..HEAD`
 *  two-dot form check-scope.mjs's checkCommitRange already uses), each
 *  compared against its own parent — not the range's endpoints as one diff,
 *  which would treat two separate, legitimate commits (one filing a row, a
 *  later one approving it) as a single suspicious change. `git()` is
 *  injectable for the same reason lib.mjs's other range-scoped checks take
 *  one, defaulting to lib.mjs's own cross-platform `run`. */
export function checkApprovalProvenanceRange(
  logRange,
  { adrDir = "docs/ADR", runGit = run } = {},
) {
  const findings = [];
  const shas = runGit("git", ["log", logRange, "--no-merges", "--format=%H"]);
  if (shas.status !== 0) return findings;
  for (const sha of splitLines(shas.stdout)) {
    const diff = runGit("git", [
      "diff-tree",
      "--no-commit-id",
      "--name-only",
      "-r",
      sha,
    ]);
    const files = diff.status === 0 ? splitLines(diff.stdout) : [];
    const short = sha.slice(0, 8);
    const readAt = (ref) => (path) => {
      const r = runGit("git", ["show", `${ref}:${path}`]);
      return r.status === 0 ? r.stdout : null;
    };
    // `~1`, not `^`: lib.mjs's `run` spawns through `cmd.exe` on Windows
    // (`shell: true`, required for npm's `.cmd` shims), and `^` is cmd's own
    // escape character — an unquoted `^` in a shelled-out argument list is
    // silently swallowed before git ever sees it, turning `sha^..sha` into
    // `sha..sha`, an empty range, on that platform only. `~1` carries no
    // meaning to cmd and reaches git unchanged everywhere.
    const readBefore = readAt(`${sha}~1`);
    const readAfter = readAt(sha);
    for (const path of files) {
      for (const f of findingsForPath(path, readBefore, readAfter, adrDir)) {
        findings.push({ ...f, path: `${short} ${f.path}` });
      }
    }
  }
  return findings;
}

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  // Checkpoint 4, the blunt instrument: run by hand against one commit —
  // `node scripts/check-approval-provenance.mjs --commit <sha>` (default
  // HEAD) — to confirm a specific commit (a bootstrap commit under review)
  // filled no approver field for anything it also introduced. Not a
  // full-history sweep: this repository's own history already carries a
  // legitimate single-commit accept (an ADR a human wrote and accepted in
  // one sitting), which a sweep run unconditionally over all of history
  // would flag forever with nothing anyone could do about it.
  const args = process.argv.slice(2);
  const idx = args.indexOf("--commit");
  const commit = idx !== -1 && args[idx + 1] ? args[idx + 1] : "HEAD";
  const findings = checkApprovalProvenanceRange(`${commit}~1..${commit}`);
  report("approval provenance", findings);
}
