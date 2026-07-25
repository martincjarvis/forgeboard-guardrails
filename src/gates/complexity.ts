import { runExternalBin } from "../exec/runExternalBin.ts";
import { GateFailure } from "../errors/GateFailure.ts";
import type { GuardrailsConfig } from "../config/types.ts";

const DEFAULTS = { ccn: 15, functionLines: 60, params: 5 };

/**
 * Opt-in cyclomatic-complexity gate. Runs only when agentHooks.complexity is set;
 * otherwise a visible skip. When configured, Lizard's exit code is the verdict —
 * we parse no numbers, exactly as the coverage and SAST gates do not. Absent Lizard
 * (configured but not on PATH) is surfaced as a named GateFailure with the install
 * one-liner, mirroring the semgrep handling.
 */
export function runComplexityGate(
  files: string[],
  cwd: string,
  config: GuardrailsConfig,
): void {
  const cfg = config.agentHooks?.complexity;
  if (!cfg) {
    console.log(
      'complexity gate skipped: no "agentHooks.complexity" configured',
    );
    return;
  }
  if (files.length === 0) return;

  const ccn = cfg.ccn ?? DEFAULTS.ccn;
  const functionLines = cfg.functionLines ?? DEFAULTS.functionLines;
  const params = cfg.params ?? DEFAULTS.params;

  let result: { pass: boolean; output: string };
  try {
    result = runExternalBin(
      "lizard",
      [
        "--warnings_only",
        "-C",
        String(ccn),
        "-L",
        String(functionLines),
        "-a",
        String(params),
        ...files,
      ],
      cwd,
    );
  } catch (error) {
    // runExternalBin throws a named ENOENT error when lizard is not on PATH.
    throw new GateFailure(
      "complexity",
      "Lizard is OSS but Python-distributed: `pip install lizard`.",
      error instanceof Error ? error.message : String(error),
    );
  }

  if (!result.pass) {
    throw new GateFailure(
      "complexity",
      "reduce the flagged function(s) below the configured thresholds (split, simplify, or reduce parameters).",
      result.output.trim() ||
        "one or more functions exceed a complexity threshold",
    );
  }
}
