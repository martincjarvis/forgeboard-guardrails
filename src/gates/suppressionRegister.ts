import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { parseMarkdown } from "../docs/model.ts";

export const REGISTER_PATH = "docs/suppression-register.md";

export interface SuppressionGateResult {
  problems: string[];
}

/**
 * Markers that turn a gate off for a line or a block.
 *
 * Each pattern captures the rule identifiers the marker names, as one string —
 * a marker may name several, comma or space separated. A marker that names none
 * is matched too, deliberately: it is the broadest form and the one that must be
 * refused rather than registered.
 */
const MARKERS: { tool: string; pattern: RegExp }[] = [
  { tool: "semgrep", pattern: /\bnosemgrep\b:?([^\n*]*)/g },
  {
    tool: "eslint",
    pattern: /\beslint-disable(?:-next-line|-line)?\b([^\n*]*)/g,
  },
  { tool: "secretlint", pattern: /\bsecretlint-disable\b([^\n>]*)/g },
  {
    tool: "markdownlint",
    pattern: /\bmarkdownlint-disable\b[^\n]*?([^\n>]*)/g,
  },
  { tool: "typescript", pattern: /@ts-(?:ignore|expect-error)\b([^\n]*)/g },
  { tool: "coverage", pattern: /\b(?:istanbul|c8) ignore\b([^\n*]*)/g },
];

/** A rule id: dotted, slashed or scoped. Prose words are not ids. */
const RULE_ID = /[@\w][\w./-]*[\w/]/g;

const COMMENT_OPENER = /(?<quote>.?)(\/\/|\/\*|<!--|#|^\s*\*)\s*$/;

/**
 * True when the marker is what the comment says, rather than a word inside a
 * sentence — the marker must be the first thing after the comment opener.
 *
 * Three false positives this rules out, all real and all found by running it here.
 * `cspell.json` lists "nosemgrep" as a dictionary word so the spell gate accepts
 * it, which turns nothing off. This programme documents these markers constantly —
 * ADR-0011, the remediation plan, this file's own comments — and a gate that cannot
 * tell a suppression from a sentence about suppressions reports the documentation
 * as the offence. And a marker inside a string literal, which the tests for this
 * gate and for the markdown model both contain, suppresses nothing: a quote
 * immediately before the comment opener is the tell.
 *
 * **Ceiling, stated deliberately:** this reads text, not syntax. A marker built by
 * concatenation, or a comment opener genuinely preceded by a quote character,
 * defeats it in one direction or the other. Parsing every language the toolkit
 * might gate is the alternative, and it is not worth it — a false positive here is
 * visible and one line to explain, and a miss is caught by the tool itself still
 * being suppressed at review.
 */
function isMarkerComment(source: string, at: number): boolean {
  const lineStart = source.lastIndexOf("\n", at) + 1;
  const match = COMMENT_OPENER.exec(source.slice(lineStart, at));
  if (!match) return false;
  return !/["'`]/.test(match.groups?.quote ?? "");
}

interface Found {
  file: string;
  line: number;
  tool: string;
  /** Empty when the marker named no rule at all. */
  codes: string[];
}

function ranges(
  file: string,
  source: string,
): { start: number; end: number }[] {
  if (!file.endsWith(".md")) return [];
  try {
    return parseMarkdown(source).codeBlocks;
  } catch {
    // An unparseable document is not a reason to block a commit; the worst case
    // is a false positive the author can see and explain.
    return [];
  }
}

function scan(file: string, source: string): Found[] {
  const blocks = ranges(file, source);
  const inExample = (at: number): boolean =>
    blocks.some((b) => at >= b.start && at < b.end);

  const found: Found[] = [];
  for (const { tool, pattern } of MARKERS) {
    for (const match of source.matchAll(pattern)) {
      const at = match.index ?? 0;
      if (inExample(at)) continue;
      if (!isMarkerComment(source, at)) continue;

      const codes = (match[1] ?? "").match(RULE_ID) ?? [];
      found.push({
        file,
        line: source.slice(0, at).split("\n").length,
        tool,
        codes,
      });
    }
  }
  return found;
}

/**
 * Refuses a suppression that is not written down.
 *
 * A `nosemgrep` or `eslint-disable` is a decision to accept a risk. Accepted in a
 * diff and never recorded, it becomes invisible: nobody can list what the repo has
 * turned off, on what grounds, or when any of it could come back. The register is
 * the list; this makes it the only way to add to it.
 *
 * A row covers one rule at one path. Matching on the rule alone would let a single
 * registered exception license that rule everywhere, which is the broadened
 * annotation ADR-0011 forbids, reached by another route.
 */
export function runSuppressionRegisterGate(cwd: string): SuppressionGateResult {
  const tracked = execFileSync("git", ["ls-files"], { cwd, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);

  const found: Found[] = [];
  for (const file of tracked) {
    // The register names every rule it governs. Scanning it as source would let it
    // authorise anything it happens to mention, including itself.
    if (file === REGISTER_PATH) continue;
    let source: string;
    try {
      source = readFileSync(path.join(cwd, file), "utf8");
    } catch {
      continue; // Binary, or deleted between listing and reading.
    }
    if (!source.includes("�")) found.push(...scan(file, source));
  }

  if (found.length === 0) return { problems: [] };

  const registerPath = path.join(cwd, REGISTER_PATH);
  if (!existsSync(registerPath)) {
    return {
      problems: [
        `${found.length} suppression(s) found and no register at ${REGISTER_PATH}. ` +
          `Create it — a suppression nobody wrote down is one nobody can review or retire. ` +
          `First: ${found[0].file}:${found[0].line}`,
      ],
    };
  }

  const register = readFileSync(registerPath, "utf8");
  const rows = register
    .split("\n")
    .filter((l) => l.trim().startsWith("|"))
    .map((l) => l.split("|").map((c) => c.trim()));

  const problems: string[] = [];
  for (const entry of found) {
    if (entry.codes.length === 0) {
      problems.push(
        `${entry.file}:${entry.line} a bare ${entry.tool} suppression silences every rule on the line — name the rule it is for.`,
      );
      continue;
    }
    for (const code of entry.codes) {
      const covered = rows.some(
        (cells) =>
          cells.some((c) => c.includes(code)) &&
          cells.some((c) => c.includes(entry.file)),
      );
      if (!covered) {
        problems.push(
          `${entry.file}:${entry.line} unregistered ${entry.tool} suppression "${code}" — ` +
            `add a row to ${REGISTER_PATH} giving its scope, justification, removal condition and approver.`,
        );
      }
    }
  }

  return { problems };
}
