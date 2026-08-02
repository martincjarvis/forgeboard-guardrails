// Gate 2 check 11 (docs/standards/guardrails/gate-2-commit.md): "A lint or
// type-check failure is refused independently of the build — the type
// checker is not the linter." tsconfig.json's checkJs already covers type
// errors; eslint owns what a type checker does not — dead stores, loose
// equality, code shape, and the rest of @eslint/js's recommended set.
//
// The base is the maintained preset, not a hand-written rule list
// (ADR-0018's bootstrap half: adopt the stack's established presets rather
// than maintaining one yourself — the four-rule list this config used to be
// left eslint measuring no complexity at all). `@eslint/js` recommended is
// the floor; `globals` supplies Node's globals, because recommended turns on
// `no-undef` and a Node script reads `process`, `console`, `setTimeout`
// without declaring them. The three rules below are the ones recommended is
// silent on that this repository still holds; a type checker is not a
// linter (thresholds.md#the-stacks-analysers-win), so tsc's checkJs runs
// alongside this and covers types while this covers shape.
//
// Scoped to the toolkit's own JS (hooks/, scripts/) — the only production and
// test code this repository ships (tsconfig.json's `include` draws the same
// line). Fixture and sample files under skills/ are documentation payloads
// read by a skill, not code this repository builds or tests.
//
// --max-warnings 0 wherever this runs (cross-gate-rules.md: "No gate emits a
// warning it does not treat as a failure") is enforced at the call site
// (scripts/pre-commit.mjs, scripts/gate-6-pull-request.mjs, package.json's
// lint script), not here — every rule below is already "error", and the
// recommended set this layers is "error" by construction, so the flag is
// redundant today and load-bearing the day a rule is added at its default
// ("warn") severity instead.
import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["hooks/**/*.mjs", "scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
    },
    rules: {
      eqeqeq: "error",
      "no-var": "error",
      "prefer-const": "error",
    },
  },
];
