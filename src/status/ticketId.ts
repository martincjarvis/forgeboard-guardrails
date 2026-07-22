export function extractTicketId(
  branch: string,
  pattern: string,
): string | null {
  // `pattern` is the consuming repo's own configured ticketIdPattern, matched against
  // a short branch name; a pathological pattern costs that repo's own pre-commit and
  // crosses no privilege boundary.
  // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
  const match = branch.match(new RegExp(pattern));
  return match ? match[0] : null;
}
