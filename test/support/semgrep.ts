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
  const result = spawnSync("semgrep", ["--version"], { shell: false, encoding: "utf8" });
  return result.status === 0;
}

/**
 * Ready-to-use value for a node:test `skip` option: `false` (run) when semgrep is
 * present, or a reason string (skip) when it is absent. Evaluated once per module.
 */
export const skipWithoutSemgrep: false | string =
  semgrepAvailable() ? false : "semgrep not installed (see README > Prerequisites)";
