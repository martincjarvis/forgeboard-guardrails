// Gate 7 (on demand) — licence table re-validation.
//
// scripts/licence-table.mjs's entries are checked-in facts, not fetched at
// gate time (placing-a-new-check.md: a heavyweight or network-bound check is
// not placed at a gate that fires on every edit or commit — gates 2 and 6
// read the table as plain data, no network involved). This is the manual
// counterpart: re-reads each entry's own `reference` and confirms it still
// resolves, so a citation going stale (a moved OSI page, a dead link) is
// caught before someone next relies on it, rather than trusted silently
// forever. Invoked, never scheduled (change-triggered-checks.md: a licence's
// text and its OSI classification do not move the way an advisory database
// does) — run it when adding a licence, or when confirming the table is
// current. Not wired into gate-7-on-demand.mjs's own default sweep: that
// sweep's other checks read the working tree; this one depends on external
// hosts staying reachable, a different and slower failure mode that would
// otherwise make every `npm run gate:7` invocation hostage to a dozen
// third-party sites.
//
// What this does NOT do: re-scrape each reference to confirm the recorded
// booleans (osiApproved, conditions, ...) still match the page's content.
// That would need structured, page-specific parsing per licence steward —
// fragile, and the kind of improvisation the corpus already forbids ("do not
// assert OSI status from memory" cuts the same way against inferring it from
// scraped prose next). A reference that stops resolving is the mechanical,
// checkable signal this raises; the human adding or correcting an entry
// reads the page itself for anything beyond that.
import { LICENCE_TABLE } from "./licence-table.mjs";
import { report } from "./lib.mjs";
import { pathToFileURL } from "node:url";

/** One finding per entry whose `reference` does not resolve. `fetchFn`
 *  defaults to the global fetch (Node >= 18, this repository's own floor is
 *  20 — no new dependency); injectable so this is testable without a real
 *  network call.
 *  @param {Record<string, { reference: string }>} [table]
 *  @param {(url: string, init?: object) => Promise<{ ok: boolean, status: number }>} [fetchFn]
 */
export async function checkLicenceTableReferences(
  table = LICENCE_TABLE,
  fetchFn = fetch,
) {
  const findings = [];
  for (const [id, entry] of Object.entries(table)) {
    try {
      const res = await fetchFn(entry.reference, { method: "GET" });
      if (!res.ok) {
        findings.push({
          check: "licence table re-validation",
          path: "scripts/licence-table.mjs",
          problem: `${id}'s reference (${entry.reference}) responded ${res.status}`,
          remedy:
            "confirm the reference is still correct, and update it (or the entry's own facts) if the licence steward moved or changed it",
        });
      }
    } catch (err) {
      findings.push({
        check: "licence table re-validation",
        path: "scripts/licence-table.mjs",
        problem: `${id}'s reference (${entry.reference}) could not be reached: ${
          err instanceof Error ? err.message : String(err)
        }`,
        remedy:
          "confirm network access, then re-run; if it still fails, the reference itself may have moved",
      });
    }
  }
  return findings;
}

const isMain =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const findings = await checkLicenceTableReferences();
  report("gate 7", findings);
}
