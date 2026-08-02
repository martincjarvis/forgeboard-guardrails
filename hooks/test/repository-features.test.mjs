// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis Uncited uncited
// Split from hooks.test.mjs — subject group: repository-features.
// Loaded by hooks/test/hooks.test.mjs; not invoked directly by the test runner.
import { test } from "node:test";
import {
  evaluateRepositoryFeatures,
  checkRepositoryFeatures,
} from "../../scripts/check-repository-features.mjs";
import assert from "node:assert/strict";

// --- scripts/check-repository-features.mjs. "Every
// check the platform already provides is enabled rather than rebuilt"
// (cross-gate-rules.md) was unactionable until this enumerated which
// features that meant and how to tell "off" from "not offered on this
// plan." evaluateRepositoryFeatures is pure and tested directly, the same
// split evaluateBranchProtection uses above; checkRepositoryFeatures is
// tested through its injectable have/run for the skip paths only — the
// live gh orchestration mirrors checkBranchProtection's own, already
// proven there.

test("evaluateRepositoryFeatures: Dependabot alerts and security updates off is a finding on every visibility — they are free everywhere", () => {
  const { findings, skips } = evaluateRepositoryFeatures({
    visibility: "private",
    dependabotAlerts: "disabled",
    dependabotSecurityUpdates: "disabled",
  });
  const problems = findings.map((f) => f.check);
  assert.ok(problems.includes("Dependabot alerts"));
  assert.ok(problems.includes("Dependabot security updates"));
  assert.deepEqual(
    skips.filter((s) => /^Dependabot/.test(s)),
    [],
  );
});

test("evaluateRepositoryFeatures: dependency graph and code coverage are always reported as informational skips, never a finding — no toggle exists for either", () => {
  const { findings, skips } = evaluateRepositoryFeatures({});
  assert.deepEqual(findings, []);
  assert.ok(skips.some((s) => /dependency graph/.test(s)));
  assert.ok(skips.some((s) => /code coverage \(Code Quality\)/.test(s)));
});

test("evaluateRepositoryFeatures: secret scanning disabled on a public repository is a finding — it is free on every plan there", () => {
  const { findings, skips } = evaluateRepositoryFeatures({
    visibility: "public",
    secretScanning: "disabled",
  });
  assert.equal(findings.length, 1);
  const finding = findings[0];
  assert.ok(finding, "expected one finding");
  assert.equal(finding.check, "secret scanning");
  assert.match(finding.problem, /public repository/);
  assert.deepEqual(
    skips.filter((s) => /^secret scanning/.test(s)),
    [],
  );
});

test("evaluateRepositoryFeatures: secret scanning disabled on a private repository is a skip, not a finding — a read-only probe cannot tell 'off' from 'not purchasable on this plan'", () => {
  const { findings, skips } = evaluateRepositoryFeatures({
    visibility: "private",
    secretScanning: "disabled",
  });
  assert.deepEqual(
    findings,
    [],
    "a private repository on a plan without GitHub Secret Protection must never carry a permanent, unfixable finding for this",
  );
  const line = skips.find((s) => /^secret scanning/.test(s));
  assert.ok(line);
  assert.match(line, /does not distinguish/);
});

test("evaluateRepositoryFeatures: push protection follows the same public/private split as secret scanning, independently of it", () => {
  const publicCase = evaluateRepositoryFeatures({
    visibility: "public",
    pushProtection: "disabled",
  });
  assert.equal(publicCase.findings.length, 1);
  const publicFinding = publicCase.findings[0];
  assert.ok(publicFinding, "expected a public-case finding");
  assert.equal(publicFinding.check, "push protection");

  const privateCase = evaluateRepositoryFeatures({
    visibility: "private",
    pushProtection: "disabled",
  });
  assert.deepEqual(privateCase.findings, []);
});

test("evaluateRepositoryFeatures: code scanning 'disabled' (its own endpoint read successfully) is a finding on any visibility — the endpoint itself already proved it is available here", () => {
  const publicCase = evaluateRepositoryFeatures({
    visibility: "public",
    codeScanning: "disabled",
  });
  const privateCase = evaluateRepositoryFeatures({
    visibility: "private",
    codeScanning: "disabled",
  });
  assert.equal(publicCase.findings.length, 1);
  assert.equal(privateCase.findings.length, 1);
  const publicFinding = publicCase.findings[0];
  assert.ok(publicFinding, "expected a public-case finding");
  assert.equal(publicFinding.check, "code scanning");
});

test("evaluateRepositoryFeatures: code scanning reported unavailable (its own endpoint failed) is a skip naming the platform's own message, never a finding", () => {
  const { findings, skips } = evaluateRepositoryFeatures({
    visibility: "private",
    codeScanning: {
      unavailable:
        "Code scanning is not enabled for this repository. Please enable code scanning in the repository settings.",
    },
  });
  assert.deepEqual(findings, []);
  const line = skips.find((s) => /^code scanning/.test(s));
  assert.ok(line, "a skip line naming code scanning is present");
  assert.match(line, /Code scanning is not enabled for this repository/);
});

test("evaluateRepositoryFeatures: an unreadable status is a skip, never silently read as either enabled or disabled", () => {
  const { findings, skips } = evaluateRepositoryFeatures({
    visibility: "public",
    dependabotAlerts: null,
    dependabotSecurityUpdates: null,
  });
  assert.deepEqual(findings, []);
  assert.ok(skips.some((s) => /Dependabot alerts.*could not read/.test(s)));
  assert.ok(
    skips.some((s) => /Dependabot security updates.*could not read/.test(s)),
  );
});

test("checkRepositoryFeatures is a visible skip, naming gh, when gh is not on PATH", async () => {
  const { findings, skips } = await checkRepositoryFeatures({
    have: () => false,
  });
  assert.deepEqual(findings, []);
  assert.equal(skips.length, 1);
  const skip = skips[0];
  assert.ok(skip, "expected one skip");
  assert.match(skip, /gh not on PATH/);
});

test("checkRepositoryFeatures is a visible skip, naming gh, when gh is not authenticated", async () => {
  const { findings, skips } = await checkRepositoryFeatures({
    have: () => true,
    run: () => ({ status: 1 }),
  });
  assert.deepEqual(findings, []);
  assert.equal(skips.length, 1);
  const skip = skips[0];
  assert.ok(skip, "expected one skip");
  assert.match(skip, /not authenticated/);
});

test("checkRepositoryFeatures is a visible skip when gh cannot resolve a GitHub repository (no GitHub remote)", async () => {
  const { findings, skips } = await checkRepositoryFeatures({
    have: () => true,
    run: (cmd, args) => {
      if (args[0] === "api" && args[1] === "user") return { status: 0 };
      if (args[0] === "api" && args[1] === "repos/:owner/:repo") {
        return { status: 1, stderr: "gh: Not Found (HTTP 404)" };
      }
      throw new Error(`unexpected gh call: ${args.join(" ")}`);
    },
  });
  assert.deepEqual(findings, []);
  assert.equal(skips.length, 1);
  const skip = skips[0];
  assert.ok(skip, "expected one skip");
  assert.match(skip, /no GitHub remote/);
});

test("checkRepositoryFeatures reads a live private repository end to end: Dependabot alerts on, everything else read as an ambiguous skip", async () => {
  const { findings, skips } = await checkRepositoryFeatures({
    have: () => true,
    run: (cmd, args) => {
      if (args[0] === "api" && args[1] === "user") return { status: 0 };
      if (args[0] === "api" && args[1] === "repos/:owner/:repo") {
        return {
          status: 0,
          stdout: JSON.stringify({
            visibility: "private",
            security_and_analysis: {
              secret_scanning: { status: "disabled" },
              secret_scanning_push_protection: { status: "disabled" },
            },
          }),
        };
      }
      if (args[1] === "repos/:owner/:repo/vulnerability-alerts") {
        return { status: 0 }; // 204 — enabled
      }
      if (args[1] === "repos/:owner/:repo/automated-security-fixes") {
        return { status: 0, stdout: JSON.stringify({ enabled: true }) };
      }
      if (args[1] === "repos/:owner/:repo/code-scanning/default-setup") {
        return {
          status: 1,
          stderr:
            "gh: Code scanning is not enabled for this repository. Please enable code scanning in the repository settings. (HTTP 403)",
        };
      }
      throw new Error(`unexpected gh call: ${args.join(" ")}`);
    },
  });
  assert.deepEqual(
    findings,
    [],
    "a private repository with no Advanced Security purchase must read clean, not carry permanent findings for features it cannot enable",
  );
  assert.ok(skips.some((s) => /Dependabot alerts — enabled/.test(s)));
  assert.ok(skips.some((s) => /Dependabot security updates — enabled/.test(s)));
  assert.ok(
    skips.some((s) => /^secret scanning.*does not distinguish/.test(s)),
  );
  assert.ok(
    skips.some((s) =>
      /^code scanning — unavailable.*not enabled for this repository/.test(s),
    ),
  );
});
