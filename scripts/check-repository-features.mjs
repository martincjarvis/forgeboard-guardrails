// Fix brief 8, item 2 — "every check the platform already provides is
// enabled rather than rebuilt" (cross-gate-rules.md) was unactionable:
// audit 5 found Dependabot and vulnerability alerts disabled with no
// decision record, and no cycle since fixed it, because nothing enumerated
// which features the rule actually meant or told an implementer how to
// tell "off" from "not offered on this plan." See
// docs/standards/guardrails/gate-7-on-demand.md#platform-features-enabled-by-default
// for the standard this implements, and scripts/configure-repository-features.mjs
// for the "supply the mechanism" half — the same two-halves split
// scripts/check-branch-protection.mjs and scripts/configure-branch-protection.mjs
// already use for branch protection.
//
// Two features (Dependabot alerts, Dependabot security updates) have their
// own dedicated endpoints that answer "enabled/disabled" unambiguously by
// GET alone. Code scanning's own endpoint (code-scanning/default-setup)
// answers the same way: a 200 means the feature is available, so its
// `state` field is trustworthy; a non-200 is reported as unavailable rather
// than guessed. Secret scanning and push protection are different: they are
// read from the repository resource's own `security_and_analysis` block,
// which reports `status: "disabled"` on a private repository whose plan has
// not purchased it exactly the same way it does on a plan that could enable
// it but has not —
// verified directly against a private GitHub-Free repository (PATCHing
// `security_and_analysis.secret_scanning.status` there returns `422
// "Secret scanning is not available for this repository."`, while the GET
// that feeds this check reports `disabled` regardless). A read-only check
// cannot resolve that ambiguity without attempting the change, so on a
// private repository it is reported as a skip naming the ambiguity, never a
// finding a repository on the wrong plan can never clear — a public
// repository has no such ambiguity, because both are free there on every
// plan.
import { have, run, report } from "./lib.mjs";
import { pathToFileURL } from "node:url";

const RUN_SCRIPT = "run `node scripts/configure-repository-features.mjs`";

/** One gated feature's read-only classification against what a read-only
 *  probe can actually tell: "enabled", "disabled" (unambiguous — either a
 *  dedicated endpoint that itself fails when unavailable, or a public
 *  repository, both free at that visibility), or a private repository's
 *  ambiguous `security_and_analysis` reading, which is reported as a skip
 *  rather than guessed either way. Split out so evaluateRepositoryFeatures
 *  stays a flat sequence of feature classifications, not a chain of ifs each
 *  worth its own point of cyclomatic complexity.
 *  @param {string} name
 *  @param {"enabled" | "disabled" | { unavailable: string } | null | undefined} value
 *  @param {"public" | "private" | null} visibility
 *  @param {string} availableMessage
 *  @param {string[]} skips
 *  @param {(check: string, problem: string) => void} add */
function classifyGated(name, value, visibility, availableMessage, skips, add) {
  if (value === "enabled") {
    skips.push(`${name} — enabled`);
    return;
  }
  if (value && typeof value === "object" && value.unavailable) {
    skips.push(`${name} — unavailable: ${value.unavailable}`);
    return;
  }
  if (value === null || value === undefined) {
    skips.push(`${name} — could not read its status`);
    return;
  }
  // value === "disabled"
  if (visibility === "public") {
    add(name, `${name} is off on a public repository — ${availableMessage}`);
  } else {
    skips.push(
      `${name} — reports disabled on a ${visibility ?? "non-public"} repository; ` +
        `GitHub's read API does not distinguish "available and off" from ` +
        `"not purchasable on this plan" without attempting to enable it — ` +
        `${RUN_SCRIPT} to resolve which, or check GitHub Settings > Code ` +
        `security directly`,
    );
  }
}

/** Pure verdict over already-fetched state — exported and tested directly
 *  against constructed fixtures, the same split evaluateBranchProtection
 *  uses (check-branch-protection.mjs).
 *  @param {{
 *    visibility?: "public" | "private" | null,
 *    dependabotAlerts?: "enabled" | "disabled" | null,
 *    dependabotSecurityUpdates?: "enabled" | "disabled" | null,
 *    secretScanning?: "enabled" | "disabled" | null,
 *    pushProtection?: "enabled" | "disabled" | null,
 *    codeScanning?: "enabled" | "disabled" | {unavailable: string} | null,
 *  }} state
 *  @returns {{findings: {check: string, path: string, problem: string, remedy: string}[], skips: string[]}}
 */
export function evaluateRepositoryFeatures({
  visibility = null,
  dependabotAlerts = null,
  dependabotSecurityUpdates = null,
  secretScanning = null,
  pushProtection = null,
  codeScanning = null,
} = {}) {
  /** @type {{ check: string, path: string, problem: string, remedy: string }[]} */
  const findings = [];
  const skips = [];
  /** @type {(check: string, problem: string) => void} */
  const add = (check, problem) => {
    findings.push({ check, path: "", problem, remedy: RUN_SCRIPT });
  };

  skips.push(
    "dependency graph — always on for a supported manifest; the platform exposes no toggle to audit",
  );

  // Free on every plan and every visibility (verified directly: PUT
  // succeeded against a private GitHub-Free repository) — "disabled" is
  // always a genuine finding here, never a plan-or-visibility skip.
  if (dependabotAlerts === "disabled") {
    add(
      "Dependabot alerts",
      "Dependabot alerts are off; they are free on every plan and every repository visibility",
    );
  } else if (dependabotAlerts === null || dependabotAlerts === undefined) {
    skips.push("Dependabot alerts — could not read `vulnerability-alerts`");
  } else {
    skips.push("Dependabot alerts — enabled");
  }

  if (dependabotSecurityUpdates === "disabled") {
    add(
      "Dependabot security updates",
      "Dependabot security updates are off; they are free on every plan and every repository visibility",
    );
  } else if (
    dependabotSecurityUpdates === null ||
    dependabotSecurityUpdates === undefined
  ) {
    skips.push(
      "Dependabot security updates — could not read `automated-security-fixes`",
    );
  } else {
    skips.push("Dependabot security updates — enabled");
  }

  classifyGated(
    "secret scanning",
    secretScanning,
    visibility,
    "free on every plan for a public repository",
    skips,
    add,
  );
  classifyGated(
    "push protection",
    pushProtection,
    visibility,
    "free on every plan for a public repository, once secret scanning itself is on",
    skips,
    add,
  );

  // code-scanning/default-setup is its own endpoint: a 200 means the
  // feature is available on this repository (so "not-configured" is an
  // unambiguous finding, on any visibility), and a non-200 is reported as
  // unavailable rather than assumed to mean either "off" or "no permission."
  if (codeScanning === "enabled") {
    skips.push("code scanning — enabled");
  } else if (codeScanning === "disabled") {
    add(
      "code scanning",
      "code scanning is not configured, and the default-setup endpoint reads successfully — this repository can enable it",
    );
  } else if (
    codeScanning &&
    typeof codeScanning === "object" &&
    codeScanning.unavailable
  ) {
    skips.push(`code scanning — unavailable: ${codeScanning.unavailable}`);
  } else {
    skips.push("code scanning — could not read its status");
  }

  skips.push(
    "code coverage (Code Quality) — no documented API to audit; GitHub Team " +
      "or Enterprise Cloud only, regardless of visibility — see " +
      "docs/standards/guardrails/gate-6-pull-request.md#coverage-legible-without-a-download",
  );

  return { findings, skips };
}

/** @param {(command: string, args: readonly string[], options?: object) => {status: number | null, stdout?: string, stderr?: string}} runFn */
function alertState(runFn) {
  const r = runFn("gh", ["api", "repos/:owner/:repo/vulnerability-alerts"]);
  if (r.status === 0) return "enabled";
  if (/404/.test(r.stderr || "")) return "disabled";
  return null;
}

/** @param {(command: string, args: readonly string[], options?: object) => {status: number | null, stdout?: string, stderr?: string}} runFn */
function securityUpdatesState(runFn) {
  const r = runFn("gh", ["api", "repos/:owner/:repo/automated-security-fixes"]);
  if (r.status !== 0) return null;
  try {
    return JSON.parse(r.stdout ?? "").enabled ? "enabled" : "disabled";
  } catch {
    return null;
  }
}

/** @param {(command: string, args: readonly string[], options?: object) => {status: number | null, stdout?: string, stderr?: string}} runFn */
function codeScanningState(runFn) {
  const r = runFn("gh", [
    "api",
    "repos/:owner/:repo/code-scanning/default-setup",
  ]);
  if (r.status === 0) {
    try {
      const body = JSON.parse(r.stdout ?? "");
      return body.state === "configured" ? "enabled" : "disabled";
    } catch {
      return {
        unavailable: "code-scanning/default-setup returned unparseable JSON",
      };
    }
  }
  return {
    unavailable:
      (r.stderr || "").trim().split("\n")[0] ||
      "code-scanning/default-setup could not be read",
  };
}

/** @param {Record<string, { status?: string } | null> | null} analysis @param {string} key */
function statusOf(analysis, key) {
  const v = analysis?.[key]?.status;
  return v === "enabled" || v === "disabled" ? v : null;
}

/** { findings, skips }. Impure: resolves the repository, reads each
 *  feature's live state via `gh api`, then hands it to
 *  evaluateRepositoryFeatures above. Every early return is a SKIP naming
 *  why — gh missing, unauthenticated, or no GitHub remote — the same
 *  discipline checkBranchProtection uses. `have`/`run` are injectable so
 *  the skip paths are testable without a live `gh` session.
 *  @param {{
 *    have?: (command: string, args?: readonly string[]) => boolean,
 *    run?: (command: string, args: readonly string[], options?: object) => {status: number|null, stdout?: string, stderr?: string},
 *  }} [deps]
 */
export async function checkRepositoryFeatures({
  have: haveFn = have,
  run: runFn = run,
} = {}) {
  /** @type {string[]} */
  const skips = [];
  if (!haveFn("gh", ["--version"])) {
    skips.push(
      "repository features audit — gh not on PATH; install the GitHub CLI to enable this check",
    );
    return { findings: [], skips };
  }
  if (runFn("gh", ["api", "user"], { stdio: "ignore" }).status !== 0) {
    skips.push(
      "repository features audit — gh is not authenticated (`gh auth login`); check skipped",
    );
    return { findings: [], skips };
  }
  const repoGet = runFn("gh", ["api", "repos/:owner/:repo"]);
  if (repoGet.status !== 0) {
    skips.push(
      "repository features audit — gh could not resolve a GitHub repository from this checkout (no GitHub remote?)",
    );
    return { findings: [], skips };
  }
  let repo;
  try {
    // No stdout is not an empty object: `JSON.parse("")` throws, so absent
    // output lands on the same skip as unparseable output rather than
    // reading as a repository with every feature off.
    repo = JSON.parse(repoGet.stdout ?? "");
  } catch {
    skips.push(
      "repository features audit — gh api returned unparseable JSON for the repository",
    );
    return { findings: [], skips };
  }
  const visibility = repo.visibility ?? (repo.private ? "private" : "public");
  const analysis = repo.security_and_analysis ?? null;

  const evaluated = evaluateRepositoryFeatures({
    visibility,
    dependabotAlerts: alertState(runFn),
    dependabotSecurityUpdates: securityUpdatesState(runFn),
    secretScanning: statusOf(analysis, "secret_scanning"),
    pushProtection: statusOf(analysis, "secret_scanning_push_protection"),
    codeScanning: codeScanningState(runFn),
  });

  return {
    findings: evaluated.findings,
    skips: [...skips, ...evaluated.skips],
  };
}

const argv1 = process.argv[1];
const isMain = argv1 && import.meta.url === pathToFileURL(argv1).href;
if (isMain) {
  const { findings, skips } = await checkRepositoryFeatures();
  report("gate 7", findings, skips);
}
