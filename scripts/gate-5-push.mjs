#!/usr/bin/env node
// Gate 5 — Push. The expensive tests run once per push, over the whole range
// being pushed. Coverage is command-delegated: c8 owns the threshold and the
// gate treats a non-zero exit as the shortfall signal, naming both possibilities
// (genuine shortfall vs. a command that failed to run). Integration tests are
// scoped to changed components; this repository has none yet, reported as a
// visible skip rather than a silent pass.
//
// Git pipes the pushed ref updates on stdin. Exit 2 refuses the push.
import { run, resolveBase, report } from "./lib.mjs";
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
  range =
    /^0+$/.test(oldrev) && baseline
      ? `${baseline}..${newrev}`
      : `${oldrev}..${newrev}`;
  break;
}
if (range) process.stderr.write(`gate 5: pushed range ${range}\n`);

// Check 1 — coverage, repository-wide. The command owns the floor; prove the
// gate fails by raising the floor above current coverage once (testing-strategy).
const coverage = run("npm", ["run", "test:coverage"]);
if (coverage.status !== 0) {
  findings.push({
    check: "coverage",
    problem:
      "the coverage command exited non-zero — either coverage is below the " +
      "configured floor, or the command itself failed to run",
    remedy:
      "read the command's own output for which; c8 prints the shortfall when " +
      "it is coverage, anything else is a runner failure",
  });
}

// Check 2 — integration tests, for changed components only.
skips.push(
  "integration tests — none configured for any component yet; gate 5 has " +
    "nothing to run. Add integration tests under a component path to exercise this",
);

report("gate 5", findings, skips);
