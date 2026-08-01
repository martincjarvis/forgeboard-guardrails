#!/usr/bin/env node
// Gate 7 — On demand. The whole-repository sweep: run before trusting any of
// the incremental gates, or when adopting the toolkit. Reports rather than
// blocks — the caller decides the consequence — so this script exits 0 and
// prints a clear banner either way. (The server-side gate 6 is the authority.)
//
// Run with `npm run gate:7`.
import { spawn } from "node:child_process";
import {
  createWriteStream,
  unlinkSync,
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import {
  trackedFiles,
  isText,
  have,
  run,
  git,
  formatFindingBody,
} from "./lib.mjs";
import { checkLinks } from "./check-links.mjs";
import { checkMachineId } from "./check-machine-id.mjs";
import { checkRefusalProofs } from "./check-refusal-proofs.mjs";
import {
  checkScriptWiring,
  checkScriptFileWiring,
  checkIndexGateClaims,
  GATE_FILES,
} from "./check-script-wiring.mjs";
import { checkBranchProtection } from "./check-branch-protection.mjs";
import { checkRepositoryFeatures } from "./check-repository-features.mjs";
import {
  checkToolingClassDeclared,
  checkToolingCoverageLeakage,
  checkToolingTestSuiteExists,
  complexityScanFiles,
} from "./check-tooling-class.mjs";

/** @type {{check: string, path?: string, problem?: string, remedy?: string}[]} */
const findings = [];
const skips = [];
/** @param {string} c @param {string} p @param {string} problem @param {string} remedy */
const add = (c, p, problem, remedy) =>
  findings.push({ check: c, path: p, problem, remedy });

const tracked = trackedFiles();
const trackedText = tracked.filter(isText);
const secretAvail = have("npx", ["--no-install", "secretlint", "--version"]);

// --- Security: whole-repository secret scan ---
if (secretAvail) {
  const scan = run("npx", ["--no-install", "secretlint", ...trackedText]);
  if (scan.status !== 0) {
    add(
      "repository-wide secret scan",
      "",
      (scan.stdout || "") + (scan.stderr || ""),
      "revoke the credential first, then remove it; rewriting history is a separate decision",
    );
  }
} else {
  skips.push("repository-wide secret scan — secretlint not installed");
}

// --- Security: history secret scan (the only check that reads past HEAD) ---
// secretlint has no stdin mode and refuses paths outside cwd, so stream the
// history diff to a momentary in-repo file, scan it, and delete it. The file is
// never tracked and is gone before the run ends. `--no-merges` keeps the diff to
// what was actually added.
if (secretAvail) {
  const probe = join(process.cwd(), "history-scan.tmp");
  const wrote = await new Promise((resolve) => {
    const g = spawn(
      "git",
      ["log", "--all", "-p", "-U0", "--no-color", "--no-merges"],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    const ws = createWriteStream(probe);
    g.stdout.pipe(ws);
    g.on("close", (code) => resolve(code === 0 && existsSync(probe)));
    g.on("error", () => resolve(false));
  });
  if (wrote && readFileSync(probe, "utf8").trim()) {
    const scan = run("npx", ["--no-install", "secretlint", probe]);
    if (scan.status !== 0) {
      add(
        "history secret scan",
        "",
        (scan.stdout || "") + (scan.stderr || ""),
        "revoke first; the credential is in every clone even if deleted from HEAD",
      );
    }
  } else {
    skips.push("history secret scan — no history to scan");
  }
  try {
    unlinkSync(probe);
  } catch {
    /* already gone */
  }
} else {
  skips.push(
    "history secret scan — secretlint not installed (prefer a dedicated scanner for scale)",
  );
}

// --- Security: repository-wide machine-identifying content ---
for (const f of checkMachineId()) findings.push(f);

// --- Security: repository-wide analysis (semgrep) ---
if (have("semgrep", ["--version"])) {
  // --error is what makes a finding a failure: without it semgrep reports and
  // still exits 0, so the check reads as green with findings on screen. This
  // scan was decorative until that was noticed.
  const sg = run("semgrep", ["--config", "auto", "--quiet", "--error", "."]);
  if (sg.status !== 0) {
    add(
      "repository-wide analysis (semgrep)",
      "",
      (sg.stdout || "") + (sg.stderr || ""),
      "triage each finding; suppress per-rule per-path with a register row if accepted",
    );
  }
} else {
  skips.push("repository-wide analysis — semgrep not on PATH");
}

// --- Size: repository-wide complexity scan (lizard) ---
// lizard is the general-purpose backstop, and a backstop scans everything —
// including stacks that have a specialised analyser. Where the specialised tool
// genuinely covers the property, lizard finds nothing, and finding nothing is
// the expected result rather than a reason to exclude the language. Excluding a
// stack because a specialised tool "already covers it" is how a repository ends
// up with no complexity measurement at all: a type checker is not a complexity
// analyser, so tsc does not stand in for this.
//
// It runs here, at the on-demand gate, and not at commit — it is heavyweight and
// general-purpose, so it belongs in the later tier with semgrep and the CI
// platform scanners. This gate reports and never blocks, and the whole sweep
// takes about ten seconds.
//
// This scan was once excluded for JavaScript on the grounds that lizard's
// tokenizer misparses ES modules. Read a finding before acting on it: lizard's
// function-span detection does fail here, and when it does the whole remainder
// of the file is attributed to one function. Measured on this repository's own
// `hooks/gate-4-task-completion.mjs`, lizard reported `classOf@44-218` in a
// 225-line file for a function that really ends at line 49 — six lines reported
// as 175, and every branch after it counted as its own.
//
// That is a reason to check a finding, not to exclude the language. Of the three
// findings this scan raised here, two were real — `resolveTarget` and
// `checkSuppressions`, both genuinely CCN 16, both since split — and one was the
// span artefact above. Excluding JavaScript to avoid the artefact would have
// hidden the two true findings, which is the worse trade. Confirm a span against
// the source before splitting a function to satisfy it.
//
// This gate's report-only tolerance for that artefact is not automatically
// gate 6's: gate 6 reuses this same invocation against changed files but
// hard-blocks, and `hooks/test/hooks.test.mjs` was the file that proved the
// gap — split by subject area rather than left to trip every future
// bootstrap's first commit (ADR-0009, cross-gate-rules.md: "a check reused
// across gates carries its severity model with it").
//
// This used to hand lizard "." unfiltered, scanning every tracked
// file regardless of class. That had no visible effect here only because
// every file in this toolkit's own repository is `production`
// (file-classes.md's stated carve-out for a repository whose product is the
// tooling); ported to a consuming repository it would scan a `tooling`-
// classed gate script too, silently reintroducing exactly what the class was
// declared to exclude (thresholds.md: the complexity backstop's own scope is
// "Production and test code", never tooling). complexityScanFiles derives
// the file list from each file's own declared class instead.
const complexityFiles = complexityScanFiles();
if (!complexityFiles.length) {
  skips.push("repository-wide size scan — no production or test file tracked");
} else if (have("lizard", ["--version"])) {
  const lz = run("lizard", [
    "-C",
    "15",
    "-L",
    "100",
    "-a",
    "7",
    ...complexityFiles,
  ]);
  if (lz.status !== 0) {
    add(
      "repository-wide size scan (lizard)",
      "",
      (lz.stdout || "") + (lz.stderr || ""),
      "split the long or complex function; the thresholds are the gap-fill defaults",
    );
  }
} else {
  skips.push("repository-wide size scan — lizard not on PATH");
}

// --- Size: tooling file class (file-classes.md, "The class is per
// repository, not per filename") --------------------------------------------
// Two checks the class attribute never had exercised against it before:
// a consuming repository with ported gate scripts and no file classed
// `tooling` anywhere (checkToolingClassDeclared — this toolkit's own
// repository is exempt, the same carve-out complexityScanFiles above
// relies on), and a `tooling`-classed file that still shows up in the
// coverage report this run's own `test:coverage` script produced
// (checkToolingCoverageLeakage — a visible skip, not a finding, when no
// report exists yet in this pass).
{
  for (const f of checkToolingClassDeclared())
    add(f.check, f.path, f.problem, f.remedy);
  const { findings: leaked, skips: leakSkips } = checkToolingCoverageLeakage();
  for (const f of leaked) add(f.check, f.path, f.problem, f.remedy);
  skips.push(...leakSkips);
  // testing-strategy.md's own tooling-suite requirement, stated in
  // full and never checked: a repository carrying tooling-classed gate
  // scripts with nothing that tests them is a finding, the same tier as the
  // class-declaration check just above.
  for (const f of checkToolingTestSuiteExists())
    add(f.check, f.path, f.problem, f.remedy);
}

// --- Documentation: link and anchor integrity ---
for (const f of checkLinks()) findings.push(f);

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
{
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
{
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

// --- Policy: refusal-proof audit (cross-gate-rules.md, "Every
// blocking check proves it refuses"). REFUSAL_PROOF_FIXTURE guards against
// the recursion this would otherwise cause: one of the audit's own fixtures
// runs this very script against a scratch repository to prove the semgrep
// wrapper refuses, and that nested run must not spawn the audit again.
// Reported into gate 7's own findings/skips, never a reason for this sweep
// to exit non-zero — gate 7 reports, it does not block (the dedicated CI
// workflow, refusal-proof-audit.yml, is where "does not refuse" blocks).
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
{
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
{
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

// Report. Gate 7 reports; the caller decides. It does not block.
for (const s of skips) process.stderr.write(`gate 7: SKIP ${s}\n`);
for (const f of findings) {
  const where = f.path ? ` (${f.path})` : "";
  process.stderr.write(`gate 7: FINDING ${f.check}${where}\n`);
  for (const line of formatFindingBody(f.problem)) {
    process.stderr.write(`          ${line}\n`);
  }
}
const banner = findings.length
  ? `gate 7: ${findings.length} finding(s), ${skips.length} skip(s) — reports only, caller decides`
  : `gate 7: clean — ${skips.length} skip(s)`;
process.stderr.write(`${banner}\n`);
process.exit(0);
