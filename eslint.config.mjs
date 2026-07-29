// Gate 2 check 11 (docs/standards/guardrails/gate-2-commit.md): "A lint or
// type-check failure is refused independently of the build — the type
// checker is not the linter." tsconfig.json's checkJs already covers type
// errors; this covers what a type checker does not — dead code, loose
// equality, `var` over `let`/`const`. A short, explicit rule list, not a
// plugin-provided "recommended" preset: the toolkit already holds a
// no-new-dependency line for itself (ADR-0011), and the handful of core
// rules below close every gap a preset would, with nothing to add.
//
// Scoped to the toolkit's own JS (hooks/, scripts/) — the only production and
// test code this repository ships (tsconfig.json's `include` draws the same
// line). Fixture and sample files under skills/ are documentation payloads
// read by a skill, not code this repository builds or tests.
//
// --max-warnings 0 wherever this runs (cross-gate-rules.md: "No gate emits a
// warning it does not treat as a failure") is enforced at the call site
// (scripts/pre-commit.mjs, scripts/gate-6-pull-request.mjs, package.json's
// lint script), not here — every rule below is already "error", so the flag
// is redundant today and load-bearing the day a rule is added at its default
// ("warn") severity instead.
export default [
  {
    files: ["hooks/**/*.mjs", "scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": "error",
      eqeqeq: "error",
      "no-var": "error",
      "prefer-const": "error",
    },
  },
];
