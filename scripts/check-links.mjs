// Check 17 — link and anchor integrity (gate 2, and gate 7's sweep).
//
// Reads the WHOLE documentation corpus, not the staged subset, because a file
// move leaves the broken link in a file nobody staged. Repairs are confined to
// staged files; a break it cannot repair still blocks, wherever it lives.
//
// Internal links and anchors are resolved offline — the repository's own docs
// command. External links are platform capability scanning (level 1) and are
// skipped here, reported rather than fetched: a gate that needs the network to
// run is a gate people route around.
import { existsSync } from "node:fs";
import { dirname, resolve, normalize } from "node:path";
import { trackedFiles, readStaged } from "./lib.mjs";

const FENCE = /^(\s*)(```+|~~~+)/;

/** GitHub-style heading slug: lowercase, drop punctuation, spaces to hyphens.
 *  Each space becomes its own hyphen — punctuation is removed first, so
 *  `Gate 2 — Commit` keeps both surrounding spaces and slugs to
 *  `gate-2--commit`. */
export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/ /g, "-");
}

/** Every anchor a markdown file exposes, including GitHub's -n suffix for
 *  repeated headings. */
export function anchorsOf(md) {
  const anchors = new Set();
  const counts = new Map();
  let inFence = false;
  for (const line of md.split("\n")) {
    const fence = line.match(FENCE);
    if (fence) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const h = line.match(/^(#{1,6})\s+(.*?)(?:\s+#+\s*)?$/);
    if (!h) continue;
    let slug = slugify(h[2]);
    if (!slug) continue;
    const n = counts.get(slug) || 0;
    counts.set(slug, n + 1);
    if (n > 0) slug = `${slug}-${n}`;
    anchors.add(slug);
  }
  return anchors;
}

/** Markdown links on non-code lines: yields { line, target }. Images and
 *  reference-style links are included because both name a target to resolve. */
export function* linksOf(md) {
  let inFence = false;
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.match(FENCE)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    // Drop inline code spans on this line so links inside `code` are not checked.
    const line = raw.replace(/`[^`]*`/g, "");
    const re = /!?\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      yield { line: i + 1, target: m[2] };
    }
    // Bare reference definitions: [label]: target
    const ref = line.match(/^\[[^\]]+\]:\s*(\S+)/);
    if (ref) yield { line: i + 1, target: ref[1] };
  }
}

function isExternal(target) {
  return /^[a-z][a-z0-9+.-]*:/i.test(target);
}

// Skip anything with a scheme, a protocol-relative form, or a placeholder.
function skipTarget(target) {
  return (
    isExternal(target) || target.startsWith("//") || target.startsWith("<")
  );
}

/** Split a raw link target into its file part and anchor: strips a query
 *  string, and treats a leading "#" as an anchor-only target (empty file
 *  part, pointing back at the file the link itself lives in). */
function splitTarget(target) {
  let raw = target.trim();
  const q = raw.indexOf("?");
  if (q >= 0) raw = raw.slice(0, q);
  if (raw.startsWith("#")) return { filePart: "", anchor: raw.slice(1) };
  const [filePart, anchor] = raw.split("#");
  return { filePart, anchor };
}

/** Resolve a link's non-empty file part to a repo-relative path, or null if
 *  it matches nothing tracked or on disk. GitHub resolves a bare path to a
 *  directory's README or a .md sibling, so those are tried too. */
function resolveFilePart(linkFile, filePart, trackedSet) {
  let decoded = filePart;
  try {
    decoded = decodeURIComponent(filePart);
  } catch {
    // leave as-is
  }
  const base = dirname(linkFile);
  const candidates = [decoded];
  if (!decoded.endsWith(".md")) {
    candidates.push(`${decoded}.md`, `${decoded}/README.md`);
  }
  for (const c of candidates) {
    const resolved = normalize(resolve(base, c)).replace(/\\/g, "/");
    const rel = normalize(resolved);
    if (trackedSet.has(rel) || existsSync(resolved)) return rel;
  }
  return null;
}

/** Does `targetPath`'s markdown expose `anchor`? Null (nothing wrong) unless
 *  the target is markdown and the anchor is genuinely absent from it. */
function anchorProblem(targetPath, anchor) {
  if (!anchor || !targetPath.endsWith(".md")) return null;
  let md;
  try {
    md = readStaged(targetPath);
  } catch {
    return null;
  }
  return anchorsOf(md).has(anchor) ? null : `anchor does not exist: #${anchor}`;
}

/** Resolve one link target against the file it appears in. Returns null if ok,
 *  or a reason string. */
function resolveTarget(linkFile, target, trackedSet) {
  const { filePart, anchor } = splitTarget(target);
  if (!filePart && !anchor) return null; // "()" — nothing to check

  let targetPath;
  if (filePart) {
    targetPath = resolveFilePart(linkFile, filePart, trackedSet);
    if (!targetPath) return `links to nothing: ${filePart}`;
  } else {
    targetPath = linkFile.replace(/\\/g, "/");
  }

  return anchorProblem(targetPath, anchor);
}

/** Check a list of markdown files; return findings (one per broken link).
 *  Defaults to the whole tracked corpus, because a moved file leaves broken
 *  links in files nobody staged. */
export function checkLinks(files) {
  if (!files) files = trackedFiles().filter((f) => f.endsWith(".md"));
  const tracked = new Set(trackedFiles().map((f) => f.replace(/\\/g, "/")));
  const findings = [];
  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    let md;
    try {
      md = readStaged(file);
    } catch {
      continue;
    }
    for (const { line, target } of linksOf(md)) {
      if (skipTarget(target)) continue;
      const reason = resolveTarget(file, target, tracked);
      if (reason) {
        findings.push({
          check: "link/anchor integrity",
          path: `${file}:${line}`,
          problem: `${reason} (target: ${target})`,
          remedy: "fix the link, or rename the target back into shape",
        });
      }
    }
  }
  return findings;
}

// CLI — when run directly, checks the whole tracked corpus.
import { pathToFileURL } from "node:url";
const isMain =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const { report } = await import("./lib.mjs");
  const files = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const targets = files.length
    ? files
    : trackedFiles().filter((f) => f.endsWith(".md"));
  const findings = checkLinks(targets);
  process.stderr.write(
    `links: checked ${targets.length} markdown file(s), ${findings.length} broken\n`,
  );
  report("links", findings);
}
