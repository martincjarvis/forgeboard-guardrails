// Check 15 — suppression register completeness (gate 2).
//
// Every inline suppression must name a single rule and carry a complete row in
// docs/registers/suppression-register.md (bypass-and-exceptions.md). A broadened
// annotation, or a marker with no register row, is the finding this catches.
// The register itself is the reviewed record; a generated inventory is not one.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { trackedFiles, isText, classOf, splitLines, report } from "./lib.mjs";
import { pathToFileURL } from "node:url";

const REGISTER = "docs/registers/suppression-register.md";
// This checker defines the marker patterns as data, so it would flag its own
// source. Identified by this module's own URL — not process.argv[1], which is the
// invoker (pre-commit.mjs) when the function is imported rather than run as a CLI.
const SELF_URL = import.meta.url;

// Each marker: a directive and a function pulling the single rule it names (or
// null when it names none, which is itself a defect — a broadened annotation).
const MARKERS = [
  {
    name: "eslint-disable",
    re: /eslint-disable(?:-next-line|-line)?(?:\s+(.+))?/,
    rule: (m) => firstRule(m[1]),
  },
  {
    name: "secretlint-disable",
    re: /secretlint-disable(?:\s+(.+))?/,
    rule: (m) => firstRule(m[1]),
  },
  {
    name: "markdownlint-disable",
    re: /markdownlint-disable(?:-next-line|-line|-file)?(?:\s+(.+))?/,
    rule: (m) => firstRule(m[1]),
  },
  {
    name: "nosemgrep",
    re: /nosemgrep(?::\s*([A-Za-z0-9._-]+))?/,
    rule: (m) => (m[1] ? m[1] : null),
  },
  {
    name: "@ts-expect-error",
    re: /@ts-expect-error/,
    rule: () => "@ts-expect-error",
  },
  {
    name: "@ts-ignore",
    re: /@ts-ignore/,
    rule: () => "@ts-ignore",
  },
  {
    name: "coverage ignore",
    re: /\b(?:c8|istanbul|v8|coverage)[ _-]ignore(?:-next-line|-start)?/,
    rule: () => "coverage-ignore",
  },
];

function firstRule(rest) {
  if (!rest) return null;
  // Rules are the first whitespace/comma-separated token that looks like an id.
  const tok = rest
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => /^[A-Za-z][\w./-]*$/.test(t));
  return tok.length === 1 ? tok[0] : tok.length > 1 ? null : null;
}

/** Parse the register into [{ code, scope }]. Columns: Code | Scope | ... */
function parseRegister() {
  const rows = [];
  let md;
  try {
    md = readFileSync(REGISTER, "utf8");
  } catch {
    return rows;
  }
  for (const line of md.split("\n")) {
    if (!line.startsWith("|") || line.includes("---")) continue;
    const cells = cellsOf(line);
    if (cells.length < 2) continue;
    const code = cells[0]?.trim();
    const scope = cells[1]?.trim();
    // Skip the header row and the "no rows" sentinel.
    if (!code || (/code/i.test(code) && /scope/i.test(scope))) continue;
    if (code.startsWith("_") || code.startsWith("No rows")) continue;
    rows.push({ code, scope });
  }
  return rows;
}

function cellsOf(row) {
  // Split on unescaped pipes; strip inline code backticks and emphasis.
  return row
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/** Check tracked code files for unregistered or broadened suppressions.
 *  Inline suppressions live in code (production and test classes); prose that
 *  documents a marker, and a tool's own configuration, are not suppressions
 *  (bypass-and-exceptions.md: a wholesale config disable is a documented
 *  decision, not an exception to a rule). */
export function checkSuppressions(files) {
  const rows = parseRegister();
  const findings = [];
  const scan = files ?? trackedFiles();
  for (const file of scan) {
    if (file === REGISTER || !isText(file)) continue;
    const cls = classOf(file);
    if (cls !== "production" && cls !== "test") continue;
    try {
      if (pathToFileURL(resolve(process.cwd(), file)).href === SELF_URL)
        continue;
    } catch {
      /* ignore */
    }
    let md;
    try {
      md = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const lines = md.split("\n");
    for (let i = 0; i < lines.length; i++) {
      for (const marker of MARKERS) {
        const m = lines[i].match(marker.re);
        if (!m) continue;
        const rule = marker.rule(m);
        if (!rule) {
          findings.push({
            check: "suppression register",
            path: `${file}:${i + 1}`,
            problem: `${marker.name} does not name a single rule`,
            remedy: "name the one rule, and add a register row for it",
          });
          continue;
        }
        const hasRow = rows.some(
          (r) => r.code === rule && pathMatches(r.scope, file),
        );
        if (!hasRow) {
          findings.push({
            check: "suppression register",
            path: `${file}:${i + 1}`,
            problem: `${marker.name} of \`${rule}\` has no register row`,
            remedy: `add a row to ${REGISTER} (Code: ${rule}, Scope: ${file})`,
          });
        }
      }
    }
  }
  return findings;
}

function pathMatches(scope, file) {
  if (!scope) return false;
  const s = scope.replace(/\\/g, "/").replace(/\/$/, "");
  const f = file.replace(/\\/g, "/");
  return f === s || f.endsWith("/" + s) || s === f.replace(/\.[^.]+$/, "");
}

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const files = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const findings = checkSuppressions(files.length ? files : undefined);
  process.stderr.write(
    `suppressions: ${findings.length} unregistered or broadened\n`,
  );
  report("gate 2", findings);
}
