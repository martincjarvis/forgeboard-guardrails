// cspell:ignore PYTHONUTF fixtured fixturing xkcdblorptrousers
// Fix 9a — the refusal-proof contract (docs/standards/guardrails/
// cross-gate-rules.md, "Every blocking check proves it refuses").
//
// The defect class this closes: a check wired so that it structurally cannot
// fail — a tool that always exits 0 and signals findings only in its own
// output, a tool that needs a flag to make a finding fail and the flag is
// missing (this repository shipped exactly that bug with semgrep once), or a
// tool that silently examines nothing and reports success. A list of
// known-bad tools goes stale; the contract instead: every blocking check
// carries a negative fixture — an input it must refuse — and this module
// proves it does, rather than trusting the check's own green exit.
//
// Three states, not two: `refuses` (the fixture was tried and blocked, as it
// must), `does not refuse` (the fixture was tried and passed anyway — a real
// finding, the check is decorative), `no fixture` (nobody has written one
// yet, or the tool a fixture needs is unavailable in this environment —
// unverified, and must not read as green).
//
// Runs at gate 7 (the on-demand sweep) and in CI
// (.github/workflows/refusal-proof-audit.yml), never per commit: this guards
// wiring, and wiring changes only when wiring changes.
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { have, run, cleanGitEnv, classifyDiffCoverOutcome } from "./lib.mjs";
import { checkMachineId } from "./check-machine-id.mjs";
import { checkLinks } from "./check-links.mjs";
import { checkSuppressions } from "./check-suppressions.mjs";
import { classifyAdvisories } from "./check-dependency-advisories.mjs";
import { licenceExpressionAcceptable } from "./check-licence-policy.mjs";

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));
const TMP = ".refusal-proof-tmp";

/** Writes one fixture file under a scratch, untracked directory, hands its
 *  path to fn(), and always cleans up — even the file-content checks below
 *  read through readStaged (lib.mjs), which falls back to a plain disk read
 *  for a path git has never heard of, so no scratch git repository is
 *  needed for these. */
function withFixtureFile(relPath, content, fn) {
  mkdirSync(TMP, { recursive: true });
  const full = join(TMP, relPath);
  writeFileSync(full, content);
  try {
    return fn(full.replace(/\\/g, "/"));
  } finally {
    try {
      rmSync(TMP, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
}

/** semgrep needs an actual repository to scan (gate 7's own check reads
 *  `git ls-files`), so this builds the smallest one that satisfies that: an
 *  initialised repo with one bad file staged — no commit needed, `git
 *  ls-files` reads the index. Runs the real gate-7-on-demand.mjs as its own
 *  process, cwd pointed at the scratch repo, so a regression in the actual
 *  wired script (not a re-implementation of its semgrep call) is what this
 *  proves. Returns null, not false, when semgrep itself is not on PATH:
 *  environment absence is a "no fixture" state, not a "does not refuse" one. */
function refuseSemgrepFixture() {
  if (!have("semgrep", ["--version"])) return null;
  const dir = join(TMP, "semgrep-repo");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "bad.py"), "x = eval(user_input)\n");
  // gate-7-on-demand.mjs's workspace-capability check reads .gitattributes
  // unconditionally (a real repository always has one) — present here so
  // the scratch repo exercises the semgrep step this fixture is actually
  // about, rather than crashing on an unrelated section first.
  writeFileSync(join(dir, ".gitattributes"), "* text=auto eol=lf\n");
  const g = (args) => run("git", args, { cwd: dir, env: cleanGitEnv() });
  g(["init", "-q", "."]);
  g(["add", "-A"]);
  const gate7 = join(SCRIPTS_DIR, "gate-7-on-demand.mjs");
  const r = run("node", [gate7], {
    cwd: dir,
    // REFUSAL_PROOF_FIXTURE tells the child gate-7 run not to call back into
    // this module — gate-7-on-demand.mjs runs the refusal-proof audit as
    // part of its own sweep, and this fixture already IS that audit; without
    // the guard, the semgrep fixture below would spawn a gate 7 that spawns
    // its own semgrep fixture, unboundedly.
    env: { ...process.env, PYTHONUTF8: "1", REFUSAL_PROOF_FIXTURE: "1" },
  });
  try {
    rmSync(TMP, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
  const out = (r.stdout || "") + (r.stderr || "");
  return /FINDING repository-wide analysis \(semgrep\)/.test(out);
}

/** Every blocking check this toolkit ships that has a fixture, in the same
 *  wording gate-2-commit.md and gate-6-pull-request.md use for it. */
const CHECKS_WITH_FIXTURES = [
  {
    check: "machine-identifying content (gate 2 check 9)",
    fixture: () =>
      withFixtureFile(
        "machine-id.md",
        "See C:\\Users\\jsmith\\project\\notes.md for details.\n",
        (path) => checkMachineId([path]).length > 0,
      ),
  },
  {
    check: "link and anchor integrity (gate 2 check 17)",
    fixture: () =>
      withFixtureFile(
        "links.md",
        "[missing](./this-file-does-not-exist-zzz.md)\n",
        (path) => checkLinks([path]).length > 0,
      ),
  },
  {
    check: "suppression register completeness (gate 2 check 15)",
    fixture: () => {
      // Built by concatenation, not written as one literal: checkSuppressions
      // scans raw source text for this exact marker, and a literal copy of it
      // here would flag THIS file's own source as an unregistered
      // suppression — the same reason check-suppressions.mjs excludes its own
      // URL from the scan, applied to a fixture instead of the checker.
      const marker = "// eslint" + "-disable-next-line no-console";
      return withFixtureFile(
        "suppression.mjs",
        `${marker}\nconsole.log('x');\n`,
        (path) => checkSuppressions([path]).length > 0,
      );
    },
  },
  {
    check: "dependency advisory scan (gate 6 check 6)",
    // classifyAdvisories is the pure classifier `npm audit --json`'s output
    // feeds — the layer that turns "a tool that always exits 0, findings
    // only in its output" into an actual finding. A synthetic report, not a
    // live `npm audit`: the same reason this classifier is exported and
    // tested this way already (check-dependency-advisories.mjs's own
    // comment), repeated here as the fixture rather than a new mechanism.
    fixture: () => {
      const auditReport = {
        vulnerabilities: {
          "known-bad-package": {
            severity: "critical",
            via: [{ url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc" }],
          },
        },
      };
      return (
        classifyAdvisories(auditReport, {
          runtimeNames: new Set(["known-bad-package"]),
          acceptedIds: new Set(),
        }).length > 0
      );
    },
  },
  {
    check: "dependency licence policy (gate 6 check 7)",
    fixture: () =>
      !licenceExpressionAcceptable("GPL-3.0-only", "Runtime").acceptable,
  },
  {
    check: "changed-line coverage (gate 6 check 8)",
    // classifyDiffCoverOutcome is the pure classifier diff-cover's own
    // output feeds — the same layer that turns "a tool whose findings live
    // only in its own text" into an actual finding, tested here the same
    // way as the dependency advisory scan and licence policy fixtures above:
    // a synthetic negative report, not a live diff-cover run.
    fixture: () =>
      classifyDiffCoverOutcome(
        "Failure: Coverage (40%) is below the threshold (80%)\n",
      ).kind === "shortfall",
  },
  {
    check: "spelling (gate 2 check 7)",
    // The exact third failure shape the contract exists for: cspell printing
    // "Files checked: 0" because every path given was ignored, and reporting
    // success. A word no dictionary carries proves both that cspell ran at
    // all AND that it refused.
    fixture: () =>
      withFixtureFile(
        "spelling.md",
        "# Fixture\n\nThis word is xkcdblorptrousers and should not exist.\n",
        (path) => {
          const r = run("npx", [
            "cspell",
            "lint",
            "--no-progress",
            "--no-must-find-files",
            path,
          ]);
          return r.status !== 0;
        },
      ),
  },
  {
    check: "prose lint (gate 2 check 5)",
    fixture: () =>
      withFixtureFile(
        "prose.md",
        "# Fixture\n\n### Skipped heading level\n",
        (path) => {
          const r = run("npx", ["markdownlint-cli2", path]);
          return r.status !== 0;
        },
      ),
  },
  {
    check: "cross-language static analysis (semgrep) (gate 2 check 8 / gate 7)",
    fixture: refuseSemgrepFixture,
  },
];

/** Blocking checks this repository ships with no fixture yet — named
 *  honestly rather than silently left out of the audit. Each either needs
 *  infrastructure this module does not yet build (a controlled git ref
 *  state for the protected-branch check, a resolved npm dependency tree for
 *  licence-register completeness) or is proven a different way already (gate
 *  2's lint wiring has its own dedicated regression test — hooks/test/
 *  hooks.test.mjs, fix 10 — not yet folded into this registry). A finding to
 *  report, per the contract, not a row to skip. */
const NO_FIXTURE = [
  "protected branch (gate 2 check 1) — needs a controlled git ref state (HEAD on the derived default branch); not yet fixtured here",
  "dependency lock sync (gate 2 check 3) — comparison logic is inline in pre-commit.mjs and gate-6-pull-request.mjs, not yet extracted for direct fixturing",
  "secret scan (gate 2 check 6) — needs secretlint resolvable from a scratch tree; not yet fixtured here",
  "file size (gate 2 check 10) — comparison logic is inline, not yet extracted for direct fixturing",
  "per-path lint (gate 2 check 11) — proven by a dedicated regression test (fix 10, hooks/test/hooks.test.mjs), not yet folded into this registry",
  "build (gate 2 check 12) — self-referential for this repository (there is no second copy of tsc to break on purpose); not yet fixtured here",
  "unit and architecture tests (gate 2 check 13) — self-referential; not yet fixtured here",
  "repository-wide tests (gate 2 check 14) — self-referential; not yet fixtured here",
  "dependency licence register completeness (gate 2 check 16) — needs a resolved npm dependency tree from a scratch install; not yet fixtured here",
  "repository-wide complexity scan (lizard, gate 7) — needs a scratch repository the same shape as the semgrep fixture above; not yet fixtured here",
  "cross-stack dependency scan (osv-scanner, gate 5 check 3 / gate 6 check 10) — osv-scanner is not installed on this host at all (fix 9b's own point); its skip path is covered by a dedicated test (hooks/test/hooks.test.mjs), but a refusal fixture needs the tool itself and cannot be verified here",
];

/** The three-state contract itself, as a pure function: a fixture returns
 *  true (refused the bad input — correct), false (passed the bad input
 *  anyway — decorative), or null (the fixture could not be run at all, an
 *  environment gap rather than a wiring one). Exported and tested directly
 *  so the classification rule is verified independently of any one fixture
 *  — CHECKS_WITH_FIXTURES supplies real cases, this supplies the rule. */
export function classifyFixtureResult(result) {
  if (result === null) return "no-fixture";
  return result === true ? "refuses" : "does-not-refuse";
}

/** { refuses, doesNotRefuse, noFixture } — the three states, each a list of
 *  check names / reasons. */
export async function checkRefusalProofs() {
  const refuses = [];
  const doesNotRefuse = [];
  const noFixture = [...NO_FIXTURE];

  for (const { check, fixture } of CHECKS_WITH_FIXTURES) {
    let result;
    try {
      result = await fixture();
    } catch (err) {
      doesNotRefuse.push(
        `${check} — fixture threw instead of refusing: ${err.message}`,
      );
      continue;
    }
    switch (classifyFixtureResult(result)) {
      case "no-fixture":
        noFixture.push(
          `${check} — the tool this fixture needs is not available in this environment`,
        );
        break;
      case "refuses":
        refuses.push(check);
        break;
      default:
        doesNotRefuse.push(check);
    }
  }
  return { refuses, doesNotRefuse, noFixture };
}

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const { refuses, doesNotRefuse, noFixture } = await checkRefusalProofs();
  for (const c of refuses)
    process.stderr.write(`refusal-proof: REFUSES ${c}\n`);
  for (const c of noFixture)
    process.stderr.write(`refusal-proof: SKIP (no fixture) ${c}\n`);
  for (const c of doesNotRefuse)
    process.stderr.write(`refusal-proof: DOES NOT REFUSE ${c}\n`);
  process.stderr.write(
    `refusal-proof: ${refuses.length} refuse, ${noFixture.length} unverified (no fixture), ${doesNotRefuse.length} decorative\n`,
  );
  // "Does not refuse" is a real defect — a check that cannot demonstrate
  // refusal is worse than one everyone knows is missing, so this is what
  // fails the build. "No fixture" is an audit gap, reported and left open
  // rather than blocking every build until every check has one.
  process.exit(doesNotRefuse.length > 0 ? 2 : 0);
}
