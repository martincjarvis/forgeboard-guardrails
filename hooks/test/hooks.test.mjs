// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis Uncited uncited
// The hooks are the only code in this repository, and they run on every edit on
// somebody's machine. Their logic — thresholds, the override marker, which files
// count — is exactly the kind that fails quietly, so it leaves a runnable check
// behind. Run with: node --test hooks/test/hooks.test.mjs
//
// Split by subject area so no single file reaches the point where
// lizard's function-span detection merges adjacent functions into one
// over-length block (docs/ADR/0009-split-hooks-test-suite.md). This file is
// the suite's entry point: each import below runs its module for its side
// effect of registering tests with node:test; nothing here is itself a test.
import "./gate-1-4-task-completion.test.mjs";
import "./gate-2-commit.test.mjs";
import "./gate-6-dependency-advisories-and-licence-policy.test.mjs";
import "./licence-register-completeness.test.mjs";
import "./gate-6-licence-register-row-decisions.test.mjs";
import "./adr-approver-and-citations.test.mjs";
import "./link-integrity.test.mjs";
import "./suppression-register.test.mjs";
import "./gate-5-push-and-scans.test.mjs";
import "./branch-and-repository-policy.test.mjs";
import "./gate-7-wiring-audits.test.mjs";
import "./standards-instantiation.test.mjs";
import "./instantiation-residue.test.mjs";
import "./toolkit-exemption.test.mjs";
import "./tooling-class.test.mjs";
import "./approval-provenance.test.mjs";
import "./pr-body-artefacts.test.mjs";
import "./report-ci-reconciliation.test.mjs";
