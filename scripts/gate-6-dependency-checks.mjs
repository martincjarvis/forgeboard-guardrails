// cspell:ignore lockChanged
// The dependency-tree leg of gate 6, extracted from
// gate-6-pull-request.mjs as its own subject seam: every check here reads
// the resolved dependency tree or the lock/manifest pair, and all are
// change-triggered the same way (a dependency moved in this range, or the
// sibling cron fired) — a distinct concern from per-file content, SARIF
// scanners, or the build/test/coverage leg. gate-6-pull-request.mjs
// imports and re-exports `runDependencyChecks`; its public surface is
// unchanged.
import { checkLicenceCompleteness } from "./check-licence.mjs";
import { checkLicencePolicy } from "./check-licence-policy.mjs";
import { checkDependencyAdvisories } from "./check-dependency-advisories.mjs";
import {
  checkMinimumReleaseAge,
  checkMinimumReleaseAgeStaleness,
} from "./check-minimum-release-age.mjs";
import { git } from "./lib.mjs";

const DEP_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
  "bundleDependencies",
  "overrides",
  "resolutions",
];
/** @param {string} ref */
function depsAt(ref) {
  const r = git(["show", ref]);
  if (r.status !== 0) return "";
  try {
    const p = JSON.parse(r.stdout);
    return JSON.stringify(
      Object.fromEntries(DEP_FIELDS.filter((f) => p[f]).map((f) => [f, p[f]])),
    );
  } catch {
    return "";
  }
}

/** @typedef {{ check: string, path?: string, problem?: string, remedy?: string }} Finding */

/** Runs the dependency-tree checks (gate 6 checks 3, 16, 7, 6, 11, and the
 *  release-age register staleness check). `base` is the already-resolved
 *  pull-request base (`origin/<base>`); `changed` is `changedFiles(range)`.
 *  Returns `{ findings, skips }` the same way every check-*.mjs helper does,
 *  so the caller spreads them into its own accumulators.
 *
 *  pre-commit.mjs reads `git show HEAD:package.json` against the staged blob
 *  (`:package.json`); a checkout has no staged blob, so the second read moves
 *  to the base ref instead — same comparison, same two ends, different source
 *  for the "before" side.
 *  @param {{ base: string, changed: string[] }} args
 *  @returns {{ findings: Finding[], skips: string[] }} */
export function runDependencyChecks({ base, changed }) {
  /** @type {Finding[]} */
  const findings = [];
  /** @type {string[]} */
  const skips = [];
  /** @param {string} check @param {string | undefined} path @param {string} problem @param {string} remedy */
  const fail = (check, path, problem, remedy) =>
    findings.push({ check, path, problem, remedy });

  const manifestChanged = changed.includes("package.json");
  const lockChanged = changed.includes("package-lock.json");
  const depsChanged =
    depsAt(`${base}:package.json`) !== depsAt("HEAD:package.json");
  if (depsChanged && !lockChanged) {
    fail(
      "dependency lock sync",
      "package.json",
      "a dependency in package.json changed but package-lock.json did not move in this range",
      "commit the regenerated lock file alongside the manifest change",
    );
  }
  if (lockChanged && !manifestChanged) {
    fail(
      "dependency lock sync",
      "package-lock.json",
      "package-lock.json moved with no manifest change in this range",
      "state the upgrade in a commit message or a decision record, or include the manifest change",
    );
  }

  // Check 16 (gate 2) — dependency licence register completeness. Reuses
  // check-licence.mjs unmodified; only the "is the lock file in scope"
  // decision differs from pre-commit.mjs (staged vs. range).
  const lic = checkLicenceCompleteness(lockChanged);
  findings.push(...lic.findings);
  skips.push(...lic.skips);

  // Check 7 (gate 6) — dependency licence policy. Reads the same register as
  // completeness above, judged against the allow list rather than for a
  // missing row (registers.md: "completeness and policy are different
  // checks"); change-triggered the same way.
  const policy = checkLicencePolicy(lockChanged);
  findings.push(...policy.findings);
  skips.push(...policy.skips);

  // Check 6 (gate 6) — dependency advisory scan. Change-triggered like the
  // licence register above, plus scheduled: GITHUB_EVENT_NAME is "schedule"
  // when the sibling cron trigger (dependency-advisory-schedule.yml) invokes
  // this same script, so the advisory database is checked even on a day
  // nobody touched a dependency (change-triggered-checks.md).
  const scheduled = process.env.GITHUB_EVENT_NAME === "schedule";
  const advisories = checkDependencyAdvisories(lockChanged || scheduled);
  findings.push(...advisories.findings);
  skips.push(...advisories.skips);

  // Check 11 (gate 6) — minimum release age. Change-triggered like the two
  // dependency checks above, plus scheduled: a dependency old enough to pass
  // when adopted stays old enough, so only a new dependency (or a new advisory
  // scan) raises the question. The window is derived from npm's own
  // `min-release-age` config (.npmrc); see check-minimum-release-age.mjs for
  // the tooling ladder and why the resolver flag alone is not the gate.
  const releaseAge = checkMinimumReleaseAge(lockChanged || scheduled);
  findings.push(...releaseAge.findings);
  skips.push(...releaseAge.skips);

  // Check 11 (gate 6) — minimum release age register staleness. Register hygiene
  // rather than a dependency question: runs whenever the register exists, the
  // same way the change-size-override and unapproved-suppression checks below do,
  // because a row that has aged past the window is stale regardless of whether a
  // dependency moved in this range.
  const staleness = checkMinimumReleaseAgeStaleness();
  findings.push(...staleness.findings);
  skips.push(...staleness.skips);

  return { findings, skips };
}
