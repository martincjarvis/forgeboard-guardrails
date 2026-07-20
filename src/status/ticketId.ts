export function extractTicketId(branch: string, pattern: string): string | null {
  const match = branch.match(new RegExp(pattern));
  return match ? match[0] : null;
}
