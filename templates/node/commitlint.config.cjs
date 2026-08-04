module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Machine-authored commits (Dependabot) carry release-note bodies with
    // long URLs; the subject rules still bite, the body length does not.
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
  },
};
