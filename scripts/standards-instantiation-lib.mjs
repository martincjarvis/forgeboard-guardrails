// cspell:ignore pyproject pytest golangci clippy nunit mstest msbuild pylint virtualenv gofmt phpunit rubocop lede
// The pure check functions `check-standards-instantiation.mjs` runs as a
// CLI — split into this file (fix 81) because the combined file reached the
// point where lizard's function-span detection merged this module's
// functions into one over-length block, the same tool artefact ADR-0009
// fixes for hooks/test/hooks.test.mjs. `check-standards-instantiation.mjs`
// re-exports everything below, so nothing that imports from it needs to
// change; only the CLI glue (the report* helpers and the `isMain` block)
// stayed in that file.
//
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
// Fix 55 — the first checkpoint is not confined to `docs/standards/**`.
// Audit 14 found four dead .NET words (`Roslynator`, `Meziantou`, `xunit`,
// `warnaserror`) in a Node-only repository's `cspell.json`, each with zero
// occurrences anywhere else in the tree, copied wholesale from this
// toolkit's own multi-stack word list — where the same words are not
// residue, because they occur in this corpus's own `.NET` prose.
// Instantiation residue is not confined to prose: a repository's own
// configuration can carry a stack it does not have, the same as its
// documents can. checkCspellResidue below reads the instantiated
// repository's own cspell.json, kept conservative on purpose — an unused
// word alone is not a finding, only one that also names a stack outside the
// derived list, because plenty of legitimate vocabulary appears once and is
// later edited away and a checker that flags every unused word gets turned
// off.
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
// `findMultiComponentContent`, or invoke check-standards-instantiation.mjs
// directly, from that repository's `gate-7-on-demand.mjs`) — a copy that
// only sits in the tooling directory checks nothing (fix 40; this toolkit's
// own `scripts/check-script-wiring.mjs` reports exactly that unwired
// state). This toolkit does not wire it into its OWN gate 7, and that is
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
import {
  trackedFiles,
  isText,
  classOf,
  isToolkit as isToolkitRepo,
} from "./lib.mjs";

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

// Fix 55 — single-token markers, distinct from STACK_KEYWORDS above. A
// cspell dictionary word is a bare identifier ("xunit"), not running prose,
// so a phrase built for a substring search in text ("dotnet ", trailing
// space and all) does not apply to it; this is the same per-stack universe
// with the tool and framework names a dictionary word copied wholesale from
// that stack would actually carry — the demonstrated case (Roslynator,
// Meziantou, xunit, warnaserror) is every entry in STACK_WORD_MARKERS.dotnet.
const STACK_WORD_MARKERS = {
  dotnet: [
    "roslynator",
    "meziantou",
    "xunit",
    "nunit",
    "mstest",
    "warnaserror",
    "nuget",
    "csproj",
    "msbuild",
  ],
  python: ["pytest", "pyproject", "pylint", "flake8", "virtualenv"],
  go: ["golangci", "gofmt", "goroutine"],
  rust: ["clippy", "rustfmt", "cargo"],
  java: ["junit", "gradle", "maven", "mockito"],
  php: ["phpunit", "composer", "psr"],
  ruby: ["rspec", "rubocop", "bundler"],
  node: [],
};

/** True when `word` names one stack's own tooling by containment either
 *  way — an exact match, a marker contained in the word, or the word
 *  contained in a marker — so both a bare tool name ("xunit") and a longer
 *  compound one still match without an exhaustive per-word list. */
function wordNamesStack(word, markers) {
  const w = word.toLowerCase();
  return markers.some((m) => w === m || w.includes(m) || m.includes(w));
}

/** Every `words` entry with no occurrence anywhere in `corpusText` (the rest
 *  of the tracked tree) that also names a stack absent from `presentStacks`.
 *  Returns [{ word, stack }]. Deliberately conservative: an unused word with
 *  no stack match is not a finding — most legitimate vocabulary appears once
 *  and is later edited away, and only the combination (unused AND names a
 *  stack the repository does not have) is the residue fix 55 demonstrated.
 *
 *  A case-insensitive substring test, not a RegExp built from the word — a
 *  cspell word list is repository content, not trusted input, and semgrep's
 *  detect-non-literal-regexp rule correctly flags any `new RegExp(variable)`
 *  as a ReDoS surface regardless of escaping; `.includes()` needs no escaping
 *  and answers the same "does this occur anywhere" question this check
 *  actually asks. */
export function findCspellResidue(words, corpusText, presentStacks) {
  const findings = [];
  const corpusLower = corpusText.toLowerCase();
  for (const word of words) {
    if (corpusLower.includes(word.toLowerCase())) continue;
    for (const [stack, markers] of Object.entries(STACK_WORD_MARKERS)) {
      if (presentStacks.has(stack)) continue;
      if (wordNamesStack(word, markers)) {
        findings.push({ word, stack });
        break;
      }
    }
  }
  return findings;
}

/** Fix 55: `cspell.json`'s word list is configuration the instantiation
 *  copies verbatim, the same as a document under `docs/standards/**` — a
 *  dead stack's vocabulary can hide there just as easily. This toolkit's
 *  own repository is exempt outright, keyed on lib.mjs's `isToolkit()`
 *  (fix 91 — `.claude-plugin/plugin.json` existing directly, not on
 *  whatever manifest a consumer's own tuned `deriveComponent()` happens to
 *  read): this corpus's `cspell.json` legitimately lists every stack it
 *  documents, in prose this same check would otherwise have to read to rule
 *  out. `files` and `readFile` are injectable for testing, the same shape
 *  the rest of this module uses.
 *
 *  Fix 59: the "is this word used elsewhere" corpus is built from files
 *  NOT classed `tooling` (file-classes.md), not from every tracked file.
 *  Once this module (and its ported test file, docs-style.md's own
 *  instruction) live inside the repository they inspect, "every tracked
 *  file" includes this checker's own source and test fixtures — which
 *  necessarily contain the literal dead-stack words as fixtures
 *  (`Roslynator`, `Meziantou`, `xunit`, `warnaserror` are exactly fix 55's
 *  demonstrated case). Those fixtures then vote the words "used elsewhere"
 *  and the checker never flags them in the one repository it exists to
 *  protect. This toolkit's own tests never caught it: `isToolkit()` above
 *  means the corpus-composition path never runs here at all, so a bug in it
 *  is invisible to any test that only exercises this toolkit's own,
 *  exempt repository — the general lesson is in docs-style.md, and the
 *  next "does this appear elsewhere" check should read it before making the
 *  same mistake. */
export function checkCspellResidue({
  cspellPath = "cspell.json",
  files = trackedFiles(),
  readFile = (f) => readFileSync(f, "utf8"),
  classify = classOf,
  isToolkit = isToolkitRepo,
} = {}) {
  if (isToolkit()) return [];
  let cspell;
  try {
    cspell = JSON.parse(readFile(cspellPath));
  } catch {
    return [];
  }
  const words = Array.isArray(cspell.words) ? cspell.words : [];
  if (words.length === 0) return [];
  const stacks = deriveStackList(files);
  const corpus = files
    .filter((f) => f !== cspellPath && isText(f) && classify(f) !== "tooling")
    .map((f) => {
      try {
        return readFile(f);
      } catch {
        return "";
      }
    })
    .join("\n");
  return findCspellResidue(words, corpus, stacks).map(({ word, stack }) => ({
    path: cspellPath,
    problem:
      `${cspellPath} lists '${word}' in its word list, with no occurrence ` +
      `anywhere else in the tree, and the word names ${stack} tooling — a ` +
      `stack outside this repository's derived list (${[...stacks].join(", ") || "none"})`,
    remedy: `remove '${word}' from ${cspellPath}'s word list, or add the manifest that shows the ${stack} stack is actually present`,
  }));
}

// Fix 60 — instantiation residue is not confined to prose or configuration
// either: a PORTED TEST can carry it too. An implementer removed, by hand,
// two toolkit self-checks that had made it into a ported test file — one
// reading this toolkit's own commit `daa59d0c…`, one asserting this
// toolkit's own ADR-0004 was `Accepted` with a named approver. Both would
// fail deterministically on every consuming repository's first CI run: a
// consumer's history does not, and cannot, contain another repository's
// commits. Nothing mechanical caught it — the instantiation checks above
// read `docs/standards/**` and `cspell.json`, never test files — and only
// the implementer noticing by hand closed the gap that time.

/** A full 40-character hex commit SHA in `text`. Returns [{ line, sha }],
 *  1-indexed. Deliberately the only signal: detecting "this assertion tests
 *  the upstream repository's state" semantically is exactly the kind of
 *  heuristic that false-positives on legitimate fixtures (a hash used as
 *  arbitrary test data, a content-addressed id) — a full 40-hex-character
 *  token is precise, mechanical, and has no judgement in it. A 40-hex-char
 *  SUBSTRING of a longer hash (a sha256 hex digest, for instance) does not
 *  match: `\b` requires a transition out of a hex/word character on both
 *  sides, which a longer unbroken hex run never offers in its middle. */
export function findHardcodedCommitSha(text) {
  const findings = [];
  const re = /\b[0-9a-f]{40}\b/gi;
  text.split("\n").forEach((line, i) => {
    re.lastIndex = 0;
    const m = re.exec(line);
    if (m) findings.push({ line: i + 1, sha: m[0] });
  });
  return findings;
}

/** Fix 60: scoped to files classed `test` (file-classes.md), not every
 *  tracked file — the same file-class scoping fix 59 applied to the cspell
 *  corpus, applied again. A blanket tree-wide search would false-positive
 *  on a `configuration`-classed CI workflow pinning a third-party GitHub
 *  Action to its commit SHA, which is the opposite of this defect: a
 *  security practice, not a ported assertion about upstream history. This
 *  toolkit's own repository is exempt outright, the same `isToolkit`
 *  reasoning as `checkCspellResidue` above — its own test suite legitimately
 *  asserts its own real history (fix 49, hazard 3: `daa59d0c…`), which is a
 *  fact about this canonical repository, not residue to flag. */
export function checkHardcodedCommitSha({
  files = trackedFiles(),
  readFile = (f) => readFileSync(f, "utf8"),
  classify = classOf,
  isToolkit = isToolkitRepo,
} = {}) {
  if (isToolkit()) return [];
  const findings = [];
  for (const f of files) {
    if (classify(f) !== "test" || !isText(f)) continue;
    let text;
    try {
      text = readFile(f);
    } catch {
      continue;
    }
    for (const { line, sha } of findHardcodedCommitSha(text)) {
      findings.push({
        path: f,
        problem:
          `${f}:${line}: hard-codes a full 40-character commit SHA ` +
          `(${sha}) — a consuming repository's history does not, and ` +
          "cannot, contain another repository's commits, so an assertion " +
          "against it fails deterministically on the first CI run",
        remedy:
          "replace the SHA with a synthetic fixture, or delete the assertion if it tests the source repository's own state rather than this one",
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

// Fix 72 — findMultiComponentContent above is a heading search, and a
// retained standard's own contradiction does not have to live in a heading.
// Audit 17's demonstrated case: docs/standards/deployment-strategy.md, 567
// of 568 lines, whose frontmatter `summary` still read "How a multi-component
// app is versioned per-component, packaged, and deployed..." in a repository
// this corpus's own component map derives as one component
// (docs/standards/guardrails/components.md) — a direct, structural
// contradiction the heading search cannot see, because neither a frontmatter
// field nor a restated title line is a Markdown heading.
const MULTI_COMPONENT_PHRASE = /\bmulti-component\b/i;

/** The first paragraph right after `lines[titleIndex]` (the H1), before a
 *  blank line or the next heading — the document's lede. `null` when the H1
 *  is followed by nothing (EOF, or a heading with no paragraph between). */
function ledeAfter(lines, titleIndex) {
  let i = titleIndex + 1;
  while (i < lines.length && lines[i].trim() === "") i++;
  const paraStart = i;
  const paraLines = [];
  while (
    i < lines.length &&
    lines[i].trim() !== "" &&
    !/^#{1,6}\s/.test(lines[i])
  ) {
    paraLines.push(lines[i]);
    i++;
  }
  return paraLines.length
    ? { line: paraStart + 1, text: paraLines.join(" ").trim(), field: "lede" }
    : null;
}

/** True for a frontmatter block line, the `# ` title line, or the lede — the
 *  first paragraph right after the H1. Three structural self-description
 *  spots, never the body generally (docs-style.md: "a crude proxy, and
 *  deliberately so"). Fix 81 — audit 19: deployment-strategy.md's
 *  frontmatter was tuned but its lede still read "multi-component"; the
 *  frontmatter/title scan alone could not see it. */
function frontmatterOrTitleLines(text) {
  const lines = text.split("\n");
  const result = [];
  const fmEnd = lines[0] === "---" ? lines.indexOf("---", 1) : -1;
  for (let i = 0; i < lines.length; i++) {
    if (fmEnd > 0 && i > 0 && i < fmEnd) {
      result.push({ line: i + 1, text: lines[i], field: "frontmatter" });
    } else if (/^#\s/.test(lines[i])) {
      result.push({ line: i + 1, text: lines[i], field: "title" });
      const lede = ledeAfter(lines, i);
      if (lede) result.push(lede);
      break; // the first `# ` heading is the title; nothing past its lede counts
    }
  }
  return result;
}

/** A retained standard's own title, frontmatter or lede contradicts the
 *  derived component map — structural, not vocabulary-based. Returns
 *  [{ field, line, text }], 1-indexed. Deliberately narrow to the one
 *  demonstrated phrase ("multi-component") and the three structural
 *  locations — widening to body prose reopens the judgement call this
 *  check exists to avoid. */
export function findComponentCountContradiction(text, componentCount) {
  if (componentCount > 1) return [];
  return frontmatterOrTitleLines(text)
    .filter((l) => MULTI_COMPONENT_PHRASE.test(l.text))
    .map((l) => ({
      field: l.field,
      line: l.line,
      text: l.text.trim(),
    }));
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
