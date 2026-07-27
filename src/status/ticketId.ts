export function extractTicketId(
  branch: string,
  pattern: string,
): string | null {
  // `pattern` is the consuming repo's own configured ticketIdPattern, matched against
  // a short branch name; a pathological pattern costs that repo's own pre-commit and
  // crosses no privilege boundary.
  // Two tools flag this one line, and both want the line immediately above it.
  // Only one can have it, so semgrep's rides on the line itself — it accepts a
  // trailing marker, eslint's directive does not.
  // eslint-disable-next-line security/detect-non-literal-regexp
  const match = branch.match(new RegExp(pattern)); // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
  return match ? match[0] : null;
}
