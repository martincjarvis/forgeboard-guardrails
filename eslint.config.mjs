// Gate 2 check 11 (docs/standards/guardrails/gate-2-commit.md): "A lint or
// type-check failure is refused independently of the build — the type
// checker is not the linter." tsconfig.json's checkJs already covers type
// errors; this covers what a type checker does not — dead code, loose
// equality, `var` over `let`/`const`. The four rules below are a short,
// explicit list. Dependency decisions are scoped by phase, not blanket
// (ADR-0018, which supersedes ADR-0002); the "no-new-dependency line" this
// comment once cited as ADR-0011 was a misattribution — this repository's
// ADR-0011 is `reconciliation-matches-labels-not-details`, and a number
// from another repository had leaked into this one.
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
