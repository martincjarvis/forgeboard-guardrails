// Subject group: gate-7-semgrep-rule-resolution. Loaded by hooks/test/
// hooks.test.mjs; not invoked directly by the test runner.
//
// `--config auto` resolves semgrep's rule set from the registry at run time,
// so the recording of what it resolved is the only durable record of which
// rules a given run was actually checked against. The extractor reads the
// SARIF semgrep itself writes; the record builder's three states keep a
// missing tool or an unreadable result from reading as a clean run. Both are
// pure, so tested against a real-shape SARIF fixture rather than a live scan.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvedSemgrepRules, semgrepRuleRecord } from "../../scripts/lib.mjs";

// A trimmed slice of a real `semgrep --config auto --sarif` run's shape (the
// probe captured 1074 rules; this carries the structure that matters —
// runs[].tool.driver.rules for the resolved set, runs[].results for the
// findings — with one rule that found nothing, to prove the resolved set is
// not just the rules with findings).
const SEMGREP_SARIF = {
  runs: [
    {
      tool: {
        driver: {
          name: "Semgrep OSS",
          rules: [
            {
              id: "python.lang.security.audit.eval-detected.eval-detected",
              name: "python.lang.security.audit.eval-detected.eval-detected",
              defaultConfiguration: { level: "warning" },
            },
            {
              id: "bash.curl.security.curl-eval.curl-eval",
              name: "bash.curl.security.curl-eval.curl-eval",
              defaultConfiguration: { level: "warning" },
            },
          ],
        },
      },
      results: [
        {
          ruleId: "python.lang.security.audit.eval-detected.eval-detected",
        },
      ],
    },
  ],
};

test("resolvedSemgrepRules: reads every rule semgrep resolved, including rules with zero findings", () => {
  const rules = resolvedSemgrepRules(SEMGREP_SARIF);
  assert.deepEqual(rules, [
    "python.lang.security.audit.eval-detected.eval-detected",
    "bash.curl.security.curl-eval.curl-eval",
  ]);
  // The curl-eval rule had no result; it is in the resolved set anyway, which
  // is exactly the coverage a run-to-run comparison needs to see drift in.
  assert.ok(
    rules.includes("bash.curl.security.curl-eval.curl-eval"),
    "a rule with zero findings is still recorded as resolved",
  );
});

test("resolvedSemgrepRules: a SARIF with no runs yields an empty list, not a throw", () => {
  assert.deepEqual(resolvedSemgrepRules({}), []);
  assert.deepEqual(resolvedSemgrepRules(null), []);
});

test("semgrepRuleRecord: a run that resolved rules records them with a count", () => {
  const record = semgrepRuleRecord({
    ran: true,
    rules: ["a", "b", "c"],
  });
  assert.equal(record.outcome, "resolved");
  assert.equal(record.ruleCount, 3);
  assert.deepEqual(record.rules, ["a", "b", "c"]);
});

test("semgrepRuleRecord: semgrep not on PATH records a skip, distinguishable from a clean resolved run", () => {
  // The acceptance: "unavailable" must not read as "passed". A skip and a
  // resolved run carry different `outcome` values, so a reader comparing two
  // runs can tell a missing tool from a real result.
  const skip = semgrepRuleRecord({ ran: false, reason: "semgrep not on PATH" });
  const resolved = semgrepRuleRecord({ ran: true, rules: ["a"] });
  assert.equal(skip.outcome, "skipped");
  assert.equal(resolved.outcome, "resolved");
  assert.notEqual(skip.outcome, resolved.outcome);
  assert.match(skip.reason ?? "", /semgrep not on PATH/);
  assert.equal(
    "ruleCount" in skip,
    false,
    "a skip carries no rule count to be mistaken for zero",
  );
});

test("semgrepRuleRecord: a run that produced no readable rule set records unavailable, not a resolved zero", () => {
  // semgrep ran but its SARIF could not be read (it crashed before writing) —
  // distinct from both a clean resolved run and the not-on-PATH skip.
  const unavailable = semgrepRuleRecord({ ran: true, rules: null });
  assert.equal(unavailable.outcome, "unavailable");
  assert.equal("ruleCount" in unavailable, false);
  assert.match(unavailable.reason ?? "", /could not be read/);
});
