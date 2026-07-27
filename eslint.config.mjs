import tseslint from "typescript-eslint";
import security from "eslint-plugin-security";
import noUnsanitized from "eslint-plugin-no-unsanitized";

/**
 * Static analysis for this repository.
 *
 * The A1 scope promises "automated code standards (analysers, type checking)" as
 * a gate, and until now the toolkit ran neither on itself — the same
 * self-application gap FB-0013 was. Type checking is `npm run typecheck`; this is
 * the analyser half.
 *
 * **Security rules are the point, not a bonus.** This repository spawns child
 * processes from configuration, builds regular expressions from configuration,
 * and reads and writes files chosen by the caller. `eslint-plugin-security` and
 * `eslint-plugin-no-unsanitized` cover exactly that ground, and they overlap
 * semgrep deliberately: semgrep is an external, pip-installed prerequisite that a
 * consumer can be missing, while these travel with the package.
 *
 * Findings are reported as SARIF for CI (`npm run lint:sarif`), which is the
 * security tier of the tier-to-category mapping in the coverage-and-test-artifacts
 * standard: security → SARIF → code-scanning.
 */
export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "coverage/**",
      "dist/**",
      ".forgeboard/logs/**",
    ],
  },
  ...tseslint.configs.recommended,
  security.configs.recommended,
  {
    plugins: { "no-unsanitized": noUnsanitized },
    rules: {
      "no-unsanitized/method": "error",
      "no-unsanitized/property": "error",
    },
  },
  {
    rules: {
      // A leading underscore is the declared-but-deliberately-unused convention.
      // Hook signatures take arguments the individual check does not read, and
      // the signature has to match the contract regardless.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // Off repo-wide, with reasons, rather than suppressed at ~19 sites each:
      //
      // Reading and writing paths the caller chose is what this toolkit does —
      // every gate takes a cwd and a file list from the consuming repo. The rule
      // fires on the feature, so at every call site it would be noise, and noise
      // is what gets a whole gate switched off.
      "security/detect-non-literal-fs-filename": "off",
      // Indexing an object by a computed key. TypeScript's own checking covers
      // the real risk here, and the rule's own documentation acknowledges a high
      // false-positive rate on typed code.
      "security/detect-object-injection": "off",

      // Deliberately left ON: both fire on genuine judgement calls that are
      // recorded in docs/suppression-register.md rather than silenced here.
      // "security/detect-child-process"
      // "security/detect-non-literal-regexp"
    },
  },
  {
    // Fixtures deliberately contain the shapes the gates detect — planted
    // secrets, path-like strings, awkward input — and assert on `any` payloads.
    files: ["test/**"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);
