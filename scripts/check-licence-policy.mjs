// Check 7 (gate 6) — dependency licence policy.
//
// Completeness (gate 2 check 16, check-licence.mjs) asks whether every
// resolved dependency has a current register row. This asks a different
// question over the SAME register: is the licence recorded on that row
// acceptable (registers.md: "completeness and policy are different checks",
// gate-6-pull-request.md: "It also reads a different scope than gate 2's
// completeness check over the same register").
//
// Fix brief 6 — the decision rule, mechanical rather than a judgement:
//
//   A dependency's licence passes without blocking when it is OSI-approved,
//   and its conditions are compatible with this repository's own licence (or
//   the repository declares none). Anything else needs an explicit human
//   decision, recorded on the row itself.
//
// "OSI-approved" is scripts/licence-table.mjs's own recorded fact, with a
// citation. "Compatible" is `compatible()` below: a licence that imposes
// none of source-disclosure, same-licence (share-alike) or
// network-use-disclosure ("permissive", derived — licence-table.mjs's
// isPermissive) cannot conflict with anything and is always compatible; one
// that does is compatible only when it never ships (development scope has
// nothing downstream to conflict with — the same scope split
// gate-6-pull-request.md already draws for build/test-only dependencies) or
// when the repository's own licence carries the same condition. This
// replaces the old four-category enumerated allow lists (RUNTIME_ALLOW,
// DEV_ADDITIONS): gate-6-pull-request.md used to say the allow lists were
// "enumerated identifiers, not adjectives" because "permissive" and
// "copyleft" are category judgements two implementers would sort
// differently. That objection stands; this design answers it by making the
// adjective data with a citation instead of removing the adjective's
// judgement call — see the table's own header comment for the fuller
// reasoning.
//
// A licence with NO table entry blocks and asks for one, the same as an
// unrecognised licence always has (gate-6-pull-request.md: "a dependency
// with no licence is not unlicensed in the permissive sense — it is all
// rights reserved by default" — a licence the table has never seen is the
// same kind of unknown, just discovered by a different route). Unlike a
// blocked *decision-rule* verdict, a missing table entry is not something a
// register row's Decision record can accept: the table needs an entry with a
// reference before anyone can judge it at all.
import { readStaged, report, repositoryLicenceId } from "./lib.mjs";
import { REGISTER } from "./check-licence.mjs";
import {
  licenceTableEntry,
  isPermissive,
  parseLicenceExpression,
  evaluateLicenceExpression,
} from "./licence-table.mjs";
import { pathToFileURL } from "node:url";

/** Is `entry`'s licence compatible with the repository's own declared
 *  licence (or the absence of one)? A permissive licence is compatible with
 *  anything — there is no condition it could conflict with. A non-permissive
 *  one is compatible only when it never reaches what ships (development
 *  scope), when nothing is declared to conflict with, or when the
 *  repository's own tabled licence carries the same condition (both
 *  share-alike, say) — a same-family check, not a full pairwise
 *  compatibility matrix. Exported so the relation is directly testable
 *  without a register file or a real package.json on disk. */
export function compatible(entry, scope, repoLicenceId) {
  if (isPermissive(entry)) return true;
  if (!/^runtime$/i.test((scope ?? "").trim())) return true;
  if (!repoLicenceId) return true;
  const repoEntry = licenceTableEntry(repoLicenceId);
  if (!repoEntry) return false; // the repository's own licence isn't tabled — cannot confirm, refuse to guess
  const c = entry.conditions;
  const r = repoEntry.conditions;
  return (
    (!c.sameLicence || r.sameLicence) &&
    (!c.sourceDisclosure || r.sourceDisclosure) &&
    (!c.networkUseDisclosure || r.networkUseDisclosure)
  );
}

/** The decision rule for one bare licence identifier: `{ acceptable, reason
 *  }`. `reason` is `undefined` when acceptable, else one of "no-table-entry"
 *  or "not-compatible" — what evaluateRegisterRow below turns into the
 *  finding's wording. */
export function leafVerdict(id, scope, repoLicenceId) {
  const entry = licenceTableEntry(id);
  if (!entry) return { acceptable: false, reason: "no-table-entry" };
  const acceptable =
    entry.osiApproved && compatible(entry, scope, repoLicenceId);
  return { acceptable, reason: acceptable ? undefined : "not-compatible" };
}

/** Parse-then-evaluate in one call — what evaluateRegisterRow actually
 *  wants per register row. */
export function licenceExpressionAcceptable(licence, scope, repoLicenceId) {
  return evaluateLicenceExpression(parseLicenceExpression(licence), (id) =>
    leafVerdict(id, scope, repoLicenceId),
  );
}

function cellsOf(row) {
  return row
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/** Rows as { dep, version, licence, scope, decisionRecord, approver }, from
 *  the same register check-licence.mjs parses — column order per
 *  registers.md: Dependency, Version, Licence, Direct or transitive, Scope,
 *  Used by, Why, Decision record, Obligations, Expires, Approver. */
function parseRegisterRows(md) {
  const rows = [];
  for (const line of md.split("\n")) {
    if (!line.startsWith("|") || line.includes("---")) continue;
    const cells = cellsOf(line);
    if (cells.length < 5) continue;
    const [dep, version, licence, , scope] = cells;
    if (!dep || (/dependency/i.test(dep) && /version/i.test(version))) continue;
    if (dep.startsWith("_") || dep.startsWith("No rows")) continue;
    rows.push({
      dep,
      version,
      licence: (licence ?? "").trim(),
      scope: (scope ?? "").trim(),
      decisionRecord: (cells[7] ?? "").trim(),
      approver: (cells[10] ?? "").trim(),
    });
  }
  return rows;
}

/** Pure per-row verdict: every finding one already-parsed register row
 *  raises. Exported so the decision rule is directly testable against a
 *  constructed row, without a staged register file on disk. `repoLicenceId`
 *  is injectable (defaults to the real package.json) for the same reason. */
export function evaluateRegisterRow(
  row,
  repoLicenceId = repositoryLicenceId(),
) {
  const findings = [];
  const versionResolved =
    Boolean(row.version) && !/^undefined$/i.test(row.version);
  if (!versionResolved) {
    findings.push({
      check: "dependency licence policy",
      path: REGISTER,
      problem:
        `${row.dep}'s version could not be resolved — the register row records ` +
        `${row.version ? `the literal '${row.version}'` : "no version"} rather than one`,
      remedy:
        `resolve ${row.dep}'s installed version (for example, \`npm ls ${row.dep}\`) ` +
        `and correct the register row; a row that is not pinned to a version cannot be judged`,
    });
  }
  const depLabel = versionResolved ? `${row.dep}@${row.version}` : row.dep;

  if (!row.licence || /^unknown$/i.test(row.licence)) {
    findings.push({
      check: "dependency licence policy",
      path: REGISTER,
      problem: `${depLabel} carries no recorded licence — unknown is not "unclassified yet", it blocks`,
      remedy:
        "determine the actual licence and record it, or remove the dependency",
    });
    return findings;
  }

  const verdict = licenceExpressionAcceptable(
    row.licence,
    row.scope,
    repoLicenceId,
  );
  if (verdict.acceptable) return findings;

  const missingEntry = verdict.blockers.some(
    (b) => b.reason === "no-table-entry",
  );
  const unparseable = verdict.blockers.some((b) => b.reason === "unparseable");
  if (missingEntry) {
    const ids = verdict.blockers
      .filter((b) => b.reason === "no-table-entry")
      .map((b) => `'${b.id}'`)
      .join(", ");
    findings.push({
      check: "dependency licence policy",
      path: REGISTER,
      problem: `${depLabel} carries licence '${row.licence}' — ${ids} has no entry in scripts/licence-table.mjs`,
      remedy: `add an entry to scripts/licence-table.mjs for ${ids}, citing an authoritative reference (an OSI approval page, or the licence steward's own text)`,
    });
    return findings;
  }
  if (unparseable) {
    findings.push({
      check: "dependency licence policy",
      path: REGISTER,
      problem: `${depLabel} carries licence '${row.licence}', which is not a valid SPDX expression`,
      remedy:
        "correct the licence cell to a valid SPDX expression (the exact identifier, hyphenated, joined only by AND / OR / WITH), then re-run the check",
    });
    return findings;
  }

  // The licence has a table entry but does not pass the decision rule on
  // its own — this is exactly the case a register row's own Decision record
  // and Approver columns can carry (registers.md: "Decision record: required
  // when the licence is outside the allow list" — reworded here as "outside
  // what the table's decision rule accepts on its own"), unlike a missing
  // table entry above, which nobody can accept until the table has an entry
  // to accept. A human accepting THIS dependency is recorded on THIS row —
  // there is no code-level allow list left to extend.
  if (row.decisionRecord && row.approver) return findings;

  const blockedBy = verdict.blockers.map((b) => `'${b.id}'`).join(", ");
  findings.push({
    check: "dependency licence policy",
    path: REGISTER,
    problem:
      `${depLabel} carries licence '${row.licence}' (scope ${row.scope || "(none recorded)"}) — ` +
      `not OSI-approved and compatible with this repository's own licence on its own (${blockedBy})`,
    remedy:
      "record a human decision accepting it — name the record in this row's Decision record column and the person in Approver — or replace the dependency",
  });
  return findings;
}

/** { findings, skips }. `scanTriggered` is the caller's own scope decision —
 *  the resolved dependency set moved (a lock file change), or a scheduled
 *  run — the same change-triggered shape as check 6 and gate 2 check 16.
 *  No schedule of its own: a licence's text and classification are fixed
 *  once published (change-triggered-checks.md), so this fires only when the
 *  dependency set moved; re-validating the table's own facts against their
 *  references is gate 7's separate, invoked check
 *  (check-licence-table.mjs), never a cron. */
export function checkLicencePolicy(scanTriggered) {
  const skips = [];
  if (!scanTriggered) {
    skips.push(
      "dependency licence policy — no dependency change and not a scheduled run, check skipped",
    );
    return { findings: [], skips };
  }

  let md;
  try {
    md = readStaged(REGISTER);
  } catch {
    return {
      findings: [
        {
          check: "dependency licence policy",
          path: REGISTER,
          problem: `${REGISTER} does not exist, so no resolved dependency's licence can be judged`,
          remedy:
            "create the register (gate 2 check 16 already requires one row per resolved dependency) before licence policy can run",
        },
      ],
      skips,
    };
  }

  const repoLicenceId = repositoryLicenceId();
  const findings = [];
  for (const row of parseRegisterRows(md)) {
    findings.push(...evaluateRegisterRow(row, repoLicenceId));
  }
  return { findings, skips };
}

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  // Manual or scheduled run: always in scope — there is no staged/changed set
  // to ask, the way pre-commit.mjs and gate-6-pull-request.mjs can.
  const { findings, skips } = checkLicencePolicy(true);
  report("gate 6", findings, skips);
}
