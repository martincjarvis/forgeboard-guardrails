// Check 16 — dependency licence register completeness (gate 2, 2.3).
//
// Change-triggered (change-triggered-checks.md): runs only when a lock file is
// part of the change, and is a visible skip otherwise. This checks
// completeness — every dependency npm resolves has a current register row —
// never policy: whether a licence is acceptable is gate 6 check 7, against the
// allow list (registers.md: "completeness and policy are different checks").
//
// cspell:ignore Unlicense
import { readStaged, resolvedDependencyTree, report } from "./lib.mjs";
import {
  leafIdentifiers,
  licenceTableEntry,
  parseLicenceExpression,
} from "./licence-table.mjs";
import { pathToFileURL } from "node:url";

export const REGISTER = "docs/registers/dependency-licence-register.md";

/** @param {string} row */
function cellsOf(row) {
  return row
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/** Rows already recorded: a Set of "name@version" (completeness's own
 *  lookup) plus the raw rows with their licence cell (the
 *  table-entry completeness check below needs the licence, completeness
 *  itself does not). Null means the register itself does not exist —
 *  distinct from an empty register, which parses to empty and still fails
 *  completeness for every resolved dependency. */
function parseRegister() {
  let md;
  try {
    md = readStaged(REGISTER);
  } catch {
    return null;
  }
  const known = new Set();
  const rows = [];
  for (const line of md.split("\n")) {
    if (!line.startsWith("|") || line.includes("---")) continue;
    const cells = cellsOf(line);
    if (cells.length < 3) continue;
    const dep = (cells[0] ?? "").trim();
    const version = (cells[1] ?? "").trim();
    if (!dep || (/dependency/i.test(dep) && /version/i.test(version))) continue;
    if (dep.startsWith("_") || dep.startsWith("No rows")) continue;
    known.add(`${dep}@${version}`);
    rows.push({ dep, version, licence: (cells[2] ?? "").trim() });
  }
  return { known, rows };
}

/** A licence in the resolved set with no entry in
 *  scripts/licence-table.mjs is a finding at gate 2 (here) as well as gate 6
 *  (check-licence-policy.mjs): "you need an entry precisely when a
 *  dependency introduces the licence, which is when the check already
 *  runs." Exported so it is directly testable against constructed rows.
 *  @param {{dep: string, version: string, licence: string}[]} rows */
export function missingLicenceTableEntries(rows) {
  const findings = [];
  const reported = new Set();
  for (const row of rows) {
    if (!row.licence || /^unknown$/i.test(row.licence)) continue; // its own finding, not this one
    for (const id of leafIdentifiers(parseLicenceExpression(row.licence))) {
      if (licenceTableEntry(id) || reported.has(id)) continue;
      reported.add(id);
      findings.push({
        check: "dependency licence register",
        path: REGISTER,
        problem: `'${id}' (${row.dep}@${row.version}) has no entry in scripts/licence-table.mjs`,
        remedy: `add an entry for '${id}' to scripts/licence-table.mjs, citing an authoritative reference (an OSI approval page, or the licence steward's own text)`,
      });
    }
  }
  return findings;
}

/** { findings, skips }. `lockChanged` is the caller's own scope decision — the
 *  staged set locally, the pull request's changed-file range in CI — so this
 *  module makes no assumption about where the scope came from.
 *  @param {boolean} lockChanged */
export function checkLicenceCompleteness(lockChanged) {
  /** @type {string[]} */
  const skips = [];
  if (!lockChanged) {
    skips.push(
      "dependency licence register — no lock file in scope, check skipped",
    );
    return { findings: [], skips };
  }

  const resolved = resolvedDependencyTree();
  if (!resolved) {
    return {
      findings: [
        {
          check: "dependency licence register",
          problem:
            "`npm ls --all --json` did not produce a readable dependency tree",
          remedy: "run `npm ci` so the tree resolves, then re-run this check",
        },
      ],
      skips,
    };
  }

  const parsed = parseRegister();
  if (parsed === null) {
    return {
      findings: [
        {
          check: "dependency licence register",
          path: REGISTER,
          problem:
            `the lock file changed but ${REGISTER} does not exist, so none ` +
            `of the ${resolved.size} resolved dependencies have a row`,
          remedy:
            "create the register — one row per resolved dependency, per " +
            "docs/standards/guardrails/registers.md#the-dependency-licence-register",
        },
      ],
      skips,
    };
  }

  const findings = [];
  for (const [name, version] of resolved) {
    if (!parsed.known.has(`${name}@${version}`)) {
      findings.push({
        check: "dependency licence register",
        path: REGISTER,
        problem: `${name}@${version} is resolved but has no current register row`,
        remedy: `add a row to ${REGISTER} for ${name}@${version}`,
      });
    }
  }
  findings.push(...missingLicenceTableEntries(parsed.rows));
  return { findings, skips };
}

const argv1 = process.argv[1];
const isMain = argv1 && import.meta.url === pathToFileURL(argv1).href;
if (isMain) {
  // Manual run: treat any path argument naming a lock file as "changed".
  const args = process.argv.slice(2);
  const lockChanged = args.some((a) => /package-lock\.json$/.test(a));
  const { findings, skips } = checkLicenceCompleteness(lockChanged);
  report("gate 2", findings, skips);
}
