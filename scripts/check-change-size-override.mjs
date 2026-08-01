// cspell:ignore ccd
// Fix 74 — [large-pr] is a human decision an agent may propose and never take.
//
// hooks/gate-4-task-completion.mjs's own OVERRIDE check was, before this fix,
// `!log.stdout.includes(OVERRIDE)` — pure string presence, satisfied by any
// commit on the branch, from any author, with no reason and no approver.
// Audit 18's own case: the marker landed two commits after the diff it
// excused (`ccd9d67`, +520, after `53f4bed`, +29,447) — which already
// satisfied that check, and would have satisfied a naive fix requiring "the
// marker sits in a commit distinct from the one it excuses" too, because it
// already was one. Requiring commit separation is not sufficient here; the
// distinguishing property is **who**, not **which commit**.
//
// This module is what makes the override answerable only by a human. The
// marker alone no longer clears gate 6 (server-side, where nobody is present
// to answer a push back — registers.md's own split between gate 2 and gate
// 6). It must be backed by a row in
// docs/registers/change-size-override-register.md naming a human as
// Approver, identified by this branch. Because that register lives under
// docs/registers/ like every other one, check-approval-provenance.mjs
// (already wired blocking at gate 2 and gate 6) already refuses a row that
// arrives pre-approved in the same commit that files it — the mechanical
// form of "who, not which commit": an agent cannot fabricate the second,
// later, separately-reviewed commit that answers a push back, because the
// only thing that check can verify is that two distinct commits happened,
// and this repository's own norm (registers.md, bypass-and-exceptions.md:
// "no worker approves its own exception") is what keeps the second one
// meaning what it claims. check-pr-body-artefacts.mjs also already accepts
// this register's own row identity as a citation (`registerRowIdentities`
// reads every file under docs/registers/ generically). Neither needed a
// line changed for this fix: the generic register reader every check here
// already shares (registers.md: "generic across every register shape,
// since Approver is always the last column") is reused rather than
// duplicated, per this corpus's own tooling ladder
// (cross-gate-rules.md#prefer-established-tooling-to-bespoke-checks).
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { run, report, readStaged } from "./lib.mjs";
import { parseRegisterRows } from "./check-approval-provenance.mjs";
import { looksLikeTeamLabel } from "./check-adr-approver.mjs";

const OVERRIDE = "[large-pr]";
export const REGISTER_PATH = "docs/registers/change-size-override-register.md";

/** True when `logText` — a branch's own commit messages — claims the
 *  change-size override, anywhere in the range. */
export function usesOverrideMarker(logText) {
  return (logText || "").includes(OVERRIDE);
}

/** Every row in the change-size override register identified by `branch`
 *  (the Branch column, register's first cell) whose Approver cell names a
 *  human. `parseRegisterRows` is the generic reader every other register in
 *  this repository already shares — this module adds no parser of its own. */
export function approvedOverrideRowsForBranch(registerText, branch) {
  const want = `${(branch || "").trim().toLowerCase()}|`;
  return parseRegisterRows(registerText).filter(
    (r) =>
      r.identity.startsWith(want) &&
      r.approver &&
      !looksLikeTeamLabel(r.approver),
  );
}

/** Fix 74's check, pure and injectable. `branch` is the pull request's own
 *  head branch (`GITHUB_HEAD_REF` in CI, the checked-out branch for a
 *  manual run) — the same identity a human filing the row names in the
 *  register's own Branch column, so a row approved for one branch does not
 *  silently authorise a different one. An unresolved branch is reported as
 *  a finding rather than a silent skip — the fail-safe direction: nothing
 *  here can tell "genuinely cannot resolve" from "chose a detached HEAD to
 *  dodge the check" apart, so it blocks either way. */
export function findChangeSizeOverrideFindings({
  logText,
  registerText,
  branch,
}) {
  if (!usesOverrideMarker(logText)) return [];
  if (!branch) {
    return [
      {
        check: "change size override",
        path: REGISTER_PATH,
        problem:
          `this branch's commit log carries the ${OVERRIDE} marker, but its own name could ` +
          "not be resolved to check the change-size override register against it",
        remedy:
          "run this check with GITHUB_HEAD_REF set, or from a checked-out branch — not a detached HEAD",
      },
    ];
  }
  if (approvedOverrideRowsForBranch(registerText, branch).length > 0) {
    return [];
  }
  return [
    {
      check: "change size override",
      path: REGISTER_PATH,
      problem:
        `this branch's commit log carries the ${OVERRIDE} marker, but ${REGISTER_PATH} has no ` +
        `row for branch '${branch}' naming a human as Approved by — a marker with no stated ` +
        "reason and no named approver is not an override, it is an agent approving its own work",
      remedy:
        `record the branch, the counted change size and what is driving it as a row in ${REGISTER_PATH}, ` +
        "with Approved by left blank until a human fills it in — a push back is resolved by a decision record, not by the marker alone",
    },
  ];
}

/** Production entry point: reads the branch's own commit log over `logRange`
 *  and the register file from disk. `branch` defaults to `GITHUB_HEAD_REF`
 *  (set on every `pull_request` CI run) or the checked-out branch for a
 *  manual run. `runGit`/`readFile` are injectable, the same shape every
 *  other check here takes. */
export function checkChangeSizeOverride(
  logRange,
  {
    branch = process.env.GITHUB_HEAD_REF ||
      run("git", ["rev-parse", "--abbrev-ref", "HEAD"]).stdout?.trim(),
    runGit = run,
    readFile = (p) => {
      try {
        return readFileSync(p, "utf8");
      } catch {
        return "";
      }
    },
  } = {},
) {
  const log = runGit("git", ["log", logRange, "--format=%B"]);
  return findChangeSizeOverrideFindings({
    logText: log.status === 0 ? log.stdout : "",
    registerText: readFile(REGISTER_PATH),
    branch,
  });
}

// Fix 84 — the marker itself, not only the finding it excuses, is refused
// without an approved row. ADR-0006 already made a pre-approved register row
// unwritable in the commit that files it (check-approval-provenance.mjs: the
// approver cell cannot be filled in the same commit that introduces the row).
// This closes the matching gap on the other side: three prose statements
// (ADR-0006, SKILL.md, the register's own header) told an agent never to
// write the marker on its own authority, and one commit did it anyway while
// quoting the rule it broke. A prose-only defect recurs; this makes the
// marker mechanically unwritable the same structural way the approver cell
// already is — an agent cannot fabricate the earlier, separate, human-filled
// approval a commit carrying the marker now requires to exist first.
//
// Wired at the commit-msg hook (gate 3 — docs/standards/guardrails/gate-3-
// commit-message.md — the one hook stage where the message about to be
// committed is readable at all; gate 2's own contract is staged *file*
// content, and the marker lives in the message, not a file, so gate 2 cannot
// see it before the commit object exists). `logText` here is the single
// drafted message, not a log range: the check fires once, for the commit
// that would introduce the marker, not for the branch's whole history — a
// commit that only files the register row (its own message never mentions
// `[large-pr]`) never trips it, so filing a blank-approver row stays exactly
// as available as ADR-0006 already made it.
export function checkChangeSizeOverrideMessage(
  message,
  {
    branch = process.env.GITHUB_HEAD_REF ||
      run("git", ["rev-parse", "--abbrev-ref", "HEAD"]).stdout?.trim(),
    readFile = readStaged,
  } = {},
) {
  return findChangeSizeOverrideFindings({
    logText: message,
    registerText: readFile(REGISTER_PATH),
    branch,
  });
}

const argv1 = process.argv[1];
const isMain = argv1 && import.meta.url === pathToFileURL(argv1).href;
if (isMain) {
  if (process.argv[2] === "--message") {
    // .husky/commit-msg usage: the one message about to be committed.
    const msgFile = process.argv[3];
    let message = "";
    if (msgFile) {
      try {
        message = readFileSync(msgFile, "utf8");
      } catch {
        message = "";
      }
    }
    report("gate 3", checkChangeSizeOverrideMessage(message));
  } else {
    const range = process.argv[2] || "origin/main..HEAD";
    report("gate 6", checkChangeSizeOverride(range));
  }
}
