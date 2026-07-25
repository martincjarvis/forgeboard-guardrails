export const DEFAULT_PR_SIZE = { warn: 400, error: 800 };

/**
 * PR-size verdict. "ok" ≤ warn; "warn" over warn but ≤ error, or over error when
 * the sticky `[large-pr]` override token is present on the branch; "error" over
 * error with no override. "error" blocks (exit 2); "warn"/"ok" are advisory.
 */
export function classifyPrSize(
  lines: number,
  thresholds: { warn: number; error: number },
  hasOverrideToken: boolean,
): "ok" | "warn" | "error" {
  if (lines <= thresholds.warn) return "ok";
  if (lines <= thresholds.error) return "warn";
  return hasOverrideToken ? "warn" : "error";
}
