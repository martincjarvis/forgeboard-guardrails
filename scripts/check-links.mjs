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
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, normalize } from "node:path";
import { trackedFiles, splitLines } from "./lib.mjs";

const FENCE = /^(\s*)(```+|~~~+)/;

/** GitHub-style heading slug: lowercase, drop punctuation, spaces to hyphens. */
export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
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

/** Resolve one link target against the file it appears in. Returns null if ok,
 *  or a reason string. */
function resolveTarget(linkFile, target, trackedSet) {
  let raw = target.trim();
  // Strip a query string; keep the fragment separate.
  const q = raw.indexOf("?");
  if (q >= 0) raw = raw.slice(0, q);
  let [filePart, anchor] = raw.split("#");
  const anchorOnly = raw.startsWith("#");
  if (anchorOnly) {
    anchor = raw.slice(1);
    filePart = "";
  }
  if (filePart === "" && !anchor) return null; // "()" — nothing to check

  let targetPath = null;
  if (filePart) {
    try {
      filePart = decodeURIComponent(filePart);
    } catch {
      // leave as-is
    }
    const base = dirname(linkFile);
    const candidates = [filePart];
    // GitHub resolves a bare path to a directory's README or a .md sibling.
    if (!filePart.endsWith(".md")) {
      candidates.push(`${filePart}.md`, `${filePart}/README.md`);
    }
    for (const c of candidates) {
      const resolved = normalize(resolve(base, c)).replace(/\\/g, "/");
      const rel = normalize(resolved);
      if (trackedSet.has(rel) || existsSync(resolved)) {
        targetPath = rel;
        break;
      }
    }
    if (!targetPath) return `links to nothing: ${filePart}`;
  } else {
    targetPath = linkFile.replace(/\\/g, "/");
  }

  if (anchor) {
    if (!targetPath.endsWith(".md")) return null; // anchor on a non-md file: leave
    let md;
    try {
      md = readFileSync(targetPath, "utf8");
    } catch {
      return null;
    }
    const anchors = anchorsOf(md);
    if (!anchors.has(anchor)) return `anchor does not exist: #${anchor}`;
  }
  return null;
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
      md = readFileSync(file, "utf8");
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
const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
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
