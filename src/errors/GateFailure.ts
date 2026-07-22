export class GateFailure extends Error {
  constructor(
    public gate: string,
    public remediation: string,
    public detail?: string,
  ) {
    // Detail and remediation are separate sentences: detail states what is wrong,
    // remediation what to do. Joined by a space they read as one run-on sentence,
    // which is the first thing a developer sees when a commit is blocked.
    super(`[${gate}] ${detail ? `${detail} — ${remediation}` : remediation}`);
    this.name = "GateFailure";
  }
}
