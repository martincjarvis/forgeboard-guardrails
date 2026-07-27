import { spawnSync } from "node:child_process";

/**
 * True when a runnable `semgrep` is resolvable on PATH.
 *
 * The SAST gate shells out to an external semgrep binary — semgrep is OSS but
 * Python/pip-distributed, not npm-bundled (see ADR-0011 and the design spec's
 * "Dependency resolution" section) — so it is the one built-in gate a consuming
 * repo can be missing after a successful `npm install`. Scenario tests that
 * require the SAST gate to *pass*, or that must attribute a rejection to a
 * specific non-SAST gate, are skipped (not failed) when semgrep is absent, so the
 * suite stays green on a bare machine. semgrep is a documented test prerequisite
 * (README > Prerequisites); CI installs it, so nothing skips there.
 *
 * shell:false so a missing binary is a clean ENOENT (status null) rather than a
 * shell "not recognized" exit that could be mistaken for a runnable tool.
 */
export function semgrepAvailable(): boolean {
  // Absent means ENOENT specifically. Any other failure is the probe failing, not
  // the tool missing, and the two must not be conflated: `status === 0` treated a
  // probe that could not run as "semgrep is not installed" and silently skipped
  // the tests that depend on it.
  //
  // That was observed on a machine with semgrep on PATH — one module's probe failed
  // while eighteen others succeeded in the same run, and the suite reported green
  // having never executed `stagedContent.test.ts`, which is the regression test for
  // the defect currently under investigation. A green run that skipped the test
  // proving the thing is worse than a red one.
  //
  // So: retried once, and anything that is not a clean ENOENT is treated as present.
  // If semgrep really is broken the tests then fail loudly, which is the outcome we
  // want over a silent skip.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = spawnSync("semgrep", ["--version"], {
      shell: false,
      encoding: "utf8",
    });
    if (result.status === 0) return true;
    if (
      (result.error as NodeJS.ErrnoException | undefined)?.code === "ENOENT"
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Ready-to-use value for a node:test `skip` option: `false` (run) when semgrep is
 * present, or a reason string (skip) when it is absent. Evaluated once per module.
 */
export const skipWithoutSemgrep: false | string = semgrepAvailable()
  ? false
  : "semgrep not installed (see README > Prerequisites)";
