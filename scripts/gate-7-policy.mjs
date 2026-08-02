// Gate 7's policy seam, split from gate-7-on-demand.mjs: installation,
// workspace and platform capability, the refusal-proof audit, and the two
// script-wiring audits (quality-script and script-file/index). runPolicyChecks
// returns the findings and skips this seam produced, in the order the original
// single-file sweep pushed them; the orchestrator merges them before printing
// the report.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { git } from "./lib.mjs";
import {
  checkScriptWiring,
  checkScriptFileWiring,
  checkIndexGateClaims,
  GATE_FILES,
} from "./check-script-wiring.mjs";
import { checkBranchProtection } from "./check-branch-protection.mjs";
import { checkRepositoryFeatures } from "./check-repository-features.mjs";
import { checkRefusalProofs } from "./check-refusal-proofs.mjs";

/** @typedef {{ check: string, path?: string, problem?: string, remedy?: string }} Finding */
/** @typedef {(c: string, p: string, problem: string, remedy: string) => void} Adder */

// --- Policy: installation check ---
// npm tools are verified by their bin in node_modules/.bin rather than a
// `--version` probe: several (markdownlint-cli2) do not implement --version and
// would false-report as missing. semgrep and lizard live on PATH, not npm.
/** @param {string} name */
function npmBin(name) {
  return (
    existsSync(join("node_modules", ".bin", name)) ||
    existsSync(join("node_modules", ".bin", name + ".cmd"))
  );
}

/** @param {Adder} add */
function installationCheck(add) {
  const hooksPath = git(["config", "--get", "core.hooksPath"]);
  if (hooksPath.status !== 0 || !hooksPath.stdout.trim()) {
    add(
      "installation check",
      "core.hooksPath",
      "no git hooks path is set; husky may not have installed",
      "run `npm install` (or `npm run prepare`) to install hooks",
    );
  } else {
    const hp = hooksPath.stdout.trim();
    for (const h of ["pre-commit", "commit-msg", "pre-push"]) {
      if (!existsSync(join(hp, h)) && !existsSync(join(".husky", h))) {
        add(
          "installation check",
          `${hp}/${h}`,
          "hook file missing",
          "reinstall husky hooks",
        );
      }
    }
  }
  for (const tool of [
    "prettier",
    "cspell",
    "markdownlint-cli2",
    "commitlint",
    "tsc",
  ]) {
    if (!npmBin(tool)) {
      add(
        "installation check",
        tool,
        "required tool not installed",
        "`npm install` to install dev dependencies",
      );
    }
  }
  for (const cfg of [
    "package.json",
    "tsconfig.json",
    "cspell.json",
    ".secretlintrc.json",
  ]) {
    try {
      JSON.parse(readFileSync(cfg, "utf8"));
    } catch {
      add(
        "installation check",
        cfg,
        "configuration file does not parse",
        "fix the JSON",
      );
    }
  }
}

// --- Policy: workspace capability check ---
/** @param {Adder} add */
function workspaceCapabilityCheck(add) {
  // Long-path support is a Windows-only git setting; POSIX handles long paths
  // natively, so the check is reported only where it can actually bite.
  if (process.platform === "win32") {
    const lp = git(["config", "--get", "core.longpaths"]);
    if (lp.status !== 0 || !/true/i.test(lp.stdout.trim())) {
      add(
        "workspace capability — long paths",
        "core.longpaths",
        "long-path support is not enabled; a deep path can fail to clone or build on Windows",
        "run `git config --global core.longpaths true` (a gate reports; it does not set this for you)",
      );
    }
  }
  const attr = readFileSync(".gitattributes", "utf8");
  if (!/^\* text=auto eol=lf/m.test(attr)) {
    add(
      "workspace capability — line endings",
      ".gitattributes",
      "`* text=auto eol=lf` is not declared",
      "declare line-ending normalisation",
    );
  }
  if (!existsSync(".editorconfig")) {
    add(
      "workspace capability — editorconfig",
      ".editorconfig",
      "missing",
      "add .editorconfig agreeing with .gitattributes",
    );
  }
}

// --- Policy: platform capability audit ---
// Azure DevOps and any host besides GitHub still has no local check —
// `az repos policy list` stays a by-hand step (platforms.md). GitHub's own
// branch protection is no longer one (cross-gate-rules.md, "every
// blocking local check has a named required status check server-side")
// closes it below, using the same local `gh` session a human or agent
// running gate 7 by hand already has. A sibling check adds which
// free GitHub repository features (Dependabot, secret
// scanning, code scanning, ...) are actually enabled — see
// docs/standards/guardrails/gate-7-on-demand.md#platform-features-enabled-by-default.
/** @param {Finding[]} findings @param {string[]} skips */
async function platformCapabilityAudit(findings, skips) {
  skips.push(
    "platform capability audit — non-GitHub hosts still need `az repos policy list` by hand; not a local check here",
  );
  {
    const { findings: bp, skips: bpSkips } = await checkBranchProtection();
    for (const f of bp) findings.push(f);
    skips.push(...bpSkips);
  }
  {
    const { findings: rf, skips: rfSkips } = await checkRepositoryFeatures();
    for (const f of rf) findings.push(f);
    skips.push(...rfSkips);
  }
}

// --- Policy: refusal-proof audit (cross-gate-rules.md, "Every
// blocking check proves it refuses"). REFUSAL_PROOF_FIXTURE guards against
// the recursion this would otherwise cause: one of the audit's own fixtures
// runs this very script against a scratch repository to prove the semgrep
// wrapper refuses, and that nested run must not spawn the audit again.
// Reported into gate 7's own findings/skips, never a reason for this sweep
// to exit non-zero — gate 7 reports, it does not block (the dedicated CI
// workflow, refusal-proof-audit.yml, is where "does not refuse" blocks).
/** @param {Adder} add @param {string[]} skips */
async function refusalProofAudit(add, skips) {
  if (!process.env.REFUSAL_PROOF_FIXTURE) {
    const { refuses, doesNotRefuse, noFixture } = await checkRefusalProofs();
    for (const c of doesNotRefuse) {
      add(
        "refusal-proof audit",
        c,
        `${c} was given its negative fixture and did not refuse it — the check is decorative`,
        "restore whatever makes the check actually fail on a bad input (a missing --error/--max-warnings flag, a tool that always exits 0)",
      );
    }
    for (const c of noFixture) skips.push(`refusal-proof audit — ${c}`);
    if (refuses.length) {
      skips.push(
        `refusal-proof audit — ${refuses.length} check(s) proved they refuse their negative fixture`,
      );
    }
  }
}

// --- Policy: quality-script wiring audit (cross-gate-rules.md,
// "Every quality script is wired or declared"). A script in package.json
// that no gate invokes and no on-demand declaration covers reads as a
// check the repository runs when nothing runs it — worse than an absent
// script. Also a wiring property, also reported rather than blocked.
//
// package.json may not exist or may not parse — a scratch repository built
// to isolate one check (this module's own refusal-proof fixtures do exactly
// this) has no reason to carry one, and a gate crashing on a missing file
// it does not itself require is worse than the finding it would otherwise
// report. Read the same way the installation check below reads its own
// config files: try, and report rather than throw.
/** @param {Adder} add @param {string[]} skips */
function qualityScriptWiring(add, skips) {
  let pkg = null;
  try {
    pkg = JSON.parse(readFileSync("package.json", "utf8"));
  } catch {
    skips.push(
      "quality-script wiring — package.json missing or unparseable, check skipped",
    );
  }
  const { wired, onDemand, unwired } = pkg
    ? checkScriptWiring(pkg.scripts)
    : { wired: [], onDemand: [], unwired: [] };
  for (const s of unwired) {
    add(
      "quality-script wiring",
      "package.json",
      s,
      "wire the script into the gate that owns its concern, or declare it on-demand in scripts/check-script-wiring.mjs naming the gate that would otherwise own it",
    );
  }
  if (wired.length) {
    skips.push(
      `quality-script wiring — ${wired.length} script(s) confirmed wired: ${wired.join(", ")}`,
    );
  }
  if (onDemand.length) {
    skips.push(
      `quality-script wiring — ${onDemand.length} script(s) declared on-demand: ${onDemand.join(", ")}`,
    );
  }
}

// --- Policy: script-file wiring audit ("close the class, not just
// the instance"). checkScriptWiring above only sees what package.json's
// `scripts` object names; check-standards-instantiation.mjs was never
// listed there at all, so it sat ported, unit-tested and never imported by
// anything that runs without ever tripping that audit. This scans scripts/
// itself for every check-*.mjs file, independent of the manifest.
/** @param {Adder} add @param {string[]} skips */
function scriptFileWiringCheck(add, skips) {
  /** @type {string[]} */
  let scriptFiles = [];
  try {
    scriptFiles = readdirSync("scripts").filter((f) => f.endsWith(".mjs"));
  } catch {
    skips.push("script-file wiring — scripts/ directory not found, skipped");
  }
  /** @param {string} f */
  const readScript = (f) => readFileSync(join("scripts", f), "utf8");
  const { wired, onDemand, unwired } = scriptFiles.length
    ? checkScriptFileWiring(scriptFiles, readScript)
    : { wired: [], onDemand: [], unwired: [] };
  for (const s of unwired) {
    add(
      "script-file wiring",
      "scripts/",
      s,
      "import it from the gate that owns its concern, or declare it on-demand in SCRIPT_FILE_ON_DEMAND (check-script-wiring.mjs) naming why",
    );
  }
  if (wired.length) {
    skips.push(
      `script-file wiring — ${wired.length} check script(s) confirmed imported somewhere in scripts/: ${wired.join(", ")}`,
    );
  }
  if (onDemand.length) {
    skips.push(
      `script-file wiring — ${onDemand.length} check script(s) declared on-demand: ${onDemand.join(", ")}`,
    );
  }

  // --- The same defect one level up, in a tooling index's own
  // prose rather than the manifest: scripts/README.md (if this repository
  // carries one) can claim a script "runs at gate N" without anything ever
  // re-checking that claim against the gate's actual imports.
  const indexPath = join("scripts", "README.md");
  if (existsSync(indexPath)) {
    /** @type {Record<string, string>} */
    const gateSources = {};
    for (const f of Object.values(GATE_FILES)) {
      try {
        gateSources[f] = readFileSync(join("scripts", f), "utf8");
      } catch {
        gateSources[f] = "";
      }
    }
    const mismatches = checkIndexGateClaims(
      readFileSync(indexPath, "utf8"),
      gateSources,
    );
    for (const m of mismatches) {
      add(
        "script-index wiring",
        indexPath,
        m,
        "fix the gate the index names, or the wiring — the index and the code must agree",
      );
    }
    if (!mismatches.length) {
      skips.push(
        "script-index wiring — scripts/README.md's gate claims match actual wiring",
      );
    }
  } else {
    skips.push(
      "script-index wiring — no scripts/README.md in this repository, nothing to check",
    );
  }
}

/** @returns {Promise<{ findings: Finding[], skips: string[] }>} */
export async function runPolicyChecks() {
  /** @type {Finding[]} */
  const findings = [];
  /** @type {string[]} */
  const skips = [];
  /** @param {string} c @param {string} p @param {string} problem @param {string} remedy */
  const add = (c, p, problem, remedy) =>
    findings.push({ check: c, path: p, problem, remedy });
  installationCheck(add);
  workspaceCapabilityCheck(add);
  await platformCapabilityAudit(findings, skips);
  await refusalProofAudit(add, skips);
  qualityScriptWiring(add, skips);
  scriptFileWiringCheck(add, skips);
  return { findings, skips };
}
