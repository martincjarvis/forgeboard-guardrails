// cspell:ignore pyproject pytest golangci clippy nunit mstest msbuild pylint virtualenv gofmt phpunit rubocop lede
// The CLI entry point for the "instantiated docs are tuned to the
// repository" checkpoints. The check functions themselves live in
// ./standards-instantiation-lib.mjs (fix 81, ADR-0009) — re-exported below
// so nothing that already imports names from THIS file needs to change; only
// the CLI glue below (the report* helpers and the `isMain` block) stayed
// here. See that file's own header for what the checks do and why.
//
// Ported into a CONSUMING repository's own tooling directory and run there,
// against THAT repository's own instantiated `docs/standards/`. Never run
// against this toolkit's own `docs/standards/` — this repository is the
// canonical corpus, not an instantiated copy, and legitimately documents
// every stack it supports.
//
// PORTING THIS FILE (and standards-instantiation-lib.mjs beside it) IS NOT
// ENOUGH. Wire it into the consuming repository's own gate 7 (call
// `deriveStackList`/`findStackReferencesOutsideList`/
// `findMultiComponentContent`, or invoke this file directly, from that
// repository's `gate-7-on-demand.mjs`) — a copy that only sits in the
// tooling directory checks nothing (fix 40; this toolkit's own
// `scripts/check-script-wiring.mjs` reports exactly that unwired state).
// This toolkit does not wire it into its OWN gate 7, and that is
// deliberate, not an oversight to imitate: this repository is the
// canonical corpus, not an instantiated copy (see above) — do not copy the
// absence of wiring along with the file.
//
// Fix 46 — gate 7 alone is not enough either. A bootstrapped repository
// with this wired only there reported 60 findings across 13 gate-reference
// documents and never blocked a merge on any of them: the sweep runs
// unconditionally and only ever reports, by design (a stack added later
// touches no file under docs/standards/, and gate 7 is what notices that
// regardless). ALSO wire it into that repository's own gate 6, blocking,
// whenever the pull request's range touches `docs/standards/` — the same
// change-triggered shape gate-6-pull-request.mjs's own checks 6 and 7
// already use (a `changedFiles(range)` read, not a second range comparison
// invented for this one check), documented in full at
// docs/standards/docs-style.md#enforcement and
// docs/standards/guardrails/change-triggered-checks.md. A pull request that
// never touches the instantiated corpus is not asked about it; one that
// does and leaves it non-clean does not merge that way.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { trackedFiles } from "./lib.mjs";
export * from "./standards-instantiation-lib.mjs";
import {
  deriveStackList,
  findStackReferencesOutsideList,
  findMultiComponentContent,
  findComponentCountContradiction,
  findRemovalsOutsideEnforcementMap,
  checkCspellResidue,
  checkHardcodedCommitSha,
} from "./standards-instantiation-lib.mjs";

/** isMain's fix-55 leg, pulled out as its own function rather than an
 *  inline loop — the isMain block below is already lizard's own
 *  span-artifact case (gate-7-on-demand.mjs's comment on `run.mjs`
 *  documents the same tool misreading a large top-level `if` as one giant
 *  function); adding another inline loop to it only feeds that, where a
 *  named function keeps this leg's own count separate and small. Returns
 *  the number of findings printed.
 *  @param {string[]} files @returns {number} */
function reportCspellResidue(files) {
  let count = 0;
  for (const f of checkCspellResidue({ files })) {
    count++;
    process.stderr.write(f.path + ": " + f.problem + "\n");
  }
  return count;
}

/** isMain's fix-60 leg, the same reason reportCspellResidue above is its own
 *  function rather than an inline loop. Returns the number of findings
 *  printed.
 *  @param {string[]} files @returns {number} */
function reportHardcodedCommitSha(files) {
  let count = 0;
  for (const f of checkHardcodedCommitSha({ files })) {
    count++;
    process.stderr.write(f.problem + "\n");
  }
  return count;
}

/** isMain's per-document leg: stack references, multi-component headings
 *  and frontmatter/title/lede contradictions, for one doc file. Pulled out
 *  as its own function for the same reason reportCspellResidue and
 *  reportHardcodedCommitSha above are. Returns the number of findings
 *  printed.
 *  @param {string} file @param {string} text @param {Set<string>} stacks @param {number} componentCount @returns {number} */
function reportDocFindings(file, text, stacks, componentCount) {
  let count = 0;
  for (const f of findStackReferencesOutsideList(text, stacks)) {
    count++;
    const stackList = [...stacks].join(", ") || "none";
    process.stderr.write(
      file +
        ":" +
        f.line +
        ": references " +
        f.stack +
        ' ("' +
        f.keyword +
        '") — not in the derived stack list (' +
        stackList +
        ")\n",
    );
  }
  for (const f of findMultiComponentContent(text, componentCount)) {
    count++;
    process.stderr.write(
      file +
        ":" +
        f.line +
        ': multi-component content ("' +
        f.heading +
        '") but the component map declares ' +
        componentCount +
        " component\n",
    );
  }
  // Fix 72 — the same comparison, read from the document's frontmatter,
  // title or lede rather than a body heading.
  for (const f of findComponentCountContradiction(text, componentCount)) {
    count++;
    process.stderr.write(
      file +
        ":" +
        f.line +
        ": " +
        f.field +
        ' reads as multi-component ("' +
        f.text +
        '") but the component map declares ' +
        componentCount +
        " component\n",
    );
  }
  return count;
}

const argv1 = process.argv[1];
const isMain = argv1 && import.meta.url === pathToFileURL(argv1).href;
if (isMain) {
  // ponytail: component count taken from argv rather than derived from a
  // project graph — this reference script checks two mechanical properties,
  // not the full component map; a repository already knows its own count.
  const componentCount = Number(process.argv[2] ?? 1);
  /** @type {string[]} */
  const files = trackedFiles();
  const stacks = deriveStackList(files);
  const docFiles = files.filter(
    (f) => f.startsWith("docs/standards/") && f.endsWith(".md"),
  );
  let findingCount = 0;
  for (const file of docFiles) {
    const text = readFileSync(file, "utf8");
    findingCount += reportDocFindings(file, text, stacks, componentCount);
  }

  // Fix 55 — the same residue, outside docs/standards/**: cspell.json's own
  // word list, copied wholesale, keeping a stack's dead vocabulary alive.
  findingCount += reportCspellResidue(files);

  // Fix 60 — instantiation tunes code as well as prose: a ported test
  // hard-coding a full 40-character commit SHA is asserting the SOURCE
  // repository's own history, which fails deterministically on this
  // repository's first CI run.
  findingCount += reportHardcodedCommitSha(files);

  // Fix 53 — a removal recorded only in a one-time session report, not in
  // the enforcement map or a PROVENANCE note. "Report-shaped" is a filename
  // convention (`*report*.md` under docs/, outside docs/standards/ itself —
  // an instantiated standard's own removal note is exactly what this check
  // must not flag), not a claim that every such file is one.
  const reportFiles = files
    .filter(
      (f) =>
        f.startsWith("docs/") &&
        !f.startsWith("docs/standards/") &&
        /report/i.test(f) &&
        f.endsWith(".md"),
    )
    .map((f) => ({ path: f, text: readFileSync(f, "utf8") }));
  const enforcementMapPath = "docs/standards-enforcement.md";
  let enforcementMapText = null;
  try {
    enforcementMapText = readFileSync(enforcementMapPath, "utf8");
  } catch {
    /* no enforcement map yet — reported the same as an absent one below */
  }
  const instantiatedDocFiles = docFiles.map((f) => ({
    path: f,
    text: readFileSync(f, "utf8"),
  }));
  for (const f of findRemovalsOutsideEnforcementMap({
    reportFiles,
    enforcementMapText,
    instantiatedDocFiles,
  })) {
    findingCount++;
    process.stderr.write(f.path + ": " + f.problem + "\n");
  }

  process.stderr.write(
    "standards instantiation: " +
      findingCount +
      " finding" +
      (findingCount === 1 ? "" : "s") +
      "\n",
  );
  process.exit(findingCount > 0 ? 2 : 0);
}
