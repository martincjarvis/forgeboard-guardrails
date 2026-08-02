// cspell:ignore fixtured lintstagedrc symref warnish ghsa GHSA monocart deliberatemisspelling nother PYTHONUTF opensource untabled martincjarvis Uncited uncited bypassable
// Split from hooks.test.mjs — subject group: refusal-proof-contract.
// The refusal-proof contract (check-refusal-proofs.mjs) and the spell-check
// enforcement guards — every blocking check proves it refuses, and the cspell
// invocation actually scans code, not only Markdown.
// Loaded by hooks/test/hooks.test.mjs; not invoked directly by the test runner.
import { test } from "node:test";
import { writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { classifyFixtureResult } from "../../scripts/check-refusal-proofs.mjs";
import { run } from "../lib/run.mjs";
import assert from "node:assert/strict";
import { ROOT, CLEAN_ENV, scratchRepo } from "./support.mjs";

// --- scripts/check-refusal-proofs.mjs — the refusal-proof contract
// (docs/standards/guardrails/cross-gate-rules.md, "Every blocking check
// proves it refuses"). Only the pure classification rule and a fast,
// file-content regression guard run here: the full registry
// (scripts/check-refusal-proofs.mjs's own CLI) shells out to semgrep, cspell
// and markdownlint-cli2 and takes upward of twenty seconds — appropriate for
// gate 7 and the weekly CI audit this is deliberately NOT wired into per
// commit (the standard's own rule), wrong for hooks/test/hooks.test.mjs,
// which runs on every commit that touches hooks/. That full run was verified
// by hand: `node scripts/check-refusal-proofs.mjs` reported all eight
// fixtured checks as `refuses` and exited 0.

test("classifyFixtureResult: the three-state contract itself", () => {
  assert.equal(
    classifyFixtureResult(true),
    "refuses",
    "a fixture the check blocked",
  );
  assert.equal(
    classifyFixtureResult(false),
    "does-not-refuse",
    "a fixture the check passed anyway — decorative, a finding",
  );
  assert.equal(
    classifyFixtureResult(null),
    "no-fixture",
    "the fixture could not be run at all — unverified, never a pass",
  );
});

test("regression guard: .lintstagedrc.json's cspell invocation uses a flag cspell actually recognises", () => {
  // The exact bug found while writing this contract:
  // cspell's CLI is commander-based, and an unrecognised flag
  // (`--no-must-find-file`, missing the plural) prints "unknown option" and
  // still exits 0 — the check never scans anything and reads as a pass. This
  // is the third failure shape cross-gate-rules.md names by name ("the tool
  // silently examines nothing and reports success"), found in this
  // repository's own lint-staged config, not merely a hypothetical.
  //
  // Both keys are checked, not just Markdown — gate-2-commit.md
  // requires spelling on "the file's own vocabulary", with no file-type
  // restriction, and a checker that only ever read Markdown would answer
  // "is spelling enforced?" with a confident yes while never opening a
  // .ts/.mjs file.
  const config = JSON.parse(
    readFileSync(join(ROOT, ".lintstagedrc.json"), "utf8"),
  );
  for (const key of [
    "*.{md,mdx}",
    "*.{js,mjs,cjs,ts,tsx,json,jsonc,yml,yaml}",
  ]) {
    const spellCmd = config[key].find(
      /** @param {string} c */ (c) => c.includes("cspell"),
    );
    assert.ok(spellCmd, `${key} has no cspell invocation`);
    assert.match(spellCmd, /--no-must-find-files\b/);
    assert.doesNotMatch(
      spellCmd,
      /--no-must-find-file\b/,
      "the singular form is not a real cspell flag and is silently ignored, not enforced",
    );
  }
});

test("cspell actually reads code files, not only Markdown — a misspelling in a .mjs comment and in a user-facing string are both flagged", () => {
  // Runs the exact cspell invocation .lintstagedrc.json's code-glob
  // key now uses, against a scratch file, to prove the check reads .mjs
  // content rather than only ever being wired to Markdown. This is the
  // functional counterpart to the config-shape regression guard above. The
  // repository's own cspell binary is invoked directly, cwd set to the
  // fixture's own directory (a relative file argument, exactly what
  // lint-staged passes) — the same cross-platform `run()` the hooks
  // themselves use to reach a `.cmd` shim on Windows (hooks/lib/run.mjs).
  const dir = scratchRepo();
  writeFileSync(
    join(dir, "fixture.mjs"),
    "// a deliberatemisspelling in a comment\n" +
      'export const message = "a nother deliberatemisspelling in a user-facing string";\n',
  );
  const config = JSON.parse(
    readFileSync(join(ROOT, ".lintstagedrc.json"), "utf8"),
  );
  const spellCmd = config["*.{js,mjs,cjs,ts,tsx,json,jsonc,yml,yaml}"].find(
    /** @param {string} c */ (c) => c.includes("cspell"),
  );
  const [, ...cspellArgs] = spellCmd.split(" "); // drop the leading "cspell"
  const r = run(
    join(ROOT, "node_modules", ".bin", "cspell"),
    [...cspellArgs, "fixture.mjs"],
    { cwd: dir, env: CLEAN_ENV },
  );
  assert.notEqual(
    r.status,
    0,
    "a misspelling in a code file's comment and string must be refused, not silently passed",
  );
  assert.match((r.stdout || "") + (r.stderr || ""), /deliberatemisspelling/);
  rmSync(dir, { recursive: true, force: true });
});
