// Gate 7's size seam, split from gate-7-on-demand.mjs: the repository-wide
// complexity scan (lizard) and the tooling file-class checks (class declaration,
// coverage leakage, and the tooling-suite-exists requirement). runSizeChecks
// returns the findings and skips this seam produced, in the order the original
// single-file sweep pushed them; the orchestrator merges them before printing
// the report.
import { have, run } from "./lib.mjs";
import {
  complexityScanFiles,
  checkToolingClassDeclared,
  checkToolingCoverageLeakage,
  checkToolingTestSuiteExists,
} from "./check-tooling-class.mjs";

/** @typedef {(c: string, p: string, problem: string, remedy: string) => void} Adder */

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
/** @param {Adder} add @param {string[]} skips */
function complexityScan(add, skips) {
  const complexityFiles = complexityScanFiles();
  if (!complexityFiles.length) {
    skips.push(
      "repository-wide size scan — no production or test file tracked",
    );
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
/** @param {Adder} add @param {string[]} skips */
function toolingFileClassChecks(add, skips) {
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

/** @returns {{ findings: Array<{ check: string, path?: string, problem?: string, remedy?: string }>, skips: string[] }} */
export function runSizeChecks() {
  /** @type {Array<{ check: string, path?: string, problem?: string, remedy?: string }>} */
  const findings = [];
  /** @type {string[]} */
  const skips = [];
  /** @param {string} c @param {string} p @param {string} problem @param {string} remedy */
  const add = (c, p, problem, remedy) =>
    findings.push({ check: c, path: p, problem, remedy });
  complexityScan(add, skips);
  toolingFileClassChecks(add, skips);
  return { findings, skips };
}
