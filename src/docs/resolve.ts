import path from "node:path";

// cspell:ignore basenames

export type Resolution =
  | { kind: "ok" }
  | { kind: "fixed"; to: string }
  | { kind: "ambiguous"; candidates: string[] }
  | { kind: "dead" };

const EXTERNAL = /^(https?:|mailto:|#|<)/;

/**
 * Decides whether a link target resolves against the corpus, and what it should
 * become if not.
 *
 * The basename fallback is a heuristic with a stated ceiling: it would guess wrong
 * if two files shared a basename across directories, which is exactly why more than
 * one match reports `ambiguous` rather than picking. If basenames stop being
 * effectively unique in a repo, drop the fallback rather than making it cleverer.
 */
export function resolveTarget(
  fromFile: string,
  target: string,
  corpus: string[],
): Resolution {
  if (!target || EXTERNAL.test(target)) return { kind: "ok" };

  const fromDir = path.posix.dirname(fromFile);
  const resolved = path.posix
    .normalize(path.posix.join(fromDir, decodeURI(target)))
    .replace(/\/$/, "");

  // A target that escapes the repository root is deliberate and unverifiable from
  // here — the toolkit's own README links a sibling ForgeBoard checkout. Treated
  // like an external link rather than reported as dead.
  //
  // Ceiling, stated deliberately: this is a false negative for an in-repo typo that
  // overshoots the root by one level, which is indistinguishable from a legitimate
  // sibling-checkout link without knowing the author's intent. The trade buys
  // cross-repo documentation at the cost of one error class in the check the ticket
  // calls hard. Narrow it by requiring a configured list of sibling repo names if
  // that class ever bites.
  if (resolved.startsWith("../")) return { kind: "ok" };

  if (corpus.includes(resolved)) return { kind: "ok" };

  // Directory targets are legitimate: ForgeBoard's projects convention links
  // `[docs/ADR/](../ADR/)`. git ls-files lists files only, so directories must be
  // derived from the corpus rather than looked up in it.
  if (corpus.some((f) => f.startsWith(resolved + "/"))) return { kind: "ok" };

  const base = path.posix.basename(resolved);
  const candidates = corpus.filter((f) => path.posix.basename(f) === base);

  if (candidates.length === 1) {
    let rel = path.posix.relative(fromDir, candidates[0]);
    if (rel.startsWith("./")) rel = rel.slice(2);
    return { kind: "fixed", to: rel };
  }
  if (candidates.length > 1) return { kind: "ambiguous", candidates };
  return { kind: "dead" };
}
