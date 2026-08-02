// cspell:ignore pyproject pytest golangci clippy nunit mstest msbuild pylint virtualenv gofmt phpunit rubocop lede
// The pure check functions behind `check-standards-instantiation.mjs`, which
// re-exports everything here and keeps only the CLI glue.
//
// Reference implementation for two of the seven "instantiated docs are tuned to
// the repository" checkpoints
// (docs-style.md#standards-in-a-consuming-repository): a stack name outside the
// derived list, and multi-component content in a single-component repository.
// Only these two are coded because only these two are mechanical; the other
// five ask whether prose is honest, which no script scores.
//
// checkCspellResidue extends the first checkpoint past `docs/standards/**` — a
// repository's configuration can carry a stack it does not have, the same as
// its documents can. Deliberately conservative: an unused word alone is not a
// finding, only one that also names a stack outside the derived list. A checker
// that flags every unused word gets turned off.
//
// findRemovalsOutsideEnforcementMap checks only *where* a removal was recorded,
// never whether its reason is honest. docs-style.md requires a PROVENANCE note
// or an enforcement-map section; a session report is not where anyone looks a
// year later.
//
// **Run this against a CONSUMING repository, never against this one.** This
// repository is the canonical corpus, not an instantiated copy, and
// legitimately documents every stack it supports.
//
// **Porting the file is not enough — wire it in, at two gates.** Gate 7 alone
// only ever reports: one bootstrapped repository ran it there and carried 60
// findings across 13 documents without blocking a merge. It also belongs at
// gate 6, blocking, change-triggered on the range touching `docs/standards/`.
// See docs-style.md#enforcement and change-triggered-checks.md.
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

/** Which stacks `files` (tracked paths) declare a manifest for.
 *  @param {string[]} files */
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
 *  [{ stack, keyword, line }], 1-indexed.
 *  @param {string} text @param {Set<string>} presentStacks
 *  @returns {{ stack: string, keyword: string, line: number }[]} */
export function findStackReferencesOutsideList(text, presentStacks) {
  /** @type {{ stack: string, keyword: string, line: number }[]} */
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

// Single-token markers, distinct from STACK_KEYWORDS above: a cspell word is
// a bare identifier ("xunit"), not prose, so a phrase built for a text search
// ("dotnet ", trailing space and all) does not apply to it.
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
 *  compound one still match without an exhaustive per-word list.
 *  @param {string} word @param {string[]} markers @returns {boolean} */
function wordNamesStack(word, markers) {
  const w = word.toLowerCase();
  return markers.some((m) => w === m || w.includes(m) || m.includes(w));
}

/** Every `words` entry with no occurrence anywhere in `corpusText` (the rest
 *  of the tracked tree) that also names a stack absent from `presentStacks`.
 *  Returns [{ word, stack }]. Only the combination is a finding: plenty of
 *  legitimate vocabulary appears once and is later edited away.
 *
 *  A substring test rather than a RegExp built from the word — a cspell word
 *  list is repository content, not trusted input, and `new RegExp(variable)`
 *  is a ReDoS surface however it is escaped.
 *  @param {string[]} words @param {string} corpusText @param {Set<string>} presentStacks
 *  @returns {{ word: string, stack: string }[]} */
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

/** `cspell.json`'s word list is configuration the instantiation copies
 *  verbatim, so a dead stack's vocabulary hides there as easily as in prose.
 *  This toolkit is exempt via `isToolkit()`: its own list legitimately names
 *  every stack it documents.
 *
 *  **The corpus excludes `tooling`-classed files, and must.** Once this
 *  module and its test live in the repository they inspect, their own
 *  fixtures contain the dead-stack words — which would vote those words
 *  "used elsewhere" and silence the check in the one repository it exists to
 *  protect.
 *  @param {{ cspellPath?: string, files?: string[], readFile?: (file: string) => string, classify?: (file: string) => string, isToolkit?: () => boolean }} [opts] */
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

// A ported TEST can carry residue too, and nothing above reads test files.
// A toolkit self-check that survives porting — one reading this repository's
// own commit SHA, or asserting its own ADR — fails on a consumer's first CI
// run, because a consumer's history cannot contain another repository's
// commits.

/** A full 40-character hex commit SHA in `text`. Returns [{ line, sha }],
 *  1-indexed. The only signal, deliberately: judging an assertion's intent
 *  false-positives on legitimate fixtures where a 40-hex token does not. A
 *  40-character run inside a longer hash does not match — `\b` needs a
 *  transition on both sides.
 *  @param {string} text @returns {{ line: number, sha: string }[]} */
export function findHardcodedCommitSha(text) {
  /** @type {{ line: number, sha: string }[]} */
  const findings = [];
  const re = /\b[0-9a-f]{40}\b/gi;
  text.split("\n").forEach((line, i) => {
    re.lastIndex = 0;
    const m = re.exec(line);
    if (m) findings.push({ line: i + 1, sha: m[0] });
  });
  return findings;
}

/** Scoped to files classed `test` (file-classes.md), not every
 *  tracked file — the same file-class scoping `checkCspellResidue` uses. A
 *  tree-wide search would flag a workflow pinning a GitHub Action to its
 *  SHA, which is the opposite defect: a security practice. This toolkit is
 *  exempt outright, the same `isToolkit` reasoning as above.
 *  @param {{ files?: string[], readFile?: (file: string) => string, classify?: (file: string) => string, isToolkit?: () => boolean }} [opts] */
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
 *  Returns [{ heading, line }], 1-indexed.
 *  @param {string} text @param {number} componentCount
 *  @returns {{ heading: string, line: number }[]} */
export function findMultiComponentContent(text, componentCount) {
  if (componentCount > 1) return [];
  /** @type {{ heading: string, line: number }[]} */
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

// findMultiComponentContent is a heading search, and a contradiction does not
// have to live in a heading: a frontmatter `summary` describing a
// multi-component app, in a repository the component map derives as one, is
// invisible to it.
const MULTI_COMPONENT_PHRASE = /\bmulti-component\b/i;

/** The first paragraph right after `lines[titleIndex]` (the H1), before a
 *  blank line or the next heading — the document's lede. `null` when the H1
 *  is followed by nothing (EOF, or a heading with no paragraph between).
 *  @param {string[]} lines @param {number} titleIndex */
function ledeAfter(lines, titleIndex) {
  let i = titleIndex + 1;
  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined || line.trim() !== "") break;
    i++;
  }
  const paraStart = i;
  const paraLines = [];
  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined || line.trim() === "" || /^#{1,6}\s/.test(line))
      break;
    paraLines.push(line);
    i++;
  }
  return paraLines.length
    ? { line: paraStart + 1, text: paraLines.join(" ").trim(), field: "lede" }
    : null;
}

/** True for a frontmatter block line, the `# ` title line, or the lede — the
 *  first paragraph right after the H1. Three structural self-description
 *  spots, never the body generally (docs-style.md: "a crude proxy, and
 *  deliberately so"). deployment-strategy.md's
 *  frontmatter was tuned but its lede still read "multi-component"; the
 *  frontmatter/title scan alone could not see it.
 *  @param {string} text */
function frontmatterOrTitleLines(text) {
  const lines = text.split("\n");
  const result = [];
  const fmEnd = lines[0] === "---" ? lines.indexOf("---", 1) : -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    if (fmEnd > 0 && i > 0 && i < fmEnd) {
      result.push({ line: i + 1, text: line, field: "frontmatter" });
    } else if (/^#\s/.test(line)) {
      result.push({ line: i + 1, text: line, field: "title" });
      const lede = ledeAfter(lines, i);
      if (lede) result.push(lede);
      break; // the first `# ` heading is the title; nothing past its lede counts
    }
  }
  return result;
}

/** A retained standard's own title, frontmatter or lede contradicts the
 *  derived component map — structural, not vocabulary-based. Returns
 *  [{ field, line, text }], 1-indexed. Narrow to one phrase and three
 *  structural locations; widening to body prose reopens the judgement this
 *  check exists to avoid.
 *  @param {string} text @param {number} componentCount
 *  @returns {{ field: string, line: number, text: string }[]} */
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
 *  accepted locations, read structurally rather than for what they say.
 *  @param {string} text @returns {boolean} */
function hasRemovalRecord(text) {
  return text
    .split("\n")
    .some(
      (line) => REMOVAL_HEADING.test(line) || PROVENANCE_HEADING.test(line),
    );
}

/** `reportFiles` and `instantiatedDocFiles` are each `{ path, text
 *  }`; `enforcementMapText` is the map's own content, or `null` when the
 *  repository carries none. A finding names the report and the durable
 *  location docs-style.md requires — never whether the removal was reasoned
 *  correctly.
 *  @param {{ reportFiles: { path: string, text: string }[], enforcementMapText: string | null, instantiatedDocFiles: { path: string, text: string }[] }} opts
 *  @returns {{ path: string, problem: string, remedy: string }[]} */
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
