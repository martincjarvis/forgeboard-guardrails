// cspell:ignore pyproject pytest golangci clippy
// Reference implementation for two of the seven "instantiated docs are tuned
// to the repository" checkpoints
// (docs-style.md#standards-in-a-consuming-repository): a stack name outside
// the derived list, and multi-component content in a single-component
// repository. Both are mechanical — a text search over a derived list, and a
// heading search gated on a count — which is why only these two are coded.
// The other five checkpoints (removal recorded, shorter than source, gate
// documents read as a process, a gap named rather than silent, and these
// seven checks themselves never pruned) ask whether prose is honest or well
// formed, which no script here scores; see the standard for why.
//
// Fix 53 — one narrow exception, not a third full checkpoint. Whether a
// removal's stated *reason* is honest and complete stays judgement, same as
// ever — findRemovalsOutsideEnforcementMap below does not read that. It
// checks only *where* a removal was written down: docs-style.md requires "a
// PROVENANCE note or a short section of the enforcement map," and a
// bootstrapped repository instead recorded every removal in
// `docs/bootstrap-report.md` — a one-time session report — while its
// enforcement map carried no removals record at all. A session report is
// not where anyone looks a year later. This is a heading search, the same
// mechanical weight as findMultiComponentContent above: does a report-shaped
// document carry a removals heading that the enforcement map does not.
//
// Ported into a CONSUMING repository's own tooling directory and run there,
// against THAT repository's own instantiated `docs/standards/`. Never run
// against this toolkit's own `docs/standards/` — this repository is the
// canonical corpus, not an instantiated copy, and legitimately documents
// every stack it supports.
//
// PORTING THIS FILE IS NOT ENOUGH. Wire it into the consuming repository's
// own gate 7 (call `deriveStackList`/`findStackReferencesOutsideList`/
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

/** Manifest that, if present, means the stack is genuinely in use. */
const STACK_MARKERS = {
  node: [/(^|\/)package\.json$/],
  dotnet: [/\.csproj$/, /\.sln$/],
  python: [/(^|\/)pyproject\.toml$/, /(^|\/)requirements\.txt$/],
  go: [/(^|\/)go\.mod$/],
  rust: [/(^|\/)Cargo\.toml$/],
  java: [/(^|\/)pom\.xml$/, /(^|\/)build\.gradle(\.kts)?$/],
  php: [/(^|\/)composer\.json$/],
  ruby: [/(^|\/)Gemfile$/],
};

/** Words that name a stack's own tooling in prose. Checked only for a stack
 *  absent from the derived list, so a repository is never flagged for
 *  naming its own stack. */
const STACK_KEYWORDS = {
  dotnet: [".NET", "dotnet ", ".csproj", "NuGet"],
  python: ["pytest", "pyproject.toml", "pip install"],
  go: ["go test", "go build", "golangci-lint"],
  rust: ["cargo ", "Cargo.toml", "clippy"],
  java: ["Maven", "Gradle", "JUnit"],
  php: ["composer ", "PHPUnit"],
  ruby: ["RSpec", "bundler", "Gemfile"],
  node: ["npm ", "package.json", "eslint"],
};

const MULTI_COMPONENT_HEADINGS = [
  /per-component prerelease/i,
  /deployment ordering/i,
  /per-component version/i,
  /cross-component/i,
];

/** Which stacks `files` (tracked paths) declare a manifest for. */
export function deriveStackList(files) {
  const found = new Set();
  for (const [stack, markers] of Object.entries(STACK_MARKERS)) {
    if (markers.some((re) => files.some((f) => re.test(f)))) {
      found.add(stack);
    }
  }
  return found;
}

/** Stack keywords in `text` for a stack not in `presentStacks`. Returns
 *  [{ stack, keyword, line }], 1-indexed. */
export function findStackReferencesOutsideList(text, presentStacks) {
  const findings = [];
  const lines = text.split("\n");
  for (const [stack, keywords] of Object.entries(STACK_KEYWORDS)) {
    if (presentStacks.has(stack)) continue;
    for (const keyword of keywords) {
      lines.forEach((line, i) => {
        if (line.includes(keyword)) {
          findings.push({ stack, keyword: keyword.trim(), line: i + 1 });
        }
      });
    }
  }
  return findings;
}

/** Multi-component section headings in `text`, when `componentCount` is 1.
 *  Returns [{ heading, line }], 1-indexed. */
export function findMultiComponentContent(text, componentCount) {
  if (componentCount > 1) return [];
  const findings = [];
  text.split("\n").forEach((line, i) => {
    if (
      /^#{1,6}\s/.test(line) &&
      MULTI_COMPONENT_HEADINGS.some((re) => re.test(line))
    ) {
      findings.push({
        heading: line.replace(/^#+\s*/, "").trim(),
        line: i + 1,
      });
    }
  });
  return findings;
}

const REMOVAL_HEADING = /^#{1,6}\s*.*\bremoval/i;
const PROVENANCE_HEADING = /^#{1,6}\s*PROVENANCE\b/i;

/** Does `text` carry a heading naming a removal (`## Removals`, `### What was
 *  removed`, ...) or a `PROVENANCE` note? Both are docs-style.md's own two
 *  accepted locations, read structurally rather than for what they say. */
function hasRemovalRecord(text) {
  return text
    .split("\n")
    .some(
      (line) => REMOVAL_HEADING.test(line) || PROVENANCE_HEADING.test(line),
    );
}

/** Fix 53. `reportFiles` and `instantiatedDocFiles` are each `{ path, text
 *  }`; `enforcementMapText` is the enforcement map's own content, or `null`
 *  when the repository carries none yet. A finding names the report that
 *  recorded a removal and the durable location docs-style.md actually
 *  requires — never a judgement about whether the removal itself was
 *  reasoned correctly, which stays out of scope for this function the same
 *  as it does for the two checks above. */
export function findRemovalsOutsideEnforcementMap({
  reportFiles,
  enforcementMapText,
  instantiatedDocFiles,
}) {
  const reportsWithRemovals = reportFiles.filter((r) =>
    hasRemovalRecord(r.text),
  );
  if (reportsWithRemovals.length === 0) return [];
  const mapHasRemovals = Boolean(
    enforcementMapText && hasRemovalRecord(enforcementMapText),
  );
  const anyDocHasProvenance = instantiatedDocFiles.some((d) =>
    hasRemovalRecord(d.text),
  );
  if (mapHasRemovals || anyDocHasProvenance) return [];
  return reportsWithRemovals.map((r) => ({
    path: r.path,
    problem:
      `${r.path} records an instantiation removal, but neither the ` +
      "enforcement map nor any instantiated standard carries a removals " +
      "heading or a PROVENANCE note — docs-style.md requires the removal " +
      "recorded in one of those two, not only in a session report",
    remedy:
      "move the removal record (or add it) to a `## Removals` section of the enforcement map, or a `## PROVENANCE` note on the instantiated standard it applies to",
  }));
}

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  // ponytail: component count taken from argv rather than derived from a
  // project graph — this reference script checks two mechanical properties,
  // not the full component map; a repository already knows its own count.
  const componentCount = Number(process.argv[2] ?? 1);
  const files = trackedFiles();
  const stacks = deriveStackList(files);
  const docFiles = files.filter(
    (f) => f.startsWith("docs/standards/") && f.endsWith(".md"),
  );
  let findingCount = 0;
  for (const file of docFiles) {
    const text = readFileSync(file, "utf8");
    for (const f of findStackReferencesOutsideList(text, stacks)) {
      findingCount++;
      process.stderr.write(
        `${file}:${f.line}: references ${f.stack} ("${f.keyword}") — not in the derived stack list (${[...stacks].join(", ") || "none"})\n`,
      );
    }
    for (const f of findMultiComponentContent(text, componentCount)) {
      findingCount++;
      process.stderr.write(
        `${file}:${f.line}: multi-component content ("${f.heading}") but the component map declares ${componentCount} component\n`,
      );
    }
  }

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
    process.stderr.write(`${f.path}: ${f.problem}\n`);
  }

  process.stderr.write(
    `standards instantiation: ${findingCount} finding${findingCount === 1 ? "" : "s"}\n`,
  );
  process.exit(findingCount > 0 ? 2 : 0);
}
