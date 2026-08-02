// cspell:ignore packument packuments
// Gate 6 check 11 — minimum release age.
//
// A dependency published very recently is the supply-chain attack window: a
// compromised release is typically caught and yanked within days, so refusing
// to adopt anything younger than a set age costs little and removes most of the
// exposure. The standard names this control at
// docs/standards/guardrails/gate-6-pull-request.md (the "vetting or
// minimum-release-age policy" passage); this module is the implementation that
// matches that promise.
//
// Change-triggered like checks 6 and 7 (a lock file is in the change), plus the
// scheduled leg the advisory check already has, because a dependency that was
// old enough to pass when adopted stays old enough — only a new dependency
// raises the question. Reads the resolved tree the same way they do.
//
// Tooling ladder (cross-gate-rules.md, "Prefer established tooling"):
//
//   Rung 1 — platform capability: no host offers a native minimum-release-age
//   gate, so nothing to adopt there.
//   Rung 2 — established tool: npm ships `--min-release-age <days>` (and the
//   `min-release-age` key in `.npmrc`), which constrains the *resolver* at
//   install time. That is the declared policy in this repository's `.npmrc`,
//   and the window below is *derived* from it via `npm config get
//   min-release-age` (ADR-0003) rather than typed a second time here. The
//   publish dates themselves come from `npm view <name> time --json` — the
//   registry's own packument time object, not a hand-written registry client.
//   Rung 3 — bespoke: the gate-6 *check* itself. npm's flag is a resolver
//   constraint, not a pull-request check that reads the resolved tree and an
//   exception register, and it has no exception route — so the authority that
//   gate 6 exists to be still belongs to a check here. That check builds on
//   rung 2's data (the resolver's own window and the registry's own dates),
//   not on a parallel resolver of this repository's own.
//
// The exception register is docs/registers/minimum-release-age-register.md. A
// row admits one dependency@version; it is self-expiring, because every pinned
// version eventually passes the window on its own, and the staleness check
// below reports rows that have aged out so they cannot accumulate into
// permanent exemptions.
import { readStaged, report, resolvedDependencyTree, run } from "./lib.mjs";
import { pathToFileURL } from "node:url";

export const REGISTER = "docs/registers/minimum-release-age-register.md";
const MS_PER_DAY = 86_400_000;

/** The declared minimum-release-age window in days, derived from npm's own
 *  effective config (`npm config get min-release-age`), which reads the
 *  `min-release-age` key this repository sets in `.npmrc`. Returns null when
 *  no value is declared: the policy is opt-in via `.npmrc`, and a check that
 *  invented its own window would be the configuration-file assumption
 *  ADR-0003 refuses (derive, don't duplicate). Exported so the derivation is
 *  testable without shelling out. */
export function minReleaseAgeDays(getConfig = defaultGetConfig) {
  const raw = getConfig();
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim();
  if (!trimmed || /^null$/i.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function defaultGetConfig() {
  return run("npm", ["config", "get", "min-release-age"]).stdout;
}

/** One resolved dependency's release-age outcome, or null to pass over it:
 *  skip when the version is empty or undetermined, `undetermined` when the
 *  publish date is missing or unparseable, skip when a register row admits
 *  it, otherwise a `finding` when it is inside the window. Split out of
 *  classifyReleaseAge's loop so the loop stays a single classify-and-bin
 *  rather than carrying the date/age branching inline.
 *  @param {string} name
 *  @param {string} version
 *  @param {Map<string, string>} publishDates
 *  @param {{ windowDays: number, today: Date, admitted: Set<string> }} opts */
function classifyOneRelease(
  name,
  version,
  publishDates,
  { windowDays, today, admitted },
) {
  if (!version || /^undefined$/i.test(version)) return null;
  const key = `${name}@${version}`;
  const publishedRaw = publishDates?.get(key);
  const published = publishedRaw ? new Date(publishedRaw) : null;
  if (!published || Number.isNaN(published.getTime())) {
    return { undetermined: key };
  }
  if (admitted.has(key)) return null;
  const ageDays = (today.getTime() - published.getTime()) / MS_PER_DAY;
  if (ageDays >= windowDays) return null;
  return {
    finding: {
      check: "minimum release age",
      path: name,
      problem:
        `${key} was published ${ageDays.toFixed(1)} days ago, inside the ` +
        `${windowDays}-day minimum release age window — a dependency this ` +
        `recent is the supply-chain attack window the policy exists to refuse`,
      remedy:
        `wait for ${key} to pass the ${windowDays}-day window, or record a ` +
        `human-approved exception row in ${REGISTER} naming this dependency and version`,
    },
  };
}

/** Pure classification: given the resolved tree (a Map name -> version), a map
 *  of publish dates (key `name@version` -> ISO string), the window in days,
 *  and the set of `name@version` keys a human-approved register row admits,
 *  return every finding the window raises. Dependencies whose publish date is
 *  absent are returned in `undetermined` rather than silently passed: a
 *  registry lookup that could not return a date has not checked the age, the
 *  same way an unavailable tool has not run (cross-gate-rules.md, "never
 *  claim more than was checked"). Kept pure so it is testable against fixed
 *  fixtures — `npm view` is network-bound and its result is not repeatable.
 *
 *  @param {Map<string, string>} resolved
 *  @param {Map<string, string>} publishDates
 *  @param {{ windowDays?: number, today?: Date, admitted?: Set<string> }} opts */
export function classifyReleaseAge(
  resolved,
  publishDates,
  { windowDays, today = new Date(), admitted = new Set() } = {},
) {
  /** @type {{ check: string, path: string, problem: string, remedy: string }[]} */
  const findings = [];
  /** @type {string[]} */
  const undetermined = [];
  if (!windowDays || windowDays <= 0) return { findings, undetermined };
  for (const [name, version] of resolved?.entries?.() ?? []) {
    const result = classifyOneRelease(name, version, publishDates, {
      windowDays,
      today,
      admitted,
    });
    if (result?.undetermined) undetermined.push(result.undetermined);
    else if (result?.finding) findings.push(result.finding);
  }
  return { findings, undetermined };
}

/** @param {string} row */
function cellsOf(row) {
  return row
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/** The register's own header row, or an empty leading cell — neither is a
 *  data row.
 *  @param {string} dep @param {string} version @returns {boolean} */
function isHeaderOrEmpty(dep, version) {
  return !dep || (/dependency/i.test(dep) && /version/i.test(version));
}

/** The italicised `_none yet_` or `No rows yet` placeholder rows.
 *  @param {string} dep @returns {boolean} */
function isPlaceholder(dep) {
  return dep.startsWith("_") || /^no rows/i.test(dep);
}

/** Rows as { dep, version, published, justification, removableWhen, approver },
 *  from docs/registers/minimum-release-age-register.md. Column order per the
 *  register's own header, which carries the shared column set every register
 *  holds (registers.md) plus the identity and Published columns this subject
 *  needs. Placeholder rows (`_none yet_`, italicised) are skipped the same way
 *  check-licence-policy.mjs skips them over the licence register. */
/** @param {string} [md] */
export function parseRegisterRows(md) {
  /** @type {{dep:string,version:string,published:string,justification:string,removableWhen:string,approver:string}[]} */
  const rows = [];
  for (const line of (md ?? "").split("\n")) {
    if (!line.startsWith("|") || line.includes("---")) continue;
    const cells = cellsOf(line);
    if (cells.length < 6) continue;
    const [
      dep = "",
      version = "",
      published = "",
      justification = "",
      removableWhen = "",
      approver = "",
    ] = cells;
    if (isHeaderOrEmpty(dep, version)) continue;
    if (isPlaceholder(dep)) continue;
    rows.push({
      dep,
      version,
      published,
      justification,
      removableWhen,
      approver,
    });
  }
  return rows;
}

/** The `name@version` keys a register's parsed rows admit — one per row whose
 *  Approver cell a human has filled. A row missing only its approver does not
 *  admit (gate 6 has no author present to answer a push back), the same split
 *  every other register already draws; the approval-provenance check guards
 *  the unapproved-row case separately.
 *  @param {{dep:string,version:string,published:string,justification:string,removableWhen:string,approver:string}[]} rows */
export function admittedKeys(rows) {
  return new Set(
    rows
      .filter((r) => (r.approver ?? "").trim())
      .map((r) => `${r.dep}@${r.version}`),
  );
}

/** Pure classification: every register row that has aged past the window and
 *  so must be removed. Once the pinned version a row excepts is older than the
 *  minimum age, the dependency passes the release-age check unaided and the
 *  row is stale — the self-expiring property that stops exceptions
 *  accumulating into permanent exemptions. A row whose Published date cannot
 *  be parsed is itself a finding: a register row whose staleness cannot be
 *  verified is a broken row, not a row this check can pass.
 *
 *  @param {{ dep: string, version: string, published: string }[]} rows
 *  @param {{ windowDays?: number, today?: Date }} opts */
export function classifyStaleRows(
  rows,
  { windowDays, today = new Date() } = {},
) {
  /** @type {{ check: string, path: string, problem: string, remedy: string }[]} */
  const findings = [];
  if (!windowDays || windowDays <= 0) return findings;
  for (const row of rows ?? []) {
    const published = new Date(row.published);
    if (Number.isNaN(published.getTime())) {
      findings.push({
        check: "minimum release age register staleness",
        path: REGISTER,
        problem:
          `${row.dep}@${row.version}'s Published date '${row.published}' is ` +
          `not a valid date — staleness cannot be verified, so the row reads as permanent`,
        remedy:
          `record the version's actual publish date (ISO, from \`npm view ${row.dep} time\`) ` +
          `in the row's Published column, or remove the row`,
      });
      continue;
    }
    const ageDays = (today.getTime() - published.getTime()) / MS_PER_DAY;
    if (ageDays >= windowDays) {
      findings.push({
        check: "minimum release age register staleness",
        path: REGISTER,
        problem:
          `${row.dep}@${row.version} was excepted but is now ${ageDays.toFixed(1)} ` +
          `days old (>= ${windowDays}-day window) — it passes the minimum age on ` +
          `its own, so the row is stale and must be removed`,
        remedy: `delete the stale row from ${REGISTER}`,
      });
    }
  }
  return findings;
}

/** Publish dates for the resolved tree, as a Map keyed `name@version`, from
 *  `npm view <name> time --json` — npm's own packument time object, one call
 *  per distinct package name. A name whose packument cannot be read (a linked
 *  or private package, a registry outage) contributes no dates, and the
 *  classifier reports those versions as undetermined rather than guessing.
 *  @param {Map<string,string>} resolved */
function queryPublishDates(resolved) {
  /** @type {Map<string,string>} */
  const dates = new Map();
  const names = [...new Set([...(resolved?.keys?.() ?? [])])];
  for (const name of names) {
    const r = run("npm", ["view", name, "time", "--json"]);
    let times;
    try {
      times = JSON.parse(r.stdout || "");
    } catch {
      continue;
    }
    if (!times || typeof times !== "object") continue;
    for (const [version, iso] of Object.entries(times)) {
      if (typeof iso === "string") dates.set(`${name}@${version}`, iso);
    }
  }
  return dates;
}

/** { findings, skips }. `scanTriggered` is the caller's own scope decision —
 *  the lock file is in the staged/changed set, or this is the scheduled run —
 *  the same change-triggered shape checks 6 and 7 take. The window is derived
 *  from npm's effective config; with none declared the check is a visible
 *  skip, never a silent pass on an invented value.
 *  @param {boolean} scanTriggered */
export function checkMinimumReleaseAge(scanTriggered) {
  /** @type {string[]} */
  const skips = [];
  if (!scanTriggered) {
    skips.push(
      "minimum release age — no dependency change and not a scheduled run, check skipped",
    );
    return { findings: [], skips };
  }

  const windowDays = minReleaseAgeDays();
  if (windowDays === null) {
    skips.push(
      "minimum release age — no `min-release-age` declared in .npmrc (`npm config get min-release-age`); policy not in force",
    );
    return { findings: [], skips };
  }

  const resolved = resolvedDependencyTree();
  if (!resolved) {
    skips.push(
      "minimum release age — resolved dependency tree unavailable (`npm ls --all --json` did not read); check skipped",
    );
    return { findings: [], skips };
  }

  /** @type {{dep:string,version:string,published:string,justification:string,removableWhen:string,approver:string}[]} */
  let rows = [];
  try {
    rows = parseRegisterRows(readStaged(REGISTER));
  } catch {
    /* no register yet — nothing admitted, which is the correct default */
  }
  const admitted = admittedKeys(rows);

  const publishDates = queryPublishDates(resolved);
  const { findings, undetermined } = classifyReleaseAge(
    resolved,
    publishDates,
    { windowDays, admitted },
  );
  if (undetermined.length) {
    skips.push(
      `minimum release age — publish date undeterminable for ${undetermined.length} ` +
        `dependency(ies) (registry lookup failed); not silently passed: ${undetermined.join(", ")}`,
    );
  }
  return { findings, skips };
}

/** { findings, skips }. Register hygiene: rows whose pinned version has aged
 *  past the window are stale and must be removed. Runs whenever the register
 *  exists — staleness is a property of the register, not of whether a
 *  dependency changed — the same way the change-size-override and suppression
 *  register checks run unconditionally. */
export function checkMinimumReleaseAgeStaleness() {
  /** @type {string[]} */
  const skips = [];
  const windowDays = minReleaseAgeDays();
  if (windowDays === null) {
    skips.push(
      "minimum release age register staleness — no `min-release-age` declared in .npmrc; staleness not judged",
    );
    return { findings: [], skips };
  }

  let md;
  try {
    md = readStaged(REGISTER);
  } catch {
    skips.push(
      "minimum release age register staleness — register not present, nothing to age out",
    );
    return { findings: [], skips };
  }

  const findings = classifyStaleRows(parseRegisterRows(md), { windowDays });
  return { findings, skips };
}

const argv1 = process.argv[1];
const isMain = argv1 && import.meta.url === pathToFileURL(argv1).href;
if (isMain) {
  // Manual or scheduled run: always in scope — there is no staged/changed set
  // to ask, the way pre-commit.mjs and gate-6-pull-request.mjs can.
  const a = checkMinimumReleaseAge(true);
  const b = checkMinimumReleaseAgeStaleness();
  report("gate 6", [...a.findings, ...b.findings], [...a.skips, ...b.skips]);
}
