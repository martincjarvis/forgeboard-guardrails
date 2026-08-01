// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis Uncited uncited
// Split from hooks.test.mjs — subject group: gate-6-dependency-advisories-and-licence-policy.
// Loaded by hooks/test/hooks.test.mjs; not invoked directly by the test runner.
import { test } from "node:test";
import {
  classifyAdvisories,
  checkDependencyAdvisories,
} from "../../scripts/check-dependency-advisories.mjs";
import {
  licenceExpressionAcceptable,
  leafVerdict,
  compatible,
} from "../../scripts/check-licence-policy.mjs";
import { LICENCE_TABLE, isPermissive } from "../../scripts/licence-table.mjs";
import assert from "node:assert/strict";

// --- scripts/check-dependency-advisories.mjs — gate 6 check 6 (docs/
// standards/guardrails/gate-6-pull-request.md, change-triggered-checks.md).
// `npm audit` is network-bound and its result changes as advisories publish,
// so these test the pure classification against a fixed, synthetic report —
// not a live `npm audit` run — the same reason check-dependency-advisories.mjs
// splits classifyAdvisories out from the impure orchestration around it.

/** @param {[string, string, string[]?][]} entries */
function auditReport(entries) {
  /** @type {Record<string, { name: string, severity: string, via: { url: string }[] }>} */
  const vulnerabilities = {};
  for (const [name, severity, urls = []] of entries) {
    vulnerabilities[name] = {
      name,
      severity,
      via: urls.map((url) => ({ url })),
    };
  }
  return { vulnerabilities };
}

test("dependency advisory scan blocks a runtime dependency at high severity", () => {
  // thresholds.md: block for runtime is "high and above". No accepted ids, no
  // runtime/dev distinction needed to reach the block band.
  const report = auditReport([["left-pad", "high"]]);
  const findings = classifyAdvisories(report, {
    runtimeNames: new Set(["left-pad"]),
  });
  assert.equal(findings.length, 1);
  const finding = findings[0];
  assert.ok(finding, "expected one finding");
  assert.match(
    finding.problem,
    /left-pad carries a high advisory \(runtime dependency\)/,
  );
  assert.match(finding.remedy, /block severity has no accepted-record path/);
});

test("dependency advisory scan does not push back a development-only dependency below its band", () => {
  // thresholds.md: development-only push-back is "high"; moderate is below
  // it and must not fire — the same package would push back if it were a
  // runtime dependency (push-back for runtime is "medium"/moderate).
  const report = auditReport([["left-pad", "moderate"]]);
  const findings = classifyAdvisories(report, { runtimeNames: new Set() });
  assert.equal(findings.length, 0);
});

test("dependency advisory scan pushes back a development-only dependency at high severity, unless an Accepted ADR names its advisory id", () => {
  const report = auditReport([
    ["left-pad", "high", ["https://github.com/advisories/GHSA-aaaa-bbbb-cccc"]],
  ]);
  const unaccepted = classifyAdvisories(report, { runtimeNames: new Set() });
  assert.equal(
    unaccepted.length,
    1,
    "high severity, dev-only, is the push-back band",
  );
  const finding = unaccepted[0];
  assert.ok(finding, "expected one finding");
  assert.match(finding.problem, /ghsa-aaaa-bbbb-cccc/);

  const accepted = classifyAdvisories(report, {
    runtimeNames: new Set(),
    acceptedIds: new Set(["ghsa-aaaa-bbbb-cccc"]),
  });
  assert.equal(
    accepted.length,
    0,
    "a decision record naming the advisory id clears the push-back band",
  );
});

// --- The push-back remedy used to name only two paths — "upgrade
// the dependency, or accept it in an Accepted ADR naming the advisory id" —
// a false binary. Iteration 26 took the ADR branch
// in good faith for a js-yaml advisory, reasoning the fixed version only
// shipped bundled inside markdownlint-cli2, five days inside the
// repository's own release-age window — missing that js-yaml@5.2.2 itself,
// pinned directly via `overrides`, was published nine days EARLIER, clears
// the same window on its own, and `npm audit` reports 0 vulnerabilities
// with that pin (verified across two iterations).
// The remedy must name the pin as a real third option, not push every
// push-back-band advisory toward either an upgrade nobody can do yet or an
// ADR nobody needed to write.

test("dependency advisory scan's push-back remedy names all three paths — upgrade, an overrides/resolutions pin, and an Accepted ADR — not the false binary iteration 26 acted on", () => {
  const report = auditReport([
    ["js-yaml", "high", ["https://github.com/advisories/GHSA-pm4m-ph32-ghv5"]],
  ]);
  const findings = classifyAdvisories(report, { runtimeNames: new Set() });
  assert.equal(findings.length, 1);
  const finding = findings[0];
  assert.ok(finding, "expected one finding");
  assert.match(finding.remedy, /upgrade/i);
  assert.match(
    finding.remedy,
    /overrides.*resolutions|resolutions.*overrides/i,
  );
  assert.match(finding.remedy, /Accepted ADR/);
});

test("dependency advisory scan is a visible skip, naming the reason, when not triggered", () => {
  const { findings, skips } = checkDependencyAdvisories(false);
  assert.deepEqual(findings, []);
  assert.equal(skips.length, 1);
  const skip = skips[0];
  assert.ok(skip, "expected a skip");
  assert.match(skip, /dependency advisory scan/);
  assert.match(skip, /no dependency change and not a scheduled run/);
});

// --- scripts/licence-table.mjs and scripts/check-licence-policy.mjs — gate
// 6 check 7 (a per-licence table, not two enumerated allow
// lists — docs/standards/guardrails/gate-6-pull-request.md's "Licence
// policy: a table, not two allow lists").

test("isPermissive is derived from recorded conditions, not asserted — Artistic-2.0's source-disclosure condition makes it non-permissive despite being OSI-approved", () => {
  assert.equal(isPermissive(LICENCE_TABLE["MIT"]), true);
  assert.equal(
    isPermissive(LICENCE_TABLE["Artistic-2.0"]),
    false,
    "Artistic-2.0 requires a modified version's source to be made available — checked against the OSI text directly, not assumed from OSI-approval alone",
  );
  assert.equal(
    isPermissive(LICENCE_TABLE["CC-BY-SA-4.0"]),
    false,
    "share-alike is one of the three disqualifying conditions",
  );
});

test("leafVerdict: OSI-approved and permissive passes regardless of scope or a declared repository licence", () => {
  assert.equal(leafVerdict("MIT", "Runtime", null).acceptable, true);
  assert.equal(
    leafVerdict("MIT", "Development", "GPL-3.0-only").acceptable,
    true,
  );
});

test("leafVerdict: a licence with no table entry blocks and names that as the reason, distinct from failing the decision rule", () => {
  const v = leafVerdict("GPL-3.0-only", "Development", null);
  assert.equal(v.acceptable, false);
  assert.equal(
    v.reason,
    "no-table-entry",
    "GPL-3.0-only is not in scripts/licence-table.mjs — a coverage gap, not a policy failure",
  );
});

test("leafVerdict: not OSI-approved blocks even when the licence's own conditions alone would read as permissive", () => {
  // WTFPL imposes no conditions at all — permissive by conditions — but is
  // absent from opensource.org's approved list (verified 2026-07-30, not
  // assumed from its reputation as an extremely permissive licence).
  assert.equal(isPermissive(LICENCE_TABLE["WTFPL"]), true);
  assert.equal(LICENCE_TABLE["WTFPL"].osiApproved, false);
  const v = leafVerdict("WTFPL", "Development", null);
  assert.equal(v.acceptable, false);
  assert.equal(v.reason, "not-compatible");
});

test("compatible(): the relation is evaluated against the repository's own licence, not a membership test — the same dependency passes with no declared repository licence and blocks against one that conflicts", () => {
  // gate-6-pull-request.md's own verification checkpoint: "The same
  // dependency passes in a repository with no declared licence and blocks
  // in one whose licence conflicts — proving the relation is evaluated, not
  // a membership test." Artistic-2.0 (OSI-approved, source-disclosure) at
  // Runtime scope is the worked case: nothing to conflict with when no
  // licence is declared, blocked against a repository that is MIT
  // (permissive, carries no source-disclosure condition of its own to
  // match), passing again against a repository that is itself Artistic-2.0.
  const artistic = LICENCE_TABLE["Artistic-2.0"];
  assert.equal(
    compatible(artistic, "Runtime", null),
    true,
    "no repository licence declared — nothing recorded to conflict with",
  );
  assert.equal(
    compatible(artistic, "Runtime", "MIT"),
    false,
    "MIT does not itself require source disclosure — the condition conflicts",
  );
  assert.equal(
    compatible(artistic, "Runtime", "Artistic-2.0"),
    true,
    "the repository carries the same condition — same-family, not a conflict",
  );
});

test("compatible(): a non-permissive licence that never ships has nothing downstream to conflict with, at any declared repository licence", () => {
  const artistic = LICENCE_TABLE["Artistic-2.0"];
  assert.equal(compatible(artistic, "Development", "MIT"), true);
});

test("SPDX expression evaluation: OR passes if any disjunct is acceptable — the JSONStream / type-fest regression, MIT OR Apache-2.0 and (MIT OR CC0-1.0)", () => {
  assert.equal(
    licenceExpressionAcceptable("MIT OR Apache-2.0", "Runtime", null)
      .acceptable,
    true,
  );
  // CC0-1.0 alone is not OSI-approved, but the OR passes via MIT.
  assert.equal(
    licenceExpressionAcceptable("(MIT OR CC0-1.0)", "Runtime", null).acceptable,
    true,
  );
  // Both disjuncts unacceptable: blocked, and the refusal names both.
  const blocked = licenceExpressionAcceptable(
    "GPL-3.0-only OR AGPL-3.0-only",
    "Runtime",
    null,
  );
  assert.equal(blocked.acceptable, false);
  assert.equal(blocked.blockers.length, 2);
  assert.deepEqual(
    blocked.blockers.map(/** @param {{ id: string }} b */ (b) => b.id),
    ["GPL-3.0-only", "AGPL-3.0-only"],
  );
});

test("SPDX expression evaluation: AND requires every conjunct to be acceptable", () => {
  assert.equal(
    licenceExpressionAcceptable("MIT AND Apache-2.0", "Runtime", null)
      .acceptable,
    true,
  );
  const verdict = licenceExpressionAcceptable(
    "MIT AND GPL-3.0-only",
    "Runtime",
    null,
  );
  assert.equal(
    verdict.acceptable,
    false,
    "one unacceptable conjunct blocks the whole AND expression",
  );
  assert.deepEqual(
    verdict.blockers.map(/** @param {{ id: string }} b */ (b) => b.id),
    ["GPL-3.0-only"],
    "only the failing conjunct is named — MIT is not the reason this blocks",
  );
});

test("SPDX expression evaluation: parentheses nest, mixing AND and OR correctly", () => {
  // (MIT OR Apache-2.0) AND CC0-1.0 — the brief's own nesting example.
  assert.equal(
    licenceExpressionAcceptable(
      "(MIT OR Apache-2.0) AND CC0-1.0",
      "Runtime",
      null,
    ).acceptable,
    false,
    "CC0-1.0 is not OSI-approved, so the AND's second conjunct fails even though the OR passes",
  );
  assert.equal(
    licenceExpressionAcceptable("(MIT OR Apache-2.0) AND MIT", "Runtime", null)
      .acceptable,
    true,
  );
});

test("SPDX expression evaluation: WITH is one identifier, not silently split into a passing term", () => {
  // GPL-2.0-only WITH Classpath-exception-2.0 is not in the table as a
  // whole; splitting it would let the bare "GPL-2.0-only" half be judged
  // instead (still failing here, but for the wrong reason) or, worse, let an
  // exception clause on an otherwise-permissive base licence pass unchecked.
  const verdict = licenceExpressionAcceptable(
    "GPL-2.0-only WITH Classpath-exception-2.0",
    "Development",
    null,
  );
  assert.equal(verdict.acceptable, false);
  assert.equal(verdict.blockers.length, 1);
  const blocker = verdict.blockers[0];
  assert.ok(blocker, "expected one blocker");
  assert.equal(
    blocker.id,
    "GPL-2.0-only WITH Classpath-exception-2.0",
    "the exception clause must not be dropped from the identifier looked up",
  );
});

test("SPDX expression evaluation: an identifier with no table entry blocks, named in the refusal", () => {
  const verdict = licenceExpressionAcceptable("Beerware", "Development", null);
  assert.equal(verdict.acceptable, false);
  assert.deepEqual(verdict.blockers, [
    { id: "Beerware", reason: "no-table-entry" },
  ]);
});

test("SPDX expression evaluation: a non-SPDX string is reported as unparseable, quoted whole — not tokenised into a wrong identifier", () => {
  // A space instead of the SPDX hyphen ('Apache 2.0' rather than
  // 'Apache-2.0') tokenises into two identifier-shaped words with no
  // operator between them; a parser that stops at the first token the
  // grammar doesn't recognise would silently drop the rest and name '2.0' or
  // 'Apache' as the blocked identifier — a licence that does not exist, so a
  // maintainer searching the table for it finds nothing to reason about.
  // This repository's own register cell for this exact shape ('CC BY-SA
  // 4.0') was corrected to the real SPDX identifier (CC-BY-SA-4.0) rather
  // than worked around here — the fix is the register entry, not the parser.
  const apache = licenceExpressionAcceptable("Apache 2.0", "Development", null);
  assert.equal(apache.acceptable, false);
  assert.deepEqual(apache.blockers, [
    { id: "Apache 2.0", reason: "unparseable" },
  ]);

  // A genuinely valid compound expression must still parse and pass.
  assert.equal(
    licenceExpressionAcceptable("(MIT OR Apache-2.0)", "Runtime", null)
      .acceptable,
    true,
  );
});
