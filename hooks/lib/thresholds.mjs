// The size and shape numbers, in one place, so nothing states them twice.
//
// Both readers import from here: `eslint.config.mjs` — the standard flat-config
// location eslint resolves and a consuming repository tunes — and gate 4, which
// re-runs the same rules at their warn values to band a finding.
//
// Gate 4 still runs eslint self-contained (`overrideConfigFile: true`), because
// it has to work in a repository that has no eslint config yet. That is why the
// numbers have to be shared: without this module the gate carried its own
// literals, and tuning the documented file changed lint results while the gate
// went on enforcing something else.
//
// `thresholds.md` documents these values for a human. It is not a third
// declaration: the numbers live here, and that document describes them.
//
// **A threshold is the last acceptable value.** `COMPLEXITY_ERROR = 15` means a
// function of 15 passes and 16 blocks — the same reading eslint's own rule
// options take, so `complexity: ["error", COMPLEXITY_ERROR]` needs no
// adjustment. A band that meant "15 blocks" would make the same constant mean
// two different things in two files, which is how the two readers came to
// disagree in the first place.

/** Added plus deleted lines across a branch, production and configuration and
 *  tooling together. Change size is branch-scoped by nature — no single commit
 *  shows it — which is why it stays at gate 4. */
export const CHANGE_WARN = 400;
export const CHANGE_ERROR = 800;

/** Lines in one file. A per-file property, true at every moment rather than
 *  only across a branch. */
export const FILE_LENGTH_ERROR = 400;

/** Cyclomatic complexity, function length and parameter count. JavaScript has
 *  no stack opinion beyond eslint's own core rules, so these values are the
 *  stack's analyser configuration rather than a substitute for one
 *  (thresholds.md: "take the analyser's recommended rule set ... only where the
 *  stack has no native opinion").
 *
 *  The warn values exist because a gate runs the rules at the warn threshold —
 *  so every function past it is reported at all — and re-derives warn versus
 *  block from the measured number. eslint's own severity is not the band. */
export const COMPLEXITY_WARN = 10;
export const COMPLEXITY_ERROR = 15;
export const FUNCTION_LENGTH_WARN = 60;
export const FUNCTION_LENGTH_ERROR = 100;
export const PARAM_COUNT_WARN = 5;
export const PARAM_COUNT_ERROR = 7;

/** Nesting depth. No gap-fill row in thresholds.md — this is eslint's own
 *  default, taken as-is rather than invented here. */
export const MAX_DEPTH = 4;
