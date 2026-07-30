// cspell:ignore martincjarvis
// Fix 45 — file-classes.md's own rule, stated and never checked: "In a
// repository that consumes this standard, gate scripts and other development
// automation are `tooling`… In a repository whose product is the tooling — a
// guardrails toolkit itself — those same scripts are `production`." Audit 12
// found `@martincjarvis/greet`, a consuming repository, with its gate
// scripts classed `production` and **no file anywhere classed `tooling`** —
// and that it had no live effect only because lizard filters to `.ts`/`.tsx`
// before consulting the class, and c8 measures only what the test process
// imports: extension and import scope were accidentally doing the class
// attribute's job. A `tooling`-classed file written in the product's own
// language would slip past both, so this module makes the class itself the
// filter instead of trusting either accident.
//
// Two checks:
//   checkToolingClassDeclared — a consuming repository with ported gate
//   scripts and zero files classed `tooling` is a finding (item 1).
//   checkToolingCoverageLeakage — a `tooling`-classed file that still
//   appears in the coverage report is a finding (item 2's checkpoint).
// complexityScanFiles is the class-derived file list gate-7-on-demand.mjs
// now hands lizard, replacing the unfiltered `.` it used before — the
// complexity backstop's own scope (thresholds.md: "Cyclomatic complexity …
// Production and test code") never included tooling in the first place.
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";
import { trackedFiles, classOf, deriveComponent } from "./lib.mjs";

/** A tracked file's basename matching the naming convention this toolkit's
 *  own gate and check scripts use — the same names skills/repository-
 *  bootstrap/SKILL.md step 7 tells an implementer to port verbatim ("port
 *  … scripts/gate-6-pull-request.mjs … from this repository rather than
 *  reinventing"). They travel into a consuming repository's own tooling
 *  directory, whatever that directory is named (file-classes.md: "The
 *  directory's name is the repository's own choice") — the file names are
 *  the derivable signal, not the surrounding path. */
const GATE_SCRIPT_NAME =
  /^(gate-\d+-[\w-]+|check-[\w-]+|pre-commit|pre-push)\.\w+$/;

export function findGateScripts(files) {
  return files.filter((f) => GATE_SCRIPT_NAME.test(basename(f)));
}

/** file-classes.md: "The class is per repository, not per filename" — a
 *  repository whose product IS the tooling (this one) is exempt outright,
 *  derived the same way deriveComponent() already answers it for packaging
 *  (ADR-0003): a `.claude-plugin/plugin.json` manifest names this
 *  repository's own shipped product. Its absence means this is a consuming
 *  repository, where a ported gate script with no `tooling`-classed file
 *  anywhere is exactly the audit-12 defect. */
export function checkToolingClassDeclared({
  files = trackedFiles(),
  classify = classOf,
  isToolkit = () => deriveComponent() !== null,
} = {}) {
  if (isToolkit()) return [];
  const gateScripts = findGateScripts(files);
  if (gateScripts.length === 0) return [];
  const toolingClassed = files.filter((f) => classify(f) === "tooling");
  if (toolingClassed.length > 0) return [];
  return [
    {
      check: "tooling file class (file-classes.md)",
      path: "",
      problem:
        `${gateScripts.length} gate/check script(s) found ` +
        `(${gateScripts.slice(0, 5).join(", ")}${gateScripts.length > 5 ? ", …" : ""}) ` +
        "but no file anywhere in the repository is classed `tooling`",
      remedy:
        "declare `guardrail-class=tooling` in .gitattributes over the directory carrying the gate scripts — a repository consuming this standard is not the product, and its own gate scripts are development automation, not production code",
    },
  ];
}

/** thresholds.md's own stated scope for the complexity backstop:
 *  "Cyclomatic complexity … Production and test code" — configuration,
 *  documentation, agent context and tooling were never in scope. Returns
 *  the file list lizard should actually scan, derived from each file's own
 *  declared class rather than its extension — the fix for the accident fix
 *  45 closes: two files of the identical extension are correctly split by
 *  class, which an extension filter cannot do. */
export function complexityScanFiles({
  files = trackedFiles(),
  classify = classOf,
} = {}) {
  return files.filter((f) => {
    const cls = classify(f);
    return cls === "production" || cls === "test";
  });
}

/** Cobertura's own schema: `<class name="…" filename="…">` per source file
 *  the coverage run measured. A minimal regex read, not a full XML parser —
 *  the same weight as this module's other pure readers (lib.mjs's SARIF
 *  helpers), because the only question is which paths appear, not the
 *  coverage figures themselves (classifyTestCoverageOutcome, lib.mjs,
 *  already owns those). */
export function coveredFilesFromCobertura(xml) {
  const files = new Set();
  const re = /<class\b[^>]*\bfilename="([^"]+)"/g;
  let m;
  while ((m = re.exec(xml))) files.add(m[1].replace(/\\/g, "/"));
  return [...files];
}

/** file-classes.md: "Tooling is excluded from coverage." Given the files a
 *  coverage report actually measured, names any classed `tooling` that
 *  leaked in anyway — the checkpoint fix 45 adds because, per audit 12, the
 *  exclusion has never been exercised against a real `tooling`-classed
 *  file. */
export function toolingLeakage(coveredFiles, { classify = classOf } = {}) {
  return coveredFiles.filter((f) => classify(f) === "tooling");
}

/** Reads the Cobertura report this repository's own `test:coverage` script
 *  produces (`coverage/cobertura-coverage.xml`), when one exists — a
 *  missing report is a visible skip, not a finding: gate 7 runs
 *  independently of whether coverage was measured in this same pass. */
export function checkToolingCoverageLeakage({
  readReport = () => readFileSync("coverage/cobertura-coverage.xml", "utf8"),
  classify = classOf,
} = {}) {
  let xml;
  try {
    xml = readReport();
  } catch {
    return {
      findings: [],
      skips: [
        "tooling coverage exclusion — no coverage/cobertura-coverage.xml in this run; run `npm run test:coverage` first to check it",
      ],
    };
  }
  const leaked = toolingLeakage(coveredFilesFromCobertura(xml), { classify });
  if (leaked.length === 0) return { findings: [], skips: [] };
  return {
    findings: [
      {
        check: "tooling coverage exclusion (file-classes.md)",
        path: "",
        problem: `classed \`tooling\` but present in the coverage report: ${leaked.join(", ")}`,
        remedy:
          "exclude the file from the coverage run (c8's own --exclude, or the runner's equivalent) — a `tooling`-classed file is development automation, not the code the coverage floor protects",
      },
    ],
    skips: [],
  };
}

// --- Fix 52 — the tooling-suite requirement is text nobody implements ------
// testing-strategy.md states it in full: "A repository carrying ported gate
// or check scripts runs a `tooling tests` suite against them… its absence is
// not a silent default, one way or the other." Audit 13 found a repository
// with 26 `tooling`-classed scripts, no test file covering any of them, and
// nothing positioned to notice — `check-script-wiring.mjs` asks whether a
// script is *invoked by a gate*, never whether it is *tested*, so a script
// wired into every gate and never once exercised by a test still reads wired.
//
// Mechanical proxy, the same shape checkToolingClassDeclared above already
// uses: a test-classed file's own text names at least one tooling-classed
// file's basename. Crude, deliberately — this is a text search, the same
// weight as findStackReferencesOutsideList in check-standards-
// instantiation.mjs, not a coverage-instrumentation read (tooling is
// excluded from coverage by design, so coverage cannot answer this
// question). It answers exactly what audit 13 found missing: whether
// anything that looks like a test even mentions the tooling scripts at all.
export function checkToolingTestSuiteExists({
  files = trackedFiles(),
  classify = classOf,
  isToolkit = () => deriveComponent() !== null,
  readFile = (f) => readFileSync(f, "utf8"),
} = {}) {
  if (isToolkit()) return [];
  const toolingFiles = files.filter((f) => classify(f) === "tooling");
  if (toolingFiles.length === 0) return [];
  const toolingNames = toolingFiles.map((f) => basename(f));
  const testFiles = files.filter((f) => classify(f) === "test");
  const tested = testFiles.some((tf) => {
    let text = "";
    try {
      text = readFile(tf);
    } catch {
      return false;
    }
    return toolingNames.some((name) => text.includes(name));
  });
  if (tested) return [];
  return [
    {
      check: "tooling test suite (testing-strategy.md)",
      path: "",
      problem:
        `${toolingFiles.length} file(s) classed \`tooling\` ` +
        `(${toolingFiles.slice(0, 5).join(", ")}${toolingFiles.length > 5 ? ", …" : ""}) ` +
        "but no file classed `test` names any of them — no tooling tests suite exists",
      remedy:
        "add a test suite exercising the ported gate/check scripts, change-triggered and blocking at gate 6 when the range touches a `tooling`-classed file, and unconditional at gate 7 and on a schedule — testing-strategy.md#tooling-code-is-excluded-from-the-products-coverage-floor-not-from-testing",
    },
  ];
}

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const declared = checkToolingClassDeclared();
  const { findings: leakFindings, skips } = checkToolingCoverageLeakage();
  const suiteFindings = checkToolingTestSuiteExists();
  const findings = [...declared, ...leakFindings, ...suiteFindings];
  for (const s of skips) process.stderr.write(`SKIP ${s}\n`);
  for (const f of findings) {
    process.stderr.write(
      `FAIL ${f.check}\n        ${f.problem}\n        ${f.remedy}\n`,
    );
  }
  process.exit(findings.length > 0 ? 2 : 0);
}
