import type { DocModel } from "./model.ts";

export type AnchorResult = { ok: true } | { ok: false; closest?: string };

/**
 * Validates a link fragment against the target document's heading slugs.
 *
 * Never repairs. Choosing a replacement heading is a guess, and an anchor pointing
 * confidently at the wrong section is worse than one that fails visibly.
 */
export function checkAnchor(
  fragment: string,
  targetModel: DocModel,
): AnchorResult {
  const slugs = targetModel.headings.map((h) => h.slug);
  if (slugs.includes(fragment)) return { ok: true };

  // Suggest only on a prefix relationship — the shortened/lengthened-heading case.
  // Anything looser produces confident nonsense.
  const closest = slugs.find(
    (s) => s.startsWith(fragment) || fragment.startsWith(s),
  );
  return closest ? { ok: false, closest } : { ok: false };
}
