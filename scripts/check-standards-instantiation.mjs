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
// Ported into a CONSUMING repository's own tooling directory and run there,
// against THAT repository's own instantiated `docs/standards/`. Never run
// against this toolkit's own `docs/standards/` — this repository is the
// canonical corpus, not an instantiated copy, and legitimately documents
// every stack it supports.
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
  process.stderr.write(
    `standards instantiation: ${findingCount} finding${findingCount === 1 ? "" : "s"}\n`,
  );
  process.exit(findingCount > 0 ? 2 : 0);
}
