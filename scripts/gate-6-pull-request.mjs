#!/usr/bin/env node
// cspell:ignore PYTHONUTF nloc
// Gate 6 — Pull request pipeline, local-check surface. Re-runs the gates 2-5
// checks against the pull request's range, on a clean checkout that has no
// staged index — see docs/standards/guardrails/gate-6-pull-request.md, "check
// 3 adapts each local check to the pull request's range": `git diff --cached`
// becomes `git diff origin/<base>...HEAD`, and `git show :<path>` becomes
// `<path>` read straight from the checkout, which already holds what the
// branch would commit.
//
// Invoked by .github/workflows/pull-request.yml. Runs by hand as
// `node scripts/gate-6-pull-request.mjs [base-branch]` from a normal clone —
// resolveBase() supplies the base the same way the local gates do when no
// argument is given.
//
// Unlike pre-commit.mjs, which stops at the first failure for a fast local
// loop, this collects every finding before reporting: a CI re-run is
// expensive, so the pull request author wants the whole list in one push, the
// same reasoning gate 4 already applies locally
// (gate-4-task-completion.md: "collects every finding before reporting").
//
// This is the reference gate-6 workflow the corpus asks every consuming
// repository to port (gate-6-pull-request.md's own verification checklist);
// see .github/workflows/pull-request.yml for how it is wired to a pull
// request event, and skills/repository-bootstrap/SKILL.md for where an
// implementer is pointed at it.
import { existsSync, statSync, appendFileSync } from "node:fs";
import {
  git,
  run,
  have,
  isText,
  classOf,
  changedFiles,
  resolveBase,
  deriveComponent,
  classifyTestCoverageOutcome,
  report,
} from "./lib.mjs";
import { checkLinks } from "./check-links.mjs";
import { checkSuppressions } from "./check-suppressions.mjs";
import { checkMachineId } from "./check-machine-id.mjs";
import { checkLicenceCompleteness } from "./check-licence.mjs";
import { checkLicencePolicy } from "./check-licence-policy.mjs";
import { checkDependencyAdvisories } from "./check-dependency-advisories.mjs";
import { checkCommitRange } from "./check-scope.mjs";
import { checkAdrApprover } from "./check-adr-approver.mjs";
import { normalizeSarifPaths, filterSuppressedSarif } from "./lib.mjs";

/** @type {{check: string, path?: string, problem?: string, remedy?: string}[]} */
const findings = [];
const skips = [];
const fail = (check, path, problem, remedy) =>
  findings.push({ check, path, problem, remedy });
const skip = (s) => skips.push(s);

// --- Resolve the base and the range ---------------------------------------
// `GITHUB_BASE_REF` is the pull request's base branch name in a `pull_request`
// workflow event; a manual run falls back to resolveBase(), the same
// origin/HEAD derivation gate 0 and the local gate 2 hook already use, so a
// renamed default branch does not need this script edited to match.
const baseArg = process.argv[2] || process.env.GITHUB_BASE_REF || null;
const base = baseArg ? `origin/${baseArg}` : resolveBase();
if (base && git(["rev-parse", "--verify", "--quiet", base]).status !== 0) {
  // A shallow or single-branch checkout may not have the base ref yet.
  git([
    "fetch",
    "--no-tags",
    "--quiet",
    "origin",
    base.replace(/^origin\//, ""),
  ]);
}
if (!base || git(["rev-parse", "--verify", "--quiet", base]).status !== 0) {
  console.error(
    "gate 6: cannot resolve the base branch — nothing to compare the pull request against",
  );
  process.exit(1);
}
const range = `${base}...HEAD`; // three-dot: merge-base to HEAD, gate-6's own form
const logRange = `${base}..HEAD`; // two-dot: every commit the branch actually added
process.stderr.write(`gate 6: base ${base}, range ${range}\n`);

const changed = changedFiles(range);
const changedText = changed.filter(isText);
process.stderr.write(`gate 6: ${changed.length} file(s) changed in range\n`);

// --- Check 3 (gate 2) — dependency lock sync -------------------------------
// pre-commit.mjs reads `git show HEAD:package.json` against the staged blob
// (`:package.json`); a checkout has no staged blob, so the second read moves
// to the base ref instead — same comparison, same two ends, different source
// for the "before" side.
const DEP_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
  "bundleDependencies",
  "overrides",
  "resolutions",
];
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
{
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
}

// --- Check 10 (gate 2) — file size -----------------------------------------
// A checkout has no staged/working-tree split to protect (gate-6: "the
// checkout already IS the branch"), so the file on disk is read directly
// rather than through `git cat-file -s :<path>`.
const SIZE_WARN = 1_000_000;
const SIZE_ERROR = 5_000_000;
for (const f of changed) {
  if (!existsSync(f)) continue; // deleted in this range
  const bytes = statSync(f).size;
  if (bytes >= SIZE_ERROR) {
    fail(
      "file size (error)",
      f,
      `${f} is ${bytes} bytes (>= ${SIZE_ERROR} error limit)`,
      "store large objects via large-file storage, or remove the file",
    );
  } else if (bytes >= SIZE_WARN) {
    fail(
      "file size (warn)",
      f,
      `${f} is ${bytes} bytes (>= ${SIZE_WARN} warn limit)`,
      "store large objects via large-file storage, or record why here",
    );
  }
}

// --- Check 9 (gate 2) — machine-identifying content ------------------------
for (const f of checkMachineId(changedText)) findings.push(f);

// --- Check 6 (gate 2) — secret scan -----------------------------------------
if (changedText.length) {
  if (have("npx", ["--no-install", "secretlint", "--version"])) {
    const scan = run("npx", ["--no-install", "secretlint", ...changedText]);
    if (scan.status !== 0) {
      // Path is empty, not the joined file list: secretlint's own text names
      // the file and line per finding, and a comma-joined path breaks the
      // annotation below rather than pointing at anything real (gate 7's
      // repository-wide scan uses the same empty-path shape for the same
      // reason).
      fail(
        "secret scan",
        "",
        (scan.stdout || "") + (scan.stderr || ""),
        "remove the credential, or revoke and rotate if already pushed",
      );
    }
  } else {
    skip("secret scan — secretlint not installed, changed files not scanned");
  }
}

// --- Check 8 (gate 2) — cross-language static analysis (semgrep) -----------
// Deferred locally because `--config auto` is network-bound (cross-gate
// rules: cost tiers); a CI runner has network, so it runs for real here
// rather than the visible skip pre-commit.mjs prints. `--error` is required —
// without it semgrep exits 0 regardless of findings, which would make this a
// check that always passes. Scoped to the files this range changed, the same
// "adapt the staged scope to the range" rule as every other file-scoped
// check; the repository-wide sweep is gate 7's job, not this one's.
// PYTHONUTF8 avoids a Windows-only crash: semgrep's SARIF writer defaults to
// the console code page (cp1252), which cannot encode some rule messages
// (emoji in a rule's own text) and throws instead of writing the file. No
// `--quiet`: the per-finding detail goes to the SARIF file the workflow
// uploads, but the human summary ("Findings: N (N blocking)") is what this
// check's own `problem` text has to show — quiet suppresses that too, and
// the finding would otherwise carry no readable content of its own.
if (changedText.length) {
  if (have("semgrep", ["--version"])) {
    const sarif = "semgrep-results.sarif";
    const sg = run(
      "semgrep",
      [
        "--config",
        "auto",
        "--error",
        "--sarif",
        "--output",
        sarif,
        ...changedText,
      ],
      { env: { ...process.env, PYTHONUTF8: "1" } },
    );
    const sgOut = (sg.stdout || "") + (sg.stderr || "");
    process.stderr.write(sgOut);
    normalizeSarifPaths(sarif);
    // Fix 25 — drop results suppressed in source before upload; see
    // filterSuppressedSarif (lib.mjs) for why the register, not the SARIF
    // file, is the audit trail for an accepted finding.
    filterSuppressedSarif(sarif);
    if (sg.status !== 0) {
      // Path is empty for the same reason as the secret scan above: the
      // per-finding location lives in the SARIF file, not in a joined list
      // of every file that was scanned. The annotation and step summary get
      // semgrep's one-line "Findings: N (N blocking)" rather than its full
      // scan banner — the banner already went to stderr above for anyone
      // reading the raw log, and the SARIF upload carries the per-line detail
      // natively; repeating the whole banner in a native annotation is noise.
      // semgrep writes the summary to stderr, not stdout — search both.
      const summary =
        /Findings:.*$/m.exec(sgOut)?.[0] ??
        "semgrep exited non-zero; see the uploaded SARIF report";
      fail(
        "cross-language analysis (semgrep)",
        "",
        summary,
        "triage each finding; suppress per-rule per-path with a register row if accepted",
      );
    }
  } else {
    skip(
      "cross-language analysis (semgrep) — not on PATH; the workflow's install step should have put it there",
    );
  }
}

// --- Check 10 (gate 6) — cross-stack dependency scan (osv-scanner; fix 9b) -
// Whole-repository, not range-scoped: it reads the resolved dependency tree,
// not the files this range touched (the same reason checks 6/7 above read
// the whole tree rather than the diff). Re-run here server-side, with a
// SARIF upload, the way cross-gate-rules.md requires of anything blocking
// that also runs at a local gate (gate 5 — scripts/gate-5-push.mjs).
if (have("osv-scanner", ["--version"])) {
  const sarif = "osv-results.sarif";
  const osv = run("osv-scanner", [
    "--format",
    "sarif",
    "--output",
    sarif,
    "-r",
    ".",
  ]);
  const osvOut = (osv.stdout || "") + (osv.stderr || "");
  process.stderr.write(osvOut);
  normalizeSarifPaths(sarif);
  filterSuppressedSarif(sarif); // fix 25 — same in-source-suppression rule as semgrep's SARIF above
  if (osv.status !== 0) {
    fail(
      "cross-stack dependency scan (osv-scanner)",
      "",
      osvOut || "osv-scanner exited non-zero; see the uploaded SARIF report",
      "upgrade the flagged dependency, or record why the advisory does not apply",
    );
  }
} else {
  skip(
    "cross-stack dependency scan (osv-scanner) — not on PATH; the workflow's install step should have put it there",
  );
}

// --- Check 17 (gate 2) — link and anchor integrity --------------------------
// Reads the whole documentation corpus already (checkLinks.mjs: "a file move
// leaves the broken link in a file nobody staged"); no range adaptation
// needed, same call as pre-commit.mjs.
for (const f of checkLinks()) findings.push(f);

// --- Check 15 (gate 2) — suppression register completeness ------------------
// Also whole-repository already (pre-commit.mjs calls it with no argument);
// same call here.
for (const f of checkSuppressions()) findings.push(f);

// --- Fix 22 — ADR approver, over the whole ADR corpus ------------------------
// Same repository-wide call as pre-commit.mjs; an ADR accepting a risk,
// licence, suppression or opt-out is a standing decision, not scoped to
// this pull request's own range.
for (const f of checkAdrApprover()) findings.push(f);

// --- Gate 3 — commit message, once per commit in the range ------------------
// gate-6-pull-request.md: "commit-message structure and scope agreement run
// once per commit in `git log origin/<base>..HEAD`, not once against the
// branch tip." checkCommitRange resolves each commit's own touched paths via
// `git diff-tree`, the range-scoped stand-in for the staged list a checkout
// does not have.
{
  const component = deriveComponent();
  for (const f of checkCommitRange(logRange, component)) findings.push(f);
}

// --- Checks 12 & 13 (gate 2) + gate 6 check 4 — whole-repository build and
// test, unconditionally. gate-6-pull-request.md's own point: "the local
// gates skip untouched components for speed; this gate does not, so the
// optimisation never becomes an unverified claim." One command also produces
// the two evidence artefacts gate 6 names: JUnit (row 10) and Cobertura
// coverage with its floor enforced (row 11, and gate 5 check 1).
{
  const build = run("npm", ["run", "build"]);
  if (build.status !== 0) {
    fail(
      "build (tsc)",
      undefined,
      (build.stdout || "") + (build.stderr || ""),
      "fix the type/analysis error above; a warning is a failure",
    );
  }
  // Check 11 (gate 2) — per-path lint. Whole-repository, not range-scoped,
  // for the same reason build and test just above are: this gate does not
  // take the local gates' skip-untouched-component shortcut.
  const lint = run("npm", ["run", "lint"]);
  if (lint.status !== 0) {
    fail(
      "lint (eslint)",
      undefined,
      (lint.stdout || "") + (lint.stderr || ""),
      "fix the lint violation; a warning is a failure",
    );
  }
  const test = run("npx", [
    "c8",
    "--check-coverage",
    "--lines=80",
    "--reporter=text",
    "--reporter=cobertura",
    "node",
    "--test",
    "--test-reporter=spec",
    "--test-reporter-destination=stdout",
    "--test-reporter=junit",
    "--test-reporter-destination=test-results.xml",
    "hooks/test/hooks.test.mjs",
  ]);
  const testOut = (test.stdout || "") + (test.stderr || "");
  process.stderr.write(testOut);
  if (test.status !== 0) {
    // Fix 11: name which of the two this actually was, rather than a
    // compound "either...or" finding that cannot name its own cause
    // (gate-5-push.md: "A broken coverage command blocks the push without
    // claiming a shortfall").
    const outcome = classifyTestCoverageOutcome(testOut);
    if (outcome.kind === "test-failure") {
      fail(
        "unit tests",
        undefined,
        outcome.detail,
        "fix the failing test(s); the output above names each one",
      );
    } else if (outcome.kind === "coverage-shortfall") {
      fail(
        "coverage",
        undefined,
        outcome.detail,
        "add tests for the uncovered lines the report above names",
      );
    } else {
      fail(
        "unit tests / coverage",
        undefined,
        outcome.detail,
        "read the output above for why the command itself could not run",
      );
    }
  }
  // Gate 5 check 2 — integration tests. None configured for any component
  // yet (gate-5-push.mjs states the same visible skip locally).
  skip(
    "integration tests — none configured for any component yet; gate 5 has nothing to run",
  );
}

// --- Gate 4 — task completion, over the same range --------------------------
// Change size and file length are already implemented range-scoped — hooks/
// gate-4-task-completion.mjs is the distributed hook, invoked unmodified
// rather than reimplemented, because it already measures `${base}...HEAD`
// against the same file classes this script uses everywhere else.
{
  const g4 = run("node", ["hooks/gate-4-task-completion.mjs"]);
  process.stderr.write((g4.stdout || "") + (g4.stderr || ""));
  if (g4.status !== 0) {
    fail(
      "gate 4 — change size / file length",
      undefined,
      (g4.stdout || "") + (g4.stderr || ""),
      "split the change, or carry the [large-pr] marker with a stated reason",
    );
  }
}

// Complexity, function length and parameter count (gate-4-task-completion.md
// row 4) are gap-fill measures with no stack analyser configured for this
// repository (no ESLint here — thresholds.md: "take the analyser's
// recommended rule set... only where the stack has no native opinion").
// lizard is what gate 7 already uses as the general-purpose backstop, at the
// same thresholds; reused directly here rather than invented twice, scoped to
// this range's changed production and test files rather than the whole
// repository.
{
  const codeFiles = changed.filter((f) => {
    if (!existsSync(f)) return false;
    const cls = classOf(f);
    return cls === "production" || cls === "test";
  });
  if (codeFiles.length && have("lizard", ["--version"])) {
    const lz = run("lizard", [
      "-C",
      "15",
      "-L",
      "100",
      "-a",
      "7",
      ...codeFiles,
    ]);
    const lzOut = (lz.stdout || "") + (lz.stderr || "");
    process.stderr.write(lzOut);
    if (lz.status !== 0) {
      // Path is empty, not the joined file list, for the same reason as the
      // secret scan and semgrep findings above: lizard's own table already
      // names the file and line range per function. Only the "Warnings"
      // table goes into the finding — the full per-function listing already
      // went to stderr above, and repeating it in a native annotation is
      // noise the reviewer did not ask for.
      const table =
        /!!!! Warnings[\s\S]*?(?=\r?\n=+\r?\nTotal nloc)/.exec(lzOut)?.[0] ??
        "lizard exited non-zero; see the log above for which function";
      fail(
        "gate 4 — complexity (lizard, gap-fill)",
        "",
        table,
        "split the long or complex function; the thresholds are the gap-fill defaults",
      );
    }
  } else if (!codeFiles.length) {
    skip("gate 4 — complexity: no production or test file changed in range");
  } else {
    skip("gate 4 — complexity: lizard not on PATH");
  }

  // Agent-context length (gate-4-task-completion.md row 3): warn 200, error
  // 500 lines, applied to changed files classed agent-context (skills/**).
  const agentFiles = changed.filter(
    (f) => existsSync(f) && classOf(f) === "agent-context",
  );
  for (const f of agentFiles) {
    const lines = run("git", ["show", `HEAD:${f}`]).stdout.split("\n").length;
    if (lines > 500) {
      fail(
        "gate 4 — agent-context length",
        f,
        `${f} is ${lines} lines (> 500 error limit)`,
        "split detail into a referenced file, one level deep, with a stated load trigger",
      );
    } else if (lines > 200) {
      skip(
        `gate 4 — agent-context length: ${f} is ${lines} lines (> 200 warn band)`,
      );
    }
  }
}

// --- Report -----------------------------------------------------------------
// GitHub Actions renders `::error file=,line=::message` as a native
// annotation on the changed lines of a pull request — no extra action or
// artefact download needed for the checks this script owns directly (the
// SARIF upload step in the workflow covers semgrep the same native way).
const onActions = process.env.GITHUB_ACTIONS === "true";
function annotate(f) {
  if (!onActions) return;
  const m = /^(.*):(\d+)$/.exec(f.path || "");
  const loc = m ? `file=${m[1]},line=${m[2]}` : f.path ? `file=${f.path}` : "";
  const msg = `${f.check}: ${(f.problem || "").toString().split("\n")[0].slice(0, 400)}`;
  console.log(loc ? `::error ${loc}::${msg}` : `::error::${msg}`);
}

for (const f of findings) annotate(f);

const summaryFile = process.env.GITHUB_STEP_SUMMARY;
if (summaryFile) {
  const lines = [
    "## Gate 6 — pull request checks",
    "",
    `Range: \`${range}\` — ${changed.length} file(s) changed.`,
    "",
    findings.length ? `**${findings.length} finding(s):**` : "**No findings.**",
    ...findings.map(
      (f) =>
        `- \`${f.check}\`${f.path ? ` (${f.path})` : ""}: ${f.problem ?? ""}`,
    ),
    "",
    skips.length ? `**${skips.length} skipped check(s):**` : "",
    ...skips.map((s) => `- ${s}`),
    "",
  ];
  try {
    appendFileSync(summaryFile, lines.join("\n") + "\n");
  } catch {
    /* best effort — evidence still went to stderr/annotations above */
  }
}

report("gate 6", findings, skips);
