import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { parseMarkdown, type DocModel } from "../docs/model.ts";
import { resolveTarget } from "../docs/resolve.ts";
import { checkAnchor } from "../docs/anchors.ts";

export interface DocsGateResult {
  problems: string[];
  fixes: string[];
}

/**
 * Whole-corpus link and anchor integrity.
 *
 * Scans every tracked markdown file, not just the staged ones: when a file moves,
 * the links that break live in files nobody staged. lint-staged runs with
 * `stash: true`, so during a gated commit the working tree is the post-commit state
 * and this sees what the commit will produce.
 *
 * Repairs are confined to `stagedFiles`. A write outside that set would land in the
 * working tree but not the commit, and risks conflicting when the stash unwinds.
 */
export function runDocsRepoGate(
  cwd: string,
  stagedFiles: string[],
  opts: { fix?: boolean } = {},
): DocsGateResult {
  const corpus = execFileSync("git", ["ls-files"], { cwd, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  const markdown = corpus.filter((f) => f.endsWith(".md"));
  const staged = new Set(stagedFiles);
  const problems: string[] = [];
  const fixes: string[] = [];

  const models = new Map<string, DocModel>();
  const model = (rel: string): DocModel => {
    let m = models.get(rel);
    if (!m) {
      m = parseMarkdown(readFileSync(path.join(cwd, rel), "utf8"));
      models.set(rel, m);
    }
    return m;
  };

  for (const file of markdown) {
    let source = readFileSync(path.join(cwd, file), "utf8");
    // Edits are collected as character ranges and applied last-first, so earlier
    // offsets stay valid. A global string replace would also rewrite the same text
    // where it appears in prose or inside a fenced example — which is the bug the
    // parser exists to avoid, reintroduced on the write path.
    const edits: { start: number; end: number; text: string }[] = [];

    for (const link of model(file).links) {
      const res = resolveTarget(file, link.target, corpus);

      if (res.kind === "dead") {
        problems.push(
          `${file}:${link.line} dead link "${link.target}" — no file of that name exists`,
        );
        continue;
      }

      if (res.kind === "ambiguous") {
        problems.push(
          `${file}:${link.line} "${link.target}" is missing and its name is ambiguous — candidates: ${res.candidates.join(", ")}`,
        );
        continue;
      }

      if (res.kind === "fixed") {
        if (opts.fix && staged.has(file)) {
          const node = source.slice(link.start, link.end);
          edits.push({
            start: link.start,
            end: link.end,
            text: node.replace(`(${link.target}`, `(${res.to}`),
          });
          fixes.push(`${file}:${link.line} ${link.target} -> ${res.to}`);
        } else {
          problems.push(
            `${file}:${link.line} "${link.target}" has moved to "${res.to}"` +
              (staged.has(file)
                ? ""
                : " — file not staged, so it was not repaired"),
          );
        }
        continue;
      }

      // res.kind === "ok". The target resolves, so validate the fragment if present.
      if (!link.fragment) continue;
      const targetRel = link.target
        ? path.posix.normalize(
            path.posix.join(path.posix.dirname(file), link.target),
          )
        : file;
      if (!targetRel.endsWith(".md") || !corpus.includes(targetRel)) continue;

      const anchor = checkAnchor(link.fragment, model(targetRel));
      if (!anchor.ok) {
        problems.push(
          `${file}:${link.line} dead anchor "#${link.fragment}" in ${targetRel}` +
            (anchor.closest
              ? ` — closest heading is "#${anchor.closest}"`
              : ""),
        );
      }
    }

    if (edits.length > 0) {
      for (const e of edits.sort((a, b) => b.start - a.start)) {
        source = source.slice(0, e.start) + e.text + source.slice(e.end);
      }
      writeFileSync(path.join(cwd, file), source);
    }
  }

  return { problems, fixes };
}
