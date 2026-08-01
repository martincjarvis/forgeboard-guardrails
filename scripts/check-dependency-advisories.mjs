// cspell:ignore GHSA
// Check 6 (gate 6) — dependency advisory scan.
//
// Change-triggered (change-triggered-checks.md) PLUS scheduled: a licence is a
// property of a dependency at a version, but an advisory is a property of the
// *world* — a dependency clean this morning can carry a critical advisory this
// afternoon with nothing in the repository having moved. So this runs when the
// resolved dependency set changed (a lock file is in the change), and on a
// schedule regardless — the sibling cron trigger,
// .github/workflows/dependency-advisory-schedule.yml, invokes this module
// directly, daily (thresholds.md).
//
// `npm audit --json` is already in the box (registers.md: "no extra tooling
// option") — no new dependency for a check this standard already asks for.
//
// Severity bands (thresholds.md) differ by scope: a dependency present in what
// ships is judged more strictly than one used only to build or test it
// (gate-6-pull-request.md: "scope changes the answer for both"). Block and
// push-back are both refusals here — gate 6 has no author to ask, and a
// push-back advisory only clears with a decision record naming it, per
// registers.md: "answering a push back is a decision record, because it
// outlives the change that raised it" (there is no register row for this —
// only a suppression, a licence exception or a quarantine gets one).
import { readdirSync, readFileSync } from "node:fs";
import { run, resolvedDependencyTree, report } from "./lib.mjs";
import { pathToFileURL } from "node:url";

/** @type {Record<string, number>} */
const SEVERITY_RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
// thresholds.md calls the push-back band "medium"; npm audit's own severities
// are info/low/moderate/high/critical — "medium" and "moderate" name the same
// band.
const BLOCK = { runtime: "high", dev: "critical" };
const PUSH_BACK = { runtime: "moderate", dev: "high" };

/** @param {string} severity @returns {number} */
function rank(severity) {
  const normalised = severity === "medium" ? "moderate" : severity;
  return SEVERITY_RANK[normalised] ?? 0;
}

/** Every GHSA advisory id named anywhere in an Accepted ADR — the decision
 *  record gate-6-pull-request.md requires before a push-back-band advisory
 *  clears ("a decision record where the advisory is being lived with"). No
 *  new register: an accepted advisory is recorded the way this standard
 *  already records anything that outlives one change. */
export function acceptedAdvisoryIds(adrDir = "docs/ADR") {
  const ids = new Set();
  let files;
  try {
    files = readdirSync(adrDir).filter((f) => f.endsWith(".md"));
  } catch {
    return ids;
  }
  for (const f of files) {
    let text;
    try {
      text = readFileSync(`${adrDir}/${f}`, "utf8");
    } catch {
      continue;
    }
    if (!/^status:\s*Accepted\s*$/im.test(text)) continue;
    for (const m of text.matchAll(
      /GHSA-[a-zA-Z0-9]+-[a-zA-Z0-9]+-[a-zA-Z0-9]+/g,
    )) {
      ids.add(m[0].toLowerCase());
    }
  }
  return ids;
}

/** The GHSA ids an `npm audit --json` vulnerability entry names, lower-cased —
 *  read from each `via` entry's advisory URL (the last path segment).
 *  @param {{ via?: { url: string }[] }} info @returns {string[]} */
function advisoryIdsOf(info) {
  return (info.via ?? [])
    .filter((v) => typeof v === "object" && typeof v.url === "string")
    .map((v) => (v.url.trim().split("/").pop() ?? "").toLowerCase())
    .filter(Boolean);
}

/** Pure classification: given an `npm audit --json` report and the runtime
 *  dependency names and accepted advisory ids resolved elsewhere, return the
 *  findings. Kept separate from the impure orchestration below so it can be
 *  tested against a fixed report — `npm audit` is network-bound and its
 *  result changes as new advisories publish, so testing it end to end would
 *  not be a repeatable test.
 *  @param {{ vulnerabilities?: Record<string, { severity: string, via: { url: string }[] }> }} auditReport */
export function classifyAdvisories(
  auditReport,
  { runtimeNames = new Set(), acceptedIds = new Set() } = {},
) {
  const findings = [];
  for (const [name, info] of Object.entries(
    auditReport?.vulnerabilities ?? {},
  )) {
    const scope = runtimeNames.has(name) ? "runtime" : "dev";
    const severity = info.severity === "medium" ? "moderate" : info.severity;
    const blocks = rank(severity) >= rank(BLOCK[scope]);
    const pushesBack = !blocks && rank(severity) >= rank(PUSH_BACK[scope]);
    if (!blocks && !pushesBack) continue;

    const ids = advisoryIdsOf(info);
    if (pushesBack && ids.some((id) => acceptedIds.has(id))) continue;

    findings.push({
      check: "dependency advisory scan",
      path: name,
      problem:
        `${name} carries a ${severity} advisory (${scope} dependency)` +
        (ids.length ? `: ${ids.join(", ")}` : ""),
      remedy: blocks
        ? "upgrade or remove the dependency; block severity has no accepted-record path"
        : "upgrade the dependency, pin the specific vulnerable transitive dependency via `overrides`/`resolutions` where that version itself clears policy, or accept it in an Accepted ADR naming the advisory id",
    });
  }
  return findings;
}

/** { findings, skips }. `scanTriggered` is the caller's own scope decision —
 *  the lock file is in the staged/changed set, or this is the scheduled run
 *  — the same shape checkLicenceCompleteness (check-licence.mjs) takes for
 *  the same reason.
 *  @param {boolean} scanTriggered */
export function checkDependencyAdvisories(scanTriggered) {
  /** @type {string[]} */
  const skips = [];
  if (!scanTriggered) {
    skips.push(
      "dependency advisory scan — no dependency change and not a scheduled run, check skipped",
    );
    return { findings: [], skips };
  }

  const audit = run("npm", ["audit", "--json"]);
  let auditReport;
  try {
    auditReport = JSON.parse(audit.stdout || "");
  } catch {
    return {
      findings: [
        {
          check: "dependency advisory scan",
          problem: "`npm audit --json` did not produce a readable report",
          remedy: "run `npm audit` locally to see why, then re-run this check",
        },
      ],
      skips,
    };
  }

  const runtime = resolvedDependencyTree({ omitDev: true });
  const runtimeNames = runtime ? new Set(runtime.keys()) : new Set();
  const acceptedIds = acceptedAdvisoryIds();

  return {
    findings: classifyAdvisories(auditReport, { runtimeNames, acceptedIds }),
    skips,
  };
}

const argv1 = process.argv[1];
const isMain = argv1 && import.meta.url === pathToFileURL(argv1).href;
if (isMain) {
  // Manual or scheduled run: always in scope — there is no staged/changed set
  // to ask, the way pre-commit.mjs and gate-6-pull-request.mjs can.
  const { findings, skips } = checkDependencyAdvisories(true);
  report("gate 6", findings, skips);
}
