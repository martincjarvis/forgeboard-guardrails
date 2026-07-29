module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Gate 3 check 2: the type set is the one the standard declares. Scope
    // validity and scope agreement (checks 3 and 5) are enforced by the bespoke
    // scripts/check-scope.mjs hook, because the component set is derived from
    // the plugin manifest rather than fixed.
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "refactor",
        "perf",
        "test",
        "docs",
        "build",
        "ci",
        "chore",
      ],
    ],
  },
};
