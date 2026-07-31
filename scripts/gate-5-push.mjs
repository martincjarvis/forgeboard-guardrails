#!/usr/bin/env node
// Gate 5 — Push. The expensive tests run once per push, over the whole range
// being pushed. Coverage is command-delegated: c8 owns the threshold. The
// underlying command also runs the unit suite, so a non-zero exit has three
// possible causes, not two — a failing test, a genuine coverage shortfall, or
// the command itself failing to run — and classifyTestCoverageOutcome (lib.mjs,
// fix 11) tells them apart from the command's own output rather than reporting
// one compound finding that cannot name its own cause (gate-5-push.md: "A
// broken coverage command blocks the push without claiming a shortfall").
// Integration tests are scoped to changed components; this repository has
// none yet, reported as a visible skip rather than a silent pass.
//
// Git pipes the pushed ref updates on stdin. Exit 2 refuses the push.
import {
  run,
  resolveBase,
  classifyTestCoverageOutcome,
  report,
} from "./lib.mjs";
import { checkOsvScanner } from "./check-osv-scanner.mjs";
import { checkBranchBehindBase } from "./check-branch-behind-base.mjs";
import { createInterface } from "node:readline";

const findings = [];
const skips = [];

// Read the range git is pushing. A new branch (all-zero old rev) compares
// against the base; otherwise it is old..new.
let range = null;
const baseline = resolveBase();
const rl = createInterface({ input: process.stdin });
for await (const line of rl) {
  const [oldrev, newrev] = line.split(" ");
  if (!newrev) continue;
  const isNewBranch = /^0+$/.test(oldrev);
  if (isNewBranch && !baseline) {
    skips.push(
      "pushed range — origin/HEAD could not be resolved, cannot compute the range for a new branch",
    );
  } else {
    range = isNewBranch ? `${baseline}..${newrev}` : `${oldrev}..${newrev}`;
  }
  break;
}
if (range) process.stderr.write(`gate 5: pushed range ${range}\n`);

// Check 4 — branch behind its base (fix 67; gate-5-push.md). Cheapest-first
// (cross-gate-rules.md): a branch that cannot merge is worth refusing before
// paying for the expensive coverage run below.
{
  const { findings: found, skips: sk } = checkBranchBehindBase();
  findings.push(...found);
  skips.push(...sk);
}

// Check 1 — coverage, repository-wide. The command owns the floor; prove the
// gate fails by raising the floor above current coverage once (testing-strategy).
const coverage = run("npm", ["run", "test:coverage"]);
if (coverage.status !== 0) {
  const outcome = classifyTestCoverageOutcome(
    (coverage.stdout || "") + (coverage.stderr || ""),
  );
  if (outcome.kind === "test-failure") {
    findings.push({
      check: "unit tests",
      problem: outcome.detail,
      remedy:
        "fix the failing test(s); the command's own output names each one",
    });
  } else if (outcome.kind === "coverage-shortfall") {
    findings.push({
      check: "coverage",
      problem: outcome.detail,
      remedy:
        "add tests for the uncovered lines the command's own report names",
    });
  } else {
    findings.push({
      check: "coverage",
      problem: outcome.detail,
      remedy:
        "read the command's own output for why it did not run to completion",
    });
  }
}

// Check 2 — integration tests, for changed components only.
skips.push(
  "integration tests — none configured for any component yet; gate 5 has " +
    "nothing to run. Add integration tests under a component path to exercise this",
);

// Check 3 — cross-stack dependency scan (osv-scanner; fix 9b). Placed here,
// not gate 2, because it is network-bound (placing-a-new-check.md); PATH-
// resolved and never bundled (ADR-0002), the same as semgrep and lizard.
{
  const { findings: found, skips: sk } = checkOsvScanner();
  findings.push(...found);
  skips.push(...sk);
}

report("gate 5", findings, skips);
